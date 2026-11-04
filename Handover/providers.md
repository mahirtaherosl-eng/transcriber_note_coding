# Providers and engine decisions

This page is the most important one for avoiding repeated work. The app went through four engine
attempts; only MAI-Transcribe-2 and Scribe are currently useful.

## Current default: MAI-Transcribe-2 via OpenRouter — **verified**

```bash
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=microsoft/mai-transcribe-2
STT_PROVIDER=openrouter
```

[`lib/providers/openrouter.ts`](../lib/providers/openrouter.ts) calls
`POST https://openrouter.ai/api/v1/audio/transcriptions` with a JSON body:

```json
{
  "model": "microsoft/mai-transcribe-2",
  "input_audio": { "format": "mp3", "data": "<base64>" },
  "response_format": "verbose_json",
  "timestamp_granularities": ["segment", "word"],
  "provider": {
    "options": { "azure": { "diarization": { "enabled": true } } }
  }
}
```

Key facts:

- MAI is served by OpenRouter's **Azure** endpoint and reports `supports_diarization: true`.
- **M4A/MP4 is rejected by the Azure upstream (HTTP 400).** The adapter transcodes unsupported
  formats to mono 16 kHz MP3; 64 kbps normally, 32 kbps above 30 minutes so base64 stays under the
  25 MB request cap.
- OpenRouter's upstream timeout is **60 s**; MAI is fast enough in practice (4.4 s for 118 s).
- OpenRouter requires a **$0.50 minimum balance for audio requests** (platform-wide, not
  model-specific). A 402 with that message means top up, not bad auth.
- Price ~**$0.10/audio-hour**; the 118 s test cost **$0.003305**.

Verified result on the trilingual meeting:

| Metric | Value |
|---|---|
| Raw segments / words | 53 / 367 |
| App segments / speakers | 50 / 3 |
| Overlaps | 0 |
| Latency | 4.4 s |
| Cost | $0.0033 |

### Cantonese findings

MAI is the best engine tested so far, but **not fully colloquial**. It preserves some Cantonese
lexicon and particles (`你哋`, `我哋`, `依家`, `咯`), while many lines remain Standard Written
Chinese/Mandarin (`还需要`, `不知道啊`, `那样我们聊一下`). Some of that may be genuinely Mandarin in
the meeting; the audio is trilingual.

OpenRouter reports a single global `language` (usually `en`) even for mixed audio. The adapter sets
`detectedLanguage = "mixed"` when the transcript contains both CJK and Latin characters;
`languageLabel("mixed")` shows **Mixed languages** in the explorer.

## Provider matrix

| Provider | Status | Cantonese | Diarization | Word timestamps | Limits | Cost |
|---|---|---|---|---|---|---|
| **OpenRouter MAI-Transcribe-2** | **Verified, default** | `yue`, code-switching; partial colloquial | yes (Azure option) | yes | 60 s / 25 MB / 30 min cap | ~$0.10/h |
| ElevenLabs Scribe v2 | Verified fallback | `yue` accepted, but writes written Chinese | yes (32 speakers) | yes | ~10 h | ~$0.22/h |
| Google Gemini native (`lib/providers/gemini.ts`) | Implemented, **unverified** | `yue-Hant-HK` hint | yes | yes | 30 min with diarization | ~$0.18–0.30/h |
| OpenRouter Gemini (`google/gemini-3.5-transcribe`) | Implemented, **no diarization via OpenRouter** | code-switching | no (endpoint reports false) | yes | 30 min | $2/M in, $12/M out |
| Local Qwen3-ASR 1.7B + pyannote (`sidecar/`) | **Experimental, failed gate** | poor | pyannote (not installed) | yes | local CPU/4 GB GPU | free |
| Soniox `stt-async-v5` | Stub | `yue` unconfirmed | not implemented | not implemented | — | — |
| Azure Speech direct (`lib/providers/azure.ts`) | Stub | `zh-HK` mapping | not implemented | not implemented | — | — |
| Mock | Verified offline | n/a | synthetic 2 speakers | synthetic | — | free |

## Per-provider notes

### ElevenLabs Scribe v2 — verified fallback

- Env: `ELEVENLABS_API_KEY`; model `scribe_v2`; `ELEVENLABS_API_KEY` takes precedence in
  `resolveProviderId` when `STT_PROVIDER` is unset.
- Requests `diarize=true`, `timestamps_granularity=word`, optional `num_speakers`.
- A/B on the 118 s meeting: `auto` (detected `zho` 0.89), `yue` (detected `yue` 1.0), and `zh`
  produced **near-identical Standard Written Chinese**, with **zero** strong Cantonese particles
  (`係/唔/嘅/咗/佢/哋/喺/冇/嗰/啲`). Forcing `yue` changes the label, not the text.
- Use Scribe for English/Mandarin and long files; it is not the solution for colloquial Cantonese.

### Google Gemini native — implemented but unverified

- [`lib/providers/gemini.ts`](../lib/providers/gemini.ts) uses the Interactions API
  (`POST /v1beta/interactions`, `gemini-3.5-transcribe`, verbatim mode, `diarization_mode:
  "speaker"`, word timestamps, inline base64 audio).
- Requires `GEMINI_API_KEY`; no key was available, so this path has **never been run**. The code is a
  reasonable starting point if the native Google API becomes preferred.
- The OpenRouter Gemini endpoint does **not** expose diarization; do not assume the two paths behave
  alike.

### Local Qwen3-ASR + pyannote — experimental, do not repeat blindly

- Code: [`sidecar/`](../sidecar/), [`lib/providers/qwen.ts`](../lib/providers/qwen.ts), scripts
  `npm run sidecar` / `sidecar:check`.
- Environment used: Python 3.11.15 + `uv`, CPU PyTorch 2.15.0 (`sidecar/.venv`), `qwen-asr==0.0.6`.
- Quality gate (`sidecar/asr_check.py`, Qwen3-ASR-1.7B, auto language, 118 s):
  - detected **English**;
  - **translated** the Chinese content into English (“I'm Connie”, “What? You say what?”);
  - **0** strong Cantonese particles; 490 characters;
  - **1,889.8 s** elapsed on CPU (~16× realtime, ~31 minutes for 2 minutes of audio).
- The full sidecar (`server.py`) adds a forced aligner and pyannote, but:
  - `pyannote.audio` is **not installed**;
  - `HF_TOKEN` is **not configured**;
  - `server.py` has never completed an end-to-end diarized run.
- Do not sink more time into this path without a materially different model or GPU. The 4 GB
  Quadro T2000 is also too small for 1.7B + aligner concurrently.

### Stubs

- [`lib/providers/soniox.ts`](../lib/providers/soniox.ts): Soniox has strong code-switching but its
  official language list does not confirm `yue`; a stub only.
- [`lib/providers/azure.ts`](../lib/providers/azure.ts): direct Azure Speech Fast Transcription with
  MAI-Transcribe-2 (`enhancedMode`) was planned but not built. If you pursue it, the request shape is
  documented in the project history: `enhancedMode.enabled/model`, `diarization`, `modelOptions`,
  API version `2025-10-15`, and M4A must be converted to MP3/WAV/FLAC.

## Costs (current)

| Engine | Rate | 118 s test |
|---|---|---|
| OpenRouter MAI | ~$0.10/audio-hour | $0.0033 |
| Scribe v2 | ~$0.22/audio-hour | ~$0.007 |
| OpenRouter Gemini | $2/M input, $12/M output | not tested |
| Local Qwen | compute only | free (slow) |

## How to add a provider

1. Implement `SttProvider` in `lib/providers/<id>.ts`; return flat `Token[]` with `startMs`,
   `endMs`, `speakerId`, and `type: "word"`.
2. Add the id to `ProviderId` in [`lib/languages.ts`](../lib/languages.ts) and the provider enum in
   [`lib/transcript/schema.ts`](../lib/transcript/schema.ts).
3. Register it in [`lib/providers/index.ts`](../lib/providers/index.ts) and decide the default
   resolution order.
4. Add a language mapping in `lib/languages.ts` if needed; `supportsLanguage()` gates the uploader.
5. Add the engine option in [`app/page.tsx`](../app/page.tsx) and an env variable name to
   [`.env.example`](../.env.example).
6. Add the key to `.env.local`, restart, and test with `npm run eval -- <audio> --providers=<id>` or
   an upload. Never print the key.
7. Keep the provider's `raw` response in the returned result so `raw.json` is useful for debugging.

## Engine history (why we are here)

1. **Scribe v2** was chosen first for accuracy/diarization/long files. It failed the Cantonese
   requirement: auto/`yue`/`zh` all emitted Standard Written Chinese with no Cantonese particles.
2. **Gemini 3.5 Transcribe** was investigated for native code-switching/diarization. OpenRouter's
   Google endpoint reports `supports_diarization: false`, so it could not serve the speaker filter.
3. **Qwen3-ASR 1.7B + pyannote** was attempted for a fully local, privacy-preserving pipeline. It
   translated Chinese to English and was ~16× realtime on CPU; the gate failed before pyannote.
4. **MAI-Transcribe-2 via OpenRouter** was the successful path: Azure endpoint with diarization,
   3 speakers, word timestamps, mixed-language output, and $0.0033 for 118 s.
