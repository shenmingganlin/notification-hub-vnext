# SceneState Persistence Implementation Plan

**Goal:** 为规范化 `SceneState` 建立独立、可校验、可回滚的文件持久化层，不在本刀接入 Runtime 生命周期。

## Architecture

- `scene-state-store.js` 负责 SceneState 的序列化、原子写入和校验读取。
- 写入前调用 `validateSceneState()`，写入内容使用规范 JSON + newline。
- 目标文件存在时先移动到带进程/时间戳的备份名，再将临时文件移动到目标位置；新文件替换失败时尝试恢复旧文件。
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
- [x] 实现跨 Windows/Unix 语义的目标替换与失败回滚尝试。
- [x] 覆盖首次写入、覆盖写入、目录创建、损坏文件、目标不可替换和输入不可变。
- [x] 导出模块并加入 `npm run check`。
- [x] Node check、41 项 Node 测试（36 passed、5 skipped）通过。
- [ ] 由宿主接入实际路径与生命周期。
- [ ] 增加写入节流和崩溃中断后的临时文件清理策略。
