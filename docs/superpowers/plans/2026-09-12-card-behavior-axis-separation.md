# 卡片两轴分离 —— 实现计划（2026-09-12）

决策依据：`docs/adr/ADR-002-card-type-behavior-axis.md`
UI 规格来源：Lumen 拾光设计规格（本文 §4 为收敛版）
范围：视觉领域模型 / 运行时投影 / 持久化迁移 / 设置页
不做：实现 ticker、popup 的真实 Native 行为（master plan Phase 7）；新增卡片种类（Phase 6）；改声音、通知记录、Native 协议。

## 1. 问题（一句话）

「卡片种类」在代码里有两个矛盾定义，且都活着：
- 内容结构定义（`card-composition-contract.js` 的 `CARD_TYPE_IDS`）**未接线**；
- 「外观＋出现方式」打包定义（`card-visual-settings.js` 的 `CARD_TYPES = minimal/danmaku/popup`）是活链路。
而真正的行为轴早已存在（表现绑定的 `behaviorProfileId`）。结果：同一属性两个来源，UI 把两条轴揉成一个下拉，「弹幕/突脸」作为未实现的行为被当成可选卡片种类售卖，且 `danmaku`/`ticker` 命名分裂。

## 2. 目标模型（v2）

```
visualProfile = {
  version: 2,
  global, categories, visualProfiles, rules,        // 不变
  behaviorId: 'stack',                              // 新增：出现方式轴（唯一来源）
  card: {
    activeType: 'minimal',                          // 内容结构轴 ∈ 已实现 CARD_TYPE_IDS
    types: { minimal: { appearance, properties, skin, effects } }   // 不再含 behavior
  }
}
```

- **卡片种类轴**：`card.activeType` / `card.types` 的键。权威词表复用
  `card-composition-contract.js` 的 `CARD_TYPE_IDS`；`IMPLEMENTED_CARD_TYPES` 本轮 = `['minimal']`。
- **出现方式轴**：`profile.behaviorId`。权威词表 = 已实现行为集合；本轮 = `['stack']`。
  规范 id 用 `ticker`（显示「弹幕」），`popup` 显示「突脸」。`danmaku` 降级为迁移期别名。
- `card.types[*].behavior`（stub）删除；Native 投影的 anchor 依据改为 `behaviorId` 的默认锚点。
- `presentation` 绑定沿用既有 `behaviorProfileId`/`behaviorChannelId`（`behaviorId` → `${behaviorId}.main`）。

## 3. 迁移 v1 → v2（`VISUAL_PROFILE_VERSION` 1→2）

读取时自动升级、幂等；提供纯函数 `migrateVisualProfileV1ToV2`：

| 旧 `card.activeType` | 新 `cardType` | 新 `behaviorId` | 备注 |
|---|---|---|---|
| `minimal` | `minimal` | 原绑定的 `behaviorProfileId`（默认 `stack`） | 无损失 |
| `danmaku` | `minimal` | `ticker` | 原 `types.danmaku` 的 appearance/properties/skin/effects 迁入 `types.minimal` |
| `popup` | `minimal` | `popup` | 同上 |

- 旧 `types[*].behavior` 丢弃。
- 无法识别的旧值保留原文并记一条诊断，不静默丢弃。
- 迁移覆盖既有持久化（`visual-registry-persistence*`）与预览草稿（`index.js` 的 `normalizeVisualPreviewProfile`）。

## 4. UI 规格（Lumen）

1. **信息架构**：三栏保留。左栏「视觉模式」更名「**起步预设**」，副文案「选一个起点，再调细节。」预设＝一次性套用「出现方式 × 外观」，**不保留「已选中」伪状态**。中栏编辑器顶部放「**双格轴条**」：左格「出现方式」，右格「卡片种类」，中间竖向细分隔线。右栏预览按真实能力收敛。
2. **未实现态统一规则**：显示、`aria-disabled`、可聚焦、带**非颜色**文字角标「未实现」，聚焦/点击展开一句说明（「弹幕还在开发中，暂时不能选择。」）。不隐藏、不裸灰、不用红黄警示色、不用删除线。
3. **编辑器分组树**：出现方式设置（行为轴：停靠角/四周留白/卡片间距/排列方式/持续时间/停留时长/关闭方式）｜卡片外观设置（种类轴：内容槽只读/卡片大小/宽/高/圆角/透明度/皮肤背景）。删除原「卡片行为·出现方式」死下拉。
4. **文案**：轴名「出现方式」（副：决定卡片怎么进入视野）、「卡片种类」（副：决定卡片展示什么）。出现方式选项：堆叠/弹幕/突脸（`stack`/`ticker`/`popup` 作等宽小字）。种类选项：极简（`minimal`）。预设名：极简堆叠 / 弹幕流动 / 突脸强调。

## 5. 实现清单（文件级）

**领域模型**
- `plugin/domain/card-visual-settings.js`：`CARD_TYPES` 改为内容结构词表（与 `CARD_TYPE_IDS` 对齐），`IMPLEMENTED_CARD_TYPES = ['minimal']`；`TYPE_FIELDS` 去掉 `behavior`；`CARD_TYPE_DEFAULTS` 去掉 `behavior`；`normalizeType`/`createCardVisualSettings` 相应调整（对 legacy 值走迁移而非报错）。
- `plugin/domain/visual-settings.js`：`PROFILE_FIELDS` 增 `behaviorId`；`createVisualProfile` 校验并默认 `behaviorId: 'stack'`；`VISUAL_PROFILE_VERSION = 2`；接入迁移。
- 新增 `plugin/domain/visual-profile-migration.js`：`migrateVisualProfileV1ToV2`（纯函数 + 测试）。
- 行为词表收敛：`plugin/domain/notification-behavior.js`、`plugin/domain/notification-presentation-profile.js`、`plugin/domain/behavior-channel.js` 中的 `danmaku` 规范化为 `ticker`（保留入站别名映射）。

**运行时投影**
- `plugin/domain/native-visual-payload.js`：`CARD_TYPES` 白名单改为 `CARD_TYPE_IDS`（不再接受 danmaku/popup 作为 cardType）。
- `plugin/index.js`：`notificationCardPayload` 的 anchor 依据改为 `behaviorId`；`visualPlacementFingerprint`、`normalizeVisualPreviewProfile`、实验台样例（`index.js:3371-3373` 的 `cardType: danmaku/popup`）同步。

**持久化**
- `plugin/domain/visual-registry-persistence.js`、`visual-registry-persistence-store.js`：读取时走 v1→v2 迁移，写回版本 2。

**设置页**
- `plugin/routes/settings-visual.js`：按 §4 重排；`collect()` 必须真正读取出现方式轴（否则删除该控件）；预览只渲染真实可用行为的卡片。
- `tests/node/settings-visual-route.test.mjs`：收敛为新结构并全绿。

**测试**
- 更新所有引用 `activeType`/`card.types`/`danmaku` 的测试夹具；新增迁移回归（覆盖 minimal/danmaku/popup 三种历史形态 + 幂等）。

## 6. 验收

- `npm run check` 通过；全量 `npm test` 失败数为 0（不低于当前基线 985 通过）。
- 领域约束生效：`card.activeType` 只接受已实现内容结构；`profile.behaviorId` 只接受已实现行为；`danmaku` 入站被规范化为 `ticker`。
- v1 旧数据可无损加载并升级为 v2；迁移幂等。
- 设置页：两条轴标签同时可见；未实现项有非颜色「未实现」标记且不可选；`collect()` 读取真实轴值；仅 1 个实心主按钮；无横向滚动。
- `git diff --check` 退出码 0。

## 7. 明确不做

- 不实现 ticker/popup 的 Native 行为；不新增卡片种类；不改声音、通知记录、Native 协议与插件生命周期。
- 不删除数据字段本身，只移除冲突来源与误导性 UI。
