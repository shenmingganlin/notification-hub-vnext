# Phase 0/1/2 状态

日期：2026-08-01

## 已完成

- vNext Git 仓库已在工作区初始化。
- 旧版已复制到 `legacy-reference/notification-hub-0.2.1`，作为隔离参考。
- 建立 `plugin`、`runtime`、`schemas`、`tests`、`docs` 目录边界。
- 建立 Node.js package、CMake、CTest 和版本文件。
- Visual Studio Community 2026、MSVC x64、Windows SDK、CMake 和 CTest 已完成实际验证。
- CMake 已对齐 `Visual Studio 18 2026` x64 生成器。
- 建立 Node.js 协议 envelope、ACK、错误响应和诊断模型。
- 建立 C++ Runtime 协议 envelope 解析、严格字段校验和 JSONL 诊断输出。
- 建立 4 字节 little-endian 长度前缀 framing 编解码器。
- framing 支持增量接收、分片、粘包、截断和消息大小上限。
- 建立 Windows Named Pipe 一次性服务端与 Node.js 客户端。
- 完成 `hello`、`health`、`shutdown` 的跨进程 ACK 闭环。
- 增加连接超时、ACK 超时、读写失败和断开错误码。
- Node 客户端增加 `connecting`、`connected`、`disconnected`、`reconnecting`、`closed` 状态。
- 对 `hello`、`health`、`capabilities` 实现有限重连；非幂等请求默认不重放。
- 增加 Runtime 主动断开故障注入，并验证断开后的第二次 health 恢复。
- 增加 Node `RuntimeProcessManager`，负责 Runtime 启动、ready 等待、退出监控和有限自动重启。
- 增加 Runtime 退出故障注入，并验证进程重启后的第二次 health 恢复。
- 建立版本化 Runtime recovery snapshot，支持 `config.update` 和 `scene.set-mode` 的有序恢复。
- 重启后按快照顺序重放恢复命令，并对失败停止后续恢复、输出结构化诊断。
- Node.js 测试通过：9/9，Named Pipe 和 Runtime 重启 smoke 单独由 CTest 执行。
- CTest 通过：5/5。

## 当前阶段

Phase 2 已完成基础闭环，Phase 4 正在推进。Node.js 与 C++ Runtime 已具备协议、诊断、framing、最小 Named Pipe 通信、有限自动重连、Runtime 进程托管和基础恢复快照能力；完整 ACK 重试语义和 Scene 状态重建尚未接入。

## 标准验证命令

Node.js：

```powershell
npm run check
npm test
```

C++ Runtime：

```powershell
cmake --preset debug-vs2026
cmake --build --preset debug-vs2026
ctest --preset debug-vs2026
```

原生构建命令需要在 Visual Studio 2026 Developer PowerShell 或 x64 Native Tools Command Prompt 中执行。

## 下一步

继续完善 Named Pipe Runtime：增加请求幂等键策略、恢复快照持久化、Scene 状态迁移和更细粒度的故障注入。
