# Architecture

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript |
| Styling | Tailwind CSS 4 (custom theme in `app/globals.css`) |
| Client state | `zustand` (`lib/client/store.ts`) |
| Validation | `zod` (`lib/transcript/schema.ts`) |
| Audio processing | `ffmpeg-static` / `ffprobe-static` (`lib/audio/`) |
| Provider HTTP | `undici` (long-timeout `Agent` for STT calls) |
| Zip export | `archiver` 7 |
| Tests | Vitest (`tests/`) |

There is no database, no auth, and no server-side user account. Everything persistent is files under
`.data/` on the machine.

## End-to-end flow

```
Browser
  │  raw-body stream (not multipart)
  ▼
POST /api/transcriptions?fileName=…&language=…&provider=…
  │  saveRequestBody() → .data/library/{id}/original.ext
  │  ffprobe duration; sha256; create job.json; enqueue(id)
  ▼
Disk-backed job queue (lib/jobs/queue.ts)
  │  provider.transcribe()  (OpenRouter MAI, Scribe, Gemini, mock, …)
  │  buildTranscript(..., run time) → segmentTokens()
  │  archive current transcript → history/{version}.transcript.json + .meta.json
  │  raw provider response → raw.json
  │  transcript.json + peaks.json
  ▼
Explorer (/c/{id})
  ├─ GET /api/transcriptions/{id}            (status while running)
  ├─ GET /api/transcriptions/{id}/transcript (completed transcript)
  ├─ GET /api/audio/{id}                     (Range streaming for playback)
  ├─ GET /api/peaks/{id}                     (precomputed waveform)
  ├─ PATCH …/transcript                      (inline edits / speaker renames)
  ├─ POST …/retranscribe                     (reuse audio, change engine/language)
  ├─ GET …/history                           (versions)
  ├─ GET …/history/{version}                 (download a version)
  ├─ POST …/history/{version}?action=restore (swap current transcript, reversible)
  └─ GET /api/export/{id}?format=json|srt|vtt|txt|zip
```

## Directory map

```
app/
  page.tsx                              upload + recent library
  c/[id]/page.tsx                       explorer route
  api/transcriptions/route.ts           POST upload, GET list (+ defaultProvider)
  api/transcriptions/[id]/route.ts      GET status, DELETE, POST retry/cancel
  api/transcriptions/[id]/transcript/   GET + PATCH transcript
  api/transcriptions/[id]/audio/        POST attach audio to an imported transcript
  api/audio/[id]/route.ts               HTTP Range streaming (206/416/HEAD)
  api/peaks/[id]/route.ts               waveform peaks (cached)
  api/export/[id]/route.ts              JSON/SRT/VTT/TXT/zip
  api/import/route.ts                   import .transcript.json
components/
  upload/UploadDropzone.tsx             file picker, language/provider/speaker count
  explorer/Explorer.tsx                 load/poll, editing, undo, attach, layout
  explorer/TranscriptPane.tsx           search, speaker filter, follow scroll
  explorer/TranscriptRow.tsx            row rendering + right-click editor
  explorer/AudioPane.tsx                transport, speed, attach prompt
  explorer/Waveform.tsx                 canvas peaks/segments/playhead
  explorer/usePlaybackSync.ts           audio time → store, keyboard shortcuts
lib/
  providers/                            one adapter per engine; registry + resolution + client catalog
  transcript/                           schema, segmentation, build, search, export, lookup
  history.ts                            transcript version archive (archive/list/read)
  jobs/                                 disk job records + queue
  audio/                                ffmpeg paths, probe, peaks, Range parsing
  client/                               fetch helpers + zustand store
  storage.ts                            `.data` layout, atomic writes, sha256
sidecar/                                optional local Qwen3-ASR + pyannote (experimental)
scripts/                                fixture and provider eval helpers
tests/                                  segment/search/range unit tests
```

## Storage layout

```
.data/library/{id}/
  job.json          status, language, provider/model, progress, error, heartbeat
  original.{ext}    original audio (never modified)
  transcript.json   canonical portable transcript (current version)
  raw.json          unmodified response of the current run only (not versioned)
  peaks.json        interleaved min/max waveform buckets
  history/
    {version}.transcript.json   archived transcript (full TranscriptFile)
    {version}.meta.json         provider/model/language, timestamps, counts, digest
```

`version` is `YYYYMMDDThhmmssZ-<6 hex>`, so versions sort lexicographically by archive time.
History is created at the overwrite point, not at request time, so failed runs never lose the current
transcript. See “Version history” below.

`job.status` is one of `queued | processing | completed | failed | interrupted | cancelled`.
`interrupted` is deliberate: a server restart must not silently retry and double-bill. Retry is an
explicit user action. `queue.ts` keeps the runner chain on `globalThis` and reconciles disk jobs on
first access.

## Transcript model

Defined in [`lib/transcript/schema.ts`](../lib/transcript/schema.ts); validated on every read/write.

- `schemaVersion: 1`
- `createdAt` is the time the run that produced this transcript finished, so re-runs get a new
  timestamp (the original upload time stays on `job.createdAt`).
- `source` includes the audio SHA-256 so a re-attached file can be checked against the transcript.
- `speakers[]` stores display names and colors, so renames survive export/import.
- `segments[]` are sorted, half-open, non-overlapping; each has `startMs`, `endMs`, `speakerId`,
  `text`, optional `edited`, and lexical `words[]`.
- Invariants are enforced by `superRefine`; `writeTranscript()` throws a readable error if a future
  provider violates them.

**Important:** `lib/transcript/segment.ts` normalizes boundaries after grouping. Provider
timestamps are floats; converting them to integer milliseconds can invert adjacent boundaries by
1 ms. `normalizeSegmentBounds()` trims the earlier segment's end to the next start, renumbers, and
guarantees ordered non-overlapping output. Do not remove this; the original production failure was
`Segment seg_0013 overlaps or is out of order`.

## Version history

`POST /api/transcriptions/{id}/retranscribe` queues a run with a new provider/language but reuses the
stored audio. It does **not** archive anything itself. `runJob` builds the new transcript, then calls
`archiveCurrentTranscript(id, "rerun")` immediately before overwriting `transcript.json`:

- Archiving at the overwrite point covers every path that can replace a transcript (including a retry
  of a completed job) and captures edits made up to the last moment.
- If archiving throws, the job fails and the current transcript is untouched.
- Duplicates are skipped by comparing a sha256 digest (of the zod-parsed transcript) against every
  archived version, so restores and repeated runs do not pile up identical copies.
- A corrupt `transcript.json` is never silently overwritten; the run fails instead.

While a run is in progress the previous transcript stays current and the explorer shows it read-only
with a progress banner. `PATCH …/transcript` returns 409 for `queued`/`processing` jobs, so an edit
cannot race the write. On completion the new transcript replaces it.

Restoring an archived version archives the current transcript (`reason: "restore"`) and then copies
the chosen version into `transcript.json`, so the swap is reversible. The job's provider, model,
language and duration are updated to match. A warning is returned when the archived transcript's
audio SHA-256 differs from the currently attached audio.

`raw.json` belongs to the current transcript only: it is overwritten on each run and is not archived
or restored with a version.

## Provider contract

[`lib/providers/types.ts`](../lib/providers/types.ts):

```ts
type Token = {
  text: string;
  type: "word" | "spacing" | "audio_event";
  startMs: number;
  endMs: number;
  speakerId?: string | null;
  confidence?: number;
};

interface SttProvider {
  id: "elevenlabs" | "gemini" | "openrouter" | "qwen" | "soniox" | "azure" | "mock";
  label: string;
  capabilities: { languages: string[]; diarization: boolean; wordTimestamps: boolean; … };
  transcribe(input, ctx): Promise<ProviderResult>;
}
```

Adapters return flat tokens; shared code maps provider speaker ids to `spk_1…` and builds segments.
`segmentTokens()` starts a new segment on speaker change, a >700 ms gap, a sentence end after ~120
chars, or a 15 s cap. It concatenates `word` + `spacing` tokens so English/code-switched text keeps
spaces, and joins CJK/Thai without spaces. `normalizeSegmentBounds()` then fixes overlaps.

## Upload, audio, and peaks

- Upload is a **raw body stream**: `Readable.fromWeb(request.body).pipe(createWriteStream(...))`,
  with a byte limiter (`lib/server/upload.ts`). Do not switch to `request.formData()`; it buffers the
  whole file.
- Audio is served with complete Range semantics: `206`, `Content-Range`, `Accept-Ranges`, `HEAD`,
  open-ended and suffix ranges, `416`. M4A files often keep the `moov` atom at the end, so suffix
  ranges are required for seeking.
- Peaks are generated server-side by piping mono 8 kHz s16le PCM from ffmpeg through bounded
  min/max bucketing (~16k buckets), cached in `peaks.json`. The browser never decodes hours of audio.

## Playback / transcript sync

- **Audio time is the single source of truth.** `usePlaybackSync` attaches listeners once and updates
  the store at ~10 Hz; the canvas waveform repaints its playhead on rAF.
- `findSegmentAtTime()` in `lib/transcript/lookup.ts` binary-searches segments; gaps yield `null`.
- Transcript rows derive `activeSegmentId` from the store selector, so the explorer does not
  re-render at 10 Hz.
- Ctrl/Cmd+click a row seeks and plays; the timestamp button seeks without a modifier. Plain click is
  intentionally inert so text selection works.
- Waveform drag seeks; the transcript follows unless the user recently scrolled (3 s interaction
  grace period).
- Inline editing: right-click swaps the row to a textarea; `isComposing` is respected for Cantonese
  and Bengali IMEs; Enter saves, Shift+Enter newlines, Esc cancels. PATCH is optimistic with rollback
  and a session undo stack.

## Security and privacy

- The app binds `127.0.0.1` via `next dev -H 127.0.0.1`. Endpoints are unauthenticated and can read
  or delete local files; never expose them on a public interface.
- API keys are read server-side only. There is no `NEXT_PUBLIC_` key.
- Audio is sent only to the selected provider. `.data/` and `.env.local` are gitignored.
- The zip export bundles the original audio and transcript; the JSON export is portable and
  re-importable.
