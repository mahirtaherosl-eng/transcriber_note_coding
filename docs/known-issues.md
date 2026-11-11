# Known issues and next steps

Prioritized. “P1” means user-visible or likely to block real use.

## P1 — Colloquial Cantonese accuracy is still partial

**Evidence.** In comparison testing, ElevenLabs Scribe v2 (auto/`yue`/`zh`) produced largely
Standard Written Chinese with few strong Cantonese particles. OpenRouter MAI-Transcribe-2 preserved
more Cantonese lexicon and particles such as `你哋`, `我哋`, `依家`, `咯`, while many lines were still
written Chinese/Mandarin. Some of that may be genuinely Mandarin in the audio; mixed transcripts are
expected for code-switched recordings.

**What to try next, in order:**
1. Run the same file through the native Google Gemini provider with a `GEMINI_API_KEY`. It supports
   `yue-Hant-HK`, verbatim mode, diarization, and word timestamps in one pass, but is unverified here.
   Compare particle counts and speaker labels against MAI.
2. Add `phraseList` / `keyterm` biasing for names and domain terms (MAI supports
   `provider.options.azure.phraseList.phrases` through OpenRouter).
3. Compare auto locales vs an explicit `yue` run; one locale can improve Cantonese but degrade
   Mandarin.
4. Only then consider a Cantonese-specific model or fine-tune.

**Files:** [`lib/providers/openrouter.ts`](../lib/providers/openrouter.ts),
[`lib/providers/gemini.ts`](../lib/providers/gemini.ts), [`lib/languages.ts`](../lib/languages.ts).

## P1 — Long-meeting limits

- OpenRouter's upstream timeout is **60 s**, its request cap is **25 MB**, and MAI is limited to
  about **30 minutes** with diarization/word timestamps.
- Scribe supports roughly 10 hours; the app's upload cap is 4 hours
  (`app/api/transcriptions/route.ts`, `MAX_DURATION_SEC`).
- The OpenRouter adapter transcodes to MP3 (32 kbps above 30 minutes) but does not chunk.

**Next:** implement chunking with timestamp offsets and consistent speaker labels, or explicitly
route long meetings to Scribe. Test with a 45–60 minute file before claiming support.

## P2 — Provider adapters and tests are incomplete

- Native Google Gemini is implemented but has never been run end-to-end.
- Unit tests cover segmentation, search, Range parsing, history, settings, and provider ids; there are
  no adapter/API/UI tests.
- Add Vitest tests with mocked `fetch` for the OpenRouter and Scribe response parsers, plus API route
  tests for upload/status/settings.

**Files:** [`tests/`](../tests/), [`scripts/eval-providers.ts`](../scripts/eval-providers.ts).

## P2 — Provider label drift

[`lib/providers/catalog.ts`](../lib/providers/catalog.ts) hardcodes **MAI-Transcribe 2 (OpenRouter)**
for the `openrouter` engine. If `OPENROUTER_MODEL` is changed to `google/gemini-3.5-transcribe`, the
picker label is wrong (the explorer header still shows the actual provider/model from the transcript).
Either make the label dynamic or split the engines into separate provider ids.

## P2 — Diarization parameters

The OpenRouter MAI request enables Azure diarization but does not pass a max speaker count. The upload
form's “known speakers” value is ignored by the OpenRouter provider. Pass a maximum if the upstream
schema supports it; otherwise document that MAI chooses the count automatically.

## P2 — Detected-language metadata

OpenRouter returns a single global language (usually `en`) for a mixed transcript. The adapter labels
CJK+Latin transcripts as `mixed`, but there is no per-segment language metadata. If language-per-line
matters, extend the transcript schema (version bump) and populate it from the provider where
available.

## P2 — Settings limitations

- Keys are stored in plaintext in `.data/settings.json`. Encrypt backups or exclude the file.
- `.env.local` changes require a restart; saved Settings keys do not.
- A saved key takes precedence over an environment key. A revoked saved key keeps failing until it is
  cleared in Settings.
- The settings API is unauthenticated and relies on the app binding to `127.0.0.1`. Do not expose it.
- Only one process should use a given `.data/` directory.

## P3 — Explorer scope

- Search is per-document; there is no cross-file index.
- No segment split/merge, no speaker merge, no global speaker identity management.
- Speaker rename and per-segment speaker reassignment exist in the right-click edit mode.
- Waveform is a custom canvas; it does not support zoom or region editing.

## Suggested next actions

1. Verify native Google Gemini on a real trilingual file and compare with MAI.
2. Add provider parser tests and upload/status/settings integration tests.
3. Decide the long-meeting strategy (Scribe vs chunked MAI) and enforce it in the upload UI.
4. Only after those, revisit Cantonese-specific models.
