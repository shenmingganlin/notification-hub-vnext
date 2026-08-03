# Notification Hub vNext 总目标

> 这是项目方向文档，定义“为什么做、做到什么算完成、哪些边界不能越过”。
> 当前状态和具体故障请阅读同目录的 `HANDOFF.md`。
> 详细架构规划请阅读 `notification-hub-vnext-plan.md`、`README.md` 和 `docs/architecture/`。

## 1. 一句话目标

把旧版依赖侧边栏 Widget 和 WinForms helper 的 notification-hub，重构为一个长期可维护、稳定可恢复、视觉质量高、与旧插件完全隔离的 Windows Native Notification Scene System，并以 HanaAgent 插件形式交付。

## 2. 用户最终应该得到什么

用户发出通知后，系统应当能够在桌面上稳定呈现一张或多张高质量通知卡片，并提供可理解、可恢复的完整生命周期：

```text
通知进入
  -> Node.js 识别、分类、格式化和决策
  -> Named Pipe 发送版本化命令
  -> C++ Native Scene Runtime 创建或更新场景
  -> 卡片在桌面正确显示、排列、交互和关闭
  -> SceneState 持久化
  -> Runtime 或插件重启后恢复
  -> Hana 页面提供状态、设置和诊断
```

最终体验必须满足：

- 通知出现稳定、及时、清晰，不制造隐形阻塞窗口。
- 多张卡片布局可预测，不互相覆盖失控。
- 卡片可按设计进行点击、关闭和拖动。
- 卡片外透明区域可以穿透到下层应用。
- Runtime 崩溃、断开、重启或配置错误时，插件仍能存活并给出结构化诊断。
- 重启后能按可靠的 SceneState 恢复，而不是凭猜测重建。
- 设置、运行状态和故障原因能在 Hana 中被理解和追踪。
- 新系统失败时，旧版 notification-hub 仍然正常运行。

## 3. 核心架构目标

### 3.1 Node.js 插件域

Node.js 侧负责语义与策略：

- 通知接收、分类和优先级。
- 内容格式化、分组、去重和状态管理。
- Profile、工作模式、设置和历史记录。
- 声音策略和降级策略。
- Hana Page、Widget、运行状态和诊断入口。
- Runtime 进程托管、Named Pipe 客户端和恢复协调。

### 3.2 C++ Native Scene Runtime

C++ 侧负责原生桌面场景：

- Win32 窗口生命周期。
- 卡片布局、几何、交互和动画。
- Direct2D/DirectWrite 内容绘制。
- D3D11/DirectComposition 或可验证的回退渲染路径。
- 透明区域命中、关闭和拖动。
- DPI 与工作区适配。
- Runtime 级健康检查、诊断和可恢复退出。

### 3.3 进程和通信边界

插件与 Runtime 必须保持独立进程，通过版本化 JSON 协议和 Windows Named Pipe 通信：

- Runtime 崩溃不能拖垮 Node.js 插件。
- 插件重启后可以重新连接 Runtime。
- 幂等请求不能因为重连被重复执行。
- 跨进程失败必须返回稳定错误码和结构化诊断。
- 恢复顺序必须可测试、可解释、可回滚。

## 4. 严格隔离目标

vNext 是独立产品线，旧版只作为行为参考和迁移参考。

| 领域 | 旧版 | vNext |
| --- | --- | --- |
| 插件 ID | `notification-hub` | `notification-hub-vnext` |
| Runtime/helper | `notification-toast-helper.exe` | `notification-hub-runtime.exe` |
| 通信 | 旧版通信机制 | `notification-hub-vnext-*` Named Pipe |
| 安装目录 | `...\\plugins\\notification-hub` | `...\\plugins\\notification-hub-vnext` |
| 数据目录 | 旧版 `dataDir` | vNext 自己的 `ctx.dataDir` |
| 源码角色 | 运行中的旧插件 | vNext 源码与独立 Runtime |

以下规则是项目成功条件：

- 不覆盖、停止、修改、删除或复用旧插件。
- 不把旧 helper 作为 vNext 库或运行时依赖。
- 不把旧版目录、数据、通信或进程当作 vNext 的后备实现。
- vNext 启动失败只影响 vNext 自身，并留下诊断。
- 两个插件可以同时安装、同时运行、互不破坏。

## 5. 交付阶段

### 阶段 A：基础与契约

目标：建立可验证的仓库、协议、诊断、测试和进程边界。

完成标准：

- Node.js 与 C++ 目录边界清晰。
- 协议有版本、ACK、错误和诊断模型。
- Named Pipe framing 支持分片、粘包、截断和消息上限。
- Runtime 可被启动、健康检查和关闭。
- Node 与 C++ 测试可重复运行。

### 阶段 B：Scene Runtime 闭环

目标：让 Runtime 真正管理原生场景，而不只是模拟协议。

完成标准：

- 能创建、更新、排列和关闭通知卡片。
- fixed、stack、shelf 等已支持布局有明确数学契约。
- 真实 HWND 几何、绘制、命中和关闭路径都有测试。
- 透明区不拦截下层窗口。
- DPI 变化不会破坏窗口几何和渲染状态。

### 阶段 C：恢复与生命周期

目标：让异常和重启成为可恢复状态，而非未知损坏。

完成标准：

- SceneState 是优先恢复来源。
- 旧 recovery snapshot 只作为兼容 fallback。
- SceneState 原子写入、debounce、flush、失败回滚都可测试。
- Runtime 重启后按确定顺序恢复窗口、卡片、布局和顺序。
- 空 Scene 不会创建无内容的隐形窗口。
- stop、unload、断开和 Runtime 退出不会形成自动重启清理循环。

### 阶段 D：Hana 插件交付

目标：让 vNext 成为可通过 Hana 管理的独立插件。

完成标准：

- 真实 `onload/onunload` 生命周期可用。
- ZIP 根目录包含正确的 `manifest.json`。
- ZIP 只包含 vNext 自身资源。
- 禁用旧插件不会成为安装前提，两个插件可以并行。
- 通过 Hana 界面手动拖拽 ZIP 后，插件能稳定加载、启用和卸载。
- 新 ZIP 的实际手动安装过程有明确结果记录。
- 安装失败不会留下未处理 Runtime、残留进程或不可清理目录。

### 阶段 E：完整产品能力

目标：补齐通知产品层和长期体验。

范围包括：

- 通知中心、历史记录、搜索和筛选。
- Profile 与工作模式。
- Widget 轻量入口。
- 声音策略。
- 主题、信息层级、来源身份和粒子/交互表达。
- 诊断页面、运行状态和故障解释。
- 更完整的多卡片交互、动画和性能基准。

这些功能必须建立在前面阶段的稳定协议、状态和生命周期之上。

## 6. 当前交付目标

当前最优先的工作顺序：

1. 保持已确认的 vNext 安装和运行闭环不回归。
2. 使用 vNext 禁用后再安装的真实 Hana 拖拽流程，验证最新 Release ZIP。
3. 完成非空卡片的显示、排列、命中、拖动、关闭、重启和 SceneState 恢复验收。
4. 确认旧插件在整个过程中保持可用，且路径、进程、通信和数据完全隔离。
5. 修复发现的问题时，每个行为变化都补 focused regression test。
6. 通过 Node 测试、CTest、ZIP 静态检查和 Hana 实际 UI 验证后，再进入下一项能力。
7. 继续收口 shelf 视觉/交互、宿主配置热更新、关闭错误上报，再评估多显示器能力。

## 7. 明确不承诺的范围

在没有实际实现和测试证据之前，不得宣称：

- 完整多显示器拓扑支持。
- 显示器热插拔实时刷新。
- 跨显示器拖动时的完整 DPI 正确性。
- 所有布局模式都已经实现。
- 所有通知来源和旧版行为已经迁移。
- ZIP 静态检查等于 Hana 安装成功。
- Debug Runtime 自测等于 Release ZIP 的真实安装验收。
- 一次成功启动等于重启、卸载和失败恢复都正确。

## 8. 完成定义

只有同时满足以下条件，当前阶段才可标记完成：

- 目标行为已在源码中实现。
- 对应 Node 或 C++ 回归测试已加入。
- `npm run check` 通过。
- `npm test` 通过。
- CMake Release/Debug 构建和 CTest 通过。
- `git diff --check` 通过。
- ZIP 内容和 SHA256 已记录。
- Hana 真实 UI 手动拖拽安装结果已记录。
- 安装、运行、重启、卸载和失败路径没有破坏旧插件。
- 没有把未验证能力写成已完成能力。

## 9. 新对话启动协议

任何新的 Codex/Hana 对话，先按这个顺序读取：

```text
TOTAL-GOAL.md
HANDOFF.md
README.md
docs/architecture/phase-0-1-status.md
最新 git log 和 git status
```

然后先回答四个问题，再开始修改：

1. 当前总目标是什么？
2. 当前阶段完成了什么？
3. 当前真实阻塞和未验证项是什么？
4. 这次修改如何保证旧插件不受影响？

默认行为：先检查和复现，再修改；先测试，再声称完成；破坏性清理先向用户确认。

## 10. 参考文档

- 当前状态与故障交接：`HANDOFF.md`
- 项目入口和命令：`README.md`
- 详细长期规划：`notification-hub-vnext-plan.md`
- 阶段状态：`docs/architecture/phase-0-1-status.md`
- 插件 manifest：`plugin/manifest.json`
- 发布脚本：`scripts/package-release.ps1`
