# Notification Hub 事件语义说明

## 当前已确认

| 用户层名称 | 真实事件入口 | 当前通知语义 | 声音测试备注 |
|---|---|---|---|
| 聊天：助手回复完成 | `message_end`，`message.role=assistant`，完成停止原因 | 当前桌面会话一轮助手回复完成 | 不是下一轮用户消息；连续对话每轮都应有唯一消息事件 ID，不能用 sessionPath 当 traceId |
| 频道收到消息 | `channel_new_message` | 外部频道收到一条消息 | 可单独测试频道声音，不应回退为桌面聊天 |
| 工具执行完成 | `tool_execution_end`，`isError=false` | 工具结果完成 | 不代表助手回复完成 |
| 工具执行失败 | `tool_execution_end`，`isError=true` | 工具失败 | 走错误分类和重要声音 |
| 系统警告 | `session_unhealthy_warning` / `session_branch_persistence_warning` | Runtime / 会话系统警告 | 走系统通知和重要声音 |

## 当前发现

声音设置页旧文案把聊天分类的 `arrived` 显示为“新消息”，但当前 EventBus 适配器对桌面聊天监听的是 `message_end`，并把通知类型设为 `assistant_message`、标题设为“助手回复完成”。因此页面已改为“助手回复完成（当前事件）”，并明确说明它不等于下一轮用户消息。

## 连续对话的关键修复

EventBus 回调的 `sessionPath` 只是会话定位信息，不能作为每条消息的 `traceId`。如果事件本身没有 `eventId/messageId/id`，NotificationRecord 会生成自己的唯一 `notificationId` 和 `traceId`；适配器不能把同一个 sessionPath 写成每条事件的 traceId，否则通知去重可能把不同轮次误判成同一事件。

## 尚未确认

当前证据没有确认 Hana 是否向插件 EventBus 暴露了“用户新消息到达”这一独立事件。没有真实 payload 证据前，不新增或伪造 `chat_new_message` 生产事件。测试工具中的“聊天新消息”是明确标注的测试通知语义，用于验证分类和展示，不声称它来自真实 Hana EventBus。
