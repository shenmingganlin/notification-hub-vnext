# Visual Runtime Acceptance Matrix

## Scope

本矩阵用于 takeover 从 Node/Runtime contract 进入真实 Native/Hana 验收前的最后一道门禁。当前 takeover 只接管行为决策；Native 仍负责渲染、Shelf eviction 和最终 dismiss。

## 已由自动化验证

| 场景 | 验收点 | 状态 |
|---|---|---|
| 默认模式 | 无配置保持 legacy | PASS |
| Shadow 门禁 | 只有显式 shadow 开关才旁路运行 | PASS |
| Takeover 门禁 | enabled + operator-approved 双门禁 | PASS |
| Takeover 成功 | scene.create 只走一次 | PASS |
| Native create 失败 | rollback 到 legacy，最终通知 shown | PASS |
| 策略不支持 | 不发起 takeover Native 请求，legacy 只创建一次 | PASS |
| 声音解耦 | 成功/两类 fallback 均只调用一次 sound scheduler | PASS |
| queue | dismiss/reclaim 后按顺序 promote | PASS |
| drop-oldest | 保留新卡并记录 suppressed | PASS |
| 多通道 | 一个通道的 close/reclaim 不改变另一通道 | PASS |
| rollback reclaim | Runtime 不残留 takeover-owned card | PASS |

## 必须在真实 Native/Hana 环境验证

| 场景 | 观察项 | 通过条件 |
|---|---|---|
| takeover create | Native 实际窗口/卡片 | 卡片可见，内容、视觉 Profile、通道身份正确 |
| Stack allow | 连续 3 张卡 | 可见数量和 Runtime projection 一致 |
| Stack queue | 超过 maxVisible | 排队顺序与 promote 顺序一致 |
| Stack drop-oldest | 超过容量 | Native 被 dismiss 的卡与 Runtime 淘汰卡一致 |
| Shelf eviction | Native 自主淘汰 | 不产生 Runtime 残留或重复 dismiss |
| Native dismiss | 用户关闭/超时关闭 | Runtime card 进入 close → reclaim，队列正确 promote |
| 多通道 | tool/chat/system 并行 | 一个通道 layout、eviction、dismiss 不影响其它通道 |
| Native failure | 断开或拒绝 scene.create | 回到 legacy；不重复声音、不重复入库 |
| plugin unload | 插件卸载/重载 | timer、subscription、Runtime card 显式清理 |

## 禁止宣称已通过的事项

- 仅凭 Node fake adapter 宣称真实视觉通过。
- 仅凭 ChannelRuntime metrics 宣称 Native Shelf eviction 一致。
- 将 behavior takeover 描述成完整 Native layout takeover。
- 在真实环境失败时自动扩大策略支持范围。

## 现场记录要求

每个场景记录：

```text
mode
requestedMode
config gate result
Native request sequence
Native scene card ids
Runtime channel snapshots
scene.dismiss sequence
sound scheduler count
notification status
rollback code
```

不得记录：

```text
绝对路径
原始 payload 全量
stdout/stderr
堆栈
声明原文
```
