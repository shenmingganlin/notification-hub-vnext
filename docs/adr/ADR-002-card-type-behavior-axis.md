# ADR-002：卡片种类与出现方式（行为）轴分离

- 状态：Proposed
- 日期：2026-09-12
- 范围：Notification Hub 视觉系统的领域模型、运行时投影与设置页
- 关联：`docs/superpowers/plans/2026-08-18-visual-system-master-plan.md` §4、§5、§6；ADR-001

## 背景

视觉系统里「卡片种类」这个词目前有两个互相矛盾的定义，且都被真实使用：

1. **内容结构语义**（master plan §4.1）：卡片种类 = 卡片展示哪些内容槽。
   - 权威词表在 `plugin/domain/card-composition-contract.js:1`
     `CARD_TYPE_IDS = ['minimal','message','detail','progress','character','system']`。
   - 现状：该契约只被自身与测试引用，**未接入运行时**。

2. **打包语义**（当前运行时实际使用）：卡片种类 = 「外观 + 出现方式」的打包。
   - `plugin/domain/card-visual-settings.js:1` `CARD_TYPES = ['minimal','danmaku','popup']`，
     每个类型自带 `behavior` 与 `appearance` 默认值。
   - 活链路：`card.activeType` → `visual.cardType` → `plugin/domain/native-visual-payload.js:1`
     白名单 `{minimal,danmaku,popup}` → Native。

与此同时，系统里**已经存在一条独立且真实的行为轴**：

- `plugin/domain/notification-presentation-profile.js:4` `BEHAVIOR_PROFILE_IDS = ['stack','danmaku','ticker','popup']`，
  表现绑定上的 `behaviorProfileId` 驱动 `behaviorChannelId`，最终落到 Native 布局。

后果：

- **同一属性有两个来源**：`card.types[].behavior`（stub，只含 `layout/boundary`）与
  表现绑定的 `behaviorProfileId`（真实）并存。
- **名实不符**：Native 只有两种排布——
  `runtime/scene/layout.hpp:22` `enum class LayoutMode { Stack, Shelf }`；
  `runtime/scene/controller.cpp:692-700` 把 `ticker/danmaku` 映射为静态 `Shelf`、
  `popup` 映射为左上向下 `Stack`。没有横向移动，也没有「突脸」焦点语义。
  UI 却把「弹幕 / 突脸」作为可选卡片种类呈现。
- **命名分裂**：行为 id 在不同文件里分裂为 `danmaku`（`notification-behavior.js:1`）与
  `ticker`（`visual-behavior-contract.js:1`）。
- 设置页里「出现方式」下拉（`plugin/routes/settings-visual.js` `pipeline-behavior`）的值
  未被 `collect()` 读取，属于看得见但不生效的控件。

## 决策

把被揉在一起的两条轴拆开，各自有唯一词表与唯一来源：

### 1. 卡片种类（cardType）= 内容结构轴

- 权威词表：`CARD_TYPE_IDS`（`minimal` 起，其余随 master plan Phase 6 逐个实现）。
- 载体：`card.activeType` 与 `card.types` 的键。
- 只描述「展示什么」：内容槽、版面、以及该种类下的外观/属性/皮肤/特效。
- **不再携带 `behavior`**：`card.types[type].behavior` 从模型中移除。

### 2. 出现方式（behaviorId）= 编排轴

- 权威词表：已实现行为集合。当前仅 `stack`。`ticker`（弹幕）、`popup` 列为**未实现**，
  在模型与 UI 中都必须显式标注，不得表现为可选能力。
- 载体：沿用既有的表现绑定 `behaviorProfileId`（不新增重复字段）。
- **命名收敛**：以 `ticker` 为规范 id、`弹幕` 为显示名；`danmaku` 降级为迁移期的 legacy 别名，
  在边界层映射为 `ticker`，词表内不再并列保留。

### 3. 组合语义

一个视觉方案（Visual Profile）＝ `cardType` × `behaviorId` × 属性/皮肤/特效 的组合。
master plan §4 定义的六条轴（Card Type / Properties / Skin / Effects / Behavior / Behavior Channel）
不再被压缩进 `card.types` 的键。

### 4. UI 呈现（交由设计侧落地，不在本 ADR 定稿视觉细节）

- 侧栏现有三张「视觉模式卡」（极简/弹幕/突脸）**不再自称「卡片种类」**，重定位为
  「出现方式 × 外观」的**预设**；其中 `ticker`/`popup` 在其行为落地前显式标注未实现。
- 编辑器需给出两个显式且互不混淆的选择器：**出现方式**（真实行为轴）与**卡片种类**（内容结构轴）。
- 删除值为死数据的「出现方式」下拉，或将其接上真实行为轴——二选一，不留装饰性控件。

## 迁移（v1 → v2）

`VISUAL_PROFILE_VERSION` 由 `1` 提升为 `2`，提供纯函数迁移，读取时自动升级并回写：

| 旧 `card.activeType` | 新 `cardType` | 新 `behaviorId` | 说明 |
|---|---|---|---|
| `minimal` | `minimal` | 沿用原绑定的 `behaviorProfileId`（默认 `stack`） | 无行为语义丢失 |
| `danmaku` | `minimal` | `ticker` | 原 `types.danmaku` 的 appearance/properties/skin/effects 迁入 `types.minimal` |
| `popup` | `minimal` | `popup`（未实现） | 同上；UI 需提示该行为尚未实现 |

- 旧 `types[type].behavior`（`layout/boundary` stub）在迁移中丢弃，真实行为一律以绑定为准。
- 迁移必须可逆读取、幂等，并对无法识别的旧值保留原文而非静默丢弃。

## 后果

- **收益**：一条属性只有一个来源；UI 承诺与 Native 能力一致；`danmaku/ticker` 命名统一；
  master plan 的六轴模型真正落到代码，而非停在孤儿契约里；后续 Phase 6/7 有清晰的挂载点。
- **成本**：需同步改动领域模型（`card-visual-settings.js`）、持久化与迁移、
  运行时投影（`index.js` → `native-visual-payload.js`）、设置页与相关测试。
- **风险**：旧数据形态多样，迁移需有回归夹具覆盖 `minimal/danmaku/popup` 三种历史形态。

## 明确不做

- 不实现 `ticker`/`popup` 的真实 Native 行为（属 master plan Phase 7）。
- 不新增卡片种类（属 master plan Phase 6）。
- 不改声音、通知记录、Native 协议与插件生命周期。
- 不删除数据字段本身，只移除冲突来源与误导性 UI。
