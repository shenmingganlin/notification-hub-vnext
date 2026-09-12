# Notification Hub 计划索引

> 更新时间：2026-08-18
>
> 这份索引是工作台计划的入口。历史计划保留用于追溯，不应脱离当前主计划直接继续实现。

## 当前唯一主计划

### 视觉系统总计划

`2026-08-18-visual-system-master-plan.md`

这是当前视觉产品与工程实现的唯一主计划，覆盖：

```text
Card Runtime 基础
行为通道
卡片行为
卡片种类
卡片属性
皮肤
特效与粒子
视觉素材库
视觉配置包
配置包管理区
“应用于事件”
已自定义事件
导入导出
诊断系统
性能与验收门禁
```

当前执行顺序：

```text
契约冻结
  ↓
Card Runtime 基础
  ↓
Stack（一次只做一个行为）
  ↓
Visual Profile 与事件绑定
  ↓
配置包导入导出
  ↓
视觉素材库
  ↓
卡片种类与属性编辑器
  ↓
Ticker / Popup / Aggregate / Replace / Pin / Follow / Scene
  ↓
Skin
  ↓
Effects 与粒子
  ↓
配置包管理区与诊断中心
```

## 当前工程状态

已完成并冻结：

- Audio Engine 作为唯一生产原生音频服务。
- 音频重复抑制使用真实 `durationMs`，声音链路与视觉链路独立。
- Card Runtime policy、并行 channel 管理、极简卡片基础设置和视觉事件表现页面已落地。
- 行为通道已经是用户可自由命名的行为单元，不按工具、回复、错误硬编码。
- `behavior-channel.js` 已建立用户自定义 channel 的基础领域契约，旧 channel ID 保持兼容。
- 全量 Node 基线：712 项，699 通过，0 失败，13 跳过；JavaScript 语法检查 236 个文件通过。

## 历史计划：继续保留，但不再作为当前实施入口

| 计划 | 状态 | 说明 |
|---|---|---|
| `2026-08-18-visual-card-runtime-foundation.md` | 已完成/已吸收 | Card Runtime policy、并行 channel、极简卡片样板已吸收到主计划；后续行为实现按主计划逐个推进。 |
| `2026-08-18-visual-production-baseline.md` | 基线记录 | 只记录 Audio Engine 与发布包冻结状态，不承担视觉路线。 |
| `2026-08-16-effect-rule-editor.md` | 已完成/局部能力 | 规则编辑器能力保留；后续“配置包 → 应用于事件”模型以主计划为准。 |
| `2026-08-16-notification-event-presentation-refactor.md` | 历史架构计划 | 事件身份、声音/视觉/行为独立绑定的决定已吸收到主计划；不要恢复旧的业务分类 channel 设计。 |
| `2026-08-15-alpha16-card-behavior-visual.md` | 已完成/历史实现 | 极简卡片与受控 visual payload 已落地；未完成项按主计划重新排序。 |
| `2026-08-13-phase-4-visual-strategy.md` | 已完成/历史策略 | 旧的 category/preset/intensity 视觉策略是兼容层，不是未来视觉系统的最终模型。 |
| `2026-08-13-settings-shell.md` | 已完成/基础设施 | 设置 Shell 保留；视觉编辑器与配置包管理区以主计划为准。 |

## 计划维护规则

1. 新的视觉设计、字段、页面、测试和实施顺序只写入主计划；必要时再拆出带日期的子计划。
2. 子计划必须在文件头写明其属于主计划的哪个 Phase，并在完成后回链主计划。
3. 历史计划不删除，避免丢失决策和验证证据；如果与主计划冲突，主计划优先。
4. 任何“已完成”必须有测试、构建或真实宿主证据；仅有设计讨论不得标记为完成。
5. 视觉配置导入导出不得携带代码；视觉失败不得阻塞声音、通知记录或插件生命周期。
6. 修改计划后同步更新 `CURRENT-STATUS.md`，记录当前阶段、验证基线和下一步。
