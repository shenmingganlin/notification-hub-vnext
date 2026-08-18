# Visual Production Handoff Baseline

## Frozen engineering state

- Audio Engine WAV parser is owned by `runtime/audio-engine/wav-pcm.cpp/.hpp`.
- Retired `notification-hub-audio-service` target and source tree have been removed.
- Release binaries use MSVC size optimization: `/O1 /GL`, `/LTCG /OPT:REF /OPT:ICF`.
- Legacy PowerShell / Windows Media fallback remains in `plugin/domain/audio-adapter.js`.
- `.nhsound` and `.nhcombo` formats remain unchanged.

## Verification evidence

- Native CTest: 32/32 passed.
- Node tests: 698 total, 685 passed, 0 failed, 13 skipped.
- JavaScript syntax: 232 files passed.
- Audio Engine self-test: passed.
- Release package validation: passed.
- `git diff --check`: passed.

## Current optimized artifact

```text
notification-hub-vnext-0.1.0.zip
SHA256: 5D9213DC5788F23B8B22235614ADFDC7B1D17BBA560EE7BDF9E33605CDD81219
ZIP size: 479736 bytes
Runtime: 277504 bytes
Audio Engine: 134144 bytes
```

## Rollback

The previously validated optimized package remains identifiable by its earlier SHA256:

```text
EDAD33B074CC977723B212AFAD9476B273962277F9A10D23FC5B9E474B6B9EE1
```

No visual feature implementation is included here. The next change stream may focus on visual production while preserving this audio and release baseline.
