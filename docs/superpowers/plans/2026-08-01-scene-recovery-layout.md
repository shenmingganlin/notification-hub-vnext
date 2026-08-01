# Scene Recovery Layout State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Runtime 重启后的 recovery 在空卡片、先布局后创建卡片、先创建后布局三种顺序下都保持布局状态与卡片几何一致。

**Architecture:** 保持 Node `RuntimeProcessManager` 的 recovery entries 顺序重放模型；同一个 recovery key 仍由快照层最后写入覆盖，不同 key 的 `scene.set-mode` 全部按顺序重放。Runtime Scene Controller 在已有有效布局时，把新建卡片纳入当前布局，并在布局应用失败时回滚新建卡片，避免 active layout 与实际卡片几何分离。

**Tech Stack:** Node.js ESM/node:test；C++20；Win32 Native Scene Window；Named Pipe；CMake/CTest；VS2026 MSVC x64。

## Global Constraints

- 保持 `scene.set-mode` 协议字段和 recovery snapshot version 不变。
- 保持 `layout_stack(...)`、`layout_shelf(...)` 公共接口不变。
- 卡片顺序必须使用显式 `card_order`。
- 工作区坐标与尺寸使用物理像素。
- 布局失败必须返回稳定错误码，不能覆盖上一份有效布局状态。
- 每一刀完成 Node/C++ 验证后单独提交。
- 不宣称支持完整多显示器拓扑、热插拔或 shelf 换行/滚动。

---

### Task 1: Pin recovery key and replay semantics

**Status:** Completed. Same-key replacement and distinct-key replay ordering are covered by `recovery-snapshot.test.mjs`.

**Files:**
- Modify: `tests/node/recovery-snapshot.test.mjs`
- Modify: `docs/superpowers/plans/2026-08-01-layout-state-convergence.md`

**Interfaces:**
- Consumes: `createRecoverySnapshot(...)`, `addRecoveryEntry(...)`。
- Produces: 可验证的 recovery key 覆盖和不同 key 顺序重放契约。

- [ ] **Step 1: Write the failing assertion**

在 recovery snapshot 测试中先写入同一个 `scene-mode` key 两次，断言 entries 中只剩最后一次 payload；再写入不同 key 的 stack 与 shelf，断言两条 entry 按写入顺序保留。

```js
addRecoveryEntry(snapshot, {
  key: 'scene-mode',
  type: 'scene.set-mode',
  payload: { layout: 'stack', direction: 'down', anchor: 'top-right', spacing: 8 }
});
addRecoveryEntry(snapshot, {
  key: 'scene-mode',
  type: 'scene.set-mode',
  payload: { layout: 'shelf', direction: 'right', anchor: 'bottom-left', spacing: 12 }
});
assert.deepEqual(snapshot.entries.filter((entry) => entry.type === 'scene.set-mode'), [
  {
    key: 'scene-mode',
    type: 'scene.set-mode',
    payload: { layout: 'shelf', direction: 'right', anchor: 'bottom-left', spacing: 12 }
  }
]);
```

- [ ] **Step 2: Run the focused Node test**

Run: `node --test tests/node/recovery-snapshot.test.mjs`

Expected: PASS with the existing `addRecoveryEntry` replacement behavior; if the assertion exposes ordering or payload mutation, fix only that behavior.

- [ ] **Step 3: Update the convergence plan**

将“最后一次有效布局由恢复回放建立”明确写成：同 key 最后写入覆盖，不同 key 按 entries 顺序重放，最终成功的 `scene.set-mode` 成为 active layout。

- [ ] **Step 4: Run the focused test again**

Run: `node --test tests/node/recovery-snapshot.test.mjs`

Expected: all recovery snapshot tests pass。

---

### Task 2: Add Runtime recovery order regression tests

**Status:** Completed. ProcessManager smoke covers empty Scene, layout-before-create, create-before-layout, and distinct stack/shelf replay order.

**Files:**
- Modify: `tests/node/runtime-process-manager-smoke.test.mjs`

**Interfaces:**
- Consumes: `RuntimeProcessManager.restoreRecoverySnapshot(...)` and Named Pipe `health` response。
- Produces: Runtime 重启后 stack/shelf 模式、卡片顺序和卡片几何的回归覆盖。

- [ ] **Step 1: Write the failing recovery scenarios**

增加独立测试场景，使用 `RuntimeProcessManager` 的 `--exit-after-health` 机制，覆盖：

1. 只有 `scene.set-mode` 且没有卡片，恢复后 `health.result.layout` 仍存在。
2. `scene.set-mode(shelf)` 在 `scene.create(card-a)` 之前，恢复后 card-a 必须位于 shelf 的第一格。
3. `scene.create(card-a)` 在 `scene.set-mode(shelf)` 之前，恢复后 card-a 必须由 shelf 重新布局。
4. 两个不同 key 的模式按顺序重放，最终 health 回显最后一个成功模式。

测试断言示例：

```js
assert.equal(recoveredHealth.payload.result.layout.layout, 'shelf');
assert.equal(recoveredHealth.payload.result.layout.direction, 'right');
assert.deepEqual(recoveredHealth.payload.result.sceneCards.map((card) => ({
  id: card.id,
  x: card.x,
  y: card.y
})), [{ id: 'card-a', x: 0, y: 440 }]);
```

- [ ] **Step 2: Run the focused CTest**

先构建 Runtime，再运行：

```powershell
call "D:\MyApplications\VS\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64
cmake --build --preset debug-vs2026
ctest --preset debug-vs2026 -R runtime_process_manager_smoke --output-on-failure
```

Expected: 新增的先布局后创建场景在实现尚未补齐时失败，失败应体现卡片几何仍是 create payload，而不是 shelf 位置。

---

### Task 3: Reapply active layout when creating a card

**Status:** Completed. `create_card(...)` re-applies the active layout after insertion and removes the new card if the layout cannot be applied.

**Files:**
- Modify: `runtime/scene/controller.cpp`
- Test: `tests/node/runtime-process-manager-smoke.test.mjs`

**Interfaces:**
- Consumes: `RuntimeSceneController::apply_stack_layout(...)`、`active_layout`、`card_order`。
- Produces: `create_card(...)` 成功后，若已有 active layout，则新卡片进入该布局；布局失败时不留下半恢复状态。

- [ ] **Step 1: Implement a rollback-safe create path**

在 `create_card(...)` 完成窗口创建、插入 `cards/card_windows/card_order` 后：

```cpp
if (impl_->has_active_layout) {
    std::string layout_error_code;
    std::string layout_error_message;
    if (!apply_stack_layout(impl_->active_layout, layout_error_code, layout_error_message)) {
        impl_->card_order.pop_back();
        impl_->card_windows.erase(card.id);
        impl_->cards.erase(card.id);
        error_code = layout_error_code;
        error_message = layout_error_message;
        return false;
    }
}
```

实现时必须确保回滚顺序先销毁窗口，再删除卡片状态，并且不能覆盖布局失败前的 active layout。若需要避免 `apply_stack_layout` 递归或重复 Provider 查询，抽出只读的内部布局应用 helper，但保留公开接口不变。

- [ ] **Step 2: Run the focused CTest**

Run: `ctest --preset debug-vs2026 -R runtime_process_manager_smoke --output-on-failure`

Expected: recovery restart test passes，且空卡片、布局前创建、创建前布局三种场景都符合断言。

---

### Task 4: Full verification and commit

**Files:**
- Modify: `docs/architecture/phase-0-1-status.md`

- [ ] **Step 1: Update architecture status**

记录 recovery 已覆盖空 Scene、layout-before-create 和 create-before-layout；保留完整 `SceneState` 快照、多显示器拓扑和 shelf 高级溢出策略为后续工作。

- [ ] **Step 2: Run all verification commands**

```powershell
npm run check
npm test
call "D:\MyApplications\VS\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64
cmake --build --preset debug-vs2026
ctest --preset debug-vs2026 --output-on-failure
git diff --check
```

Expected: Node 11+ passed、CTest 18+ passed、无失败、diff check 通过。

- [ ] **Step 3: Commit one slice**

```powershell
git add docs/architecture/phase-0-1-status.md docs/superpowers/plans/2026-08-01-scene-recovery-layout.md docs/superpowers/plans/2026-08-01-layout-state-convergence.md runtime/scene/controller.cpp tests/node/recovery-snapshot.test.mjs tests/node/runtime-process-manager-smoke.test.mjs
git commit -m "test: cover scene layout recovery order"
```
