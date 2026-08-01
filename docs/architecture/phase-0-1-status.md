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
- recovery snapshot 支持临时文件写入、原子替换、读取和版本校验。
- 重启后按快照顺序重放恢复命令，并对失败停止后续恢复、输出结构化诊断。
- 协议 envelope 增加可选 `idempotencyKey`，Runtime 对重复请求去重并拒绝同 key 不同内容的冲突请求。
- 建立最小 Win32 Scene Window，支持 Per-Monitor V2 DPI、非激活显示、消息泵、自动关闭和生命周期诊断。
- 接入 Direct2D/DirectWrite 最小卡片表面，支持圆角背景、强调色、标题和正文绘制，并保留 GDI 回退。
- 接入 D3D11、Direct2D device context 和 DirectComposition visual，使用预乘 alpha surface 提交到 HWND。
- 建立共享卡片几何契约，接入 `WM_NCHITTEST`，卡片本体返回 `HTCLIENT`，卡片外区域返回 `HTTRANSPARENT`。
- Node.js 测试通过：11 项中 11 项通过，2 项需要 Runtime 参数的测试由 CTest 执行。
- CTest 通过：8/8。

## 当前阶段

Phase 2 已完成基础闭环，Phase 4 正在推进，Phase 5 已开始。Node.js 与 C++ Runtime 已具备协议、诊断、framing、最小 Named Pipe 通信、有限自动重连、Runtime 进程托管、幂等请求、基础恢复快照持久化、最小 Win32 窗口生命周期、Direct2D/DirectWrite 卡片绘制、DirectComposition 预乘 alpha surface 和基础卡片命中能力；截图级视觉回归、点击、拖动和 Scene 状态重建尚未接入。

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

继续完善 Native Scene Window：增加截图级视觉回归、透明区域穿透验证、卡片点击和关闭交互；同时继续推进持久化幂等记录和 Scene 状态迁移。
