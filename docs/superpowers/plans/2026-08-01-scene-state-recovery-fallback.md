# SceneState-First Recovery Fallback Implementation Plan

**Goal:** 在不改变 recovery v1 文件格式和 Runtime replay 协议的前提下，建立 `SceneState` 优先、旧 recovery snapshot fallback 的恢复入口。

## Architecture

- `recovery-plan.js` 负责恢复源选择，不负责启动 Runtime。
- `sceneState` 存在且通过版本/字段/几何校验时，投影为现有 recovery entries。
- SceneState 不可用时，使用经过 `validateRecoverySnapshot()` 校验的旧 snapshot。
- 两个来源都不可用时显式失败，禁止静默以空 Scene 启动。
- `RuntimeProcessManager` 支持构造时传入 `sceneState`，并保留原 `recoverySnapshot` 调用方式。
- fallback 通过 `RUNTIME_SCENE_STATE_RECOVERY_FALLBACK` diagnostic 暴露。

## Compatibility rules

- 不修改 `RECOVERY_SNAPSHOT_VERSION`。
- 不修改 `restoreRecoverySnapshot()` 的 replay 顺序和请求方式。
- 不自动猜测 SceneState 文件路径；`loadRecoveryPlan()` 由上层提供路径。
- Provider work area 继续由 Runtime 重新查询。
- 无有效恢复源时抛出 `RUNTIME_RECOVERY_NO_VALID_SOURCE`。

## Task Status

- [x] 实现内存恢复源选择。
- [x] 实现文件加载与缺失/损坏诊断。
- [x] 接入 `RuntimeProcessManager` 的可选 SceneState 入口。
- [x] 覆盖 SceneState 优先、版本失败 fallback、文件缺失 fallback、双源失败。
- [x] Node check、36 项 Node 测试（31 passed、5 skipped）通过。
- [ ] 由插件宿主提供实际 SceneState 文件路径并接入启动配置。
- [x] 建立独立 SceneState 原子持久化基础设施；写入失败时保留原目标文件。
- [ ] 由插件宿主提供实际 SceneState 文件路径并接入启动配置。
- [ ] 设计 SceneState 持久化写入时机和节流策略。
