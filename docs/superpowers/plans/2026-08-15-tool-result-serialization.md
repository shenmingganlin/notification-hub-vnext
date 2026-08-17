# Dynamic Tool Result Serialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `run-notification-test` return a Hana SDK-compatible text envelope while preserving the structured result for Agent inspection and existing internal callers.

**Architecture:** Keep `runNotificationTest(input)` as the structured domain/runtime method. Add a thin dynamic-tool adapter that awaits that method and returns `{ content: [{ type: 'text', text }], details }`, where `text` is a bounded JSON summary and `details` is the full structured result. The adapter is used only by `ctx.registerTool`; internal runtime APIs remain structured.

**Tech Stack:** Node.js ESM, Hana dynamic `ctx.registerTool`, Node built-in test runner.

## Global Constraints

- Preserve the existing `runNotificationTest(input)` structured return shape.
- Follow the Hana tool result contract: `content: [{ type: "text", text: "..." }]`; optional structured metadata goes in `details`.
- Do not expose absolute paths, raw notification bodies, PowerShell scripts, or audio data in the tool text/details.
- Keep the tool bounded at 100 notifications and preserve `createCards`/`playSound` semantics.
- Do not change plugin installation or commit Git changes.

---

### Task 1: Add a regression test for the Hana result envelope

**Files:**
- Modify: `tests/node/notification-test-tool.test.mjs`

**Interfaces:**
- Consumes: the registered `run-notification-test` tool.
- Produces: an assertion that `execute()` returns Hana `content` text plus structured `details`.

- [x] **Step 1: Write the failing test**

Extend the existing registration test after calling `registrations[0].execute(...)`:

```js
assert.deepEqual(result.content?.map((part) => part.type), ['text']);
assert.match(result.content?.[0]?.text ?? '', /"generated":6/);
assert.equal(result.details?.generated, 6);
assert.equal(result.details?.storedNotifications, 6);
assert.equal(result.details?.failed, 0);
```

- [x] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
node --test tests/node/notification-test-tool.test.mjs
```

Expected: FAIL because the current dynamic execute handler returns the raw object without `content` or `details`.

---

### Task 2: Add the thin dynamic-tool result adapter

**Files:**
- Modify: `plugin/index.js:1921-1955`

**Interfaces:**
- Consumes: `runNotificationTest(input)` structured result.
- Produces: `createNotificationTestToolResult(input)` returning `{ content, details }`.

- [x] **Step 1: Implement the minimal adapter**

Add a method next to `registerNotificationTestTool()`:

```js
async createNotificationTestToolResult(input = {}) {
  const details = await this.runNotificationTest(input);
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(details)
    }],
    details
  };
}
```

Change only the dynamic registration handler:

```js
execute: async (input) => this.createNotificationTestToolResult(input)
```

Do not change `runNotificationTestTool`'s internal structured return or `runtimeTestApi.runNotificationTest`.

- [x] **Step 2: Run the focused test and verify it passes**

Run:

```powershell
node --test tests/node/notification-test-tool.test.mjs
```

Expected: PASS with the existing structured assertions moved to `result.details` and the new envelope assertions passing.

---

### Task 3: Verify the full project and release artifact

**Files:**
- Modify: `CURRENT-STATUS.md` only if the verified result changes the current status.
- Modify: `README.md` only if the public tool contract needs documenting.

- [x] **Step 1: Run focused and syntax checks**

```powershell
node --test tests/node/notification-test-tool.test.mjs
npm run check
npm run pressure -- --scenario all --count 1000
```

- [x] **Step 2: Run the full Node test suite**

```powershell
npm test
```

Expected: zero failures; skipped tests remain explicitly reported.

- [x] **Step 3: Check whitespace and inspect the diff**

```powershell
git diff --check
git diff -- plugin/index.js tests/node/notification-test-tool.test.mjs
```

- [x] **Step 4: Rebuild and inspect the release ZIP**

Use the existing release packaging script, then verify the ZIP contains the updated `plugin/index.js`. Do not commit.

- [ ] **Step 5: Stage the changed plan/source/test/release files for delivery**

Use `stage_files` with the resulting SessionFile references; do not place local absolute paths in the response.
