# Operations

## Prerequisites

- Node.js 20+ (this machine used Node 26.3.1 / npm 11.16.0) and npm.
- No system ffmpeg needed: `ffmpeg-static` and `ffprobe-static` ship binaries in `node_modules`.
- Optional for the experimental local sidecar: Python 3.11+ and `uv` (this machine has Python
  3.11.15 and uv 0.11.19).
- Windows 11, Git Bash. Paths use forward slashes in scripts; Node APIs handle Windows paths.

## Environment variables

`.env.local` is gitignored. **Never commit values or paste them into docs/logs.** The current file
has `ELEVENLABS_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`,
`STT_PROVIDER=openrouter`; `GEMINI_API_KEY` is present but empty.

| Variable | Purpose |
|---|---|
| `STT_PROVIDER` | `openrouter` in the current setup; also accepts `elevenlabs`, `gemini`, `qwen`, `mock` |
| `OPENROUTER_API_KEY` | OpenRouter key (`sk-or-...`), server-side only |
| `OPENROUTER_MODEL` | `microsoft/mai-transcribe-2` (or `google/gemini-3.5-transcribe`) |
| `ELEVENLABS_API_KEY` | Scribe v2 fallback |
| `GEMINI_API_KEY` | Native Google Interactions provider; empty/unverified |
| `QWEN_ASR_URL` | Local sidecar base URL, default `http://127.0.0.1:8001` |
| `QWEN_ASR_TOKEN` | Optional bearer token for the sidecar |
| `HF_TOKEN` | Hugging Face token for gated pyannote models (not currently set) |
| `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `AZURE_SPEECH_ENDPOINT` | Reserved for the direct Azure adapter, which is still a stub |

Provider resolution in [`lib/providers/index.ts`](../lib/providers/index.ts): explicit request >
`STT_PROVIDER` > `ELEVENLABS_API_KEY` > `GEMINI_API_KEY` > `OPENROUTER_API_KEY` > mock. Setting
`STT_PROVIDER` overrides key-based defaults.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Next dev on `127.0.0.1:3000` |
| `npm run build` | Production build (stop dev first; both share `.next`) |
| `npm start` | Serve the production build on `127.0.0.1:3000` |
| `npm test` | Vitest: 35 tests (segmentation, search, Range parsing, history helpers) |
| `npx tsc --noEmit` | Type-check |
| `npm run fixture` | Create a 45 s synthetic demo conversation, no API call |
| `npm run eval -- <audio> --providers=openrouter --language=auto` | Run provider(s) directly and print text/latency/metrics |
| `npm run sidecar` | Start the experimental Qwen FastAPI sidecar (Python deps required) |
| `npm run sidecar:check` | Run the Qwen ASR-only quality probe |

## First run

```bash
npm install
# create .env.local with the key names above; do not commit it
npm run dev
```

Open <http://127.0.0.1:3000>. Without a key the app falls back to the offline mock. The upload page
shows the current default engine; the model/engine can be changed in the picker.

## Verification checklist

1. `npm test` → all 28 pass.
2. `npx tsc --noEmit` → clean.
3. `npm run build` → succeeds (stop the dev server first).
4. `curl -s http://127.0.0.1:3000/api/transcriptions` → `defaultProvider` is `openrouter` with the
   current `.env.local`.
5. Upload a 2–3 minute multi-speaker clip; select **MAI-Transcribe 2 (OpenRouter)** if it is not the
   default. Wait for `completed`.
6. In the explorer: speaker chips, search, ctrl+click seek, waveform drag, playback speed, right-click
   edit, export JSON/SRT, re-import.
7. A 118 s MAI run should be roughly 4–5 s, cost ~$0.003, and produce 2–3 speakers with word
   timestamps.
8. Re-transcribe that conversation with the mock engine (free): during the run the old transcript is
   read-only with a progress banner; after it finishes, the previous version appears under
   **Versions**, can be downloaded, and can be restored (the swap is reversible).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| OpenRouter **402** “requires at least $0.50 in balance for audio” | Platform-wide audio balance minimum. Top up at <https://openrouter.ai/settings/credits>; wait a few minutes; retry. Not a key problem. |
| OpenRouter **400 “Provider returned 400”** | For MAI, usually M4A/MP4 input. The adapter transcodes to MP3; verify the file passed through `prepareAudio`. If adding a provider, convert to MP3/WAV/FLAC. |
| OpenRouter **401** | Wrong/revoked key or server started without env; restart `npm run dev`. |
| OpenRouter requests hang or time out | Upstream timeout is 60 s and the cap is 25 MB. Split long audio or use Scribe for long meetings. |
| App still uses the old engine after editing `.env.local` | Restart `npm run dev`. `STT_PROVIDER` wins over key detection. |
| Job shows **interrupted** | The server restarted mid-job. Click Retry; jobs are deliberately not auto-resumed to avoid double billing. |
| Restore is disabled | The job is queued/processing. Wait for it to finish or cancel it; restore is refused while a run owns `transcript.json`. |
| Re-transcribe fails with “refusing to overwrite” | `transcript.json` is unreadable. Export or delete the conversation before re-running; the app will not silently destroy it. |
| “Segment … overlaps or is out of order” | Should be prevented by `normalizeSegmentBounds()` in `lib/transcript/segment.ts`. If a new provider reintroduces it, check its timestamps and keep the normalizer. |
| Qwen sidecar “not running” | Start `npm run sidecar`; the default URL is `127.0.0.1:8001`. Sidecar requires the Python venv and, for diarization, pyannote + `HF_TOKEN`. |
| Qwen sidecar pyannote error | `pyannote.audio` is not installed in `sidecar/.venv`; accept the model terms on Hugging Face and set `HF_TOKEN`. This path is experimental and was not completed. |
| ffmpeg/ffprobe missing | `npm install`; the binaries come from `ffmpeg-static`/`ffprobe-static`. `requireBinary()` gives a clear error if not. |
| Port 3000 in use | Find the listener (`netstat -ano | grep 127.0.0.1:3000`) and stop it, or run `npm run dev -- -p 3001`. |
| Build fails while dev is running | Stop dev; both use `.next`. |
| Windows Hugging Face symlink warning | Harmless; the cache falls back to copies. Set `HF_HUB_DISABLE_SYMLINKS_WARNING=1` to silence. |
| `REQUEST` body too large / upload fails | Uploads are raw-streamed with a 3 GB cap; provider caps are lower (OpenRouter 25 MB). Transcode long files. |

## Local Qwen sidecar (experimental)

The sidecar venv already exists at `sidecar/.venv` with CPU PyTorch 2.15 and `qwen-asr==0.0.6`.
It does **not** include pyannote yet. Setup if you choose to continue:

```bash
uv sync --project sidecar --python 3.11
# pyannote is gated: accept terms and set HF_TOKEN
npm run sidecar        # FastAPI on 127.0.0.1:8001
```

The ASR quality gate failed (Chinese translated to English, zero Cantonese particles, ~31 min CPU
for 118 s). Read [providers.md](providers.md) before spending more time here.

## Costs and privacy

- MAI via OpenRouter: ~$0.10/audio-hour; the 118 s test was $0.0033. OpenRouter requires ≥$0.50
  balance for audio requests.
- Scribe v2: ~$0.22/audio-hour.
- Local Qwen: compute only, but ~16× realtime on CPU.
- Audio is sent only to the selected provider. `.data/` (audio, transcripts, raw responses, history)
  and `.env.local` are local and gitignored. The app binds `127.0.0.1` and has no auth; do not expose it.
- Each successful re-run archives one transcript JSON under `.data/library/{id}/history/`; versions
  are kept until the conversation is deleted. `raw.json` is overwritten per run and is not versioned.
- Delete a conversation from the home page to remove its audio, transcript, raw response, peaks, and
  all archived versions.

## Deployment (home host)

The app is single-instance: one `next start` process with a persistent `.data/` directory. The
Windows runbook — production build, NSSM service, Tailscale Serve (primary), Cloudflare Tunnel +
Access (fallback), backups, updates — is [docs/hosting.md](../docs/hosting.md).

- Keep `next start` bound to `127.0.0.1`; both tunnels connect to it locally. Never expose port 3000
  directly, and never use Tailscale Funnel or a Cloudflare hostname without Access: the app has no
  authentication.
- Never run two instances against the same `.data/`; the queue and atomic writes assume one process.
- Cloudflare's standard plans cap proxied request bodies at ~100 MB and origin requests at ~100 s.
  Large uploads must use Tailscale.
- Stopping the service mid-transcription marks the job `interrupted`; retry is manual by design.

## Git

Current history: `3f1363a openrouter option`, `01adfd6 Initial commit`. The working tree is clean in
the delivery state. No commit is created by the handover docs unless the next developer chooses to
commit them.
