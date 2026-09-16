# Atomic File Replace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「tmp 写入 + bak 两段替换 + 同路径排队」收进一个深模块，Settings Store 与 SceneState 落盘改走该接缝，视觉/声音设置的弱替换升级为同一实现。

**Architecture:** 原子落盘模块只暴露 `replaceFileAtomically(filePath, contents, options)`。各 store 仍负责自己的快照序列化、校验和领域错误码，成为适配器。通知历史 store 本刀不动。

**Tech Stack:** Node.js `fs/promises`、`node:test`、现有 `settings-store-store` / `scene-state-store` 测试。

## Global Constraints

- 无 git：不要 `git add` / `git commit`。
- 不改工作室排版、协议字段、Native 声音、通知历史语义、描边 0、`settings-visual-client.js`。
- 不碰 `plugin/domain/notification-store-store.js`。
- 各 store 对外错误码保持原样（`SETTINGS_STORE_*`、`RUNTIME_SCENE_STATE_*`、`VISUAL_SETTINGS_*`、`SOUND_SETTINGS_*`）。
-  Sage 点头前不打试看 zip。
- 每个任务结束必须跑该任务点名的测试；禁止用「应该过了」收口。

## File map

- Create: `plugin/persistence/atomic-file-replace.js` — 深模块：排队、tmp、bak、回滚、清理。
- Create: `tests/node/atomic-file-replace.test.mjs` — 只打公共接口。
- Modify: `plugin/domain/settings-store-store.js` — 删除本地 `replaceFile` / `enqueue` / `artifacts`，改为调用原子落盘并映射错误码。
- Modify: `plugin/runtime/scene-state-store.js` — 同上。
- Modify: `plugin/domain/visual-settings-store-persistence.js` — `saveVisualSettingsSnapshot` 改走原子落盘。
- Modify: `plugin/domain/sound-settings-store-persistence.js` — `saveSoundSettingsSnapshot` 改走原子落盘。
- Unchanged: `plugin/domain/notification-store-store.js`、`plugin/routes/**`、`runtime/scene/**`。

---

### Task 1: 原子落盘模块

**Files:**
- Create: `plugin/persistence/atomic-file-replace.js`
- Test: `tests/node/atomic-file-replace.test.mjs`

**Interfaces:**
- Consumes: `node:fs/promises` mkdir / writeFile / rename / rm；可经 `fsOps` 注入。
- Produces:

```js
export async function replaceFileAtomically(filePath, contents, {
  encoding = 'utf8',
  fsOps = {}
} = {})
```

- `filePath` 非空字符串，否则抛 `ATOMIC_FILE_PATH_INVALID`。
- `contents` 为 string 或 Buffer。
- 成功返回 `filePath`。
- 同绝对路径串行排队。
- 先 `mkdir` 父目录，再 `writeFile(tmp, contents, { encoding, flag: 'wx' })`，再两段 rename（现文件 → bak，tmp → 现文件），成功后删 bak。
- 替换失败且已挪走现文件：把 bak rename 回去；回滚失败抛 `ATOMIC_FILE_ROLLBACK_FAILED`。
- 其它失败抛 `ATOMIC_FILE_REPLACE_FAILED`，`details` 含 `path`、`cause`。
- 失败时尽力 `rm(tmp, { force: true })`。

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { replaceFileAtomically } from '../../plugin/persistence/atomic-file-replace.js';

test('replaceFileAtomically writes a new file and leaves no tmp/bak', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'atomic-replace-'));
  const filePath = path.join(directory, 'doc.json');
  await replaceFileAtomically(filePath, '{"ok":true}\n');
  assert.equal(await readFile(filePath, 'utf8'), '{"ok":true}\n');
  assert.deepEqual(await readdir(directory), ['doc.json']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/node/atomic-file-replace.test.mjs`

Expected: FAIL，模块不存在。

- [ ] **Step 3: Write minimal implementation**

实现 `replaceFileAtomically`：校验路径、写 tmp、两段 rename、清 bak。先不必排队。

- [ ] **Step 4: Run the test and make sure it passes**

Run: `node --test tests/node/atomic-file-replace.test.mjs`

Expected: PASS

- [ ] **Step 5: Add empty-path, replace-existing, rollback, and queue tests one by one (red-green each)**

行为：

1. 空路径 → `ATOMIC_FILE_PATH_INVALID`
2. 已有文件再写 → 内容换成新的，目录里只剩目标文件
3. `fsOps.renameFile` 第一次成功（挪走现文件）、第二次失败 → 目标文件恢复旧内容，错误码 `ATOMIC_FILE_ROLLBACK_FAILED` 或在第二次失败且回滚成功时为 `ATOMIC_FILE_REPLACE_FAILED`（以「旧文件仍在原路径」为验收，错误码与实现注释写死一种并锁测试）
4. 对同一路径并发两次写入，后结束的那次内容是最后一次 `contents`

锁定错误码如下，测试按此断言：

- 空路径：`ATOMIC_FILE_PATH_INVALID`
- 替换失败且回滚成功：`ATOMIC_FILE_REPLACE_FAILED`
- 替换失败且回滚失败：`ATOMIC_FILE_ROLLBACK_FAILED`

- [ ] **Step 6: Re-run the whole new test file**

Run: `node --test tests/node/atomic-file-replace.test.mjs`

Expected: 0 fail

---

### Task 2: Settings Store 改为适配器

**Files:**
- Modify: `plugin/domain/settings-store-store.js`
- Test: `tests/node/settings-store-store.test.mjs`（不改断言，只当回归）

**Interfaces:**
- Consumes: `replaceFileAtomically(filePath, serialized, { fsOps })`
- Produces: 仍导出 `saveSettingsStoreSnapshot(snapshot, filePath, { fsOps } = {})` / `loadSettingsStoreSnapshot`；错误码仍为 `SETTINGS_STORE_PATH_INVALID`、`SETTINGS_STORE_PERSIST_FAILED`、`SETTINGS_STORE_LOAD_FAILED`

- [ ] **Step 1: Run existing settings store tests (baseline)**

Run: `node --test tests/node/settings-store-store.test.mjs`

Expected: PASS（改前基线）

- [ ] **Step 2: Replace local enqueue/replace with atomic replace**

`saveSettingsStoreSnapshot` 在 `serializeSettingsStoreSnapshot` 与 `validatePath` 之后调用 `replaceFileAtomically`。把 `ATOMIC_FILE_*` 映射为 `SETTINGS_STORE_PERSIST_FAILED`，保留 `details.path`。删除本文件内的 `replaceFile`、`enqueue`、`artifacts`。`fsOps` 原样下传。

- [ ] **Step 3: Run settings store tests**

Run: `node --test tests/node/settings-store-store.test.mjs`

Expected: PASS，含 `SETTINGS_STORE_PERSIST_FAILED` 那条。

---

### Task 3: SceneState store 改为适配器

**Files:**
- Modify: `plugin/runtime/scene-state-store.js`
- Test: `tests/node/scene-state-store.test.mjs`

**Interfaces:**
- Consumes: `replaceFileAtomically`
- Produces: 仍导出 `saveSceneState` / `loadSceneState`；错误码仍 `RUNTIME_SCENE_STATE_*`

- [ ] **Step 1: Run existing SceneState store tests (baseline)**

Run: `node --test tests/node/scene-state-store.test.mjs`

Expected: PASS

- [ ] **Step 2: Delete local two-stage replace / save queue; call atomic replace after serialize**

序列化仍用现有 `serializePersistedSceneState`。`ATOMIC_FILE_*` 映射为 `RUNTIME_SCENE_STATE_PERSIST_FAILED`。`loadSceneState` 与 bak 恢复逻辑保持现有行为。

- [ ] **Step 3: Run SceneState store tests**

Run: `node --test tests/node/scene-state-store.test.mjs`

Expected: PASS，包括「替换后不留 bak」。

---

### Task 4: 视觉设置与声音设置走同一接缝

**Files:**
- Modify: `plugin/domain/visual-settings-store-persistence.js`
- Modify: `plugin/domain/sound-settings-store-persistence.js`
- Test: `tests/node/visual-settings-store.test.mjs`
- Test: `tests/node/sound-settings-store-persistence.test.mjs`

**Interfaces:**
- Consumes: `replaceFileAtomically`
- Produces: `saveVisualSettingsSnapshot` / `saveSoundSettingsSnapshot` 签名与错误码不变

- [ ] **Step 1: Run visual settings store tests (baseline)**

Run: `node --test tests/node/visual-settings-store.test.mjs`

Expected: PASS

- [ ] **Step 2: Switch both save functions to atomic replace**

`saveVisualSettingsSnapshot` 仍先 `encode(snapshot)`，再 `replaceFileAtomically`；捕获后仍抛 `VISUAL_SETTINGS_PERSIST_FAILED`。声音设置同样，错误码保持 `SOUND_SETTINGS_PERSIST_FAILED`（或该文件现用码，不准改名）。

- [ ] **Step 3: Run visual + sound + settings + scene-state + atomic tests together**

Run: `node --test tests/node/atomic-file-replace.test.mjs tests/node/settings-store-store.test.mjs tests/node/scene-state-store.test.mjs tests/node/visual-settings-store.test.mjs tests/node/sound-settings-store-persistence.test.mjs`

Expected: 0 fail

---

## Later knives (not this plan)

2. 删除 `card-composition-contract.js`（ADR-005）
3. 折叠 SceneState 浅切片（吃本刀接缝）
4. 抽出 `index.js` 持久化生命周期
5. Native 空目录可删；`main.cpp` 不拆
