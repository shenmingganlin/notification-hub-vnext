# Native Runtime 验收运行记录

日期：2026-08-19

## 环境

- Runtime：`build/debug-vs2026/runtime/Debug/notification-hub-runtime.exe`
- 二进制时间：2026-08-16 13:31:31 +08:00
- `cmake`：不可用
- `msbuild`：不可用
- `ctest`：不可用

## 已通过

| 场景 | 结果 |
|---|---|
| Runtime `--self-test` | PASS |
| Named Pipe hello/health/reconnect/idempotency/scene 基础 smoke | PASS |
| Native scene changed / drag / close event | PASS |

## 旧 Debug 构建阻塞

| 场景 | 旧 Debug 结果 | 原因 |
|---|---|---|
| Native behavior-channel isolation | FAIL | `LAYOUT_SHELF_OUT_OF_BOUNDS`：ticker.main 两张 320px 卡在实际 work area 下超出宽度 |

静态源码显示 Native controller 已存在 ticker Shelf → vertical Stack fallback，但旧 Debug 二进制时间为 2026-08-16，未包含该路径或未使用同一构建产物。

## Release 构建复测

使用：

```text
build/debug-vs2026/runtime/Release/notification-hub-runtime.exe
```

结果：

| 场景 | 结果 |
|---|---|
| `--self-test` | PASS |
| `--visual-self-test` | PASS |
| `--desktop-visual-self-test` | PASS |
| Named Pipe hello/health/reconnect/idempotency/scene | PASS |
| Native behavior-channel isolation | PASS |
| Native drag/close scene.changed | PASS |

因此本次 behavior-channel layout 阻塞已由 Release 构建复测解除；旧 Debug 构建仍不可作为验收依据。

## Takeover Plugin + Release Native E2E

使用显式配置：

```text
visualRuntimeMode=takeover
visualRuntimeTakeoverEnabled=true
visualRuntimeTakeoverDeclaration=operator-approved
```

结果：

| 场景 | 结果 |
|---|---|
| 缺少 takeover enabled 时保持 legacy | PASS |
| 显式双门禁后 Plugin mode=takeover | PASS |
| Plugin → Release Native scene.create | PASS |
| Native card behaviorProfileId=stack | PASS |
| Native card behaviorChannelId=stack.main | PASS |
| notification status=shown | PASS |
| Native scene.dismiss | PASS |
| takeover queue visible bound | PASS：Native 保持 1 张，第二张留在行为队列 |
| takeover drop-oldest visible bound | PASS：先 Native scene.dismiss 旧卡，再创建新卡；Native 可见数量保持 1 |

## 尚未执行

- Native Shelf eviction 与 ChannelRuntime projection 的对照
- Native dismiss 事件自动驱动 Plugin Runtime reclaim 的完整对照：当前 FAIL/BLOCKED；通过 Named Pipe `scene.dismiss` 请求删除卡片后，Release Runtime 没有向 Plugin 转发 `scene.changed` 事件，Plugin 状态仍为 shown，queued card 也未自动 promote。需要区分“程序化 dismiss ACK”与“用户/窗口自主 dismiss event”，并补 Native event 或在请求型 dismiss 成功后显式 reconcile。
- takeover failure rollback 的真实 Native 断链验证
- plugin unload/reload 现场验证
