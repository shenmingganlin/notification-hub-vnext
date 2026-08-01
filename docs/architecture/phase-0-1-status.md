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
- Node.js 测试通过：9/9，Named Pipe smoke 单独由 CTest 执行。
- CTest 通过：4/4。

## 当前阶段

Phase 2 已完成基础闭环，Phase 4 正在推进。Node.js 与 C++ Runtime 已具备协议、诊断、framing 和最小 Named Pipe 通信能力；Runtime 生命周期管理、ACK 重试、自动重连和状态重建尚未接入。

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

继续完善 Named Pipe Runtime：增加连接生命周期管理、ACK 重试、自动重连、Runtime 重启后的状态重建和故障注入。
