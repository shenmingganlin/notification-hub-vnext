# Notification Hub vNext 完整规划

> 文档状态：基础架构规划稿
>
> 用途：在新对话、新工作区和 Git 初始化时，作为 notification-hub vNext 的共同基准。
>
> 当前阶段：Phase 0/1 已启动，正在建立工程骨架；协议、领域核心和 Runtime 尚未实现。
>
> 目标平台：Windows
>
> 维护目标：长期维护、持续优化、性能优先、视觉质量优先、稳定性优先。

---

## 0. 如何使用这份计划

新工作区建立后，先将本文件放入项目根目录，并在开始实现前重新确认：

1. 项目正式名称和目录名。
2. Git 仓库初始化方式和远程仓库地址。
3. 旧版参考代码的存放路径。
4. 版本号策略。
5. 当前机器上的 MSVC、Windows SDK、CMake、Node.js 和测试工具链。
6. 第一阶段是否只实现无窗口核心，还是同时建立最小运行时进程。

本文件中的内容分为四种状态：

- **已确定**：架构方向已经确定，后续实现以此为基础。
- **建议**：推荐方案，但需要在新工作区建立时再次确认。
- **工程目标**：需要通过基准测试验证，不能当作未经测量的承诺。
- **待决策**：实现前必须补充决定的细节。

---

# 1. 产品目标

## 1.1 总目标

将 notification-hub 从一个依赖侧边栏 Widget 和旧版 WinForms helper 的通知插件，重构为一个长期维护的通知场景系统：

- 能接收并分类 HanaAgent 及其他插件产生的通知。
- 能通过统一的 Profile 和工作模式控制通知行为。
- 能在桌面上以高质量、低延迟、可组合的场景形式展示通知。
- 能支持卡片、布局、物理、动画、粒子、声音和交互的模块化扩展。
- 能在多显示器、混合 DPI 和不同窗口环境下稳定运行。
- 能明确报告每个阶段的状态和错误。
- 能通过 Hana 页面管理历史通知、设置和诊断。
- 能通过 Widget 提供轻量、即时的通知入口。
- 能在新功能失败时回退，而不是让整个通知系统失效。

## 1.2 质量优先级

优先级从高到低：

1. 稳定性和可恢复性。
2. 长期可维护性。
3. 性能和流畅度。
4. 视觉质量和可定制性。
5. 功能数量。
6. 实现成本。

成本不是主要约束。允许为了更好的底层能力增加工程投入，但所有高成本方案都必须配套测试、诊断和回退机制。

## 1.3 目标体验

用户应该能感受到：

- 普通通知出现自然、流畅、不打扰。
- 重要通知有明显但克制的视觉和声音区分。
- 多条通知同时出现时，布局稳定，不互相覆盖失控。
- 卡片只在可见卡片区域响应点击和拖动。
- 透明区域可以穿透到底层应用。
- 视觉主题可以组合，但不会破坏内容可读性。
- 设置结果能明确显示“已保存”和“已应用”的区别。
- Runtime 出现异常时，页面能说明故障发生在哪个阶段，以及系统采取了什么回退措施。

---

# 2. 总体架构决策

## 2.1 从零建立 vNext

vNext 不从旧版 helper 继续扩张，也不把旧版 C# 文件机械拆分成更多文件。

新系统从以下基础重新建立：

- 新的领域模型。
- 新的版本化协议。
- 新的诊断模型。
- 新的 Scene Runtime。
- 新的页面与 Widget 界面边界。
- 新的测试和故障注入体系。

旧版代码继续保留，但只作为参考，不作为新架构依赖。

## 2.2 旧版定位

旧版 `notification-hub-0.2.1` 定位为：

```text
legacy-reference
```

用途：

- 参考已有通知分类行为。
- 参考旧版配置字段和默认值。
- 参考声音决策和回退行为。
- 参考视觉主题、粒子形状和动画概念。
- 参考旧版协议和兼容需求。
- 提供行为对照样本。
- 协助迁移历史配置和历史数据。
- 作为回归样本来源。

禁止事项：

- 不把旧版 helper 作为 vNext 的类库依赖。
- 不在旧版巨型 helper 上继续添加 vNext 功能。
- 不把旧版的布局、窗口和粒子实现直接当作新架构边界。
- 不因为已有代码可以复用，就牺牲新系统的接口清晰度。

## 2.3 系统分层

```text
HanaAgent
  │
  ├─ Widget Surface
  │    └─ 只显示轻量、即时的通知入口
  │
  └─ Page Surface
       ├─ 通知中心
       ├─ 设置中心
       ├─ 运行状态
       └─ 诊断中心

Node.js Plugin Domain
  ├─ Event Classifier
  ├─ Notification API
  ├─ Notification Store
  ├─ Settings Store
  ├─ Profile Store
  ├─ Content Formatter
  ├─ Grouping / Deduplication
  ├─ Sound Policy
  ├─ Diagnostics
  └─ Runtime Transport Client
          │
          │ Versioned JSON over Windows Named Pipe
          ▼
C++20 Native Scene Runtime
  ├─ Protocol Server
  ├─ Scene Manager
  ├─ Layout Engine
  ├─ Physics Engine
  ├─ Interaction Engine
  ├─ Animation System
  ├─ Card Renderer
  ├─ Effect Renderer
  ├─ Particle System
  ├─ Audio Adapter
  ├─ Monitor / DPI Manager
  ├─ DirectComposition Compositor
  ├─ Direct2D / DirectWrite Renderer
  ├─ D3D11 Particle Backend
  └─ Software / Simplified Fallback Backend
```

## 2.4 进程边界

Node.js 插件和 C++ Scene Runtime 运行在独立进程边界内：

- 插件负责语义、策略、状态和页面。
- Runtime 负责窗口、场景、渲染、交互和 GPU。
- Runtime 崩溃不能拖垮 Node.js 插件。
- Node.js 插件重启后可以重新连接 Runtime。
- Runtime 需要支持健康检查和自动恢复。
- 任何跨边界失败都必须产生结构化诊断事件。

---

# 3. 界面架构

## 3.1 Widget：即时通知入口

Widget 只承担轻量通知展示，不作为完整管理后台。

Widget 可以显示：

- 最近几条通知。
- 未读数量。
- 通知类型。
- 重要性标识。
- 时间。
- 简短摘要。
- 通知状态。
- 打开通知详情的入口。
- 打开通知中心的入口。
- 打开设置或诊断页面的入口。

Widget 可以提供的轻量操作：

- 标记已读。
- 清除单条通知。
- 清除可见通知。
- 打开详情。
- 打开通知中心。

Widget 不负责：

- 完整历史记录管理。
- 复杂搜索和筛选。
- Profile 编辑。
- 工作模式编辑。
- 声音管理。
- 粒子和视觉参数管理。
- 诊断日志浏览。
- 大量预览控件。

Widget 的核心问题是：

> 现在有没有需要我注意的通知？

## 3.2 Hana 页面：通知中心

通知中心展示所有通知，并提供完整管理能力。

### 列表功能

第一阶段至少支持：

- 全部通知。
- 未读通知。
- 重要通知。
- 错误通知。
- 对话通知。
- 工具通知。
- 系统通知。
- 按来源筛选。
- 按时间筛选。
- 标题和正文搜索。
- 按时间排序。
- 按重要性排序。
- 分页或虚拟列表。
- 批量标记已读。
- 批量删除。
- 清空历史。

后续可以支持：

- 标签筛选。
- 相似通知聚类。
- 通知分组查看。
- 同一会话的通知时间线。
- 按 Profile 或工作模式筛选。

### 通知详情

通知详情应显示：

- 标题。
- 正文。
- 通知类型。
- 来源 Agent。
- 来源插件。
- 来源会话。
- 创建时间。
- 更新时间。
- 重要性。
- 已读状态。
- 是否成功显示。
- 是否被点击。
- 是否被手动关闭。
- 是否播放声音。
- `notificationId`。
- `traceId`。

调试模式下可以展开：

- 生效 Profile。
- 布局模式。
- 目标显示器。
- 最终位置。
- 渲染器版本。
- Runtime 状态。
- 诊断事件链。
- 回退原因。

### 通知操作

- 标记已读或未读。
- 重新显示。
- 固定通知。
- 删除通知。
- 复制正文。
- 打开来源会话。
- 查看诊断链。
- 查看同组通知。
- 查看相似通知。
- 使用当前通知测试视觉效果。

## 3.3 Hana 页面：设置中心

设置页面按领域分组，不把所有配置塞在一个表单里。

```text
设置
├─ 常规
├─ 通知规则
├─ 显示与布局
├─ 内容策略
├─ 声音
├─ Profile
├─ 工作模式
├─ 历史与隐私
├─ Runtime
└─ 诊断
```

### 常规

- 是否启用通知。
- 默认重要性。
- 默认显示时长。
- 默认来源行为。
- 是否自动启动 Runtime。
- 页面语言。
- 恢复默认设置。

### 通知规则

- 各类通知是否显示。
- 错误通知是否强制显示。
- 重复通知的合并规则。
- 同组通知的行为。
- 重要性阈值。
- 各来源的启用状态。
- 静默来源列表。

### 显示与布局

- 卡片主题。
- 卡片透明度。
- 缩放比例。
- 圆角。
- 阴影。
- 显示器选择。
- 锚点位置。
- 安全边距。
- 堆叠方向。
- 布局模式。
- 拖动后是否保存位置。
- 是否允许通知超出安全区域。
- 卡片最大宽度和高度。

### 内容策略

- 固定模板模式。
- 极简模式。
- 摘要模式。
- 原文模式。
- 最大正文长度。
- 摘要长度。
- 是否显示 Agent 名称。
- 是否显示来源。
- 是否显示时间。
- 是否显示工具信息。
- 是否显示元数据。
- 截断方式。
- 本地脱敏规则。
- 是否保存完整正文。

### 声音

- 全局声音开关。
- 按通知类型配置声音。
- 按重要性配置声音。
- 音量。
- 重复通知是否播放声音。
- 工作模式下是否静音。
- 声音文件检查。
- 声音预览。
- 播放失败时的回退行为。

### Profile

Profile 采用可继承的配置覆盖机制。

建议的层级：

```text
默认 Profile
  ↓
通知类型 Profile
  ↓
重要性 Profile
  ↓
来源 Profile
  ↓
工作模式 Profile
  ↓
单条通知覆盖
```

设置页需要显示：

- Profile 列表。
- Profile 继承关系。
- 每层覆盖了哪些字段。
- 最终生效值。
- 每个字段的来源层级。
- 配置校验错误。
- 循环继承错误。
- 恢复默认 Profile。
- 复制 Profile。
- 导入和导出 Profile。

Profile 可配置：

- 卡片主题。
- 内容模式。
- 布局模式。
- 动画。
- 粒子。
- 声音。
- 显示时长。
- 优先级。
- 是否允许被下层覆盖。
- 是否允许进入历史。

### 工作模式

内置工作模式建议包括：

```text
自由模式
工作模式
会议模式
游戏模式
夜间模式
专注模式
```

工作模式可以覆盖：

- 是否显示通知。
- 是否播放声音。
- 允许的通知类型。
- 重要性阈值。
- 显示位置。
- 动画强度。
- 粒子数量上限。
- 显示时长。
- 是否允许错误通知穿透静默规则。

工作模式本质上是配置覆盖层，不复制一套完整配置。

### 历史与隐私

- 历史保留天数。
- 最大历史条数。
- 是否保存正文。
- 是否保存完整内容。
- 是否保存诊断上下文。
- 敏感字段脱敏规则。
- 日志文件大小上限。
- 清除历史。
- 导出历史。
- 导出诊断包。

### Runtime 与诊断

显示：

- Runtime 是否在线。
- Runtime 版本。
- 协议版本。
- 当前渲染器。
- 当前 GPU。
- 当前显示器。
- 当前 DPI。
- 当前场景卡片数量。
- 当前粒子数量。
- 当前帧率。
- CPU 和 GPU 帧时间。
- 最近一次错误。
- 最近一次回退。
- Named Pipe 状态。

操作：

- 启动 Runtime。
- 重启 Runtime。
- 测试通信。
- 测试渲染。
- 测试声音。
- 打开诊断日志。
- 导出诊断信息。
- 开启性能监控。
- 开启故障注入模式。

## 3.4 两种界面共享同一数据源

Widget 和页面不能各自维护通知状态。

领域层统一维护：

```text
NotificationStore
SettingsStore
ProfileStore
DiagnosticStore
RuntimeState
```

派生视图：

```text
NotificationStore
  ├─ WidgetViewModel
  ├─ NotificationPageViewModel
  └─ NotificationDetailViewModel

SettingsStore
  ├─ SettingsPageViewModel
  └─ RuntimeConfig

RuntimeState
  ├─ Widget 状态徽标
  ├─ 页面运行状态
  └─ 诊断页面
```

页面修改设置时，流程应为：

```text
页面提交设置
  ↓
SettingsStore 校验并保存
  ↓
ProfileResolver 重新解析
  ↓
生成 Runtime 配置变更
  ↓
Named Pipe 发送 config.update
  ↓
Runtime 返回 ACK
  ↓
页面显示“已应用”或“应用失败”
```

必须区分：

```text
已保存
已应用
```

如果配置保存成功但 Runtime 不可用，页面应显示：

```text
设置已保存，但桌面渲染器尚未应用。
原因：Runtime 不可用。
[重试] [查看诊断]
```

---

# 4. Node.js 插件层

## 4.1 职责

Node.js 插件层负责所有与 HanaAgent 语义和管理界面相关的工作：

- EventBus 订阅。
- 事件分类。
- 通知 API。
- 通知记录标准化。
- Profile 解析。
- 内容格式化。
- 分组和去重。
- 声音决策。
- 通知历史。
- 设置存储。
- 页面和 Widget 数据接口。
- 诊断记录。
- Runtime 进程管理。
- Named Pipe 客户端。
- 旧版配置迁移。
- 回退策略。

Node.js 不负责：

- 绘制卡片。
- 管理桌面窗口坐标。
- 执行 GPU 粒子。
- 处理底层鼠标命中。
- 负责卡片堆叠的逐帧物理积分。

## 4.2 建议目录

```text
plugin/
├─ index.js
├─ manifest.json
├─ api/
│  ├─ notify.js
│  ├─ notify-error.js
│  ├─ notify-success.js
│  ├─ notify-progress.js
│  ├─ dismiss.js
│  ├─ get-recent.js
│  └─ test.js
├─ domain/
│  ├─ notification-record.js
│  ├─ notification-profile.js
│  ├─ notification-scene-state.js
│  ├─ notification-store.js
│  ├─ settings-store.js
│  ├─ profile-store.js
│  └─ runtime-state.js
├─ events/
│  ├─ event-classifier.js
│  ├─ event-normalizer.js
│  └─ event-policy.js
├─ content/
│  ├─ content-formatter.js
│  ├─ content-truncator.js
│  ├─ redaction.js
│  └─ metadata-policy.js
├─ grouping/
│  ├─ grouping-policy.js
│  ├─ deduplication.js
│  └─ aggregation.js
├─ policies/
│  ├─ notification-policy.js
│  ├─ sound-policy.js
│  ├─ work-mode-policy.js
│  └─ fallback-policy.js
├─ runtime/
│  ├─ runtime-manager.js
│  ├─ scene-client.js
│  ├─ scene-command-builder.js
│  └─ capability-cache.js
├─ widget/
│  ├─ widget-route.js
│  ├─ widget-view-model.js
│  └─ widget-actions.js
├─ pages/
│  ├─ notification-page.js
│  ├─ settings-page.js
│  ├─ diagnostics-page.js
│  ├─ notification-view-model.js
│  └─ page-actions.js
├─ diagnostics/
│  ├─ diagnostic-reporter.js
│  ├─ diagnostic-store.js
│  ├─ error-fingerprint.js
│  ├─ recursion-guard.js
│  └─ export-diagnostics.js
└─ migration/
   ├─ legacy-config-importer.js
   └─ legacy-data-migrator.js
```

目录可以在实现阶段调整，但领域层、界面适配层和 Runtime 通信层必须保持分离。

## 4.3 公共 API

建议提供版本化 API：

```text
notify
notifyError
notifySuccess
notifyProgress
dismiss
getRecent
test
```

API 需要支持：

- `notificationId`。
- `traceId`。
- 通知类型。
- 标题和正文。
- 来源信息。
- 重要性。
- Profile 覆盖。
- 显示策略。
- 声音策略。
- 是否允许聚合。
- 是否保存历史。
- 是否允许桌面显示。

公共 API 的字段必须有 schema，不允许不同插件随意发送无法解释的对象。

## 4.4 事件分类

事件分类必须采用明确允许式逻辑，不使用“排除少数值后全部当作成功”的模式。

特别需要覆盖：

- 正常 `message_end`。
- `toolUse`。
- `aborted`。
- `error`。
- `max_tokens`。
- `content_filter`。
- `timeout`。
- `rate_limit`。
- `cancelled`。
- `interrupted`。
- `tool_error`。
- `provider_error`。
- `model_unavailable`。
- 未知事件类型。
- 缺少 `stopReason` 的异常载荷。

未知事件不能静默伪装成正常完成事件。应当：

- 记录事件类型。
- 根据策略忽略、归类或生成诊断。
- 不产生虚假的成功通知。

---

# 5. 领域模型

## 5.1 NotificationRecord

通知记录应至少包含：

```text
notificationId
traceId
createdAt
updatedAt
type
importance
source
agent
session
channel
title
content
summary
metadata
contentPolicy
profileRef
workMode
status
historyPolicy
runtimeHints
```

`status` 可以包括：

```text
received
classified
formatted
queued
shown
clicked
paused
dismissed
expired
failed
fallback
read
unread
```

领域模型不得依赖具体的窗口或渲染器类型。

## 5.2 NotificationProfile

Profile 用于描述最终展示策略，建议按字段覆盖而不是复制完整配置：

```text
id
parentId
enabled
importance
content
visual
layout
motion
particles
audio
lifetime
interaction
history
runtime
constraints
```

Profile 解析器需要：

- 合并父级和子级。
- 检查循环继承。
- 检查未知字段。
- 检查非法值。
- 返回每个字段的来源。
- 提供可解释的最终结果。
- 在解析失败时回退到默认 Profile。

## 5.3 NotificationSceneState

Scene State 描述桌面 Runtime 当前场景，不直接描述 Node.js 业务事件：

```text
sceneId
runtimeVersion
monitorTopology
activeCards
layoutMode
physicsMode
interactionMode
renderMode
performanceBudget
health
```

每张 Scene Card 至少包含：

```text
notificationId
bounds
targetBounds
velocity
zOrder
lifecycleState
hitRegions
visualState
interactionState
```

## 5.4 ContentPolicy

内容策略支持：

- 固定模板。
- 极简。
- 摘要。
- 实际内容。
- 最大字符数。
- 最大行数。
- 按句子截断。
- 按词截断。
- 保留首尾。
- 本地脱敏。
- 元数据显示控制。

内容策略不能因为截断而破坏错误信息的核心含义。错误通知、重要通知和诊断通知可以使用更高的内容预算，但必须受全局上限约束。

## 5.5 Grouping 与 Deduplication

旧版的 channel aggregation 应逐步抽象为通用分组系统：

- 分组键。
- 相似度规则。
- 时间窗口。
- 最大聚合数量。
- 聚合标题。
- 聚合正文。
- 是否保留各条原始记录。
- 是否允许重要通知进入普通组。
- 是否为重复通知抑制声音和动画。

兼容迁移期间保留旧字段的解释能力，但新领域模型不应被旧 channel 概念锁死。

---

# 6. C++20 Native Scene Runtime

## 6.1 目标技术栈

最终目标底层：

```text
C++20
MSVC
Win32
DirectComposition
Direct2D
DirectWrite
D3D11
DXGI
CMake
CTest
```

职责：

- Named Pipe 服务端。
- 场景生命周期。
- 多显示器和 DPI。
- 布局。
- 物理。
- 命中测试。
- 拖动。
- 卡片渲染。
- 特效。
- 粒子。
- GPU 合成。
- 音频适配。
- Runtime 诊断。

## 6.2 渲染架构

```text
Win32 Scene Window
  └─ DirectComposition Visual Tree
      ├─ Card Surface
      │   └─ Direct2D + DirectWrite
      ├─ Effect Surface
      │   └─ Direct2D / Composition Animation
      ├─ Particle Surface
      │   └─ D3D11 texture or shared surface
      └─ Debug Surface
          └─ Optional diagnostics overlay
```

主方案不依赖：

- WinForms `TransparencyKey`。
- 每张卡片一个 HWND。
- 全屏 GDI+ 粒子窗口。
- 把透明区域当成普通窗口区域。

## 6.3 Scene Window

建议每个显示器一个 Scene Window，而不是每张卡片一个窗口。

好处：

- HWND 数量少。
- 布局和物理集中。
- 卡片、粒子和特效统一合成。
- 多显示器边界清晰。
- 拖动坐标容易管理。
- 减少 TopMost 和窗口层级竞争。

默认行为：

- Scene Window 覆盖目标显示器的安全工作区域或必要的虚拟区域。
- 透明区域穿透到底层应用。
- 卡片本体通过自定义命中测试接收输入。
- 粒子默认不接收输入。
- 卡片外区域不能触发通知点击或关闭。

## 6.4 卡片命中和交互

命中测试由 Interaction Engine 负责，不能依赖窗口整体边界。

至少区分：

```text
CardBody
CardCloseButton
CardActionButton
CardDragRegion
CardTextRegion
ParticleRegion
TransparentRegion
```

行为：

```text
点击 CardBody
  → 通知点击事件

点击 CardCloseButton
  → 关闭通知

从 CardDragRegion 按下并移动
  → 开始拖动

点击 TransparentRegion
  → 穿透到底层应用

点击 ParticleRegion
  → 默认穿透
```

必须验证：

- 卡片左侧透明区域不会触发点击。
- 卡片上方透明区域不会暂停生命周期。
- 非卡片区域不会触发退场动画。
- 缩放、DPI 和动画过程中命中区域与视觉区域一致。

## 6.5 多显示器和 DPI

Runtime 需要：

- Per-Monitor V2 DPI awareness。
- 显示器拓扑读取。
- 显示器 ID 和工作区缓存。
- 物理像素与逻辑单位转换。
- 显示器热插拔处理。
- 显示器消失时的安全回退。
- 任务栏和工作区安全边界。
- 混合 DPI 场景验证。

测试组合至少包括：

```text
100% DPI
125% DPI
150% DPI
175% DPI
主副显示器不同 DPI
横向排列
纵向排列
负坐标显示器
显示器拔出后的回退
```

---

# 7. 模块边界

模块化的核心是稳定接口，而不是单纯拆文件。

## 7.1 Layout

```cpp
class ILayoutStrategy {
public:
    virtual LayoutPlan arrange(
        const SceneState& state,
        const LayoutContext& context) = 0;
    virtual ~ILayoutStrategy() = default;
};
```

计划支持：

```text
FixedLayout
StackLayout
ShelfLayout
CascadeLayout
FanLayout
FocusLayout
FreeformLayout
```

## 7.2 Physics

```cpp
class IPhysicsStrategy {
public:
    virtual void step(
        SceneState& state,
        const PhysicsContext& context,
        double deltaSeconds) = 0;
    virtual ~IPhysicsStrategy() = default;
};
```

计划支持：

```text
FixedPhysics
FlowPhysics
StableSpringPhysics
SoftCollisionPhysics
PriorityPushPhysics
OverlayPhysics
```

物理系统必须有：

- 最大速度。
- 最大位移修正。
- 时间步长上限。
- 数值稳定性检查。
- 越界修正。
- 性能预算。
- 异常状态回退到稳定布局。

## 7.3 Card Renderer

```cpp
class ICardRenderer {
public:
    virtual CardSurface renderCard(
        const NotificationRecord& record,
        const NotificationProfile& profile,
        const RenderContext& context) = 0;
    virtual ~ICardRenderer() = default;
};
```

计划支持：

```text
GlassCardRenderer
TechCardRenderer
PaperCardRenderer
HologramCardRenderer
MinimalCardRenderer
ClassicCardRenderer
```

## 7.4 Effect Renderer

```cpp
class IMotionEffect {
public:
    virtual void start(MotionContext&) = 0;
    virtual void update(MotionContext&, double progress) = 0;
    virtual void stop(MotionContext&) = 0;
    virtual ~IMotionEffect() = default;
};
```

计划支持：

```text
FadeEffect
ScanEffect
StardustEffect
ShatterEffect
MagnetSnapEffect
VortexEffect
```

## 7.5 Particle System

```cpp
class IParticleSystem {
public:
    virtual void emit(const ParticleRequest&) = 0;
    virtual void update(double deltaSeconds) = 0;
    virtual void render(RenderContext&) = 0;
    virtual ~IParticleSystem() = default;
};
```

粒子系统应包含：

- 粒子池。
- 生命周期管理。
- 发射器。
- 形状注册表。
- GPU buffer 管理。
- 数量上限。
- 工作模式预算。
- 设备丢失重建。
- 软件简化回退。

第一阶段不开放动态 DLL 粒子插件。先使用编译时模块化和运行时注册表，避免 DLL ABI、加载安全和崩溃隔离问题。

## 7.6 Interaction

```cpp
class IInteractionController {
public:
    virtual HitTestResult hitTest(Point2D point) const = 0;
    virtual void beginDrag(CardId, Point2D point) = 0;
    virtual void updateDrag(Point2D point) = 0;
    virtual void endDrag(Point2D point) = 0;
    virtual ~IInteractionController() = default;
};
```

## 7.7 Diagnostics

所有模块都必须能够通过统一 Reporter 产生结构化事件，不允许只向 stderr 输出无法关联的自由文本。

---

# 8. 通信协议

## 8.1 传输方式

使用 Windows Named Pipe：

- 本机通信。
- 不暴露随机 TCP 端口。
- 支持 ACL。
- 支持长连接。
- 支持重连。
- 支持请求和 ACK。
- 便于 Runtime 生命周期管理。

建议管道消息采用：

```text
[4-byte little-endian length][UTF-8 JSON payload]
```

第一阶段使用 JSON，便于调试和抓取诊断。只有在基准测试证明需要时，才考虑 MessagePack。协议语义不得绑定具体序列化格式。

## 8.2 消息通用字段

```json
{
  "protocolVersion": 1,
  "requestId": "req-123",
  "traceId": "trace-456",
  "type": "scene.create",
  "timestamp": "2026-08-01T00:00:00.000Z",
  "payload": {}
}
```

## 8.3 第一批命令

```text
hello
health
capabilities
scene.create
scene.update
scene.dismiss
scene.drag
scene.set-mode
config.update
diagnostic.subscribe
shutdown
```

## 8.4 协议行为

必须支持：

- 版本协商。
- 能力发现。
- 请求 ID。
- ACK。
- 错误响应。
- 超时。
- 重连。
- 未知命令拒绝。
- 未知字段兼容策略。
- 无效 payload 的精确错误。
- Runtime 进程重启后的状态重建。

## 8.5 回退策略

Runtime 通信失败时：

1. 记录 `TRANSPORT_*` 诊断。
2. 判断是否可重连。
3. 尝试启动或重启 Runtime。
4. 在限定时间内重试。
5. 仍失败则进入回退策略。
6. 记录 `FALLBACK_TO_LEGACY` 或 `FALLBACK_TO_NO_DESKTOP`。
7. 不让错误通知递归触发无穷错误通知。

旧版 legacy helper 可以在迁移期间作为可选回退，但不作为 vNext 的主路径。

---

# 9. 诊断与错误反馈

## 9.1 设计目标

任何失败都要能回答：

- 哪个通知发生了问题？
- 哪个阶段失败？
- 哪个模块失败？
- 使用了什么配置？
- 是否可恢复？
- 是否进行了回退？
- 回退到哪里？
- 用户下一步可以做什么？

## 9.2 诊断事件字段

```json
{
  "diagnosticId": "diag-123",
  "traceId": "trace-456",
  "notificationId": "notice-789",
  "stage": "layout-planned",
  "code": "LAYOUT_OUT_OF_BOUNDS",
  "severity": "warning",
  "recoverable": true,
  "message": "卡片超出工作区，已回退到安全锚点",
  "timestamp": "2026-08-01T00:00:00.000Z",
  "context": {
    "renderer": "native-v1",
    "profile": "error",
    "monitor": "primary",
    "dpi": 1.25
  }
}
```

## 9.3 生命周期阶段

建议至少覆盖：

```text
event-received
classified
profile-resolved
content-formatted
sound-resolved
transport-sent
runtime-accepted
scene-queued
layout-planned
physics-started
renderer-created
shown
hit-tested
drag-started
drag-ended
clicked
paused
resumed
dismissed
expired
fallback
error
```

## 9.4 稳定错误码

```text
EVENT_INVALID
EVENT_UNSUPPORTED_STOP_REASON
EVENT_UNKNOWN_TYPE

PROFILE_INVALID
PROFILE_CYCLE
PROFILE_UNKNOWN_FIELD
PROFILE_FALLBACK

CONTENT_INVALID
CONTENT_TOO_LONG
CONTENT_REDACTION_FAILED
CONTENT_FORMAT_FAILED

SOUND_PATH_INVALID
SOUND_PLAYBACK_FAILED

TRANSPORT_PIPE_NOT_FOUND
TRANSPORT_PIPE_ACCESS_DENIED
TRANSPORT_PROTOCOL_MISMATCH
TRANSPORT_ACK_TIMEOUT
TRANSPORT_DISCONNECTED

MONITOR_NOT_FOUND
MONITOR_TOPOLOGY_CHANGED
DPI_CONVERSION_FAILED

LAYOUT_INVALID
LAYOUT_OUT_OF_BOUNDS
LAYOUT_OVERLAP
LAYOUT_NO_SAFE_POSITION

PHYSICS_UNSTABLE
PHYSICS_BUDGET_EXCEEDED
PHYSICS_INVALID_DELTA

RENDERER_START_FAILED
RENDERER_RESOURCE_FAILED
RENDERER_DEVICE_LOST
RENDERER_FRAME_TIMEOUT
RENDERER_FALLBACK

PARTICLE_INVALID
PARTICLE_BUDGET_EXCEEDED
PARTICLE_DEVICE_RESET

INTERACTION_HIT_TEST_FAILED
INTERACTION_OUTSIDE_CARD
DRAG_POSITION_REJECTED

AUDIO_DEVICE_UNAVAILABLE

FALLBACK_TO_LEGACY
FALLBACK_TO_NO_DESKTOP
DIAGNOSTIC_RECURSION_SUPPRESSED
```

## 9.5 诊断级别

| 级别 | 行为 |
|---|---|
| `trace` | 只写调试日志 |
| `info` | 写入诊断时间线 |
| `warning` | 记录并尝试修正 |
| `error` | 记录并尝试回退 |
| `fatal` | 停止当前 Runtime 或当前渲染器，并显示可见错误 |

## 9.6 诊断防递归

诊断通知必须带：

```json
{
  "meta": {
    "diagnostic": true,
    "suppressRecursiveDiagnostics": true
  }
}
```

还需要：

- 错误指纹短时间去重。
- 每分钟错误通知上限。
- 诊断通知不能再次触发普通通知链。
- 错误通知渲染失败时只写日志，不再生成错误通知。
- 诊断日志大小上限。
- 日志轮转。
- 可导出诊断包。

## 9.7 可观测运行指标

- 当前 Runtime 在线状态。
- 当前渲染器。
- 当前 GPU。
- 当前显示器和 DPI。
- 活动卡片数量。
- 粒子数量。
- 帧率。
- CPU 帧时间。
- GPU 帧时间。
- 场景更新时间。
- 传输延迟。
- ACK 延迟。
- Runtime 重启次数。
- 最近回退原因。
- 最近诊断事件。

---

# 10. 测试策略

## 10.1 总原则

每个新功能都必须同时考虑：

1. 纯逻辑测试。
2. 协议测试。
3. 运行时测试。
4. 故障注入测试。
5. 性能测试。
6. 真实窗口回归。

没有测试和诊断的功能不进入稳定阶段。

## 10.2 纯逻辑测试

不创建窗口、不初始化 GPU，测试：

- 事件分类。
- 正常和异常 `stopReason`。
- Profile 继承。
- Profile 循环检测。
- 内容截断。
- 句子边界。
- 脱敏。
- 通知分组。
- 重复通知去重。
- 重要性覆盖。
- 声音决策。
- 锚点位置计算。
- 安全边距。
- 多显示器选择。
- 堆叠方向。
- 布局边界。
- 物理稳定性。
- 诊断指纹。
- 递归抑制。

## 10.3 协议测试

测试：

- `hello`。
- `health`。
- `capabilities`。
- `scene.create`。
- `scene.update`。
- `scene.dismiss`。
- `scene.drag`。
- `config.update`。
- 未知命令。
- 无效 payload。
- 缺少必需字段。
- 未知字段。
- 协议版本不匹配。
- ACK 超时。
- Named Pipe 断开。
- Runtime 重启。
- 重连后的状态恢复。
- 重复请求。
- 请求顺序错误。

## 10.4 运行时测试

测试：

- 单卡片创建。
- 多卡片创建。
- 卡片关闭。
- 卡片点击。
- 卡片拖动。
- 卡片本体命中。
- 透明区穿透。
- 粒子区穿透。
- 固定位置。
- 右上角向下堆叠。
- 右下角向上堆叠。
- Shelf。
- Cascade。
- Flow 补位。
- Fixed 不补位。
- Soft collision。
- Priority push。
- 卡片不出安全区域。
- 运行时重启。
- 显示器拓扑变化。
- DPI 变化。

## 10.5 故障注入

主动制造：

- Runtime 可执行文件不存在。
- Runtime 启动失败。
- Named Pipe 不存在。
- Named Pipe 权限拒绝。
- Named Pipe 断开。
- ACK 超时。
- 协议版本不匹配。
- GPU 初始化失败。
- Direct2D 资源创建失败。
- D3D11 设备丢失。
- 显示器不存在。
- Profile 循环继承。
- 无效颜色。
- 未知布局。
- 未知粒子。
- 声音文件不存在。
- 内容格式失败。
- 布局越界。
- 物理数值爆炸。
- 卡片渲染失败。

并验证：

- `stage` 是否准确。
- `code` 是否稳定。
- `severity` 是否合理。
- 是否可恢复。
- 是否进行了正确回退。
- 是否避免递归错误通知。
- 页面是否能看到故障状态。
- Widget 是否仍保持可用。

## 10.6 性能目标

以下是工程目标，不是未经实测的承诺：

- 普通卡片动画目标 60 FPS。
- 空闲场景尽量保持极低 CPU 占用。
- 100 个粒子保持稳定 60 FPS。
- 1000 个粒子不明显影响 HanaAgent 宿主。
- 10 张卡片连续进入时不产生明显长帧。
- 复杂退场效果不阻塞 Node.js 插件。
- Runtime 崩溃后的恢复时间目标小于 500ms，最终以实际测量为准。
- 无窗口核心测试应能快速运行，适合每次提交执行。

必须记录：

- CPU 使用率。
- GPU 使用率。
- 帧时间 P50/P95/P99。
- 分配次数。
- 内存峰值。
- 粒子数量。
- 卡片数量。
- 进程启动时间。
- 协议延迟。
- Runtime 恢复时间。

## 10.7 人工窗口回归

至少验证：

```text
Windows 10 / Windows 11
100% / 125% / 150% / 175% DPI
浅色 / 深色桌面
单显示器
多显示器
混合 DPI
横向和纵向排列
负坐标显示器
10 条连续通知
卡片拖动
点击卡片本体
点击透明区域
鼠标悬停卡片本体
鼠标悬停透明区域
自动退场
手动退场
Runtime 重启
Renderer 回退
任务栏区域
全屏应用附近
```

---

# 11. 分阶段实施路线

## Phase 0：冻结旧版和确定边界

目标：不让旧代码污染新架构。

工作：

- 将 0.2.1 标记为 `legacy-reference`。
- 保存旧版源码和配置样本。
- 记录旧版事件行为。
- 记录旧版通知类型。
- 记录旧版视觉和声音能力。
- 保存当前实验性改动，但不将其当作 vNext 实现。
- 建立迁移字段清单。
- 建立旧版回归样本。

完成标准：

- 新工作区与旧版目录隔离。
- 旧版可以被读取和比对。
- 新代码不依赖旧版 helper。

## Phase 1：建立新工程骨架

目标：建立可长期维护的仓库和工具链。

工作：

- 初始化 Git。
- 建立 `plugin`、`runtime`、`schemas`、`tests`、`docs`、`legacy-reference` 目录。
- 建立 CMake。
- 建立 C++20 项目。
- 建立 CTest。
- 建立 Node.js 测试。
- 建立格式化和静态检查。
- 建立构建配置。
- 建立版本文件。
- 建立 CI 或至少本地可重复构建脚本。
- 建立协议版本文件。
- 建立基础诊断模型。

完成标准：

- 干净环境可以构建。
- 空测试可以通过。
- 版本和构建信息可查询。
- Git 提交边界清晰。

## Phase 2：协议和诊断优先

目标：先让系统能被观察和验证。

工作：

- 定义 `hello`。
- 定义 `health`。
- 定义 `capabilities`。
- 定义请求和响应模型。
- 定义 ACK 和错误响应。
- 定义 `DiagnosticEvent`。
- 定义 trace 生命周期。
- 定义 JSONL 日志。
- 定义错误指纹和去重。
- 定义故障注入接口。

完成标准：

- Node.js 可以生成合法协议消息。
- Runtime 可以解析并拒绝非法消息。
- 每个协议错误都有稳定 code。
- 诊断事件可以查询和导出。

## Phase 3：无窗口领域核心

目标：不启动窗口就完成主要业务判断。

工作：

- `NotificationRecord`。
- `NotificationProfile`。
- `ProfileResolver`。
- `ContentFormatter`。
- `GroupingPolicy`。
- `DeduplicationPolicy`。
- `LayoutMath`。
- `MonitorMath`。
- `SceneState`。
- `PhysicsMath`。
- `DiagnosticReporter`。

完成标准：

- 核心逻辑有完整单元测试。
- Profile 解析可以解释字段来源。
- 内容策略可以稳定截断和脱敏。
- 布局数学不依赖窗口。
- 物理数学在异常输入下不会爆炸。

## Phase 4：Named Pipe Runtime 骨架

目标：建立 Node.js 和 C++ Runtime 的真正边界。

工作：

- Named Pipe 服务端。
- Named Pipe 客户端。
- 长度前缀消息。
- JSON 编解码。
- hello/health/capabilities。
- 重连。
- ACK。
- 超时。
- Runtime 启停管理。
- 故障注入。

完成标准：

- Node.js 能启动并健康检查 Runtime。
- Runtime 断开时页面可以显示状态。
- Runtime 重启后可以重新连接。
- 协议错误可以定位到具体 stage。

## Phase 5：最小 Native Scene Window

目标：只实现一个稳定、可观察的原生窗口。

工作：

- Win32 窗口。
- Per-Monitor V2 DPI。
- DirectComposition 基础树。
- Direct2D 基础卡片表面。
- DirectWrite 标题和正文。
- 真 alpha 透明。
- 一张卡片。
- 卡片本体命中。
- 点击。
- 拖动。
- 关闭。
- 生命周期诊断。

此阶段暂不加入：

- 复杂粒子。
- 多种物理。
- 全部主题。
- 复杂 Profile 编辑。
- 多卡片复杂布局。

完成标准：

- 卡片看起来正确。
- 透明区域穿透。
- 点击区域准确。
- 拖动稳定。
- DPI 坐标一致。
- 失败时有诊断和回退。

## Phase 6：布局系统

依次实现：

```text
fixed
stack
shelf
cascade
focus
freeform
```

每加入一种布局，都必须配套：

- 纯数学测试。
- 多卡片运行时测试。
- 边界测试。
- DPI 测试。
- 显示器测试。
- 性能记录。

## Phase 7：物理和关系系统

依次实现：

```text
stable spring
flow
fixed relation
soft collision
priority push
overlay
grouped
```

物理系统必须支持：

- 暂停。
- 拖动优先级。
- 重要通知优先级。
- 退出时释放空间。
- 速度和加速度预算。
- 异常回退。

## Phase 8：页面和 Widget 正式接入

Widget：

- 最近通知。
- 未读数量。
- 简短摘要。
- 打开详情。
- 打开通知中心。

页面：

- 通知中心。
- 通知详情。
- 设置中心。
- Runtime 状态。
- 诊断页面。

完成标准：

- Widget 和页面共享领域数据。
- 页面修改设置可以显示保存和应用状态。
- 页面能显示 Runtime 故障。
- 页面不会把业务逻辑复制到 UI 层。

## Phase 9：视觉系统和粒子系统

工作：

- 卡片主题注册表。
- 内容布局注册表。
- Direct2D 卡片组件。
- 特效注册表。
- 粒子池。
- 发射器。
- D3D11 粒子表面。
- DirectComposition 合成。
- GPU 计时。
- 设备丢失恢复。
- 软件简化回退。

先实现少量高质量主题和粒子，再扩展数量。不要用大量选项掩盖底层质量问题。

## Phase 10：Profile、工作模式和生态

工作：

- Profile 继承。
- 最终值解释。
- 工作模式覆盖。
- 设置导入导出。
- 兼容旧版配置。
- 公共 API 文档。
- 能力发现。
- 示例调用。
- 诊断导出。
- 版本迁移。

## Phase 11：稳定化和发布

工作：

- 长时间运行测试。
- 多显示器测试。
- 混合 DPI 测试。
- Runtime 重启测试。
- GPU 设备丢失测试。
- 资源泄漏检查。
- 性能基准。
- 发布打包。
- 回滚包。
- 变更日志。
- 用户迁移文档。

---

# 12. 版本和迁移策略

## 12.1 版本线

建议新旧版本明确分开：

```text
0.2.x  legacy line
1.0.0  vNext first stable line
```

具体版本号待新工作区建立后确认。

开发阶段可使用：

```text
0.1.0-alpha.1
0.1.0-alpha.2
0.1.0-beta.1
```

不要让 vNext 的开发版本看起来像旧版的补丁版本。

## 12.2 Renderer 能力开关

迁移期间可以保留：

```text
rendererMode: legacy | native | auto
```

推荐行为：

- `legacy`：只使用旧版 helper。
- `native`：只使用新 Runtime，失败时明确报错或按策略回退。
- `auto`：优先新 Runtime，失败后回退旧版。

vNext 稳定后，逐步减少对 legacy renderer 的依赖，但不立即删除迁移能力。

## 12.3 配置迁移

迁移器负责：

- 读取旧版配置。
- 映射旧版字段。
- 报告无法映射的字段。
- 保留用户原配置备份。
- 写入 vNext 配置。
- 记录迁移诊断。
- 允许回滚。

不强行迁移无法准确解释的视觉参数。无法可靠映射时，应采用明确默认值并告诉用户。

## 12.4 数据迁移

历史通知迁移需要：

- 版本标记。
- 原始字段保留策略。
- 敏感内容处理。
- 时间字段统一。
- 类型映射。
- 迁移失败记录。
- 可重复迁移保护。

---

# 13. Git 与工程纪律

新工作区确定后，严格执行一刀一提交的可回退原则。

## 13.1 初始提交建议

```text
chore: initialize vnext repository
chore: add build and test toolchain
feat: add versioned protocol schemas
feat: add diagnostic event model
feat: add node domain models
feat: add runtime protocol skeleton
feat: add no-window core math
feat: add named pipe transport
feat: add minimal native scene window
feat: add layout engine
feat: add physics engine
feat: add page and widget surfaces
feat: add renderer registry
feat: add particle backend
```

## 13.2 每个提交的要求

- 只完成一个可解释目标。
- 有对应测试或明确说明为何暂时无法测试。
- 不混入无关格式化。
- 不把实验性代码伪装成稳定实现。
- 构建和测试结果写入提交说明或变更记录。
- 关键架构变化更新文档。
- 每一步都可以回滚。

## 13.3 分支建议

```text
main
  ├─ develop
  ├─ feature/protocol
  ├─ feature/no-window-core
  ├─ feature/native-window
  ├─ feature/layout
  ├─ feature/physics
  ├─ feature/page-surface
  └─ feature/particles
```

具体分支策略可按实际规模简化，但 `main` 不直接承载未经验证的大重构。

## 13.4 构建产物和临时文件

必须明确：

- 源码目录。
- 构建目录。
- 测试输出目录。
- 运行时日志目录。
- 发布目录。
- 本地配置目录。
- 诊断导出目录。

构建产物和日志默认加入 `.gitignore`，除非它们属于可复现的测试 fixture。

---

# 14. 建议的新目录结构

```text
notification-hub-vnext/
├─ README.md
├─ PLAN.md
├─ CHANGELOG.md
├─ LICENSE
├─ .gitignore
├─ CMakeLists.txt
├─ CMakePresets.json
├─ package.json
├─ package-lock.json
│
├─ plugin/
│  ├─ index.js
│  ├─ manifest.json
│  ├─ api/
│  ├─ domain/
│  ├─ events/
│  ├─ content/
│  ├─ grouping/
│  ├─ policies/
│  ├─ runtime/
│  ├─ widget/
│  ├─ pages/
│  ├─ diagnostics/
│  └─ migration/
│
├─ runtime/
│  ├─ CMakeLists.txt
│  ├─ app/
│  ├─ protocol/
│  ├─ scene/
│  ├─ layout/
│  ├─ physics/
│  ├─ interaction/
│  ├─ render/
│  ├─ cards/
│  ├─ effects/
│  ├─ particles/
│  ├─ audio/
│  ├─ diagnostics/
│  ├─ platform/
│  └─ transport/
│
├─ schemas/
│  ├─ notification-record.schema.json
│  ├─ notification-profile.schema.json
│  ├─ notification-scene-state.schema.json
│  ├─ scene-command.schema.json
│  ├─ scene-response.schema.json
│  └─ diagnostic-event.schema.json
│
├─ tests/
│  ├─ node/
│  ├─ runtime/
│  ├─ protocol/
│  ├─ fixtures/
│  ├─ fault-injection/
│  ├─ performance/
│  └─ window-regression/
│
├─ docs/
│  ├─ architecture/
│  ├─ protocol/
│  ├─ migration/
│  ├─ testing/
│  └─ release/
│
└─ legacy-reference/
   └─ notification-hub-0.2.1/
```

目录名可以调整，但以下边界必须保留：

- `plugin` 与 `runtime` 分离。
- `domain` 与 `widget/pages` 分离。
- `schemas` 独立。
- `tests` 独立。
- `legacy-reference` 独立。

---

# 15. 当前已知的旧版问题，作为 vNext 参考清单

以下问题来自旧版分析，只作为新系统的设计输入，不直接复制修复方式：

- `message_end` 使用排除式 stop reason 判断，可能把错误误判成正常完成。
- 未知错误事件可能被静默丢弃。
- 卡片窗口整体边界大于视觉卡片，透明区可能误触发点击。
- 鼠标悬停判断作用于整个窗口，而不是卡片本体。
- `TransparencyKey` 无法提供真正逐像素 alpha。
- 圆角抗锯齿和粒子淡出受到颜色键透明限制。
- 进程 DPI awareness 和多显示器坐标处理不完整。
- 位置逻辑主要围绕右下角垂直堆叠。
- 卡片大小、布局和样式存在大量硬编码。
- 粒子、动画和卡片渲染集中在巨型 helper 文件。
- 某些注册表或动画代码未接入主流程。
- JS 和 C# 的枚举可能漂移并静默回退。
- 字体和 emoji fallback 不够可控。
- 诊断主要依赖性能环境变量和 stderr。
- 页面和 Widget 需要统一数据源，不能继续各自管理状态。

这些问题在 vNext 中通过新的领域模型、协议、命中测试、诊断和模块边界解决。

---

# 16. 待确认事项

以下事项在新工作区建立时确认，不影响总体架构方向：

1. 新仓库正式名称。
2. 新工作区绝对路径。
3. Git 远程仓库地址。
4. 版本号起点。
5. Node.js 最低版本。
6. MSVC 和 Windows SDK 最低版本。
7. CMake 最低版本。
8. 是否使用 vcpkg，以及依赖锁定方式。
9. JSON 库选择，或第一阶段自带最小协议解析层。
10. C++ 日志库选择。
11. 是否引入 GoogleTest，还是先使用 CTest + 自定义断言。
12. Named Pipe 命名策略和 ACL 细节。
13. Runtime 是否默认单实例。
14. 是否保留 legacy helper 作为自动回退。
15. 页面路由和 Hana 页面注册 API。
16. Widget 和页面的刷新机制。
17. 配置存储格式。
18. 通知历史存储格式。
19. 日志轮转策略。
20. 首个可发布版本包含哪些视觉主题。
21. 首个版本是否包含 D3D11 粒子。
22. DirectComposition 的具体 surface 组织方式。
23. 软件渲染回退的最低能力。
24. 是否提供调试 overlay。
25. 是否支持多实例或仅支持单用户单 Runtime。

---

# 17. 新工作区第一天的操作顺序

新对话和新工作区准备好后，按以下顺序开始：

## 第一步：确认环境

- 确认当前工作目录。
- 确认新工作区为空或只包含用户指定文件。
- 确认旧版参考路径。
- 检查 Git 是否可用。
- 检查 Node.js、npm、CMake、MSVC、Windows SDK。
- 检查当前权限和构建能力。

## 第二步：初始化仓库

- 创建 Git 仓库。
- 创建 `.gitignore`。
- 创建 `README.md`。
- 将本计划保存为 `PLAN.md`。
- 建立基础目录。
- 创建初始版本文件。
- 做第一次干净提交。

## 第三步：建立最小工具链

- 创建 Node.js package。
- 创建 CMake 项目。
- 创建 C++20 编译目标。
- 创建 CTest 目标。
- 创建 Node.js 测试命令。
- 创建格式化和静态检查命令。
- 验证空项目可构建、可测试。

## 第四步：建立协议和 schema

- 写 `notification-record.schema.json`。
- 写 `notification-profile.schema.json`。
- 写 `scene-command.schema.json`。
- 写 `diagnostic-event.schema.json`。
- 创建版本化协议模块。
- 添加非法输入测试。

## 第五步：建立无窗口核心

- 实现通知记录。
- 实现 Profile 解析。
- 实现内容策略。
- 实现诊断事件。
- 实现基础布局数学。
- 实现基础显示器数学 fixture。
- 添加单元测试。

## 第六步：再决定是否开始 Runtime 窗口

只有前五步稳定后，才开始：

- Named Pipe 服务。
- Runtime 进程。
- Win32 Scene Window。
- DirectComposition。
- Direct2D 卡片。

---

# 18. 最终决策摘要

## 已确定

1. 从零建立 vNext，不以旧 helper 为基础。
2. 旧版 0.2.1 保留为 `legacy-reference`。
3. Node.js 插件层保留。
4. 桌面渲染层采用 C++20 Native Scene Runtime。
5. 使用 Win32、DirectComposition、Direct2D、DirectWrite、D3D11、DXGI。
6. 使用 Windows Named Pipe，不继续依赖随机 localhost TCP 作为主协议。
7. 使用版本化 JSON 协议，采用长度前缀消息。
8. 使用结构化诊断、traceId、稳定错误码和故障注入。
9. 采用每显示器一个 Scene Window 的方向。
10. 卡片、布局、物理、交互、特效、粒子和音频模块化。
11. Widget 只显示即时通知。
12. Hana 页面承载通知中心、设置中心、运行状态和诊断中心。
13. Widget 和页面共享统一领域数据源。
14. 先实现无窗口核心，再逐步接入窗口和 GPU。
15. 以稳定性、可维护性、性能和视觉质量为主要指标。
16. 一刀一提交，保持每一步可回滚。

## 不做

1. 不在旧 WinForms helper 上继续扩张 vNext。
2. 不把 WPF 作为最终最高上限底层。
3. 不使用 Electron 作为桌面 Runtime。
4. 不使用 WinUI 3 作为当前主方案。
5. 不使用纯 Direct2D 独自承担完整 UI 框架职责。
6. 不在第一阶段引入动态 DLL renderer 插件。
7. 不把性能目标当成未经测试的承诺。
8. 不让 Widget 和页面各自维护状态。
9. 不让诊断错误递归生成无限通知。
10. 不在没有测试和诊断的情况下批量加入复杂功能。

## 一句话方向

> 用 Node.js 管理通知语义、状态和页面，用 C++20 原生 GPU Scene Runtime 管理桌面场景；旧版只做参考，vNext 从协议、无窗口核心和诊断系统开始，逐阶段获得高性能、高质量和高稳定性。
