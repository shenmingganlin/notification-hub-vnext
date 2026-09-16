# 视觉系统总计划

日期：2026-08-18
心智模型：见 `2026-09-13-card-face-and-channel.md`（2026-09-13）
状态：工程百科。0.1.6 工作室已冻结。视觉本体以 09-13 卡面与通道为准。

> 配置包定义视觉，事件绑定分配视觉，行为通道共同运行，诊断解释一切。

---

# 1. 现行设计（指向）

四条并行轴、卡片种类、内容轴已作废。现行设计：

```text
docs/superpowers/plans/2026-09-13-card-face-and-channel.md
```

一句话：卡面是根零件带着孩子；通道是一种飞法一个池；皮和交互长在每个零件上。

## 当前进度

- 0.1.6 已冻结：默认安静、事件自选飞或叠、弹幕怎么流、随机速度。
- Native 目前只画标题 + 正文，坐标写死。零件树还没有。
- 下一刀产品（解冻后）：Native 读最小零件树。不改本冻结包。

---

# 2. 配置包与素材

配置包只含声明和素材，不含代码。

目录约定：

```text
manifest.json
settings/global.json
settings/channels.json
settings/profiles.json
settings/event-bindings.json
behaviors/*.json
card-types/*.json
card-content/*.json
properties/*.json
skins/*.json
effects/*.json
assets/*
preview/cover.png
```

禁止出现：

```text
*.js、*.mjs、*.cjs、*.node、*.dll、*.exe、shell command
```

## 2.3 Visual Asset Library

视觉素材库是类似音频库的独立基础设施，负责长期存储和引用，不与配置包生命周期强绑定。

第一阶段支持：

```text
PNG、WEBP、JPG/JPEG；优先透明 PNG/WEBP。
```

SVG 暂不作为第一阶段必需格式；未来如支持，必须清洗脚本、外部引用和危险滤镜。

素材模型：

```js
{
  assetId: 'visual-asset-001',
  name: 'Mint Star',
  kind: 'background|avatar|icon|particle|decoration',
  format: 'png',
  path: 'visual-assets/visual-asset-001.png',
  width: 128,
  height: 128,
  byteSize: 18342,
  hasAlpha: true,
  sha256: '...',
  tags: ['star', 'particle', 'mint'],
  references: 3
}
```

素材用途：

```text
皮肤背景、头像、助手图标、卡片装饰、入场粒子、持续粒子、消失粒子。
```

素材库能力：

```text
导入、预览、尺寸/格式查看、删除保护、搜索、标签筛选、引用次数。
```

删除规则：正在被 Profile、Skin、Effect、Channel 引用的素材不可默认直接删除；必须显示引用对象，并提供取消、替换引用或明确强制断开。

导出规则：

```text
配置引用模式：只导出 assetId 引用。
完整分享模式：配置 + 实际被引用的素材文件一起进入 ZIP。
```

导入时按 SHA256 去重；相同内容复用已有素材，新内容注册新 assetId，并修复包内引用。

---

# 3. Behavior Channel：独立并行的行为舞台

## 3.1 通道职责

通道不是工具、回复、错误分类，而是独立的运行边界，负责：

```text
接收卡片
维护卡片集合
统一布局计算
统一并行/容量/溢出规则
统一生命周期调度
统一行为特效挂载点
维护 active/visible/queued/suppressed 指标
```

不同通道：

```text
完全并行
互不排队
互不覆盖
互不共享位置计算
一个通道故障不得阻塞其他通道
```

同一通道：

```text
共同计算
共同管理
共享布局空间
共享容量和溢出策略
```

一种飞法一个池（现行，见 09-13）。不为外部插件开池。下面这种「同一行为多通道 / 插件私有通道」已作废：

```text
ticker
  ├── danmaku-normal
  ├── danmaku-chaos
  └── plugin-x-ticker    ← 不作外部接入方式
```

## 3.2 通道建议模型

```js
{
  channelId: 'danmaku-chaos',
  owner: { kind: 'user|system|plugin', id: '...' },
  visibility: 'private|shared|public',
  behaviorId: 'ticker',
  cardTypeId: 'minimal',
  propertiesId: 'danmaku-default',
  skinId: 'terminal',
  effectConfigId: 'clean-slide',
  policy: {
    suppression: 'off',
    maxVisible: 1000,
    maxActive: 1000,
    maxParticles: 0,
    maxAnimationInstances: 1000,
    overflow: 'allow|queue|drop-oldest|aggregate|replace'
  }
}
```

默认不抑制、不限制通知风暴；用户可以显式设置 `maxVisible`、`maxActive`、`maxParticles`、`maxAnimationInstances` 和 overflow。

## 3.3 行为与属性分工

```text
Behavior：算法和生命周期编排。
Properties：参数、数值和启用开关。
```

行为控制：

```text
进入、排序、布局、轨道、避让、聚合、替换、固定、跟随、退出、关闭后的离场钩子。
```

属性控制：

```text
速度、间距、位置、尺寸、持续时间、动画名称、动画开关、粒子数量、交互方式。
```

关闭逻辑拆分（现行，见 09-13）：

```text
关闭是根里的孩子零件（默认最上层）。
怎么关、关掉之后怎么离场：根的飞法所在的那个池负责重排。
```

---

# 4. 卡片组合模型

本节的种类 / 内容 / 并列四轴已作废。现行组合见：

```text
2026-09-13-card-face-and-channel.md
```

```text
方案 = 通道 + 卡面 + 素材
卡面 = 根零件（可点框 / 绘制框）+ 孩子
通道 = 一种飞法一个池，只承载根
皮与交互长在每个零件上
```

已落地飞法：`stack` 堆叠、`ticker` 弹幕。未做：`popup` 及以后，一种飞法一个新池。
弹幕的速度、轨道、带、间距是弹幕池的属性。

---

# 5. 行为实施顺序

每种行为必须单独完成以下契约和验收，不并行堆半成品：

```text
输入模型
进入规则
位置/轨道计算
并行规则
排序规则
冲突/避让规则
容量和溢出规则
生命周期
关闭方式
入场钩子
持续钩子
出场钩子
压力测试
视觉验收
诊断验收
```

## 行为 1：Stack 高质量共同堆叠

```text
新卡片进入底部
旧卡片平滑向上移动
同一通道内工具、错误、回复等卡片共同堆叠
各卡片独立计时
关闭/超时后执行出场并重新布局
不同通道完全隔离
```

必须验证：

```text
0/1/多卡片
不同尺寸卡片
快速连续事件
混合事件来源
关闭中插入新卡片
maxVisible 与 overflow
入场/出场开关
通道故障隔离
```

## 行为 2：Ticker/Danmaku

```text
多轨道横向移动
轨道分配
速度和间距
重叠策略
出屏结束
```

必须验证：

```text
多轨并行、不同速度、轨道不足、允许重叠、出屏清理、长时间风暴。
```

## 行为 3：Popup

```text
锚点出现、停留、离开
重要卡片的并行和覆盖规则
```

## 行为 4：Aggregate

```text
相似事件合并，保留数量、摘要、时间窗口和可展开明细；默认不启用。
```

## 行为 5：Replace

```text
按 identityKey 更新同一逻辑卡片，保留位置并更新状态；适合进度和实时状态。
```

## 行为 6：Pin

```text
不自动消失，直到用户关闭或事件结束；适合录音、下载、运行中任务。
```

## 行为 7：Follow

```text
跟随窗口、对象或屏幕区域，处理目标消失、越界和重新定位。
```

## 行为 8：Scene

```text
全屏或场景级呈现，明确限制为高级行为，不默认打断普通通知。
```

---

# 6. 设置应用到事件

## 6.1 编辑流程

```text
创建/导入配置包
  ↓
选择已有行为、通道、卡片种类、属性、皮肤、特效和素材
  ↓
保存为 Visual Profile
  ↓
点击“应用于事件”
  ↓
选择单个、多个、类别或外部插件事件
  ↓
预览新增/覆盖/保持不变
  ↓
确认建立绑定
```

## 6.2 应用范围

```text
单个事件
多个选中事件
事件类别
所有事件
只导入 Profile、不修改绑定
恢复配置包原有绑定模板
```

应用预览必须显示：

```text
将新增多少绑定
将覆盖多少绑定
保持多少不变
缺少多少依赖
声音设置不受影响
```

## 6.3 已自定义事件

页面提供独立列表，仿照音频“已自定义”：

```text
事件显示名 + eventId
视觉 Profile
行为通道
来源
编辑
导出单事件
恢复默认
```

恢复默认只删除事件显式视觉绑定，不删除 Profile、Channel、Skin、Effect 或素材。

## 6.4 共享 Profile 的编辑保护

当多个事件共享一个 Profile 时，编辑前必须让用户选择：

```text
修改共享视觉方案
仅为当前事件创建副本
取消
```

第一阶段至少保证不无提示地影响多个事件。

---

# 7. 配置包管理区

建立独立的“视觉配置包”管理区，职责是管理包生命周期，不与编辑器混成一页。

## 7.1 包列表

每个包显示：

```text
名称、简介、封面、来源、版本、更新时间
Profile/Channel/Skin/Effect/Asset 数量
已应用事件数量
状态：未应用、正在使用、有缺失依赖、有未保存修改、部分可用
```

操作：

```text
打开、编辑、应用于、导出、复制、查看引用、删除。
```

## 7.2 删除保护

包仍被事件使用时，显示引用事件：

```text
迁移到其他 Profile
解除绑定
取消删除
```

默认不允许静默删除正在使用的配置。

## 7.3 导入和应用分离

导入后的默认状态：

```text
注册配置包
注册素材
保留事件绑定为模板
不修改当前事件
```

“应用于”才会真正改变事件绑定。

完整恢复是单独入口：

```text
导入并预览
自动备份当前视觉
明确确认覆盖
恢复配置和事件绑定
```

---

# 8. 导入导出事务与冲突

## 8.1 导入阶段报告

导入必须逐类报告：

```text
格式校验
清单解析
素材注册
行为配置
卡片种类
属性
皮肤
特效
通道
Profile
事件模板
```

结果区分：

```text
成功、警告、失败、缺失依赖、部分可用。
```

## 8.2 冲突策略

```text
作为副本导入（默认）
覆盖已有配置
跳过冲突项
合并相同内容
```

相同 SHA256 素材自动复用；同名配置不默认覆盖。

## 8.3 原子导入和部分导入

```text
完整视觉备份恢复：默认原子导入，关键错误则回滚。
普通分享配置包：允许用户明确选择部分导入，失败项标记为部分可用。
```

任何部分导入结果必须保留导入报告和未解决依赖列表，不能伪装为完整成功。

---

# 9. 诊断系统

## 9.1 错误阶段

```text
PACKAGE_VALIDATE
PACKAGE_IMPORT
ASSET_REGISTER
CONFIG_RESOLVE
EVENT_BIND
CHANNEL_CREATE
CARD_CREATE
BEHAVIOR_LAYOUT
SKIN_RENDER
EFFECT_RUN
LIFECYCLE_EXIT
```

## 9.2 错误码分类

```text
VISUAL_PACKAGE_INVALID_MANIFEST
VISUAL_PACKAGE_UNSUPPORTED_VERSION
VISUAL_PACKAGE_MISSING_DEPENDENCY
VISUAL_PACKAGE_IMPORT_CONFLICT
VISUAL_ASSET_FORMAT_UNSUPPORTED
VISUAL_ASSET_TOO_LARGE
VISUAL_ASSET_DECODE_FAILED
VISUAL_ASSET_NOT_FOUND
VISUAL_PROFILE_INVALID
VISUAL_PROFILE_REFERENCE_MISSING
VISUAL_PROFILE_CYCLE_DETECTED
VISUAL_EVENT_BINDING_INVALID
VISUAL_EVENT_NOT_FOUND
VISUAL_CHANNEL_INVALID
VISUAL_CHANNEL_CAPACITY_INVALID
VISUAL_BEHAVIOR_UNAVAILABLE
VISUAL_BEHAVIOR_LAYOUT_FAILED
VISUAL_SKIN_INVALID
VISUAL_EFFECT_INVALID
VISUAL_EFFECT_ASSET_MISSING
VISUAL_CARD_RENDER_FAILED
VISUAL_CARD_LIFECYCLE_FAILED
```

## 9.3 统一错误对象

```js
{
  code: 'VISUAL_EFFECT_ASSET_MISSING',
  message: '特效引用的图片素材不存在',
  userMessage: '“星光消散”缺少图片素材“mint-star”',
  stage: 'EFFECT_RUN',
  severity: 'error|warning|info',
  recoverable: true,
  source: {
    packageId: 'deepseek-maid',
    profileId: 'maid-default',
    channelId: 'deepseek-maid-stage',
    eventId: 'chat.assistant_reply.completed',
    effectId: 'soft-dissolve',
    assetId: 'mint-star'
  },
  impact: {
    affected: ['exitParticles'],
    unaffected: ['notificationRecord', 'sound', 'eventIngestion']
  },
  details: {
    suggestedActions: ['重新导入素材', '替换已有图片', '关闭消失粒子']
  },
  cause: null,
  traceId: 'visual-run-...'
}
```

## 9.4 诊断原则

```text
用户提示与工程详情分层
可以回退但不可静默
根因与连锁影响分开
视觉失败不阻塞声音/记录/生命周期
每张异常卡片可查看来源链
配置包可执行自检
诊断可查看、修复、忽略、导出
默认导出脱敏报告
```

诊断中心分类：

```text
配置包、事件绑定、通道、卡片、皮肤、特效、素材。
```

运行压力也作为诊断状态报告，不自动改变用户配置：

```text
正常
达到用户设定上限
资源不足
Renderer/效果失败
```

---

# 10. 性能和美感原则

## 10.1 不自动降级

系统不得因为压力而偷偷：

```text
关闭粒子
替换动画
减少卡片
改变速度
删除通知
```

只有用户显式设置的边界才生效：

```text
maxVisible
maxActive
maxParticles
maxAnimationInstances
overflow
```

## 10.2 资源限制是“有意思的限制”

支持用户设计：

```text
空间限制：顶部区域、侧边区域、指定窗口。
时间限制：最小间隔、最大持续时间、轨道间隔。
行为限制：同来源不占满轨道、重要卡片插入规则。
特效限制：每张卡片一个持续效果、粒子边界。
身份限制：同 identityKey 只保留一张。
```

## 10.3 美感优先级

```text
信息清楚
  ↓
层级稳定
  ↓
动画自然
  ↓
粒子点缀
```

不设置系统强制的 minimal/expressive/dramatic 视觉等级；用户自己决定效果开关、数量、持续时间和质量边界。

---

# 11. 实施阶段与独立验收

## Phase 0：契约冻结和文档

**当前进度（2026-08-19）：** Phase 0 五项契约已完成：Behavior Contract、Channel Runtime Contract、Card Composition Contract、配置包 manifest 契约和诊断错误契约均已落地，并通过 focused 回归。下一阶段进入 Phase 1：Card Runtime 与 Channel Runtime 基础实现。

已落地文件：

```text
plugin/domain/visual-behavior-contract.js
plugin/domain/visual-channel-contract.js
plugin/domain/card-composition-contract.js
plugin/domain/visual-package-manifest.js
plugin/domain/visual-diagnostic-contract.js
tests/node/visual-contracts.test.mjs
tests/node/visual-phase0-contracts.test.mjs
```

交付：

```text
行为契约
通道运行时契约
卡片组合契约
配置包 manifest 契约
诊断错误契约
```

验收：

```text
概念边界无循环依赖
所有字段都有唯一职责
声音与视觉边界明确
```

## Phase 1：运行时基础

**当前进度（2026-08-19）：** 已完成前两刀：Card Runtime 实例模型、Channel Runtime 管理器、多通道 Runtime Registry、显式生命周期时钟和 SceneState 只读投影均已落地，暂不接入 Native Runtime，保留旧行为管理器兼容链路。

已落地文件：

```text
plugin/runtime/card-runtime.js
plugin/runtime/channel-runtime.js
plugin/runtime/runtime-registry.js
plugin/runtime/runtime-clock.js
plugin/runtime/scene-state-projection.js
tests/node/visual-runtime.test.mjs
tests/node/visual-runtime-registry.test.mjs
```

已验证：生命周期状态转换、关闭与回收、同通道队列/容量、布局重算接口、跨通道汇总、显式过期、SceneState 严格校验和通道级故障隔离。

Stack 行为前置边界已完成：

```text
plugin/runtime/stack-layout.js
tests/node/visual-stack.test.mjs
```

该布局策略按实际卡片宽高、anchor、margin 和 spacing 计算位置；无法容纳时返回 `VISUAL_BEHAVIOR_LAYOUT_FAILED`，不自动缩小或静默丢弃卡片。Channel Runtime 已增加冻结的生命周期事件和 `channel.reflow` 事件。

Stack 已正式接入 Channel Runtime：

```text
layoutStrategy
workArea
card.width / card.height
snapshot().layout
```

已验证混合来源共同堆叠、不同尺寸、关闭后立即移出布局并重排；当前仍属于 Node 领域运行时，不代表 Native Runtime 或真实 Hana 视觉验收完成。

补充进度（2026-08-19）：Native Runtime 的 SceneState/health 现在会回传完整受控 visual 事实，包括 cardType、behavior 和 appearance；真实 Named Pipe smoke 已验证大卡片、wide 比例、背景色、圆角和透明度字段能够往返。

Stack 容量验收也已完成：

```text
queue：保留卡片并按插入顺序晋升
 drop-oldest：明确回收旧卡、记录 reclaimed 事件和 suppressed 计数
 allow：默认不抑制、不丢弃
```

多通道 100 卡片混合压力 focused 回归通过。

实现：

```text
Card Runtime 实例模型
Channel Runtime 管理器
生命周期状态机
布局重算接口
并行通道隔离
active/visible/queued/suppressed 指标
```

验收：

```text
不同通道并行
同通道共同管理
一个通道失败不影响另一个
卡片生命周期可观察、可关闭、可回收
```

## Phase 2：Stack 行为

一次只做 Stack，完成完整行为契约和高质量基础卡片。

验收：

```text
混合来源共同堆叠
快速连续事件
不同尺寸
关闭和超时
入/出场开关
容量和溢出
视觉回归
压力测试
诊断链路
```

## Phase 3：配置模型和事件应用

**当前进度（2026-08-19）：** 已完成第一刀：新增 Visual Profile Registry 和 Event Binding Registry。Profile 注册使用既有 `createVisualProfile()` 归一化；事件绑定只保存 `eventId → visualProfileId / behaviorChannelId` 引用，不携带声音字段；导入/注册 Profile 不自动应用事件。

已落地文件：

```text
plugin/domain/visual-profile-registry.js
plugin/domain/event-binding-registry.js
tests/node/visual-profile-binding-registry.test.mjs
```

已验证：单事件应用、类别应用、应用预览、共享 Profile 引用、复制保护、恢复默认、不可表现事件拒绝和声音边界隔离。

持久化适配第一刀已完成：

```text
plugin/domain/visual-registry-persistence.js
tests/node/visual-registry-persistence.test.mjs
```

Registry snapshot 使用版本号、revision 和 updatedAt；恢复时重新通过 Profile/Binding registry 校验。投影到旧 `EventPresentationSettings` 时只更新视觉 Profile 和行为通道引用，保留既有声音字段，不自动修改声音配置。

Store/API 适配第一刀已完成：

```text
plugin/domain/visual-event-settings-api.js
tests/node/visual-settings-api.test.mjs
```

API 通过现有 `EventPresentationSettingsStore` 提交视觉投影，支持已自定义事件列表、预览、应用和恢复默认；恢复默认会保留事件原有声音和其他非视觉字段。

实现：

```text
Visual Profile registry
Package registry
Event binding registry
全局/类别/单事件层级
已自定义事件列表
单独/批量应用
恢复默认
导入 Profile 后再应用
```

验收：

```text
配置先保存再绑定
一个 Profile 可应用多个事件
共享 Profile 修改有保护
视觉绑定不改变声音
页面能显示已自定义事件和来源
```

## Phase 4：配置包导入导出

实现：

```text
分类包
视觉方案包
完整视觉包
预览和冲突策略
原子恢复
部分导入
事件绑定模板
```

验收：

```text
导出后可导入
导入默认不覆盖事件
应用后绑定正确
完整恢复可回滚
冲突和缺失依赖可诊断
```

## Phase 5：Visual Asset Library

当前进度（2026-08-19）：已完成第一批独立领域基础：PNG/WEBP/JPG/JPEG 头解析、尺寸与 alpha 元数据、SHA256 内容去重、结构化引用跟踪和被引用删除保护；随后补齐固定 rootDir 文件存储、原子快照和恢复索引重建，并接入素材列表/详情/删除 API、素材库页面、Windows 受控文件导入、Minimal `backgroundAssetId` 引用闭环、声明式 Visual Asset Manifest 契约、独立 Native `visual-assets.configure` 通道、Native assetId 索引、完整 manifest 记录解析、`backgroundAssetId` 的 Native 安全解析/颜色回退、固定素材 root 绑定、文件 SHA256 安全校验、WIC PNG 解码/Direct2D 背景绘制、真实 PNG 像素级 smoke 、损坏 PNG 的 backgroundColor 失败回退 smoke 、manifest trust 到 Scene Card 的有效/篡改/disabled 回归、configure 后文件篡改的引用时重新验证、reparse point / junction 最终路径守卫、manifest 重复 assetId / SHA256 的 Native 级拒绝、大小写 canonical path 一致性修复、文件替换竞态窗口关闭、WEBP/JPG Native 解码支持、图片裁剪模式（contain/cover）、透明 PNG 与 opacity 组合以及图片绘制区域配置。

实现：

```text
图片导入、预览、注册、SHA256 去重、引用跟踪、删除保护、导出打包、导入修复引用。
```

验收：

```text
透明 PNG 正确显示
素材可被 Skin/Effect 引用
重复素材不重复占用
删除有引用素材被阻止或明确处理
跨机器配置包可恢复素材
```

## Phase 6：最小零件树（解冻后）

设计见 `2026-09-13-card-face-and-channel.md`。不恢复六种卡片种类。

实现：

```text
Native 读根 + 标题 + 正文三个零件
选中才出该零件设置
加件默认不叠
堆叠池与弹幕池共用同一套卡面树
```

验收：

```text
真卡随零件树变，不是预览假象
孩子只出现在根的可点框内
换池（飞法）不丢这棵树
未实现的零件诚实标注
```

## Phase 6b：孩子零件与每件的皮

图、关闭成为真零件。描边、填充长在零件上。悬停等交互后做。不单列皮肤大类。

## Phase 7：逐个新增高质量行为

Ticker 已在 0.1.6 落地。一种飞法一个池。Popup 排在最小零件树之后。每种行为单独验收，不并行堆半成品。

```text
Popup
Aggregate
Replace
Pin
Follow
Scene
```

## Phase 8：Skin 系统

实现：

```text
颜色语义层
字体/图标/背景引用
透明图片
边框/阴影/材质
皮肤包导入导出
```

验收：

```text
同一行为切换不同皮肤
皮肤失败回退基础外观并诊断
素材引用正确
```

## Phase 9：Effects 系统

实现：

```text
enter、idle、exit
enterParticles、idleParticles、exitParticles
已有特效组合
素材粒子参数
每槽位独立开关
```

验收：

```text
动画可单独开关
粒子可单独开关
入场/持续/消失互不污染
粒子失败不影响卡片内容和声音
用户配置数量边界有效
```

## Phase 10：视觉配置包管理区和诊断中心

实现：

```text
包列表、封面、状态、引用数、打开、复制、编辑、应用、导出、删除保护
视觉诊断列表、详情、修复、忽略、导出脱敏报告
```

验收：

```text
用户能找到所有包
能看见包应用到了哪些事件
能区分导入与应用
能定位任何视觉错误的来源链
```

---

# 12. 测试矩阵

每个阶段必须包含：

## 领域单元测试

```text
合法配置
缺失字段
错误类型
默认值
边界值
未知引用
兼容旧配置
```

## 运行时测试

```text
单卡片
多卡片
并发通道
快速风暴
关闭中插入
通道隔离
生命周期回收
```

## 配置包测试

```text
导出/导入往返
素材去重
ID 冲突
缺少依赖
版本不兼容
原子回滚
部分导入
绑定模板
```

## 事件应用测试

```text
全局/类别/单事件优先级
批量新增
覆盖预览
恢复默认
共享 Profile 编辑保护
视觉不改变声音
```

## 诊断测试

```text
错误码稳定
阶段正确
source 完整
impact 正确
traceId 可串联
用户信息与工程详情分层
回退有记录
脱敏导出不含正文和敏感资源
```

## 每阶段验证命令

```powershell
npm run check
npm test -- --test-concurrency=1
git diff --check
```

涉及运行时或发布包时追加：

```powershell
npm run build
npm run package:release
```

完成声明必须以实际命令输出为依据，不能只根据代码阅读判断完成。

---

# 13. 最终产品形态

```text
通知视觉
├── 总览
├── 配置包管理区
│   ├── 我的配置包
│   ├── 导入视觉包
│   ├── 导出全部视觉
│   └── 恢复视觉备份
├── 视觉编辑器
│   ├── 通道（一种飞法一个池）
│   ├── 卡面（根零件 + 孩子）
│   ├── 零件外观与交互
│   ├── 词表（可选）
│   ├── 特效（入场/离场，后上）
│   └── 素材库
├── 应用于事件
│   ├── 单个事件
│   ├── 批量事件
│   ├── 事件类别
│   └── 已自定义事件
└── 视觉诊断
```

最终用户体验：

```text
先设计一套视觉
  ↓
保存为视觉方案/配置包
  ↓
导入、备份、分享或复制
  ↓
选择“应用于”
  ↓
应用到单个或多个事件
  ↓
事件使用该方案，声音保持独立
  ↓
任何错误都能定位到事件 → Profile → Channel → 出现方式 → 种类 → 内容 → 属性 → Skin → Effect → Asset
```

最终原则：

> **配置包负责定义视觉，事件绑定负责分配视觉，行为通道负责共同运行，诊断系统负责解释一切。**

这套系统允许用户拥有很高的自由度，但不会允许配置包注入代码；允许图片和视觉素材进入系统，但不会让素材改变运行时逻辑；允许通知并行和风暴，但所有限制都由用户明确配置；允许视觉失败回退，但不会让失败变成静默。
