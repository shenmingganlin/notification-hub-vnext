# Diagnostics Protocol Invalid JSON Fix Plan

**Goal:** Stop Runtime JSON serialization failures that caused the diagnostic export to accumulate 104 `PROTOCOL_INVALID_MESSAGE` errors.

**Evidence:** The diagnostic timeline showed repeated `PROTOCOL_INVALID_MESSAGE` errors during `scene-create`, `scene-expire`, and especially `health-sync`. A live probe against the Runtime reproduced valid health frames, while a control-character regression exposed the serializer boundary: C++ escaped only quote, backslash, newline, carriage return, and tab, leaving other C0 control characters illegal inside JSON strings.

**Fix:** Extend the C++ JSON string escaper to encode backspace and form feed with short escapes and every remaining control byte below U+0020 as `\\u00XX`. Add protocol self-test coverage and a live Node-to-Runtime Named Pipe test with control characters in a card body.

**Verification:**

- Runtime protocol self-test: passed.
- CTest: 27/27 passed.
- Node full suite: 535 tests, 523 passed, 12 skipped, 0 failed.
- `npm run check`: passed.
- `git diff --check`: passed.
- Release ZIP rebuilt with the repaired `build/vs2022-debug` Runtime.

**Release artifact:** `dist/notification-hub-vnext-0.1.0-alpha.15.zip`

**SHA256:** `0BCE9F6BC55A94707F3D847D973B109D30CD2B8933150833CFEE87FDC496351C`

**Manual acceptance:** Reload the ZIP in Hana, create or trigger a notification whose text includes unusual control characters if possible, then inspect a fresh diagnostic export. Historical entries remain in the old export; success means no new `PROTOCOL_INVALID_MESSAGE` entries appear after reload.
