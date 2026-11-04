"""Quality gate: run Qwen3-ASR-1.7B on one file and report language/script evidence.

Usage:
  uv run --project sidecar python sidecar/asr_check.py \
      --audio ".data/library/<id>/original.m4a" --language auto --device auto
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import torch
from qwen_asr import Qwen3ASRModel

MARKERS = ["係", "唔", "嘅", "咗", "佢", "哋", "喺", "冇", "嗰", "啲", "㗎", "喇", "囉", "咩"]
ENGLISH = ["hello", "connie", "bob", "read", "ok", "good", "stop"]
MAX_NEW_TOKENS = 4096

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass
LANGUAGE_NAMES = {
    "auto": None,
    "yue": "Cantonese",
    "zh": "Chinese",
    "en": "English",
    "bn": "Bengali",
}


def build_model(model_id: str, device: str):
    use_cuda = device in ("auto", "cuda") and torch.cuda.is_available()
    if use_cuda:
        try:
            return Qwen3ASRModel.from_pretrained(
                model_id,
                dtype=torch.float16,
                device_map="cuda:0",
                max_new_tokens=MAX_NEW_TOKENS,
            )
        except (torch.cuda.OutOfMemoryError, RuntimeError) as error:
            message = str(error).lower()
            if not isinstance(error, torch.cuda.OutOfMemoryError) and "out of memory" not in message:
                raise
            torch.cuda.empty_cache()
            print("CUDA OOM while loading; retrying on CPU", flush=True)

    return Qwen3ASRModel.from_pretrained(
        model_id,
        dtype=torch.float32,
        device_map="cpu",
        max_new_tokens=MAX_NEW_TOKENS,
    )


def transcribe_with_fallback(model_id: str, audio: str, language: str | None):
    try:
        model = build_model(model_id, "auto")
    except torch.cuda.OutOfMemoryError:
        torch.cuda.empty_cache()
        print("CUDA OOM while loading; retrying on CPU", flush=True)
        model = build_model(model_id, "cpu")

    try:
        return model.transcribe(audio=audio, language=language, return_time_stamps=False)
    except torch.cuda.OutOfMemoryError:
        torch.cuda.empty_cache()
        print("CUDA OOM during inference; retrying on CPU", flush=True)
        model = build_model(model_id, "cpu")
        return model.transcribe(audio=audio, language=language, return_time_stamps=False)


def count_occurrences(text: str, needle: str) -> int:
    count = 0
    start = 0
    while True:
        index = text.find(needle, start)
        if index < 0:
            return count
        count += 1
        start = index + len(needle)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--language", default="auto", choices=sorted(LANGUAGE_NAMES))
    parser.add_argument("--device", default="auto", choices=["auto", "cuda", "cpu"])
    parser.add_argument("--model", default="Qwen/Qwen3-ASR-1.7B")
    parser.add_argument("--out")
    args = parser.parse_args()

    if args.device == "cpu":
        model = Qwen3ASRModel.from_pretrained(
            args.model,
            dtype=torch.float32,
            device_map="cpu",
            max_new_tokens=MAX_NEW_TOKENS,
        )
        started = time.time()
        results = model.transcribe(
            audio=args.audio, language=LANGUAGE_NAMES[args.language], return_time_stamps=False
        )
    else:
        started = time.time()
        results = transcribe_with_fallback(
            args.model, args.audio, LANGUAGE_NAMES[args.language]
        )

    elapsed = time.time() - started
    result = results[0]
    text = result.text or ""
    markers = {
        marker: count_occurrences(text, marker)
        for marker in MARKERS
        if count_occurrences(text, marker) > 0
    }
    lower = text.lower()
    english = {
        word: count_occurrences(lower, word)
        for word in ENGLISH
        if count_occurrences(lower, word) > 0
    }

    report = {
        "model": args.model,
        "requestedLanguage": args.language,
        "detectedLanguage": getattr(result, "language", None),
        "elapsedSeconds": round(elapsed, 1),
        "characters": len(text),
        "markerHits": markers,
        "markerTotal": sum(markers.values()),
        "englishHits": english,
        "text": text,
    }

    if args.out:
        Path(args.out).write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    try:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    except UnicodeEncodeError:
        print(json.dumps(report, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
