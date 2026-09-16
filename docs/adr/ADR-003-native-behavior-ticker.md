# ADR-003：把 Native 行为扩展纳入范围（首个交付：ticker 弹幕）

- 状态：Proposed
- 日期：2026-09-12
- 范围：运行时场景控制器、布局引擎、动画心跳、视觉 Profile 行为参数、设置页未实现态收口
- 关联：ADR-002（本 ADR 部分取代其「明确不做」第 1 条）、ADR-001、`docs/superpowers/plans/2026-08-18-visual-system-master-plan.md` §3、§5
- 前置证据：ADR-002 的两轴分离已于 2026-09-12 完成真机验收（甘霖确认设置页两轴呈现、未实现标注与保存闭环均正常）

## 背景

### 为什么上一轮把 Native 排除在外

ADR-002 只做一件事：把被揉在一起的「卡片种类」与「出现方式」拆成两条正交轴，并让 UI 停止承诺 Native 尚不具备的能力。当时的「明确不做」第 1 条写着：

> 不实现 `ticker`/`popup` 的真实 Native 行为（属 master plan Phase 7）。

这是一条**范围控制**条款，不是技术判断。它换来的是：轴分离可以独立验收，不必与 Native 改动耦合。

### 现在为什么要开这个口子

三条理由，缺一不可：

1. **轴分离已验收通过**。UI 现在诚实地把 `ticker`/`popup` 标为未实现，模型里也不再有两个来源。轴分离的收益已经落袋，可以安全地在它之上叠加 Native 改动。
2. **没有别的路能让 ticker 真能用**。卡片的屏幕位置由 Native 独占（每张卡片是一个独立 Win32 分层窗口，位置经 `SetWindowPos` 施加）。JS 侧无法让卡片移动。
3. **它是计划里的下一个**。master plan §5 把行为实施顺序排为 Stack → Ticker → Popup，并附硬约束「每种行为必须单独完成契约和验收，不并行堆半成品」。Stack 已完成，Ticker 是下一个。

### 现状侦察（本次决策依据）

**链路是通的**——行为 id 一路抵达 Native 布局分派，不存在断线：

```text
设置页 behaviorId
  → 视觉 Profile（plugin/domain/visual-settings.js:83）
  → 运行时快照 behaviorId
  → scene payload 的 behavior.behaviorProfileId（plugin/runtime/scene-state.js；card.behavior）
  → Native card.behavior_profile_id（runtime/transport/named_pipe.cpp:382）
  → profile_id_for(card)（runtime/scene/controller.cpp:213）
  → 行为通道布局分派（runtime/scene/controller.cpp:691-700）
```

**Native 已经按行为分派布局**（`runtime/scene/controller.cpp:691-700`）：

| `profile_id` | 布局 | 方向 | 锚点 |
|---|---|---|---|
| `ticker` / `danmaku` | `LayoutMode::Shelf` | 右 | 左上 |
| `popup` | `LayoutMode::Stack` | 下 | 左上（另有居中偏置） |
| 其余（含 `stack`） | 默认几何 | — | — |

且有**行为通道分道**机制：通道各占工作区一条 lane，通道间互不干扰（`controller.cpp:665-690`）。

**真正缺的是时间**：

- `layout_shelf`（`runtime/scene/layout.cpp`）只计算**静态一行**位置；排不下时以 `LAYOUT_SHELF_OUT_OF_BOUNDS` 失败，控制器回退为竖排（`controller.cpp:720-733`）。
- 运行时是**请求驱动**的：`pump_messages()`（`controller.hpp:76`）只在请求处理路径上被调用（`runtime/transport/named_pipe.cpp:633`），请求之间**没有任何帧推进**。全仓唯一的计时器是卡片自己的 dismiss `WM_TIMER`（`runtime/scene/window.cpp:17`）。
- 结论：**运行时当前不持有时间维度**。让弹幕"动起来"不是改布局公式，而是给运行时引入心跳。

**参数管道只有静态几何**：scene payload 的 `visual` 现有 `{enabled, preset, intensity, category, cardType, behaviorId, space, appearance}`（`plugin/index.js:2632`）。`space` 只有 `anchor/gap/margin/layout`。**没有速度、没有轨道、没有重叠策略**。

**一处遗留**：`controller.cpp:699` 仍按 `profile_id == "minimal"` 分支。这是旧「卡片种类即出现方式」混称在 Native 侧的残留——真实值域是 `stack/ticker/danmaku/popup`（`plugin/domain/notification-behavior.js:1`），`minimal` 不应出现在行为轴。ADR-002 受边界所限未清理它。本 ADR 需要给出它的归属（旧状态兼容 or 收敛），不得含糊留着。

## 决策

### 1. 范围扩展：允许修改 Native C++ 以新增真实行为

解除 ADR-002 的限制。首个交付物为 `ticker`。`popup` 仍排在 Ticker 契约与验收完成之后（沿用 §5 的"不并行堆半成品"）。

### 2. 运行时引入周期心跳（本期最重的架构变更）

新增一个可被驱动的 tick 机制，用于按时间推进动画。行为契约必须明确：

- 心跳**来源**：定时器 / 带超时的等待轮询 / 独立线程——三选一并说明对既有请求驱动语义的影响
- 心跳**频率**与可暂停性
- 心跳与请求处理路径的**重入与消息泵时序**：一次 tick 会不会与正在处理的请求竞争卡片状态
- **无卡片时**心跳是否停摆（空闲零开销）

### 3. 行为参数进入 Profile 的 `properties`

在 `properties` 下新增行为参数组（速度、轨道、间距、重叠策略等），并投影进 native payload。参数归属**行为/通道**，不归属单张卡片——这与 master plan §3.3 的分工一致（Behavior 管算法编排，Properties 管参数数值）。

### 4. 契约先于代码

`ticker` 的实现边界以行为契约为准，契约在动 C++ 之前定稿。契约必须覆盖 master plan §5 的 15 项骨架，且每项都要**可判定**（有观察对象和通过条件），不接受形容词。

### 5. 每个行为落地时必须同步收口 UI

行为实现与「未实现」标注的消失必须是**同一次交付**：`IMPLEMENTED_VISUAL_BEHAVIOR_IDS`（`plugin/domain/visual-settings.js:8`）扩容 + 设置页对应控件解锁。禁止出现"代码能跑但 UI 还标着未实现"或反之。

## 红线（回归基线）

- **`stack` 的全部现行为不可改变**。它是回归基线，任何 ticker 改动导致 stack 行为变化即视为缺陷。
- 不削弱行为通道的隔离语义（一个通道故障不得阻塞其他通道）。
- 不改变既有 `scene.*` 消息的语义；若契约要求新增字段，必须向后兼容，且旧客户端缺失该字段时行为与今日一致。
- 不改声音、通知记录、插件生命周期。
- 不在同一次交付里并行实现多个行为。

## 后果

- **收益**：行为轴第一次完成「从标未实现 → 真能用」的完整闭环；为后续 6 个行为沉淀三样可复用资产——契约模板、心跳机制、行为参数组。
- **成本**：引入时间维度会波及 scene controller、布局、窗口移动与状态快照；测试面新增"时间可控的动画测试"。
- **风险**：
  - 每帧对多张卡片 `SetWindowPos` 的开销（`maxVisible` 默认上限很高）
  - 心跳与请求驱动语义的冲突（消息泵时机、状态重入）
  - 旧 `scene-state` 恢复文件里 ticker 卡片的静态位置如何过渡

## 未决问题（交给 Ticker 契约回答）

- 心跳由谁驱动、频率多少、能否暂停？
- 轨道分配由 Native 决定还是 JS 决定？（谁持有"当前有哪些卡片"的真相，谁就该定）
- `overlap=avoid` 时速度如何调整？
- 旧恢复文件中 ticker 卡片的静态位置如何过渡到运动态？
- `controller.cpp:699` 的 `minimal` 分支：保留为旧状态兼容，还是收敛为 `stack`？

## 取代关系

本 ADR **部分取代** ADR-002 的「明确不做」条款：

- 第 1 条（不实现 ticker/popup 真实 Native 行为）——**解除**，改为按 master plan §5 顺序逐个交付。
- 其余条款（不新增卡片种类、不改声音/记录/协议/生命周期、不删数据字段）**继续有效**。
