# Local Qwen3-ASR + pyannote sidecar

Runs Qwen3-ASR-1.7B (Apache-2.0) and pyannote speaker diarization on this machine. Audio
never leaves the machine once the models are downloaded.

## Setup

```bash
uv sync --project sidecar --python 3.11
```

The first run downloads:

- `Qwen/Qwen3-ASR-1.7B` (~3.4 GB)
- `Qwen/Qwen3-ForcedAligner-0.6B` (timestamps, ~1.2 GB)
- `pyannote/speaker-diarization-community-1` (~1 GB, gated)

### Pyannote token

1. Create a read token at <https://huggingface.co/settings/tokens>.
2. Accept the terms at <https://huggingface.co/pyannote/speaker-diarization-community-1>.
3. Add `HF_TOKEN=hf_...` to the repository `.env.local`.

## Quality gate

Before building the full pipeline, confirm Qwen actually emits colloquial Cantonese:

```bash
uv run --project sidecar python sidecar/asr_check.py \
  --audio ".data/library/bb8ffce7-b258-4125-a346-63cb7b3a4939/original.m4a" \
  --language auto --out ".data/qwen-auto.json"
```

If `markerTotal` is 0, Qwen is normalizing to Standard Written Chinese just like Scribe, and the
local route should not be pursued.

## Hardware

- GPU: Quadro T2000 4 GB. The 1.7B model is fp16 (~3.4 GB), so it may OOM alongside the aligner.
  The script falls back to CPU (32 GB RAM), which is slower.
- Pyannote needs ~2 GB VRAM alone; run it before/after the ASR model, not simultaneously.
