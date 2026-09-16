# 词表清洗 + 通道规约户口（后端改革）

> **For agentic workers:** 分步提交。每步先红测试，再最小实现。改名必须全仓检索，禁止局部替换。不要打 zip，除非甘霖点名。不要实现 PID / 路径飞法 / 淡入。

- 日期：2026-09-16
- 对照：ADR-005；本计划落地后写 ADR-006
- 产品版本：完成后升 **0.1.8**（口述「1.8」，沿用 0.1.x，不跳到 1.8.0）
- 基线：现行代码是 0.1.7 开线后的工作区；Git `HEAD` 仍是 `29480dc`（0.1.6）

## 目标

1. 后端不再用「行为 / behavior」当万金油。词各司其职，全仓一致。
2. 通道规约独立户口。方案不再私藏公路法。配置包不带规约。
3. 修掉 Native「最后一张卡覆盖整池」。弹幕方向改读这张卡。
4. 为 PID 只留插座：堆叠规约 `settle: "snap"`。不写控制器。
5. 声音、通知中心、诊断、scene-state、协议快照一起审计，禁止改了一处、另一处还握旧名。
6. 错误码带字段与期望值，方便找 bug。

## 明确不做

- PID 跟随、函数路径池、淡入淡出、突脸
- 工作室 A 排版（上通道下卡片）——后端先改户口；DOM/文案另刀，和拾光一起
- 同轨净空语义、货架 8 张钳、0.1.6 冻结包
- 把 **事件表现通道**（`behavior-channel.js`，用户可命名的通知路由单元）和 **飞法通道**（堆叠/弹幕池）混成一个词

## 现状（2026-09-16 锁定）

### 设定（已拍板）

| 项 | 决定 |
|---|---|
| 判据 | 会共同影响、要统筹 → 通道规约。能独自跑、不改别人 → 卡片动态/寿命 |
| 工作室结构 | A：上通道、下卡片。本计划后端先做，UI 后做 |
| 配置包 | 门票 + 动态 + 寿命 + 卡面 + 素材。**不含通道规约** |
| 弹幕方向 | 卡片动态。每张卡可不同 |
| 点穿 | 平动弹幕规约 |
| 同轨净空 | 留下，只约束平动进场，语义不动 |
| 函数路径 | **以后新飞法、新池**。不挂现行 ticker |
| 淡入淡出 | 以后特效。只改单卡透明度，不占槽 |
| PID | 不实现。堆叠规约只留 `settle: "snap"` |
| 命名 | 交给本计划词表，不再用用户随口的「行为」 |

### 真洞（不是改名）

Native `rebuild_behavior_channels` 把最后一张带 `ticker_specified` 的卡的带子、轨、净空、**方向**写进整池。后进的卡能改公路。

通道法律现在寄居在视觉方案的 `properties.space` + 顶层 `ticker`，又随每张卡 visual 再下发一次。

### 两套「通道」，禁止一锅端

| 现行代码 | 实际是什么 | 改革后名字 |
|---|---|---|
| `plugin/domain/behavior-channel.js`、`DEFAULT_BEHAVIOR_CHANNEL_ID` | 用户可命名的**事件表现路由**（通知进哪条业务通道） | **事件巷** `eventLane` |
| `visual.event.stack` / `visual.event.ticker`、Native `BehaviorChannelState` | 一种飞法一个池 | **飞法通道** `flightChannel` |
| `profile.behaviorId` | 进哪座池的门票 | **飞法** `flight` |
| `createBehaviorProfile` / `BEHAVIOR_MODES` | 飞法枚举 + 过期的 duration/maxVisible | 拆进 `flight` + 规约；删万金油 profile |
| 顶层 `ticker` 一整团 | 规约和动态混装 | `TickerCharter` + `TickerMotion` |
| `properties.space` 里的停靠/缝 | 堆叠规约寄居方案 | `StackCharter` |
| `properties.lifecycle` / `interaction` | 这张卡的寿命 | `CardLife` |
| 卡面零件树 | 已是脸 | `CardFace`（可保持现有 parts API，内部注释对齐） |

声音链路与视觉独立（ADR-001）。清洗时只改它自己的含糊词，不把飞法词表塞进音频。

## 规范词表（后端以此为准）

中文用于设定与错误文案；英文用于类名、字段、协议新键。

| 中文 | 英文 | 一句话 | 禁止再叫 |
|---|---|---|---|
| 飞法 | `flight` | 进哪座池：`stack` / `ticker`（`path` / `popup` 以后） | behavior、mode、出现方式（代码里） |
| 飞法通道 | `flightChannel` | 一座池，id 如 `visual.event.stack` | behaviorChannel（内部） |
| 规约 | `charter` | 全池一份法律 | properties.ticker 整包、space 当通道 |
| 堆叠规约 | `StackCharter` | 停靠、往哪长、开新行、走线、边距、缝；`settle` | |
| 弹幕规约 | `TickerCharter` | 带、轨、异轨间距、同轨净空、满轨、点穿 | |
| 动态 | `motion` | 这张卡怎么动：速度、方向、速度随机 | ticker 整包 |
| 寿命 | `life` | 关闭、停留、超时、悬停加亮/暂停 | interaction 万金油（可迁） |
| 卡面 | `face` | 零件树和皮 | cardType 当飞法 |
| 特效 | `effect` | 单卡透明度等，本刀不接 | |
| 事件巷 | `eventLane` | 通知中心/表现路由的用户通道 | 与飞法通道混称 channel |
| 门票 | `flight` 写在方案上 | 方案选择飞法，不私藏规约 | |
| 落点策略 | `settle` | 现仅 `snap`；以后 `follow` = PID | pid、Kp |

协议 / 恢复快照：继续吃旧键 `behavior`、`behaviorProfileId`、`behaviorChannelId`，对内投影到新名。新写入优先新键。删除旧键另开刀，不塞进 0.1.8。

Native 新字段只垫结构体末尾。能改归属的就改归属，不靠加 PID 字段充数。

## Git

仓库已在：`D:\快捷访问\OH-WorkSpace\notification-hub-upgrade`，分支 `main`。

工作区相对 0.1.6 有大量未提交（约 99 改 + 44 未跟踪），即 0.1.7 零件/弹幕方向/堆叠走线等。

步骤：

1. 确认 `.gitignore` 仍排除 `node_modules/`、`build/`、`dist/`、根上 `visual-assets.json` 等
2. 把 **0.1.7 工作区**收成一次提交：`chore: snapshot 0.1.7 before lexicon reform`（回滚点 A）
3. 开分支 `reform/0.1.8-lexicon`（回滚点 A 可切回）
4. 改革每完成一个 Phase 就提交一次，信息用 `refactor:` / `fix:` / `test:`
5. 全绿且甘霖点头后再合回 `main`，改 VERSION → 0.1.8

不要 `reset --hard`。回滚用 `git revert` 或切回分支。

## 施工顺序（分多次）

每步结束：相关 Node 测试绿；涉及 Native 则 `ctest`/自检绿；全仓 `rg` 确认本步负责的旧词只剩兼容别名层。

### Phase 0 — 回滚点

- [ ] 提交 0.1.7 快照
- [ ] 开 `reform/0.1.8-lexicon`
- [ ] 本计划与 `CURRENT-STATUS.md`、计划索引已指向这份文件（本步）

### Phase 1 — ADR-006 + 检索清单

- [ ] 写 `docs/adr/ADR-006-flight-channel-charter.md`
- [ ] 产出旧词检索表（`behaviorId`、`behaviorProfileId`、`behaviorChannelId`、`BEHAVIOR_`、`ticker.` 混装字段），按文件归到：飞法 / 事件巷 / 兼容别名 / 待删
- [ ] 事件巷改名方案写入 ADR，避免和飞法通道抢 `channel`

### Phase 2 — 户口（观感不变，权威搬家）

- [ ] `visual-settings` 增加本机 `channels.stack` / `channels.ticker`（规约）
- [ ] 方案去掉作为权威的停靠/带子；迁移：从现用方案抄一份规约
- [ ] 配置包导入导出 **丢弃** 规约
- [ ] `scene.set-mode` 只发堆叠规约；弹幕规约走通道写入，不再靠卡 visual 覆盖
- [ ] Native：通道规约不从最后一张卡重建；卡只贡献 `TickerMotion`（速度、方向）
- [ ] 同轨净空、点穿、满轨仍在 `TickerCharter`
- [ ] 错误：规约校验失败写 `CHARTER_*`，动态校验写 `MOTION_*`，带 field / expected / actual

验收：两张弹幕不同方向/速度可并存；后进的卡不能改带子和净空。

### Phase 3 — 领域名（内部大改）

- [ ] JS：`flight`、`flightChannel`、`StackCharter`、`TickerCharter`、`TickerMotion`、`CardLife`
- [ ] C++：对齐类名；`BehaviorChannelState` → `FlightChannelState`（协议 JSON 旧键仍解析）
- [ ] `notification-behavior.js` 不再身兼飞法枚举 + 寿命 + 容量
- [ ] `visual-event-native-behavior.js` 改名并改导出；全仓 import 一起改
- [ ] 测试、诊断、scene-state、recovery-snapshot、protocol schema 同步
- [ ] 薄兼容：读旧键，写新键，日志若仍收到旧键记 `LEXICON_ALIAS_USED`

### Phase 4 — 事件巷、声音、通知中心

- [ ] `behavior-channel.js` → 事件巷领域名（建议文件 `event-lane.js`），通知中心/设置页引用一次改完
- [ ] 声音：检索 `behavior`/`channel`/`mode`；只改与飞法撞名的符号，不改音频语义
- [ ] 通知中心列表/筛选若展示「行为」且实为飞法或事件巷，文案与字段对齐
- [ ] 诊断码凡含 `VISUAL_BEHAVIOR_*` 的，新码并行，旧码映射一段时间

### Phase 5 — 插座 + 版本

- [ ] `StackCharter.settle = "snap"`（未知值拒绝，错误码 `CHARTER_SETTLE_UNSUPPORTED`）
- [ ] 不实现 follow
- [ ] `VERSION` / `plugin/version.js` / `manifest.json` → `0.1.8`
- [ ] 全量 Node + Native 自检
- [ ] 更新 `CURRENT-STATUS.md` 与计划索引

## 错误日志规范（本改革起）

每条可机器读：

- `code`：前缀 `FLIGHT_` / `CHARTER_` / `MOTION_` / `LIFE_` / `FACE_` / `LANE_` / `LEXICON_`
- `field`：点分路径，如 `channels.ticker.minGapPx`
- `expected` / `actual`（能给就给）
- Native 与 JS 同一套码，禁止一边 `VISUAL_BEHAVIOR_LAYOUT_FAILED` 一边 `stack failed`

通道写入失败不得 silently 回退到最后一张卡的 visual。

## 风险

- **漏改 import**：Phase 3 必须 `rg` 旧符号，零业务命中（别名层除外）
- **事件巷被误伤**：Phase 1 清单先分类再改
- **协议旧 Runtime**：别名层保留到下一主版本
- **工作区未提交**：Phase 0 不做，后面无法干净回滚

## 下一步（计划同步完成后）

1. Phase 0：0.1.7 快照提交 + 开分支（需甘霖允许把当前工作区打成 commit）
2. Phase 1：ADR-006 + 全仓旧词清单
3. 再按 Phase 2 起派工，JS 与 Native 分开短简报
