# Transcriber

A local-first web app for long conversations: upload an audio file, transcribe it with speaker labels
and timestamps, then read and listen side by side. Built for Cantonese, English, Bengali, and
code-switched audio where no single model wins everywhere.

![two panes: searchable transcript on the left, waveform and playback on the right](docs/screenshot.png)

Everything runs on your computer. There is no account, no server, and no database; audio is sent only
to the transcription provider you choose, and transcripts stay under `.data/` on your machine.

## Requirements

- **Node.js 20.9 or newer** and npm — [download Node.js](https://nodejs.org/)
- Windows, macOS, or Linux
- An API key from a transcription provider (optional — the app has an offline mock mode)

## Quick start

### Easiest: double-click a launcher

- **Windows:** double-click [`start-windows.bat`](start-windows.bat).
- **macOS:** double-click [`start-mac-linux.command`](start-mac-linux.command). If macOS blocks it,
  right-click → **Open**.
- **Linux:** run `./start-mac-linux.command` (or `bash start-mac-linux.command`).

The launcher checks Node.js, installs dependencies on the first run, finds a free port, starts the
app, and opens your browser. Then click **Settings** and paste an API key. Windows may show a
SmartScreen prompt for a downloaded `.bat`; choose **More info → Run anyway**.

Keep the launcher window open while you use the app — closing it stops the server.

### From a terminal

```bash
git clone https://github.com/mahirtaherosl-eng/transcriber_note_coding.git
cd transcriber_note_coding
npm install
npm run dev
```

Open <http://127.0.0.1:3000>, then click **Settings** and paste an API key. That's it — the next
upload uses the real provider.

No key yet? The app runs in **offline mock mode**: it produces a synthetic two-speaker conversation
so you can try the whole UI for free.

```bash
npm run fixture   # create a 45-second demo conversation in the library
```

## API keys

Keys are entered on the in-app **[Settings](http://127.0.0.1:3000/settings)** page. They are stored
in `.data/settings.json` on your machine, are never sent anywhere except the provider, and apply
immediately — no restart. The API only ever returns whether a key is configured, never the value.

| Provider | Best for | Cost (approx.) | Get a key |
|---|---|---|---|
| **OpenRouter MAI-Transcribe-2** (recommended) | Cantonese, code-switching, diarization | ~$0.10 / audio-hour | <https://openrouter.ai/keys> |
| **ElevenLabs Scribe v2** | English, Mandarin, long files (~10 h) | ~$0.22 / audio-hour | <https://elevenlabs.io> |
| **Google Gemini 3.5 Transcribe** | 30-minute diarized files | ~$0.18–0.30 / audio-hour | <https://aistudio.google.com/apikey> |
| **Offline mock** | Trying the UI with no key | free | — |

Notes:

- OpenRouter requires a **$0.50 minimum account balance for audio requests**. A `402` with that
  message means top up, not a bad key.
- OpenRouter MAI supports about 30 minutes per request; Scribe supports long meetings.
- To use a different OpenRouter model, set `OPENROUTER_MODEL` in `.env.local` and restart.
- `.env.local` is still supported as an advanced alternative to Settings. Copy `.env.example` and
  uncomment what you need; env changes require a restart. See
  [the configuration notes](docs/development.md#api-keys-and-defaults).

## What the explorer does

- Search within the transcript, with match counts, next/previous, and an “Only matches” filter.
- Filter by speaker with colour-coded chips; rename speakers in place.
- Click a timestamp, or **Ctrl/Cmd+click a line**, to jump the audio there and play.
- Drag the waveform or use the scrubber; the transcript follows and highlights the current line.
- Playback speed 0.5×–3× (pitch-preserving), jump-to-time input, follow-playback toggle.
- **Re-transcribe with another engine or language** from the header. The previous transcript stays
  readable (read-only) while the run proceeds and is kept under **Versions**, where any version can
  be downloaded or restored. Restoring archives the current version first, so it is reversible.
- **Right-click a line to edit it in place.** Enter saves, Shift+Enter adds a newline, Esc cancels.
  IME composition is respected, so committing a Cantonese or Bengali candidate with Enter does not
  end editing. Edits persist to the transcript file and are included in every export.
- Export JSON, SRT, WebVTT, plain text, or a zip containing the transcript and audio.

### Keyboard

| Key | Action |
|---|---|
| Space | Play / pause |
| ← / → | Seek −5s / +5s |
| `[` / `]` | Slower / faster |
| `/` | Focus search |
| Ctrl/Cmd+Z | Undo the last text edit |
| Enter / Shift+Enter / Esc | Save / newline / cancel while editing |

## How it works

```
upload ──stream──> .data/library/{id}/original.ext
                         │  ffprobe + sha256
                         ▼
                  disk-backed job queue
                         │  OpenRouter MAI, Scribe, Gemini, or mock
                         ▼
       transcript.json + peaks.json + raw.json
                         │  previous transcript → history/{version}.*
                         ▼
                  explorer /c/{id}
```

- Local-only: no database, no auth. Everything is files under `.data/` (gitignored).
- Audio is streamed to disk and served back with full HTTP Range support, including suffix ranges —
  required for seeking in M4A files whose `moov` atom sits at the end.
- Waveform peaks are precomputed with ffmpeg at ~16k min/max buckets, so the browser never decodes
  hours of audio.
- The transcript is a portable, versioned `.transcript.json` (see
  [`lib/transcript/schema.ts`](lib/transcript/schema.ts)). Import one from the home page; if the
  audio is missing you can attach it later and the timestamps line up.
- Re-transcribing archives the previous transcript under `history/` before replacing it; the
  **Versions** menu can download or restore any version.
- A server restart while a job is running marks it **interrupted** rather than silently retrying, so
  an ambiguous failure cannot bill twice.

More detail: [architecture](docs/architecture.md) · [providers](docs/providers.md).

## Your data

| Path | Contents |
|---|---|
| `.data/library/{id}/` | original audio, transcript, raw provider response, peaks, history |
| `.data/settings.json` | API keys saved from the Settings page (plaintext) |
| `.env.local` | optional environment keys and `STT_PROVIDER` |

- `.data/` and `.env.local` are **gitignored**. Never commit or share them.
- A `.data/` backup contains plaintext keys — encrypt the backup or exclude `settings.json`.
- If this folder lives in OneDrive/Dropbox, those files sync off your machine too.
- Delete a conversation from the library to remove its audio, transcript, raw response, peaks, and
  archived versions.
- The app binds to `127.0.0.1` and has no authentication. Do not expose it to a network.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start on `127.0.0.1:3000` |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | Generate Next types and type-check |
| `npm test` | Unit tests |
| `npm run fixture` | Create a demo conversation without an API call |
| `npm run eval -- <audio>` | Compare providers and optional WER/CER |

## Troubleshooting

| Symptom | Fix |
|---|---|
| Port 3000 in use | Stop the other process, or `npm run dev -- -p 3001` |
| “The … engine needs an API key” | Add the key in Settings, or choose Auto/mock |
| OpenRouter 402 | Add credit; audio requests require a $0.50 minimum balance |
| OpenRouter 400/401 | Try WAV/MP3, and check the key in Settings |
| Job shows **interrupted** | The server restarted mid-job; click Retry |
| Changes to `.env.local` ignored | Restart `npm run dev`; Settings changes apply immediately |
| ffmpeg/ffprobe missing | Re-run `npm install` |

The full troubleshooting table, verification checklist, and contributor notes are in
[development](docs/development.md). Current gaps are tracked in [known issues](docs/known-issues.md).

## Limitations

- Colloquial Cantonese is still imperfect: some engines emit Standard Written Chinese. Compare
  engines on your own audio with `npm run eval`.
- OpenRouter MAI is limited to about 30 minutes per request; long meetings need Scribe or chunking.
- Search is per-document; there is no cross-file index.
- No speaker merging or segment split/merge yet.
- Very large WAV/AIFF files are uploaded as-is rather than transcoded to FLAC.
- Version history is not included in the zip export.

## License

[MIT](LICENSE)
