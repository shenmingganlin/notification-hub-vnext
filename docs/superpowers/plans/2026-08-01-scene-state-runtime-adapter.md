# SceneState Runtime Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or inline execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变旧 ACK/health 字段和 recovery replay 的前提下，让 Runtime 回显可由 Node `SceneState` validator 直接校验的规范快照。

**Architecture:** `RuntimeSceneController` 新增只读 `scene_state_snapshot_json()`，从当前窗口状态、显式 `card_order`、卡片集合、最后成功布局和实际生效工作区生成 `SceneState` JSON 对象。旧的 `sceneState`、`sceneCards`、`layout`、`workArea` 字段继续保留，`sceneStateSnapshot` 作为兼容性新增字段。

**Tech Stack:** C++20；Win32 Runtime；Named Pipe；Node.js ESM/node:test；CMake/CTest；VS2026 MSVC x64。

## Global Constraints

- 不修改协议版本和 recovery snapshot version。
- 不修改 Runtime recovery replay 顺序。
- `cardOrder` 必须来自显式 `card_order`，不得依赖 `unordered_map`。
- `sceneStateSnapshot.layout` 为 null 或完整布局对象。
- `updatedAt` 每次快照生成时使用 UTC ISO-8601 时间。
- 旧字段形状保持兼容。

## Task Status

- [x] 新增 C++ `scene_state_snapshot_json()`。
- [x] health、scene.update、scene.create/update/dismiss、scene.set-mode 结果回显 `sceneStateSnapshot`。
- [x] Node Named Pipe smoke 使用 `validateSceneState()` 校验 Runtime 快照。
- [x] 覆盖空 Scene、显式 stack、失败布局后快照保持，以及动态时间戳。
- [x] Node check、Node tests、C++ build、Named Pipe smoke、diff check 已验证。
- [x] 一刀一提交。

## Deliberate non-goals

- 不把快照写入 recovery 文件。
- 不让 ProcessManager 从 `sceneStateSnapshot` 恢复 Runtime。
- 不删除旧字段。
- 不解决多显示器 monitor identity、热插拔或跨显示器 DPI 重映射。
