# Known issues and next steps

Prioritized for the next developer/AI. “P1” means user-visible or likely to block real use.

## P1 — Cantonese colloquial accuracy is still partial

**Evidence.** Scribe v2 auto/`yue`/`zh` all produced Standard Written Chinese with zero strong
Cantonese particles. MAI-Transcribe-2 is better: it preserves `你哋`, `我哋`, `依家`, `咯`, and the
app transcript contains 3 speakers and 367 word timestamps for 118 s. But many lines are still
written Chinese/Mandarin (`还需要`, `不知道啊`, `那样我们聊一下`). Some of that is genuinely Mandarin
in the trilingual meeting, so a mixed transcript is expected.

**What to try next, in order:**
1. Run the same 118 s file through the **native Google Gemini** provider with a `GEMINI_API_KEY`.
   It supports `yue-Hant-HK`, verbatim mode, diarization, and word timestamps in one pass; it has
   never been run here. Compare Cantonese particle counts and Mandarin quality.
2. If using the direct Azure MAI path later, compare auto `locales` (omit) vs `["yue"]` with
   `transcribeStyle: "verbatim"`. One locale only; forcing Cantonese may degrade Mandarin.
3. Add `phraseList` / `keyterm` biasing (MAI supports `provider.options.azure.phraseList.phrases`)
   for names and domain terms.
4. Only then consider a Cantonese-specific model/fine-tune. Qwen3-ASR 1.7B is not the answer at this
   hardware/configuration (see below).

**Files:** [`lib/providers/openrouter.ts`](../lib/providers/openrouter.ts),
[`lib/providers/gemini.ts`](../lib/providers/gemini.ts), [`lib/languages.ts`](../lib/languages.ts).

## Done — Re-transcribe and transcript history (2026-11-04)

Shipped: `POST …/retranscribe`, archive-at-overwrite in `runJob`, `GET …/history`,
`GET …/history/{version}` (download), `POST …/history/{version}?action=restore`, a re-transcribe and
versions menu in the header, read-only display of the previous transcript during a run, and a 409 on
`PATCH …/transcript` while queued/processing. Delete a conversation to remove its history.

Known gaps in this area:
- `raw.json` is overwritten per run and is neither archived nor restored with a version.
- History is not included in the zip export and there is no version diffing or pruning.
- The re-transcribe menu cannot pass provider-specific options such as Azure `phraseList`.

## P1 — Long-meeting limits

- OpenRouter’s upstream STT timeout is **60 s** and its request cap is **25 MB**; MAI is fast
  (4.4 s for 118 s) but m4a is transcoded to MP3, and very long files can still hit the cap/limit.
- MAI supports up to ~30 min with diarization/word timestamps (native model limit); OpenRouter may
  time out sooner.
- Scribe supports ~10 h; the app’s upload cap is 4 h
  (`app/api/transcriptions/route.ts`, `MAX_DURATION_SEC`).
- The OpenRouter adapter selects 32 kbps MP3 above 30 minutes to stay under 25 MB, but does not
  chunk.

**Next:** implement chunking with timestamp offsets and consistent speaker labels (pyannote on the
full file or MAI on chunks), or route long meetings to Scribe. Test with a 45–60 min file before
claiming support.

## P2 — Provider adapters and tests are incomplete

- Native Google Gemini (`lib/providers/gemini.ts`) is implemented but never executed.
- Azure direct (`lib/providers/azure.ts`) and Soniox (`lib/providers/soniox.ts`) are stubs.
- Unit tests cover segmentation, search, Range parsing, and export; there are no adapter/API/UI
  tests.
- Add Vitest tests with mocked `fetch` for the OpenRouter and Scribe response parsers, plus an API
  route test for upload/job status.
- See [`tests/`](../tests/) and `scripts/eval-providers.ts`.

## P2 — Provider label drift

[`app/page.tsx`](../app/page.tsx) hardcodes **MAI-Transcribe 2 (OpenRouter)** for the `openrouter`
engine. If `OPENROUTER_MODEL` is changed to `google/gemini-3.5-transcribe`, the dropdown label is
wrong (the explorer header still shows the actual provider/model from the transcript). Either make
the label dynamic or split the engines into separate provider ids.

## P2 — Diarization parameters

The OpenRouter MAI request enables Azure diarization but does not pass `maxSpeakers`. The upload
form’s “known speakers” value is currently ignored by the OpenRouter provider. Check the OpenRouter
Azure option schema and pass a max speaker count if supported; otherwise document that MAI chooses
the count automatically.

## P2 — Detected-language metadata

OpenRouter returns a single global language (usually `en`) for a mixed transcript. The adapter
labels CJK+Latin transcripts as `mixed`, but there is no per-segment language metadata. If
language-per-line matters, extend the transcript schema (version bump) and populate it from the
provider where available.

## P3 — Explorer scope

- Search is per-document; there is no cross-file index.
- No segment split/merge, no speaker merge, no global speaker identity management.
- Speaker rename and per-segment speaker reassignment exist in the right-click edit mode.
- Waveform is a custom canvas; it does not support zoom or region editing.

## P3 — Local Qwen3-ASR/pyannote pipeline

Do not resume this without a new model or hardware. Facts:

- `sidecar/.venv` has CPU PyTorch 2.15 + `qwen-asr==0.0.6`; `pyannote.audio` is **not installed**;
  `HF_TOKEN` is unset.
- The ASR gate on the 118 s file detected English, translated Chinese into English, produced **0**
  Cantonese particles in 490 chars, and took **1,889.8 s** (~31 min) on CPU.
- `sidecar/server.py` (aligner + pyannote + alignment) has not completed an end-to-end run.
- The 4 GB Quadro T2000 cannot comfortably hold the 1.7B model plus the 0.6B aligner.

## Suggested next actions

1. Test native Google Gemini on the same 118 s file if a `GEMINI_API_KEY` is available; compare
   Cantonese particles and speaker labels against MAI. Re-transcribe now makes this a one-click
   comparison on an existing conversation.
2. Add provider parser tests and an upload/status integration test.
3. Decide the long-meeting strategy (Scribe vs chunked MAI) and enforce it in the upload UI.
4. Only after those, revisit Cantonese-specific models or local inference.
