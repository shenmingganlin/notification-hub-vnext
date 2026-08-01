# Layout State Convergence and Shared Engine Plan

**Goal:** 让 Runtime Scene 对当前布局模式拥有单一权威状态，并把 stack/shelf 的线性几何计算收敛到同一个内部模块。

## Scope

- 保持 `scene.set-mode` 协议字段兼容。
- 保持 `layout_stack(...)` 与 `layout_shelf(...)` 公共函数兼容。
- Runtime 成功应用布局后保存最后一次有效布局参数、模式和有效工作区快照。
- ACK/health 回显当前布局状态；布局失败时不覆盖上一份有效状态。
- stack/shelf 共享验证、DPI 缩放、容量判断和矩形计算。

## Explicit non-goals

- 不新增滚动、换行、动画或多显示器拓扑。
- 不改变 Node recovery 的 replay 顺序；同一个 recovery key 由最后一次写入覆盖，不同 key 按 entries 顺序重放，最后一次成功的 `scene.set-mode` 建立 Runtime 状态。
- `SceneState` 快照契约已独立建立，但本阶段不替换 command replay；持久化迁移需另行定义版本与兼容策略。
- 不改变 fixed card order 契约。

## Vertical slices

1. **Shared math:** 已完成。抽出内部线性布局计算，保留两层公共包装函数和既有错误码。
2. **Runtime state:** 已完成。增加 active layout snapshot，成功应用后更新，ACK/health 序列化 `layout`；窗口应用全部成功前不更新状态。
3. **Behavior tests:** 已完成。覆盖 stack→shelf 切换、重复应用、health 回显和失败后状态不变。
4. **Verification:** 已完成。Node check/test、VS2026 build、18/18 CTest、diff check 已通过。
