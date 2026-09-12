# 视觉页收敛规格（Round 2 · IA 收缩）

日期：2026-09-11
版本：0.1.4
范围：通知视觉页（`plugin/routes/settings-visual.js`）与既有 `settings-visual-route.test.mjs`
约束：不改声音、通知记录、Native 协议与插件生命周期；不 commit/push/reset。

## 1. 问题定义

上一轮 DOM 实测（1411px 渲染）暴露三个硬问题：

| 症状 | 证据 | 性质 |
|---|---|---|
| 死控件占 1/4 | 97 控件中 24 个 `disabled`，配 24 个"后续加入"角标 | 范围 |
| 同一属性两处可改 | 圆角/透明度在「外形」与「皮肤·装饰」各一份；阴影/边框在两侧各一份（23 个灰度字段里 6 组重复） | 契约 |
| 无主操作 | 7 个实心强调按钮抢焦点 | 层级 |
| 圆角没有唯一真相 | 文档 6px / spec 6–12px / CSS 7px / 卡片默认 16–24px | 令牌 |

根因不是配色，是**约束缺失**：同一属性没有唯一归属，未实现的字段先摆了位置。

## 2. 决策

### 2.1 控件去留（24 个 coming 控件）

原则：**界面上看得见的，都必须是真的能用的。**

Native 渲染器实测（`renderer.cpp` / `window.cpp` / `visual.hpp`）确认真实生效的字段只有：
`cardType`、`appearance.{size,aspectRatio,width,height,backgroundColor,backgroundAssetId,backgroundFit,backgroundPadding,borderRadius,opacity}`、`preset`、`interaction.{dismissMode,timeoutMs}`。
其余一律不参与渲染。

- **移除 23 个**未实现控件（Native 既不解析也不渲染）：
  - 外形：模糊、阴影、边框宽度、边框颜色（4）
  - 排版：标题行数、正文行数、字号比例、行高、文字溢出（5）
  - 生命周期：入场时长、退场时长（2）
  - 交互：关闭按钮位置（1，Native 渲染硬编码右上，设置无效）
  - 资源边界：最大可见卡片、最大活跃卡片、最大粒子数、溢出策略（4）
  - 皮肤·装饰：阴影、边框宽度、边框颜色、模糊、视觉密度（5）
  - 特效·持续：持续粒子数、持续时长（2）
- **解锁 1 个**已实现控件：`关闭方式`（`dismissMode`）。Native `window.cpp` 对 `timeout`/`anywhere` 有真实分支，此前误标"后续加入"锁死。

### 2.1b 静默失效控件（新发现，一并移除）

以下控件此前**没有** disabled 标记，但 Native 完全不读取，属于更隐蔽的"改了没反应"：

- 皮肤方案下拉（仅一个选项，与模式卡重复）（1）
- 语义颜色 5 个色板：标题、正文、助手名、元数据、状态（Native 标题/正文色硬编码）（5）
- 特效整区：入场/持续/消失动画 + 入场/持续/消失粒子形状与数量（Native 无动画、无粒子实现）
- 交互：悬停暂停、可展开、可点击（Native 无对应行为）（3）

> 数据模型**全部保留**：`skin.semanticColors`、`effects.slots`、`properties.typography/interaction/resource` 仍可由 Profile 携带、导入导出。本轮只移除 UI 入口，不删数据字段。

移除后编辑器从 1530px 降到约 600px；coming 角标清零。

### 2.2 属性唯一归属

**`properties.shape` 是外形属性的唯一来源。**

| 属性 | 唯一归属 | 说明 |
|---|---|---|
| 圆角 | `properties.shape.borderRadius` | 皮肤·装饰不再提供同名控件 |
| 透明度 | `properties.shape.opacity` | 同上 |
| 背景色/素材/裁剪/内边距 | `skin.background.*` | 仅「皮肤·背景」一处 |
| 语义颜色 | `skin.semanticColors.*` | 仅「皮肤·语义颜色」一处 |

`collect()` 仍产出完整的 `skin.decoration`，但其 `borderRadius`/`opacity` **由 `properties.shape` 派生**（同一个控件同时写入两处），不再从独立控件读取——数据模型保持有效，歧义消失。

**回归保护**：`resolveVisualDraftPayload` 的字段优先级链（appearance → properties.shape → skin.decoration）保持不动，只收窄 UI 的写入来源。

### 2.3 主操作层级

- 一屏一个实心 `.primary`：**保存视觉设置**。
- 模式卡选中态改用**左侧色条 + 描边 + 轻着色**，不再用实心填充表达选中。
- 其余（保存配置包、应用、运行实验、覆盖、创建副本）一律 secondary。

### 2.4 视觉令牌

**澄清一个长期混淆：UI 外壳圆角 ≠ 卡片内容圆角，是两个轴。**

- 外壳（chrome）：按钮 6px、输入 6px、面板 8px、导航卡 11px。
- 内容（card）：由用户配置，Native 默认 minimal 16 / danmaku 12 / popup 24。

本轮把 CSS 外壳统一到 `--radius-*` 令牌，卡片内容圆角不再参与外壳令牌讨论。

### 2.5 文案与死代码

- 模式卡 monogram 由中文首字改为英文首字母（`M`/`D`/`P`），消除"极极简"。
- 删除 `settings-visual.js` 中的死代码：`if(false&&previewStage...)` 分支、被注释的 `profileCard`/`renderProfileList`、占位空 `<label style="visibility:hidden">`。
- 移除"第 1 阶段 · 基本能力""已接通"等工程状态文案，改为面向用户的表述。

## 3. 验收

- 24 个 coming 控件 → 0 个 `disabled`；`关闭方式` 可操作。
- 圆角/透明度控件各仅出现一次；`prob-*` 与 `skin-*` 同名控件不再共存。
- 实心 `.primary` 按钮仅 1 个。
- 页面无 `hidden` 占位、无死代码分支。
- `settings-visual-route.test.mjs` 收敛为新结构并全绿。
- `npm run check`、`npm test`、`git diff --check` 通过；全量既有失败数不增加。

## 5. 执行结果（2026-09-11）

已全部完成。渲染实测对照：

| 指标 | 收敛前 | 收敛后 |
|---|---|---|
| disabled 控件 | 24 | **0** |
| coming 角标 | 24 | **0** |
| 实心强调按钮 | 7 | **1**（`保存视觉设置`） |
| 圆角控件 | 2（`prop-border-radius` + `skin-radius`） | **1** |
| 透明度控件 | 2 | **1** |
| 编辑器高度 | 1530px | **928px** |
| 全量页面高度 | 3249px | **2647px** |
| `if(false…)` 死分支 | 1 | **0** |

验证：

- `settings-visual-route.test.mjs`：**19/19 通过**（收敛前 17/19）。
- `plugin-lifecycle.test.mjs`：**74/74 通过**（另修 3 条既有失败，见下）。
- `npm run check`：336 个文件通过。
- 全量 `npm test`：**1012 项，985 通过，0 失败，27 跳过**。
- `git diff --check`：退出码 0。

### 附带修复：既有失败测试（3 条）

`plugin-lifecycle.test.mjs` 的 3 条视觉场景测试在收敛前已失败，一并结清：

1. `carries one resolved visual decision`：断言补 `interaction` 字段；夹具 `height:300` 与 `aspectRatio:'wide'` 自相矛盾，改为只给宽度让宽高比派生（600×0.48=288）。
2. `applies an explicit event visual profile...`：同上 + **修复测试隔离缺陷**——夹具把 `dataDir` 指向真实安装目录 `C:\Hana\data\notification-hub-vnext`，而事件绑定持久化默认为开，导致测试读取本机状态、结果随机器而变。已显式关闭该持久化。
3. `evicts the oldest...overflow`：淘汰已改为按通道作用域（master plan：不同通道互不覆盖），夹具补通道身份 `chat.main`，断言改 1 张。

### 明确未做（留待后续）

- `closeButtonPosition`、语义颜色、特效、排版均需 Native 渲染改动（master plan Phase 8/9），本轮只移除 UI 入口。
- 数据字段全部保留，Profile 导入导出不受影响。

## 4. 明确不做

- 不改 Native 协议、不改声音、不改通知记录。
- 不新增卡片种类、行为、皮肤包、粒子系统。
- 不实现 `closeButtonPosition`（需 Native 渲染改动，留待后续）。
- 不实现语义颜色、特效、排版（需 Native 渲染改动，属于 master plan Phase 8/9）。
- 不删数据字段，只移除 UI 入口。
- 不动 `resolveVisualDraftPayload` 的字段兼容链。
