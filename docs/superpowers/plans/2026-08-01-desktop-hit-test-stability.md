# Desktop Hit-Test Stability Fix

## Symptom

`runtime_desktop_hit_test_self_test` occasionally reported:

```text
desktop hit test: cardOwned=0 cornerTransparent=1
INTERACTION_TRANSPARENT_HIT_FAILED
```

The card geometry and `WM_NCHITTEST` implementation were correct, but the test sampled `WindowFromPoint` immediately after moving and showing a topmost non-activating DComp window.

## Diagnosis

- Direct executable runs reproduced the failure intermittently.
- Repeated runs before the fix were unstable.
- The test already moved the HWND and called `UpdateWindow`, but used one fixed `Sleep(50)` before sampling.
- The failure was limited to the card point; the transparent corner behavior remained correct.
- This matches a desktop visibility/Z-order/compositor timing race rather than a change in hit-test geometry.

## Fix

After calculating the physical screen coordinates, poll both `WindowFromPoint` samples for up to 500 ms at 10 ms intervals. The test only succeeds when the card point resolves to the test HWND and the transparent corner does not.

The production `WM_NCHITTEST` behavior is unchanged.

## Verification

- Manual executable loop: 20/20 passed after the fix.
- Node check: passed.
- Node tests: 55 passed, 7 skipped.
- C++ build: passed.
- Full CTest: 20/20 passed.
- `git diff --check`: passed.
