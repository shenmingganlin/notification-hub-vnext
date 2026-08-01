# SceneState Persistence Implementation Plan

**Goal:** 为规范化 `SceneState` 建立独立、可校验、可回滚的文件持久化层，不在本刀接入 Runtime 生命周期。

## Architecture

- `scene-state-store.js` 负责 SceneState 的序列化、原子写入和校验读取。
- 写入前调用 `validateSceneState()`，写入内容使用规范 JSON + newline。
- 目标文件存在时先移动到唯一备份名，再将临时文件移动到目标位置；这是 Windows/Unix 兼容的两阶段替换，存在短暂目标路径空窗，失败时显式报告替换失败或回滚失败。
- 读取统一使用 `parseSceneState()`，损坏 JSON 和版本错误保持 SceneState 契约错误码。
- 宿主通过 `loadRecoveryPlan()` 决定 SceneState 与旧 recovery 的优先级，本模块不启动 Runtime。

## Safety boundary

- 不修改 recovery v1 文件格式。
- 不自动删除旧 recovery 文件。
- 不在快照写入失败时覆盖原目标文件。
- 不猜测默认路径。
- 不在本刀决定 health 事件、写入节流或崩溃恢复时机。

## Task Status

- [x] 实现 `saveSceneState()`。
- [x] 实现 `loadSceneState()`。
- [x] 实现 Windows/Unix 兼容的两阶段目标替换、唯一临时文件和同目标串行写入。
- [x] 覆盖首次写入、覆盖写入、目录创建、损坏文件、目标不可替换、替换后失败、回滚失败、并发保存和输入不可变。
- [x] 加载目标缺失时尝试恢复最近的有效备份，并保留失败证据。
- [x] 导出模块并加入 `npm run check`。
- [x] Node check、55 项 Node 测试（50 passed、5 skipped）通过。
- [ ] 由宿主接入实际路径与生命周期。
- [ ] 增加遗留临时文件的清理策略；备份恢复已覆盖目标丢失场景，但仍需由宿主决定清理时机。
