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
- 增加右上角关闭按钮绘制、按钮区域命中、`WM_LBUTTONUP` 关闭请求和窗口销毁闭环。
- 增加独立离屏 D2D target 的结构性像素回归，验证透明角、卡片表面、强调条和关闭按钮区域；不读取 DirectComposition surface，避免合成器回读不稳定。
- 增加卡片拖动状态机，支持按下捕获、屏幕坐标位移、释放和捕获丢失清理。
- 增加桌面合成截图 self-test：优先调用 `PrintWindow(PW_RENDERFULLCONTENT)`，空白时回退到固定窗口区域的屏幕 `BitBlt`，验证 HWND 最终输出。
- 当前环境中 `PrintWindow` 对 `WS_EX_NOREDIRECTIONBITMAP` 返回空白，屏幕区域回退能够采集到最终 DirectComposition 合成结果。
- 增加桌面级 `WindowFromPoint` 透明区域命中测试，以及 Per-Monitor V2 DPI、窗口客户区尺寸和当前窗口 DPI 读取测试。
- Node.js 测试通过：11 项中 11 项通过，2 项需要 Runtime 参数的测试由 CTest 执行。
- CTest 通过：14/14。

## 当前阶段

Phase 2 已完成基础闭环，Phase 4 正在推进，Phase 5 已开始。Node.js 与 C++ Runtime 已具备协议、诊断、framing、最小 Named Pipe 通信、有限自动重连、Runtime 进程托管、幂等请求、基础恢复快照持久化、最小 Win32 窗口生命周期、Direct2D/DirectWrite 卡片绘制、DirectComposition 预乘 alpha surface、离屏结构性像素回归、卡片命中、关闭、基础拖动交互、桌面区域合成回归、桌面透明命中和 DPI 基础契约；整图 golden、跨显示器 DPI 和 Scene 状态重建尚未完全收口。

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

继续完善 Native Scene Window：增加整图 golden 与真实桌面截图回归、透明区域桌面穿透验证、多显示器 DPI 拖动验证；同时继续推进持久化幂等记录和 Scene 状态迁移。
