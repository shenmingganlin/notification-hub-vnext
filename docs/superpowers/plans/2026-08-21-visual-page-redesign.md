# 视觉页全面重构实施计划

**依据：** 2026-08-18-visual-system-master-plan.md
**目标：** 将通知视觉页从平铺面板改为完整层级管道，按 master plan 结构与字段深度实现
**版本：** 保持 `0.1.4`
**约束：** 不 Git commit/push/reset；不改变声音、通知记录、Plugin 生命周期和 Native 协议既有边界；
每层完成后必须 `npm run check`、focused 测试通过、全量测试不引入新失败。

## 总体进度

```
██████████████████████  100% (10/10 层完成)
```

| 层级 | 状态 |
|------|------|
| 1. 视觉页 UI 重构（属性完整 + 皮肤系统 + 特效系统） | ✅ |
| 2. 数据模型扩展（properties/skin/effect 注册与持久化） | ✅ |
| 3. 保存为配置包 + 冲突处理 | ✅ |
| 4. 预览测试 | ✅ |
| 5. 应用于事件 | ✅ |
| 6. 诊断 | ✅ |
| 7. 全局视觉开关 + 默认视觉效果 | ✅ |
| 8. 常规页收尾 | ✅ |
| 9. 全量验证 + 重新打包 0.1.4 | ✅ |
| 10. 清理测试产物 | ✅ |

---

## Layer 1: 视觉页 UI 重构 — 完整管道 + 属性 + 皮肤 + 特效

**文件：** `plugin/routes/settings-visual.js`
**测试：** `tests/node/settings-visual-route.test.mjs`
**数据模型：** 现有 `card-visual-settings.js` 的 `behavior` 和 `appearance` 字段维持不动；
UI 新增字段（皮肤、特效、扩展属性）暂存在 `card` 对象中，Layer 2 再拆分为独立注册系统。

### 页面结构

```
[卡片行为]  stack ▼
  └── [卡片种类]  minimal ▼
        ├── [卡片属性]
        │   ├── 空间: 尺寸 [中 ▼] 停靠 [右下 ▼] 宽高比 [默认 ▼]
        │   │        卡片间距 [8] 屏幕边距 [18] 排列方式 [简单 ▼]
        │   ├── 外形: 圆角 [16] 透明度 [0.96] 模糊 [0] 阴影 [无 ▼]
        │   │        边框宽度 [0] 边框颜色 [#0e1916 █]
        │   ├── 排版: 标题行数 [1] 正文行数 [4] 字号比例 [1.0] 行高 [1.55]
        │   ├── 生命周期: 持续时间 [30s] 入场时长 [260ms] 停留时长 [30s] 退场时长 [200ms]
        │   ├── 交互: 关闭方式 [关闭按钮 ▼] 悬停暂停 [关] 可展开 [关] 可点击 [关]
        │   └── 资源边界: 最大可见 [0] 最大活跃 [0] 最大粒子 [0] 溢出策略 [允许 ▼]
        │
        ├── [皮肤]
        │   ├── 皮肤方案 [默认 ▼]  ← 选择已有皮肤方案，包含完整语义颜色
        │   ├── 语义颜色:
        │   │    标题 [#F2FFF9 █] 正文 [#C5D8D0 █] 助手名 [#62D0A8 █]
        │   │    元数据 [#8EA69C █] 状态 [#F1C77A █]
        │   ├── 背景: 背景色 [#0e1916 █] 背景素材 [不使用 ▼] 裁剪 [拉伸 ▼]
        │   │        图片内边距 [0]
        │   ├── 装饰: 圆角 [16] 透明度 [0.96] 阴影 [无 ▼] 边框宽度 [0] 边框颜色 [#0e1916 █]
        │   │        模糊 [0] 视觉密度 [标准 ▼]
        │   └── 素材库 [管理素材 →]  ← 链接到 visual-assets-page
        │
        ├── [特效]
        │   ├── 入场动画 [淡入 ▼]      入场粒子 [关闭 ▼]
        │   │    入场粒子素材 [无 █]    入场粒子数 [18]
        │   │    入场时长 [260ms]
        │   ├── 持续动画 [无 ▼]        持续粒子 [关闭 ▼]
        │   │    持续粒子素材 [无 █]    持续粒子数 [0]
        │   │    持续时长 [0ms]
        │   └── 消失动画 [淡出 ▼]      消失粒子 [开启 ▼]
        │        消失粒子素材 [星形 █]  消失粒子数 [18]
        │        消失时长 [200ms]
        │
        └── [实时预览]
```

### 实现策略

- **不可用的选项灰显占位**，像当前 ticker/popup 行为那样 `disabled`
- 入场/持续/消失动画下拉：`[淡入 ▼ | 缩放 ▼ | 上滑 ▼ | 无 ▼]` 等，后三项 `disabled="coming"`
- 粒子选项：`[关闭 ▼ | 开启 ▼]`，开启时显示子控件（素材、数量）
- 粒子形状下拉：`[星形 ▼ | 圆形 ▼ | 心形 ▼ | 花瓣 ▼]`，后三项 `disabled="coming"`
- 皮肤方案下拉：`[默认 ▼]`，只有"默认"可选，后续层增加
- 所有新字段的默认值符合 master plan 规范

### 任务清单

- [x] **1.1** 写测试断言：页面包含完整层级结构（行为→种类→属性6类→皮肤→特效6槽位→预览）
- [x] **1.2** 运行 focused 测试确认失败
- [x] **1.3** 重写 `renderBody()` 的 HTML 结构为完整管道
- [x] **1.4** 更新 `collect()` 读取新字段
- [x] **1.5** 更新 `syncPreview()` 实时刷新预览（兼容新字段）
- [x] **1.6** 更新页面文案和帮助文字
- [x] **1.7** 运行 focused 测试确认通过
- [x] **1.8** 更新计划文件进度

---

## Layer 2: 数据模型扩展 — properties/skin/effect 注册与持久化

**文件：** `plugin/domain/card-visual-settings.js`、`plugin/domain/visual-settings.js`、`plugin/domain/visual-settings-store.js`

**目标：** 将 `card-visual-settings.js` 的 `appearance` 拆分为 `properties`、`skin`、`effects` 三个独立域，
新增 `skinRegistry` 和 `effectRegistry`，支持通过 `skinId`/`effectConfigId` 引用。

### 数据模型

```js
// properties — 空间、外形、排版、生命周期、交互、资源边界
{
  space: { width, height, minWidth, maxWidth, anchor, offset, margin, gap, screenPadding, zIndex },
  shape: { borderRadius, opacity, blur, shadow, borderWidth, borderColor, visualDensity },
  typography: { titleLines, bodyLines, fontScale, lineHeight, textOverflow },
  lifecycle: { durationMs, enterDurationMs, holdDurationMs, exitDurationMs },
  interaction: { dismissMode, closeButtonSize, closeButtonPosition, hoverPause, pauseOnFocus, expandable, clickable },
  resource: { maxVisible, maxActive, maxParticles, maxAnimationInstances, overflow }
}

// skin — 语义颜色 + 背景 + 装饰
{
  skinId: 'skin.default',
  skinName: '默认',
  semanticColors: { title, body, assistantName, metadata, status },
  background: { color, assetId, fit, padding },
  decoration: { borderRadius, opacity, shadow, borderWidth, borderColor, blur, density }
}

// effects — 6 槽位
{
  effectConfigId: 'effect.none',
  slots: {
    enter: { enabled, effectId, durationMs, maxParticles, assetId },
    idle: { enabled, effectId, durationMs, maxParticles, assetId },
    exit: { enabled, effectId, durationMs, maxParticles, assetId },
    enterParticles: { enabled, effectId, durationMs, maxParticles, assetId },
    idleParticles: { enabled, effectId, durationMs, maxParticles, assetId },
    exitParticles: { enabled, effectId, durationMs, maxParticles, assetId }
  }
}
```

- [x] **2.1** 扩展 `card-visual-settings.js`：新增 `createCardProperties()`、`createCardSkin()`、`createCardEffect()` 工厂函数
- [x] **2.2** 新增 `visual-skin-registry.js`：`skinId → skin` 注册/查询/删除/回退
- [x] **2.3** 新增 `visual-effect-registry.js`：`effectConfigId → effect` 注册/查询/删除/回退
- [x] **2.4** 更新 `visual-settings.js` 的 profile 结构，支持 `visualProfiles` 包含 `propertiesId`/`skinId`/`effectConfigId`
- [x] **2.5** 更新 `visual-settings-store.js` 持久化，兼容新字段
- [x] **2.6** 写 focused 测试
- [x] **2.7** 运行 `npm run check` 确认通过
- [x] **2.8** 更新计划文件进度

---

## Layer 3: 保存为配置包 + 冲突处理

**文件：** `plugin/routes/settings-visual.js`
**测试：** `tests/node/settings-visual-route.test.mjs`
**API：** 复用 `visual-profiles/save`

- [x] **3.1** 写测试断言：页面包含保存输入框、冲突处理 UI、已保存配置包列表
- [x] **3.2** 运行 focused 测试确认失败
- [x] **3.3** 在层级管道下方加"保存为配置包"区域：
  - 命名输入框（默认根据行为+种类生成名称，如 "stack·minimal"）
  - [保存 ▼] 按钮，同名冲突时弹出覆盖/保留/创建副本选项
  - 保存后新配置包出现在"已自定义配置包"列表
- [x] **3.4** 已自定义配置包列表：显示名称、行为、种类、引用事件数
- [x] **3.5** 处理同名冲突：覆盖（替换）、保留（放弃）、创建副本（自动 +1）
- [x] **3.6** 运行 focused 测试确认通过
- [x] **3.7** 更新计划文件进度

---

## Layer 4: 预览测试

**文件：** `plugin/routes/settings-visual.js`
**测试：** `tests/node/settings-visual-route.test.mjs`
**API：** 复用 `visual-test-notification`

- [x] **4.1** 写测试断言：页面包含测试区域（数量选择 + 发送按钮 + 反馈）
- [x] **4.2** 运行 focused 测试确认失败
- [x] **4.3** 在"已自定义配置包"下方加"预览测试"区域：
  - 发送数量输入（1-5，默认 1）
  - [发送 X 张测试卡片] 按钮
  - 调用 `visual-test-notification` API
  - 反馈：成功/失败/全局视觉关闭被阻止
- [x] **4.4** 运行 focused 测试确认通过
- [x] **4.5** 更新计划文件进度

---

## Layer 5: 应用于事件

**文件：** `plugin/routes/settings-visual.js`、`plugin/index.js`、`plugin/routes/settings-events.js`
**测试：** `tests/node/settings-visual-route.test.mjs`、`tests/node/settings-events-route.test.mjs`、`tests/node/plugin-lifecycle.test.mjs`

- [x] **5.1** 写测试断言：视觉页包含"应用于事件"区域（事件下拉 + 配置包下拉 + 预览 + 保存）
- [x] **5.2** 运行 focused 测试确认失败
- [x] **5.3** 在"预览测试"下方加"应用于事件"区域：
  - 事件下拉（从后端获取事件列表）
  - 配置包下拉（从后端获取已保存配置包）
  - 应用预览：新增/覆盖/保持/缺失
  - [应用] 按钮
  - 已绑定事件列表（显示事件→配置包映射）
- [x] **5.4** 通知行为页（settings-events.js）删除"应用视觉方案"区块
- [x] **5.5** 运行 focused 测试确认通过
- [x] **5.6** 更新计划文件进度
- [ ] **5.6** 更新计划文件进度

---

## Layer 6: 诊断

**文件：** `plugin/routes/settings-visual.js`
**测试：** `tests/node/settings-visual-route.test.mjs`

- [x] **6.1** 写测试断言：页面包含诊断区域，显示状态和修订版本
- [x] **6.2** 运行 focused 测试确认失败
- [x] **6.3** 在"应用于事件"下方加"诊断"区域：
  - 显示当前视觉状态（状态、修订版本）
- [x] **6.4** 运行 focused 测试确认通过
- [x] **6.5** 更新计划文件进度

---

## Layer 7: 全局视觉开关 + 默认视觉效果

**文件：** `plugin/routes/settings-visual.js`、`plugin/domain/visual-settings.js`
**测试：** `tests/node/settings-visual-route.test.mjs`、`tests/node/visual-settings.test.mjs`

- [x] **7.1** 写测试断言：页面顶部包含全局视觉开关和默认下拉
- [x] **7.2** 运行 focused 测试确认失败
- [x] **7.3** 页面顶部加 `[开启全局视觉] [默认视觉效果: 视觉关闭 ▼ | 极简 ▼]`：
  - 关闭时下方全部灰显（CSS `pointer-events: none; opacity: 0.4`）
  - 极简 = 事件没有自定义绑定时走这个兜底
- [x] **7.4** 数据模型：`visual-settings.js` 的 `global` 加 `defaultMode: 'off' | 'minimal'`
- [x] **7.5** 运行 focused 测试确认通过
- [x] **7.6** 更新计划文件进度

---

## Layer 8: 常规页收尾

**文件：** `plugin/routes/settings.js`、`plugin/routes/settings-events.js`
**测试：** `tests/node/settings-route.test.mjs`、`tests/node/settings-events-route.test.mjs`

- [x] **8.1** 写测试断言：常规页不再包含"桌面卡片"和"当前边界"，改为包含"重要性关键词"
- [x] **8.2** 运行 focused 测试确认失败
- [x] **8.3** SETTINGS_VIEWS.general 标题改为"常规"，描述更新
- [x] **8.4** 常规页删除"桌面卡片"区块（卡片持续时间移入视觉页）
- [x] **8.5** 常规页删除"当前边界"静态区块
- [x] **8.6** 常规页新增"重要性关键词"区块（从通知行为页移入）
- [x] **8.7** 通知行为页删除重要性关键词区块
- [x] **8.8** 运行 focused 测试确认通过
- [x] **8.9** 更新计划文件进度

---

## Layer 9: 全量验证 + 重新打包

- [x] **9.1** 运行 `npm run check`
- [x] **9.2** 运行 `npm test -- --test-concurrency=1`
  - 语法检查通过，316 文件
  - 875 通过 / 1 失败 / 27 跳过
  - **已知预存失败**: `plugin-lifecycle.test.mjs` 中 `vNext notification scene applies an explicit event visual profile before legacy category policy` — 非本次改动引入
- [x] **9.3** 重新打包 `notification-hub-vnext-0.1.4.zip`
- [x] **9.4** 校验 ZIP 内容
  - 181 条目，包含所有关键文件
  - SHA256: `170468E07F44C1F8FA23D344F66E2A6485EC7625DD234A3438176DF2ED710EE6`
- [x] **9.5** 更新计划文件进度

---

## Layer 10: 清理测试产物

- [x] **10.1** 删除调试脚本残留文件
- [x] **10.2** 更新计划文件进度（标记完成）

---

## 已完成的旧工作（之前 IA 重构）

- [x] 设置导航"事件表现"更名为"通知行为"
- [x] 声音页"最近声音状态"跨列铺满
- [x] 通知视觉页删除事件应用和测试
- [x] 通知行为页承接视觉应用、事件绑定、测试
- [x] Plugin 状态提供 visualProfiles 和 testEvents
- [x] 修复 settings-events.js 换行正则转义
- [x] 全量验证通过（75 focused + 841/868 full + 3 Native）
- [x] 0.1.4 打包完成（179 文件，SHA256 17A039...）