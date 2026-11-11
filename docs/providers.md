# Providers

The app ships with four engines. Keys can be saved in the in-app Settings page or supplied through
`.env.local`; the mock engine needs no key.

| Provider | Status | Cantonese | Diarization | Word timestamps | Limits | Cost |
|---|---|---|---|---|---|---|
| **OpenRouter MAI-Transcribe-2** | Recommended | `yue`, code-switching; partial colloquial | yes (Azure upstream option) | yes | ~30 min with diarization; 25 MB / 60 s upstream | ~$0.10/audio-hour |
| **ElevenLabs Scribe v2** | Supported | `yue` accepted, but often written Chinese | yes (32 speakers) | yes | ~10 h | ~$0.22/audio-hour |
| **Google Gemini 3.5 Transcribe** | Implemented, not verified in this repo | `yue-Hant-HK` hint | yes | yes | 30 min with diarization | ~$0.18–0.30/audio-hour |
| **Mock** | Always available offline | n/a | synthetic 2 speakers | synthetic | — | free |

## OpenRouter MAI-Transcribe-2 (recommended)

- Adapter: [`lib/providers/openrouter.ts`](../lib/providers/openrouter.ts).
- Endpoint: `POST https://openrouter.ai/api/v1/audio/transcriptions`.
- Default model: `microsoft/mai-transcribe-2`; override with `OPENROUTER_MODEL`.
- Requests diarization via `provider.options.azure.diarization.enabled`. **This "Azure" refers to
  OpenRouter's Azure upstream for MAI**, not to a direct Azure Speech adapter (there isn't one).
- MAI's Azure upstream rejects M4A/MP4/AAC/WebM/OGG, so the adapter transcodes unsupported formats
  to mono 16 kHz MP3; above 30 minutes it selects 32 kbps to stay under the request cap.
- OpenRouter caps audio requests at 25 MB and its upstream timeout is 60 seconds. The adapter rejects
  audio longer than 30 minutes because diarization/word timestamps would exceed the request limits.
- OpenRouter requires a **$0.50 minimum account balance for audio requests** platform-wide. A `402`
  with that message means top up, not a bad key.
- Supports 60 languages including Cantonese (`yue`), language identification, mid-speech
  code-switching, diarization, and word timestamps.
- OpenRouter reports a single global language (often `en`) even for mixed audio. The adapter labels
  CJK+Latin transcripts as `mixed`; the explorer shows **Mixed languages**.

## ElevenLabs Scribe v2

- Adapter: [`lib/providers/elevenlabs.ts`](../lib/providers/elevenlabs.ts).
- Model `scribe_v2`; requests `diarize=true`, word timestamps, and an optional speaker count.
- Handles long files (~10 h) and is a good fallback for English/Mandarin.
- Cantonese caveat: forcing `yue` changes the detected label, but in testing the text was still
  largely **Standard Written Chinese** with few colloquial particles (`係/唔/嘅/咗/佢/哋/喺/冇/嗰/啲`).
  Use it for English/Mandarin and long recordings, not as a colloquial Cantonese solution.

## Google Gemini 3.5 Transcribe

- Adapter: [`lib/providers/gemini.ts`](../lib/providers/gemini.ts).
- Uses the Interactions API (`POST /v1beta/interactions`) with verbatim mode, speaker diarization,
  word timestamps, and inline base64 audio.
- Requires a `GEMINI_API_KEY`; this path is **implemented but has not been verified end-to-end** in
  this repository. Treat it as experimental.
- 30-minute limit with diarization and word timestamps.
- Do not confuse it with OpenRouter's Gemini route: that endpoint does not expose diarization.

## Mock

- Adapter: [`lib/providers/mock.ts`](../lib/providers/mock.ts).
- Produces a synthetic two-speaker conversation with no network call. Used automatically when no key
  is configured, and handy for UI work and tests (`npm run fixture`).

## Language notes

- Cantonese uses Scribe's `yue` code, not `zh-HK`.
- `auto` is the default and works for most single-language files. For heavily code-switched
  Cantonese/English audio, try `yue` explicitly and compare.
- Some ASR models emit **Standard Written Chinese** for spoken Cantonese. If that happens, search for
  spoken particles (唔, 嘅, 咗) will miss. The raw provider response is kept in
  `.data/library/{id}/raw.json` so a post-processing pass can be added without re-billing.
- Add or change languages in [`lib/languages.ts`](../lib/languages.ts); the picker updates
  automatically.

## Costs

| Engine | Rate | Notes |
|---|---|---|
| OpenRouter MAI | ~$0.10/audio-hour | plus OpenRouter's $0.50 audio balance minimum |
| ElevenLabs Scribe v2 | ~$0.22/audio-hour | long files supported |
| Gemini | ~$0.18–0.30/audio-hour | depends on audio length/tokens |
| Mock | free | no network |

Vendor WER claims are contested; re-test on your own audio:

```bash
npm run eval -- path/to/clip.wav --providers=openrouter,mock --language=yue --reference=clip.txt
```

## Adding a provider

1. Add the id to `PROVIDER_IDS` in [`lib/providers/ids.ts`](../lib/providers/ids.ts). This updates the
   TypeScript union, schemas, and client catalog.
2. Implement `SttProvider` in `lib/providers/<id>.ts`; return flat `Token[]` with `startMs`, `endMs`,
   `speakerId`, and `type: "word"`. Read keys with `getProviderKey("<id>")` from
   `lib/settings/server.ts` so the Settings page and `.env.local` both work.
3. Register it in [`lib/providers/index.ts`](../lib/providers/index.ts) and decide the default
   resolution order.
4. Add a label to [`lib/providers/catalog.ts`](../lib/providers/catalog.ts) and any language mapping
   to [`lib/languages.ts`](../lib/languages.ts).
5. Make sure the transcript schema accepts the new id (it derives from `PROVIDER_IDS`), and add a key
   to `ENV_KEYS` in `lib/settings/server.ts` plus the Settings form if the provider needs one.
6. Add the env name to [`.env.example`](../.env.example), keep the key server-side, and test with
   `npm run eval -- <audio> --providers=<id>` or an upload. Never print the key.
7. Keep the raw provider response in `raw.json` for debugging.

## Why MAI is the default

Scribe handles long files and English/Mandarin well, but it normalizes spoken Cantonese toward
Standard Written Chinese. OpenRouter's MAI-Transcribe-2 preserved more Cantonese lexicon and
particles in testing while keeping diarization and word timestamps, at roughly half the per-hour
cost. It is not fully colloquial either; results vary by recording, so compare engines on your own
audio with the `eval` command.
