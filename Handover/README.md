# Handover — Transcriber

**Audience:** future developers and AI agents. The user-facing guide is the repository
[README](../README.md); this folder records the engineering state, decisions, and traps.

**Last updated:** 2026-11-04 · **Git:** `0a95537` plus the re-transcribe work in the working tree ·
**Tests:** 35 passing · **Build:** passing · **Default engine:** MAI-Transcribe-2 via OpenRouter.

## What this app is

A local-only Next.js app for long conversations. You upload an audio file, it is transcribed with
speaker labels and timestamps through a pluggable ASR provider, and a two-pane explorer keeps the
transcript and audio in sync. Search, speaker filtering, in-place editing, and portable transcript
export are built in. Audio and transcripts live under `.data/`; nothing is uploaded anywhere except
the ASR provider you select.

## Quick start

```bash
npm install

# .env.local (gitignored) — names only, never commit values
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=microsoft/mai-transcribe-2
STT_PROVIDER=openrouter

npm run dev
```

Open <http://127.0.0.1:3000>. `npm run fixture` creates a local demo conversation without an API call.
`npm test` runs the unit suite; `npm run build` verifies the production build.

## Current state

| Area | Status |
|---|---|
| Upload → queue → transcript → explorer | **Verified** |
| OpenRouter MAI-Transcribe-2 (diarization, timestamps, code-switching) | **Verified** — 50 segments, 3 speakers, $0.0033 for 118 s |
| ElevenLabs Scribe v2 | **Verified working**, but writes Standard Written Chinese for Cantonese |
| Google Gemini native Interactions provider | **Implemented, unverified** — no `GEMINI_API_KEY` present |
| OpenRouter Gemini Transcribe | **Implemented** — no diarization through OpenRouter |
| Local Qwen3-ASR 1.7B + pyannote | **Experimental / failed quality gate** |
| Soniox and Azure direct adapters | **Stubs** — throw a clear error |
| Search, speaker filter, editing, export/import, waveform sync | **Verified** |
| Re-transcribe with another engine/language + version history (download/restore) | **Verified** |
| Cross-file search, version diffing | **Not built** |

Latest verified artifact on this machine: job `5f8f4dd3-d7f5-42da-bb03-5961a2c88799`, provider
`openrouter`, model `microsoft/mai-transcribe-2`, 50 segments, 3 speakers, detected language
`mixed`, cost $0.0033. It lives under `.data/library/` and is **not** committed.

## Read next

- [architecture.md](architecture.md) — how the pipeline, storage, API, and UI fit together.
- [providers.md](providers.md) — every engine, what was verified, how to add one, and the engine
  experiment history (important: prevents repeating dead ends).
- [operations.md](operations.md) — environment variables, commands, tests, costs, troubleshooting.
- [known-issues-and-next-steps.md](known-issues-and-next-steps.md) — prioritized backlog.

## Hard rules for the next agent

1. **Never commit `.env.local`, `.data/`, or any API key.** `.env.local` and `.data/` are gitignored.
2. **The app is local-only and binds `127.0.0.1`.** Do not add public authless endpoints.
3. **Do not run the Qwen quality gate again without new evidence.** It translated Chinese into
   English, produced zero Cantonese particles, and took ~31 minutes on CPU for 118 seconds.
4. **Provider keys are server-side only.** Never add `NEXT_PUBLIC_` to a key.
5. **Keep the transcript schema invariants** (ordered, non-overlapping, half-open intervals); the
   explorer's binary search and waveform depend on them.
