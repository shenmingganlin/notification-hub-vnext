# Runtime Host Lifecycle Adapter

**Goal:** 将配置、恢复计划、PipeClient、RuntimeProcessManager 和 SceneState 持久化串成可由 Hana `onload/onunload` 调用的生命周期模块。

## Startup contract

1. 从 host context 的 `dataDir/config` 创建 SceneState persistence coordinator。
2. 读取 SceneState 文件，失败时读取旧 recovery 文件。
3. 首次安装且两个文件都缺失时，以显式空 recovery plan 启动。
4. 创建 PipeClient 与 RuntimeProcessManager。
5. 启动 Runtime，等待 ready。
6. 发送 `hello`。
7. 按恢复计划顺序 replay。
8. 发送首次 `health`，发出 `started`。

## Shutdown contract

1. 请求 RuntimeProcessManager stop。
2. flush SceneState persistence。
3. 关闭 PipeClient。
4. 清理引用并发出 stopped state。

## Failure contract

- 启动任一步骤失败，进入 `failed`，尝试停止 manager 和关闭 client。
- 恢复源缺失只在显式 `allowEmpty` 的 host startup 路径下允许空 Scene。
- 恢复源损坏仍交给 `loadRecoveryPlan()` 抛出 `RUNTIME_RECOVERY_NO_VALID_SOURCE`。
- 不把 host adapter 伪装成完整 Hana plugin class。

## Task Status

- [x] 新增 `RuntimeHostAdapter`。
- [x] 覆盖 startup 顺序、空初始状态、失败清理和 stop 顺序。
- [x] 增加真实 Runtime host adapter smoke。
- [x] 增加 `loadRecoveryPlan({ allowEmpty: true })` 的明确语义。
- [x] Node check、62 项 Node 测试（55 passed、7 skipped）通过。
- [ ] 将 adapter 实例化接入完整 Hana plugin `onload/onunload`。
- [ ] 增加 Runtime 重启后 host adapter 级恢复 smoke。
