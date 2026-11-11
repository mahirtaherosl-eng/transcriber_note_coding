# Documentation

Start with the root [README](../README.md) to install and run the app.

- [architecture.md](architecture.md) — pipeline, storage, job queue, transcript model, version
  history, settings, playback sync, and privacy.
- [providers.md](providers.md) — supported transcription engines, costs and limits, language notes,
  and how to add a provider.
- [development.md](development.md) — local development, environment variables, commands, tests, and
  troubleshooting.
- [known-issues.md](known-issues.md) — current limitations and a prioritized backlog.

## Ground rules for contributors

1. **Never commit `.env.local`, `.data/`, or any API key.** All three are gitignored.
2. **The app is local-only and binds `127.0.0.1`.** There is no authentication; do not expose it to
   a network or add public endpoints.
3. **Keep transcript invariants** (ordered, non-overlapping, half-open intervals). The explorer's
   binary search and waveform depend on them.
4. **One process per `.data/` directory.** The queue and archive logic assume a single instance.
5. **Keys stay server-side.** There is no `NEXT_PUBLIC_` key, and the settings API never returns a
   key value.
