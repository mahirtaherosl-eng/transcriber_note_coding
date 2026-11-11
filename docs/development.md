# Development and operations

## Prerequisites

- **Node.js >= 20.9.0** (Next.js 16) and npm. See [`.nvmrc`](../.nvmrc) for the tested version.
- No system ffmpeg: `ffmpeg-static` and `ffprobe-static` install platform binaries during
  `npm install`.
- No Python or GPU setup is required.

## First run

```bash
npm install
npm run dev
```

Open <http://127.0.0.1:3000>. With no API key the app runs in offline mock mode.

```bash
npm run fixture   # add a 45-second demo conversation without an API call
```

## API keys and defaults

The primary setup path is the in-app **Settings** page (`/settings`). It writes
`.data/settings.json` (plaintext, gitignored) and applies immediately — no restart.

`.env.local` remains supported as an advanced fallback; Next reads it at server start, so changes
there require restarting `npm run dev`. See [`.env.example`](../.env.example).

Resolution order:

1. explicit provider on the upload/re-transcribe request
2. saved default in Settings
3. `STT_PROVIDER` in `.env.local`
4. first configured key in **OpenRouter → ElevenLabs → Gemini** order
5. offline mock

Key lookup is saved Settings key first, then the matching environment variable
(`OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY`, `GEMINI_API_KEY`). Clearing a saved key falls back to the
environment key; it does not disable the provider unless no other key exists.

`OPENROUTER_MODEL` is read from the environment only (default `microsoft/mai-transcribe-2`) and is
not editable in the UI.

| Variable | Purpose |
|---|---|
| `STT_PROVIDER` | Optional default engine id: `openrouter`, `elevenlabs`, `gemini`, `mock` |
| `OPENROUTER_API_KEY` | OpenRouter key (`sk-or-…`), server-side only |
| `OPENROUTER_MODEL` | `microsoft/mai-transcribe-2` or another audio model |
| `ELEVENLABS_API_KEY` | Scribe v2 fallback |
| `GEMINI_API_KEY` | Native Gemini Interactions provider |

Uploads and re-transcribes reject a keyed provider with no key before enqueueing.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Next dev on `127.0.0.1:3000` |
| `npm run build` | Production build (stop dev first; both share `.next`) |
| `npm start` | Serve the production build on `127.0.0.1:3000` |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm test` | Vitest: segmentation, search, Range, history, settings, providers |
| `npm run fixture` | Create a synthetic demo conversation, no API call |
| `npm run eval -- <audio>` | Compare providers and optional WER/CER |

`scripts/eval-providers.ts` loads `.env.local` when present and also reads keys saved in Settings.

## Verification checklist

1. `npm run typecheck` → clean.
2. `npm test` → all pass.
3. `npm run build` → succeeds with the dev server stopped.
4. `curl -s http://127.0.0.1:3000/api/transcriptions` → `defaultProvider` matches your setup.
5. `GET /api/settings` shows the configured keys as booleans and never the values.
6. Upload a 2–3 minute multi-speaker clip; wait for `completed`.
7. In the explorer: speaker chips, search, ctrl+click seek, waveform drag, playback speed, right-click
   edit, export JSON/SRT, re-import, re-transcribe, and version restore.
8. A 118-second MAI run is typically a few seconds and costs about $0.003.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Port 3000 in use | Stop the other process (`netstat -ano | findstr :3000`), or run `npm run dev -- -p 3001`. |
| OpenRouter **402** “requires at least $0.50 in balance for audio” | Platform-wide audio minimum. Top up at <https://openrouter.ai/settings/credits>, wait a few minutes, retry. |
| OpenRouter **400 “Provider returned 400”** | Usually an unsupported audio container for MAI. The adapter transcodes M4A/MP4/AAC/WebM/OGG to MP3; if it persists, try WAV/MP3. |
| OpenRouter **401** | Wrong/revoked key, or the server started without it. Save it in Settings or fix `.env.local` and restart. |
| Requests time out / 25 MB error | OpenRouter's upstream timeout is 60 s and the cap is 25 MB; MAI is limited to ~30 minutes with diarization. Split long audio or use Scribe. |
| App still uses the old engine | `.env.local` changes require a restart. Settings changes and saved keys apply immediately. |
| Upload rejected: “needs an API key” | Add the key in Settings, or choose Auto/mock. |
| Job shows **interrupted** | The server restarted mid-job. Click Retry; jobs are deliberately not auto-resumed to avoid double billing. |
| “Segment … overlaps or is out of order” | Should be prevented by `normalizeSegmentBounds()` in `lib/transcript/segment.ts`. If a new provider reintroduces it, inspect its timestamps. |
| Settings page shows “could not be read” / “too large” | The app fell back to defaults. Delete `.data/settings.json` and re-enter keys; it is safe to remove. |
| ffmpeg/ffprobe missing | Run `npm install`; `requireBinary()` gives a clear error if the static binary is absent. |
| Build fails while dev is running | Stop dev; both use `.next`. |
| Upload fails at the provider size limit | The app accepts up to 4 hours locally, but OpenRouter is capped at 25 MB / 30 min. Use Scribe for long files. |

## Data, backups, and privacy

- Everything persistent is under `.data/`: `settings.json`, and `library/{id}/` with audio,
  transcripts, raw responses, peaks, and history.
- `.env.local` and `.data/` are gitignored. Never commit or share them.
- `.data/settings.json` contains plaintext API keys. Encrypt backups or exclude that file.
- If the project folder is cloud-synced (OneDrive, Dropbox, etc.), these files sync off the machine
  too.
- Delete a conversation from the library to remove its audio, transcript, raw response, peaks, and
  archived versions.
- The app binds `127.0.0.1` and has no authentication. Do not expose it to a network.

## Contributing

Before opening a pull request:

```bash
npm run typecheck
npm test
npm run build
```

Keep transcript invariants intact, keep keys server-side, and do not add `NEXT_PUBLIC_` secrets.
