# SceneState Snapshot Lifecycle Implementation Plan

**Goal:** 将 Runtime 返回的 `sceneStateSnapshot` 接入可测试的持久化生命周期，避免每次响应直接触发磁盘写入。

## Architecture

- `PipeClient` 在解析 ACK/error 后发出只读 `response` 事件，不改变 `request()` 返回语义。
- `SceneStatePersistenceCoordinator` 是独立适配器：接收经过契约校验的 SceneState，按 debounce 合并写入，并暴露诊断事件。
- `RuntimeProcessManager` 在配置了 coordinator 和 recovery client 时，观察响应中的 `payload.result.sceneStateSnapshot`。
- `RuntimeProcessManager.stop()` 先 flush 未落盘快照，再停止 Runtime。
- 实际文件写入继续委托给 `scene-state-store.js`，旧 recovery 文件不参与覆盖。

## Current scope

- 支持显式传入 `sceneStatePersistence`。
- 支持显式 `filePath`、debounce 时长和可测试 scheduler。
- 最新快照覆盖待写入快照。
- 写入失败生成 `RUNTIME_SCENE_STATE_PERSIST_FAILED` diagnostic。
- 停止 Runtime 前 flush 最新快照。

## Deliberate non-goals

- 不猜测宿主默认路径。
- 不改变 Runtime 协议或 health 请求行为。
- 不把 SceneState 写入旧 recovery v1 文件。
- 不在此处实现多进程锁或跨实例写入协调。

## Task Status

- [x] `PipeClient` 发出 response 事件。
- [x] 实现 `SceneStatePersistenceCoordinator`。
- [x] 接入 `RuntimeProcessManager`。
- [x] 覆盖 debounce、最新快照、失败诊断、停止 flush 和空响应。
- [x] Node check、46 项 Node 测试（41 passed、5 skipped）通过。
- [x] 增加显式宿主配置字段：启用开关、路径和 debounce；相对路径解析到 `dataDir`。
- [x] 增加真实 Runtime health → 文件写入 smoke。
- [ ] 在完整 Hana 插件生命周期中创建 RuntimeProcessManager；当前入口只提供 `createSceneStatePersistenceFromHostContext()` 工厂。
- [ ] 处理跨实例写入锁和配置热更新。
