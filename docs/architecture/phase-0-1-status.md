# Phase 0/1/2/4/5 状态

日期：2026-08-03

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
- recovery snapshot 增加 `scene.update` 窗口几何 entry，严格校验 `x/y/width/height`，重启后按顺序恢复到 Runtime 状态层。
- fixed 布局恢复支持 `scene.create`、卡片型 `scene.update` 和 `scene.dismiss`，保存卡片 id、标题、正文和窗口几何。
- 新增纯数学 stack 布局模块，支持方向、交叉轴锚点、间距、工作区边界、DPI 缩放和稳定错误码。
- 新增工作区快照模型与 Windows 主显示器工作区查询适配器，统一输出物理像素矩形、DPI、来源和显式 fallback 标志；本阶段仍不宣称多显示器热插拔支持。
- `scene.set-mode` 已接入 stack 布局，按卡片创建顺序计算并应用多卡片 HWND 几何；stack 配置也进入 recovery snapshot。
- Work Area Provider 已接入 `scene.set-mode`：缺省工作区由主显示器 Provider 提供，显式尺寸与 DPI 仍可作为覆盖；ACK/health 回显工作区来源、DPI 和 fallback 状态。
- 新增纯数学 shelf 布局：沿工作区上/下边缘单行横向排列，复用显式卡片顺序、DPI 缩放和工作区边界；暂不支持换行、动画和多显示器分栏。
- stack/shelf 已收敛到共享线性布局计算内核；Runtime Scene Controller 保存最后一次成功应用的布局模式、参数和有效工作区，并在 ACK/health 中回显。失败布局不会覆盖上一份有效布局状态。
- Runtime Named Pipe 严格接收单窗口、多卡片和布局命令，通过 RuntimeSceneController 应用到真实 Native HWND，并在 ACK/health 中回显实际状态；非法 payload 返回稳定错误码。
- 增加 Runtime Scene Controller self-test，直接验证 HWND 位置和客户区尺寸已应用。
- ProcessManager 重启 smoke 已验证 Runtime 重启后按快照顺序重放窗口与卡片命令，并通过重启后 `health` 读取真实恢复几何和卡片集合。
- recovery 已覆盖空 Scene、先布局后创建卡片、先创建卡片后布局以及多个不同 key 的布局模式顺序；已有 active layout 时新卡片会重新纳入布局，最终有效模式由最后一次成功重放的 `scene.set-mode` 决定。
- 新增版本化 `SceneState` 快照契约：统一描述 Scene 窗口、显式 `cardOrder`、卡片集合、active layout 和 work area 元数据；Runtime 在 ACK/health 中以 `sceneStateSnapshot` 只读回显该规范状态，旧版 recovery command replay 保持不变。
- 新增只读 `SceneState → recovery entries` 投影：按窗口、布局、`cardOrder` 生成旧协议命令；Provider 工作区让 Runtime 重新查询，旧协议无法表达的非零显式工作区原点明确拒绝。
- 新增 SceneState 优先、旧 recovery snapshot fallback 的恢复计划选择器；`RuntimeProcessManager` 可选接收 SceneState，旧入口与 replay 顺序保持兼容，fallback 以结构化 diagnostic 暴露。
- 新增独立 SceneState 原子持久化 store：校验后写入临时文件，替换失败时尝试恢复旧目标；当前不猜测宿主默认路径。
- 新增 SceneState 快照生命周期适配器：PipeClient 发出只读 response 事件，RuntimeProcessManager 对有效 `sceneStateSnapshot` 做 debounce 写入，并在 stop 前 flush；失败通过结构化 diagnostic 暴露。
- 新增 Runtime → Host 的 `scene.changed` 非请求事件：Runtime 检测 Native Scene/卡片拖动与销毁后推送最新 `sceneStateSnapshot`，Host 同步内存恢复计划并持久化；主 Scene 窗口关闭以 `sceneWindow: null` 表示，恢复时不再复活。
- manifest 增加 SceneState 持久化启用开关、路径和 debounce 配置；配置工厂支持从 Hana host context 的 `dataDir/config` 解析路径，并新增真实 Runtime health 到文件落盘 smoke。
- 新增 `RuntimeHostAdapter`，串联配置、SceneState/旧 recovery 选择、PipeClient、RuntimeProcessManager、hello、恢复 replay、首次 health 和 stop；首次安装的双文件缺失仅在 host startup 的 `allowEmpty` 路径下显式启动空 Scene。
- vNext 入口已接入真实 Hana `onload/onunload`，默认从独立插件目录加载 `runtime/notification-hub-runtime.exe`，使用 `notification-hub-vnext-*` Named Pipe，并将启动失败限制在本插件诊断范围内。
- 重启后按快照顺序重放恢复命令，并对失败停止后续恢复、输出结构化诊断。
- 协议 envelope 增加可选 `idempotencyKey`，Runtime 对重复请求去重并拒绝同 key 不同内容的冲突请求。
- 建立最小 Win32 Scene Window，支持 Per-Monitor V2 DPI、非激活显示、消息泵、自动关闭和生命周期诊断。
- 接入 Direct2D/DirectWrite 最小卡片表面，支持圆角背景、强调色、标题和正文绘制，并通过 32 位 DIB 提交分层窗口。
- 接入 D3D11、Direct2D/DirectWrite 离屏绘制与预乘 alpha 位图，通过 `WS_EX_LAYERED` + `UpdateLayeredWindow` 提交到 HWND。
- 建立共享卡片几何契约，接入 `WM_NCHITTEST`，卡片本体返回 `HTCLIENT`，卡片外区域返回 `HTTRANSPARENT`。
- 增加右上角关闭按钮绘制、按钮区域命中、`WM_LBUTTONUP` 关闭请求和窗口销毁闭环。
- 增加独立离屏 D2D target 的结构性像素回归，并增加 RuntimeSceneController 真实桌面像素回归，验证透明角、卡片表面、强调条和关闭按钮区域。
- 增加卡片拖动状态机，支持按下捕获、屏幕坐标位移、释放和捕获丢失清理。
- 增加桌面合成截图 self-test：优先调用 `PrintWindow(PW_RENDERFULLCONTENT)`，空白时回退到固定窗口区域的屏幕 `BitBlt`，验证 HWND 最终输出。
- 当前环境中 Native Scene 使用分层窗口提交，桌面回归直接采集最终屏幕区域并验证卡片像素可见。
- 增加桌面级 `WindowFromPoint` 透明区域命中测试，以及 Per-Monitor V2 DPI、窗口客户区尺寸和当前窗口 DPI 读取测试。
- 接入 `WM_DPICHANGED` 建议矩形处理，验证 DPI 状态、窗口位置、客户区尺寸、渲染目标和命中几何同步。
- 桌面 `WindowFromPoint` 命中 self-test 增加窗口显示后的短暂轮询，等待 HWND/Z-order 与 DComp surface 命中状态稳定，消除启动时序导致的偶发卡片区域未命中。
- Node.js 测试通过：包含入口生命周期、运行时隔离配置和 Host Adapter 恢复覆盖；需要 Runtime 参数的测试由 CTest 执行。
- CTest 通过：当前 25/25，覆盖 Runtime → Host 场景变更同步相关的 Controller/Named Pipe/ProcessManager 回归。
- 发布前验证通过：`npm run check` 通过；Node 测试 89 项，78 通过、11 跳过、0 失败；C++ CTest 25/25 通过；`git diff --check` 通过。
- 生成 Release ZIP：`dist/notification-hub-vnext-0.1.0-alpha.1.zip`，大小 154241 字节，SHA-256 为 `43D38E8C58ED638C97898D91F68AB9C8964937A578E8A0B7AF307AFA9814483E`。
- ZIP 静态检查通过：根目录包含 `manifest.json`，插件 ID 为 `notification-hub-vnext`，Runtime 位于 `runtime/notification-hub-runtime.exe`，不含旧版资源、测试源码或嵌套插件根目录。
- 通过 Hana 真实界面手动拖拽最新 ZIP 完成安装、启用和使用验收；用户确认安装、运行和交互过程没有瑕疵。旧版 `notification-hub` 保持隔离并正常运行。

## 当前阶段

Phase 2 基础闭环、Phase 4 Hana 插件交付和 Phase 5 最小 Native Scene Window 闭环已完成当前验收。Node.js 与 C++ Runtime 已具备协议、诊断、framing、Named Pipe 通信、有限自动重连、Runtime 进程托管、幂等请求、版本化恢复快照、fixed 布局多卡片创建/更新/关闭恢复、stack/shelf 共享布局数学与运行时接入、Work Area Provider 默认工作区与显式覆盖、活动布局状态回显、按 recovery 顺序的 stack/shelf 模式恢复、布局前后卡片创建的重新布局、Runtime Scene Controller 到 Native HWND 的实际应用、Runtime 重启后的窗口与卡片状态恢复、最小 Win32 窗口生命周期、D2D/DirectWrite 离屏卡片绘制与分层窗口提交、离屏结构性像素回归、控制器级桌面像素回归、卡片命中、关闭、基础拖动交互、桌面透明命中、DPI 基础契约和受控 `WM_DPICHANGED` 几何同步；shelf 的更完整视觉/交互边界、cascade/focus/freeform、真实跨显示器 DPI、显示器热插拔和完整 Scene 状态重建仍属于后续范围。

## 标准验证命令

Node.js：

```powershell
npm run check
npm test
```

C++ Runtime：

```powershell
$cmake = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'
$ctest = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\ctest.exe'
& $cmake --build build/vs2022-debug --config Release
& $ctest --test-dir build/vs2022-debug -C Release --output-on-failure
```

原生构建使用已验证的 Visual Studio 2022 BuildTools x64 工具链；`build/debug-vs2026` 仍保留为历史构建目录，不作为本轮发布包输入。

## 下一步

进入总计划的后续产品化阶段，优先评估 shelf 的视觉与交互收口、宿主配置热更新和关闭错误上报；之后再推进通知中心、Profile/工作模式以及多显示器与混合 DPI 能力。当前已完成的发布包和 Native Runtime 不再扩展未经验证的能力。
