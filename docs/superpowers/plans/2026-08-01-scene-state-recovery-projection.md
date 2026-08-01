# SceneState Recovery Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or inline execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已验证的 `SceneState` 只读投影为现有 recovery command entries，为后续快照迁移提供兼容接缝。

**Architecture:** 新增 `scene-state-recovery.js`，先调用 `validateSceneState()`，再按固定顺序生成旧协议支持的 `scene.update`、`scene.set-mode`、`scene.create` entries。Provider work area 只生成不带覆盖字段的 `scene.set-mode`，让 Runtime 重新查询当前 Provider；explicit work area 仅在原点为 `(0,0)` 且来源为 `explicit-override` 时投影，因为旧协议无法表达显式工作区原点。

**Tech Stack:** Node.js ESM/node:test；现有 recovery snapshot validator；scene-state contract。

## Global Constraints

- 不修改 `RECOVERY_SNAPSHOT_VERSION` 和现有 recovery replay。
- 不接管 `RuntimeProcessManager`。
- `cardOrder` 是唯一投影顺序。
- 投影函数不得修改输入 SceneState。
- 不可由旧协议表达的显式工作区原点必须返回稳定错误，而不能静默丢失。

## Task Status

- [x] 实现 `sceneStateToRecoveryEntries(state)`。
- [x] 覆盖有布局、无布局、Provider work area、显式 work area 和卡片顺序。
- [x] 用 `createRecoverySnapshot({ entries })` 验证投影结果仍符合旧 recovery 契约。
- [x] Node check、全量 Node tests、diff check 已验证。
- [ ] 将投影结果接入新的 snapshot persistence 或 ProcessManager fallback。

## Deliberate non-goals

- 不新增 recovery snapshot version。
- 不把 `sceneStateSnapshot` 直接写入旧 entries。
- 不从投影结果反向更新 Runtime。
- 不解决带 monitor identity 的多显示器恢复。
