# Visual Workbench Redesign

## Direction

将通知视觉页从纵向配置管道重做为一张可扫描的视觉工作台。页面的主任务只有三步：选择行为模式、编辑当前卡片、在真实 Native 预览中确认结果。配置包、事件绑定、实验台和诊断属于后续工作区，不抢占第一屏。

## Layout

桌面端使用三栏布局：

- 左栏：视觉模式和工作区锚点。展示 `minimal`、`danmaku`、`popup` 三种模式，以及编辑器、配置包、事件应用、实验台和诊断入口。
- 中栏：卡片编辑器。保留原有“卡片行为 → 卡片种类 → 卡片属性 / 皮肤 / 特效”层级，并通过 `details` 渐进披露完整字段。
- 右栏：实时 Native 预览。显示三通道空间关系、当前预览状态、后端确认信息和通道说明。

窄屏布局改为单栏：预览置顶，模式选择改为纵向列表，编辑器和业务工作区依次排列；底部导航隐藏低优先级入口，避免横向溢出。

## Visual Tokens

- 背景：`#0e1513`
- 主表面：`#17221f`
- 提升表面：`#1d2b27`
- 边界：`#304740`
- 主强调：`#62d0a8`
- 强强调：`#38b88d`
- 正文：`#e7f2ee`
- 次要文字：`#9bb1a9`
- 成功：`#72d49e`
- 错误：`#f18c8c`
- 弹幕通道：`#56c8d8`
- 突脸通道：`#f1c77a`

卡片圆角控制在 6–12px；工作台采用边界和层级，不使用渐变、装饰性光球或嵌套卡片墙。标题使用紧凑的 18–30px 层级，字段使用 11–13px 标签和 32–36px 控件高度。

## Behavior Modes

- `minimal`：中性灰绿色，右下堆叠，低打扰，通道 `stack.main`。
- `danmaku`：青色轨道，顶部横向带，流动提示，通道 `danmaku.main`。
- `popup`：琥珀色焦点卡，中央偏上，强调确认，通道 `popup.main`。

模式卡不是新的数据协议，只是现有 `pipeline-type` 和 `pipeline-behavior` 的可视化入口。点击模式卡会同步原有选择控件并触发现有 input/change 监听。

## Stable Contract Mapping

必须保留：

- `global-visual-enabled`
- `global-visual-default-mode`
- `visual-settings-save`
- `visual-settings-feedback`
- `pipeline-behavior`
- `pipeline-type`
- `prop-*`、`skin-*`、`effect-*` 字段 ID
- `visual-preview-state`
- `visual-preview-confirmation`
- `open-visual-preview`
- `visual-preview/open`
- `visual-preview/update`
- `visual-preview/close`
- `visual-profile-*` 配置包操作
- `apply-visual-*` 事件应用操作
- `visual-test-*` 实验台操作
- `visual-diagnostics-*` 诊断操作

页面只改变布局、可见层级和交互入口，不修改视觉配置嵌套 contract，不改变声音、通知历史、Native 协议或插件生命周期。

## State Rules

- 初始：显示“已读取”和预览“等待更新”。
- 修改字段：顶部状态变为“未保存”，预览状态变为“等待更新”。
- 实时更新：显示“正在发送/更新”，成功后显示“已更新”并展示 Native 指纹确认。
- 重建：显示“已重建”，保留同一工作台上下文。
- 失败：状态使用错误色，反馈包含错误码；不伪造后端确认。
- 全局关闭：编辑区降级显示并停止新的预览发送，已存在的 Native 卡片由既有生命周期负责。
- 配置包、事件应用、实验台和诊断沿用原有 API 与反馈机制。

## Acceptance

- 桌面端首屏同时看见三种行为入口、当前编辑器标题和 Native 预览舞台。
- 点击三种模式卡会同步原有行为/类型选择，不新增独立状态源。
- 实时预览仍使用独立 Native preview card，不写通知历史、不播放声音。
- 配置包、事件绑定、并行测试和诊断入口都可通过页面锚点到达。
- `17` 项 settings visual route focused tests 通过，脚本可编译。
- `npm run check` 通过，`git diff --check` 通过。
