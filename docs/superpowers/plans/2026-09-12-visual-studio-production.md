# 通知视觉页 · 卡片工作室 生产落地

日期：2026-09-12
状态：用户已点头，墨斗执行
对照：
- 硬约束 `docs/superpowers/specs/2026-09-12-visual-studio-elegance.md`
- 视觉规格 `docs/superpowers/specs/2026-09-12-visual-studio-visual-spec.md`
- 静态稿 `docs/superpowers/prototypes/visual-studio-elegance.html`

只改 UI。不升版本。不改 Native / 声音 / 历史 / 协议。

## 目标文件

- `plugin/routes/settings-visual.js`（HTML + CSS + 页内脚本）
- `tests/node/settings-visual-route.test.mjs`（跟着 IA 改，不绑死旧工作台骨架）

## 第一屏（必须）

```
← 返回设置中心

通知视觉                              [保存]
选一种出现方式，只调这一组，看见它怎么动，再保存。
[全局视觉开关可留在标题行附近，不要再做成大卡片]

堆叠 | 弹幕 | 突脸（未实现）

[ 只属于当前出现方式的一组旋钮 ]
[ 卡片外观：尺寸 / 圆角 / 背景 ]

预览（只演当前这一种）   [试一条]  [打开实时预览]
```

配置包、应用到事件、实验细节、诊断：默认折叠，不占第一屏。

## 交互

1. 出现方式只留芯片。删除起步预设卡、可见的「卡片种类」轴、可见的 `axis-chip-code`（stack/ticker 字样）。
2. `pipeline-behavior` / `pipeline-type` 可留 hidden select，供 collect 使用。
3. 选弹幕：只露 5 个弹幕旋钮；停靠、四边距、排列、持续时间、停留时长整组 `hidden`（不是 disabled）。
4. 选堆叠：弹幕整组 `hidden`。停靠用四角空间控件，同步 `prop-anchor`。边距进「边距与卡片间距」折叠。
5. 时长只留一个可见「停留时长」。`prop-duration` 与 `prop-hold-duration` 可隐藏同步，collect 仍输出毫秒。
6. 弹幕带位置用顶/底带状控件，同步 `ticker-band`（select 可 hidden）。
7. 速度/带高度/同轨间距用滑杆，保留原 id。轨道数无 `max`。
8. 预览只演当前方式。弹幕 CSS 从右往左流。禁止三张通道卡并排。
9. 「试一条」贴预览旁：走现有 `visual-test-event`（真实出卡）。弹幕试一条不要在页内预览里新开轨道。次数/间隔/并行测试折进次级。
10. 实时预览 open/update/close 逻辑原样保留。
11. 突脸：虚线 + 文字角标「未实现」+ `aria-disabled`。why 文案可保持始终可见（用户已看过静态稿）。
12. 全页只有一个 `.primary`：保存。

## 必须保留的 id / 契约

`pipeline-behavior` `pipeline-type`
`ticker-section` `ticker-speed` `ticker-band` `ticker-band-ratio` `ticker-track-count` `ticker-min-gap`
`prop-size` `prop-anchor` `prop-margin-*` `prop-gap` `prop-layout` `prop-width` `prop-height` `prop-border-radius` `prop-opacity` `prop-duration` `prop-hold-duration` `prop-dismiss-mode`
`skin-bg-color` `skin-bg-asset` `skin-bg-fit` `skin-bg-padding`
`global-visual-enabled` `global-visual-default-mode`
`visual-settings-save` `visual-page-status`
`visual-preview` `visual-preview-stage` `visual-preview-floating` `visual-preview-confirmation` `visual-preview-state`
`visual-assets-open`
`visual-profile-name` `visual-profile-save` `visual-profile-list` `visual-feedback` `visual-conflict-*`
`visual-test-event` `visual-test-count` `visual-test-interval` `visual-test-send` `visual-test-parallel` `visual-test-feedback`
`apply-event-select` `apply-visual-profile` `apply-visual-preview` `apply-visual-btn` `apply-bound-list`
`visual-diagnostics` `visual-diagnostics-list` `refresh-visual-diagnostics` `clear-visual-diagnostics` `export-visual-diagnostics`

`collect()` 输出形状不变。`SYNC_ELEMENT_IDS`、委托 input/change、previewGeneration、dispose 保留。

路由一个都不删（含 visual-workbench/* 即使页上不再入口）。

## 测试怎么改

保留：collect 契约、路由列表、preview open/update/close、slugify、配置包/应用/诊断/全局开关、脚本可编译、无 hoverPause/overflow 控件、ticker 无 max、popup aria-disabled。

改掉这些实现耦合：
- `pipeline-behavior` / `axis-chip` / `起步预设` / `卡片种类` / `卡片外观编辑器` / 三栏 grid / `视觉实验台` 作为第一屏标题
- `grid-template-columns:190px...`、`visual-preview-column sticky`、`axis-chip-code`

新增：
- 选 ticker 时 `ticker-section` 无 hidden，stack 旋钮组 hidden
- 选 stack 时相反
- 只有一个 `class="primary"`
- 无 `VISUAL WORKBENCH`、`stack.main`、`Native preview`
- 无 `id="ticker-hover-pause"|id="ticker-overflow"`
- 预览只有一个 stage，无三通道并排卡

## 明确不做

- 不改 `runtime/`、`plugin/domain/`、声音页、通知中心
- 不实现 popup 真身
- 不露出 hoverPause / overflow
- 不把轨道数设 max
- 不 Git commit
- 不把「试一条」做成纯 CSS 假动作

## 验收

1. `node --test tests/node/settings-visual-route.test.mjs` 全绿
2. 打开页面：第一屏是工作室，不是工作台
3. 切弹幕，堆叠几何消失；切堆叠，弹幕旋钮消失
4. 保存仍是唯一实心按钮
5. 试一条仍打真实测试事件
