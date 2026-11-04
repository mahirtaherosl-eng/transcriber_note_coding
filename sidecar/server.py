"""Local Qwen3-ASR 1.7B + pyannote diarization sidecar.

Run:
  uv run --project sidecar uvicorn server:app --app-dir sidecar --host 127.0.0.1 --port 8001
"""

from __future__ import annotations

import hmac
import os
import shutil
import subprocess
import tempfile
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = (ROOT / ".data").resolve()
INFERENCE_LOCK = threading.Lock()


def load_env_file() -> None:
    """Read the repo .env.local without printing any values."""
    env_file = ROOT / ".env.local"
    if not env_file.exists():
        return
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_env_file()

ASR_MODEL = os.environ.get("QWEN_ASR_MODEL", "Qwen/Qwen3-ASR-1.7B")
ALIGNER_MODEL = os.environ.get("QWEN_ALIGNER_MODEL", "Qwen/Qwen3-ForcedAligner-0.6B")
DIARIZATION_MODEL = os.environ.get(
    "PYANNOTE_MODEL", "pyannote/speaker-diarization-community-1"
)
MAX_NEW_TOKENS = int(os.environ.get("QWEN_MAX_NEW_TOKENS", "4096"))
MAX_AUDIO_SECONDS = int(os.environ.get("QWEN_MAX_SECONDS", "7200"))

LANGUAGE_NAMES = {
    "auto": None,
    "yue": "Cantonese",
    "zh": "Chinese",
    "en": "English",
    "bn": "Bengali",
    "hi": "Hindi",
    "ja": "Japanese",
    "ko": "Korean",
}

_asr: Any = None
_asr_error: str | None = None
_diarization: Any = None
_diarization_error: str | None = None


def select_device() -> str:
    preference = os.environ.get("QWEN_DEVICE", "auto").lower()
    if preference == "cpu":
        return "cpu"
    return "cuda" if torch.cuda.is_available() else "cpu"


def find_ffmpeg() -> str:
    candidates = [
        os.environ.get("FFMPEG_PATH"),
        str(
            ROOT
            / "node_modules"
            / "ffmpeg-static"
            / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")
        ),
        shutil.which("ffmpeg"),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    raise RuntimeError(
        "ffmpeg was not found. Install it or set FFMPEG_PATH in .env.local."
    )


def get_asr() -> Any:
    global _asr, _asr_error
    if _asr is not None:
        return _asr
    if _asr_error:
        raise RuntimeError(_asr_error)

    from qwen_asr import Qwen3ASRModel

    device = select_device()
    dtype = torch.float16 if device == "cuda" else torch.float32
    aligner_device = "cpu" if device == "cuda" else device
    aligner_dtype = torch.float32

    kwargs = {
        "dtype": dtype,
        "device_map": "cuda:0" if device == "cuda" else "cpu",
        "max_new_tokens": MAX_NEW_TOKENS,
        "forced_aligner": ALIGNER_MODEL,
        "forced_aligner_kwargs": {
            "dtype": aligner_dtype,
            "device_map": aligner_device,
        },
    }

    try:
        _asr = Qwen3ASRModel.from_pretrained(ASR_MODEL, **kwargs)
        return _asr
    except (torch.cuda.OutOfMemoryError, RuntimeError) as error:
        message = str(error)
        if device == "cuda" and (
            isinstance(error, torch.cuda.OutOfMemoryError)
            or "out of memory" in message.lower()
        ):
            torch.cuda.empty_cache()
            kwargs["dtype"] = torch.float32
            kwargs["device_map"] = "cpu"
            kwargs["forced_aligner_kwargs"] = {
                "dtype": torch.float32,
                "device_map": "cpu",
            }
            try:
                _asr = Qwen3ASRModel.from_pretrained(ASR_MODEL, **kwargs)
                return _asr
            except Exception as retry_error:  # noqa: BLE001
                _asr_error = str(retry_error)
                raise
        _asr_error = message
        raise


def pyannote_available() -> bool:
    try:
        import pyannote.audio  # noqa: F401

        return True
    except Exception:  # noqa: BLE001
        return False


def get_diarization() -> Any:
    global _diarization, _diarization_error
    if _diarization is not None:
        return _diarization
    if _diarization_error:
        raise RuntimeError(_diarization_error)

    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")
    if not token:
        _diarization_error = (
            "HF_TOKEN is not set. Create a Hugging Face token and accept the terms at "
            f"https://huggingface.co/{DIARIZATION_MODEL}."
        )
        raise RuntimeError(_diarization_error)

    try:
        from pyannote.audio import Pipeline

        pipeline = Pipeline.from_pretrained(DIARIZATION_MODEL, token=token)
        device = os.environ.get("PYANNOTE_DEVICE", "cpu").lower()
        if device == "cuda" and torch.cuda.is_available():
            pipeline.to(torch.device("cuda"))
        _diarization = pipeline
        return pipeline
    except Exception as error:  # noqa: BLE001
        _diarization_error = str(error)
        raise


def decode_to_wav(source: Path, target: Path) -> None:
    result = subprocess.run(
        [
            find_ffmpeg(),
            "-v",
            "error",
            "-y",
            "-i",
            str(source),
            "-ac",
            "1",
            "-ar",
            "16000",
            str(target),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise HTTPException(
            400,
            f"Could not decode the audio file: {(result.stderr or '').strip()[:500]}",
        )


def transcribe_words(wav_path: Path, language: str) -> tuple[list[dict[str, Any]], str]:
    model = get_asr()
    result = model.transcribe(
        audio=str(wav_path),
        language=LANGUAGE_NAMES.get(language, None),
        return_time_stamps=True,
    )[0]

    stamps = getattr(result, "time_stamps", None)
    items = getattr(stamps, "items", None)
    if not items:
        raise HTTPException(
            502,
            "Qwen returned no word timestamps. The forced aligner may not have been available.",
        )

    words: list[dict[str, Any]] = []
    for item in items:
        text = getattr(item, "text", None)
        start = getattr(item, "start_time", None)
        end = getattr(item, "end_time", None)
        if not text or start is None or end is None:
            continue
        start_ms = max(0, round(float(start) * 1000))
        end_ms = max(start_ms + 1, round(float(end) * 1000))
        words.append({"text": text, "startMs": start_ms, "endMs": end_ms})

    if not words:
        raise HTTPException(502, "Qwen returned an empty transcript.")

    return words, getattr(result, "language", "") or ""


def diarize(
    wav_path: Path, num_speakers: int | None
) -> tuple[list[dict[str, Any]], bool, str | None]:
    pipeline = get_diarization()
    waveform, sample_rate = sf.read(str(wav_path), dtype="float32", always_2d=True)
    tensor = torch.from_numpy(waveform.T)
    if tensor.shape[0] > 1:
        tensor = tensor.mean(dim=0, keepdim=True)

    kwargs: dict[str, Any] = {}
    if num_speakers:
        kwargs["num_speakers"] = num_speakers

    output = pipeline(
        {"waveform": tensor, "sample_rate": sample_rate},
        **kwargs,
    )
    annotation = getattr(output, "exclusive_speaker_diarization", output)

    turns: list[dict[str, Any]] = []
    for segment, _track, label in annotation.itertracks(yield_label=True):
        turns.append(
            {
                "startMs": max(0, round(segment.start * 1000)),
                "endMs": max(1, round(segment.end * 1000)),
                "speaker": label,
            }
        )

    return turns, True, None


def assign_speakers(
    words: list[dict[str, Any]], turns: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    if not turns:
        for word in words:
            word["speakerId"] = None
        return words

    for word in words:
        best_turn = None
        best_overlap = 0
        for turn in turns:
            overlap = max(
                0,
                min(word["endMs"], turn["endMs"]) - max(word["startMs"], turn["startMs"]),
            )
            if overlap > best_overlap:
                best_overlap = overlap
                best_turn = turn

        if best_turn is None:
            midpoint = (word["startMs"] + word["endMs"]) / 2
            best_turn = min(
                turns,
                key=lambda turn: abs((turn["startMs"] + turn["endMs"]) / 2 - midpoint),
            )

        word["speakerId"] = best_turn["speaker"]

    return words


def resolve_audio_path(raw: str) -> Path:
    path = Path(raw)
    if not path.is_absolute():
        path = (ROOT / path).resolve()
    else:
        path = path.resolve()

    if not path.is_file():
        raise HTTPException(404, "Audio file not found.")
    try:
        path.relative_to(DATA_ROOT)
    except ValueError:
        raise HTTPException(403, "Audio must live under .data/ in this project.")
    return path


def check_auth(authorization: str | None, sidecar_token: str | None) -> None:
    required = os.environ.get("QWEN_ASR_TOKEN")
    if not required:
        return
    supplied = sidecar_token or ""
    if not supplied and authorization and authorization.lower().startswith("bearer "):
        supplied = authorization[7:]
    if not hmac.compare_digest(supplied, required):
        raise HTTPException(401, "Invalid sidecar token.")


class TranscribeRequest(BaseModel):
    audioPath: str
    language: str = "auto"
    numSpeakers: int | None = Field(default=None, ge=1, le=16)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if os.environ.get("QWEN_PRELOAD") == "1":
        try:
            get_asr()
        except Exception as error:  # noqa: BLE001
            print(f"ASR preload failed: {error}", flush=True)
        try:
            get_diarization()
        except Exception as error:  # noqa: BLE001
            print(f"Diarization preload failed: {error}", flush=True)
    yield


app = FastAPI(title="Transcriber Qwen sidecar", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "asrReady": _asr is not None,
        "asrModel": ASR_MODEL,
        "alignerModel": ALIGNER_MODEL,
        "device": select_device(),
        "cudaAvailable": torch.cuda.is_available(),
        "diarizationAvailable": pyannote_available(),
        "diarizationReady": _diarization is not None,
        "diarizationModel": DIARIZATION_MODEL,
        "hfTokenPresent": bool(
            os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")
        ),
        "asrError": _asr_error,
        "diarizationError": _diarization_error,
    }


@app.post("/transcribe")
def transcribe(
    request: TranscribeRequest,
    authorization: str | None = Header(default=None),
    x_sidecar_token: str | None = Header(default=None),
) -> dict[str, Any]:
    check_auth(authorization, x_sidecar_token)
    audio_path = resolve_audio_path(request.audioPath)

    with INFERENCE_LOCK, tempfile.TemporaryDirectory(prefix="transcriber-qwen-") as temp:
        wav_path = Path(temp) / "audio.wav"
        decode_to_wav(audio_path, wav_path)

        info = sf.info(str(wav_path))
        duration = info.frames / info.samplerate
        if duration > MAX_AUDIO_SECONDS:
            raise HTTPException(
                413,
                f"Audio is {duration / 60:.1f} minutes; this local sidecar accepts up to "
                f"{MAX_AUDIO_SECONDS / 60:.0f} minutes per request.",
            )

        started = time.time()
        words, language = transcribe_words(wav_path, request.language)
        asr_seconds = time.time() - started

        diarization_seconds = 0.0
        diarized = False
        diarization_error: str | None = None
        turns: list[dict[str, Any]] = []
        try:
            diarization_started = time.time()
            turns, diarized, diarization_error = diarize(wav_path, request.numSpeakers)
            diarization_seconds = time.time() - diarization_started
        except Exception as error:  # noqa: BLE001
            diarization_error = str(error)
            print(f"Diarization failed: {error}", flush=True)

        assign_speakers(words, turns)

        speakers = []
        seen = set()
        for turn in turns:
            label = turn["speaker"]
            if label not in seen:
                seen.add(label)
                speakers.append({"id": label, "label": label})

        return {
            "words": words,
            "speakers": speakers,
            "language": language,
            "model": ASR_MODEL,
            "diarized": diarized,
            "diarizationError": diarization_error,
            "durationSeconds": round(duration, 3),
            "asrSeconds": round(asr_seconds, 2),
            "diarizationSeconds": round(diarization_seconds, 2),
        }
