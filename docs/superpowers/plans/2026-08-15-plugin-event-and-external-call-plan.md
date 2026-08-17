# 外部调用分类与工具事件收缩实施计划

> 本计划记录 2026-08-15 对通知分类语义的收缩调整；不执行 Git commit。

## 目标

保留未来外部插件主动调用 Notification API 时使用的 canonical 分类 `external_call`，同时根据真实 Hana 界面证据删除“插件使用”专用事件。Hana 当前调用桌面控制等插件时统一按普通工具事件处理。

## 已确认的产品边界

- `external_call` 是未来外部插件公共 Notification API 的分类，保留到视觉、模式之后的公共 API 阶段。
- Hana 内部工具调用的用户语义是“工具”“执行完成”“执行失败”，不再创建 `plugin_use` 通知。
- Notification Center 不提供独立“插件”事件筛选。
- 声音配置和声音实验台不提供“插件”事件选项。
- 普通工具事件不得被猜测成插件事件。
- 旧分类输入 `plugin` 仍兼容迁移为 `external_call`，新页面和新输出使用 `external_call`。
- 视觉 profile、视觉 resolver、视觉页面和 Runtime visual payload 本轮不修改；presentation 层继续维持现有视觉兼容边界。
- 不执行 Git commit。

## 实施范围

### 1. 删除插件专用事件链

移除以下内部事件及其专用逻辑：

```text
plugin_use
plugin_call_start
plugin_execution_start
extension_start
```

包括：

- EventClassifier 专用规则。
- Event Adapter 插件事件识别、字段规范化和通知入库分支。
- Notification classification 的插件事件投影。
- Notification Center 的“插件”事件按钮和前端状态。
- 声音 binding、页面和实验台中的“插件”事件选项。
- 仅验证插件专用通知的回归测试和过时文档描述。

工具链保持：

```text
tool_execution_start：只缓存必要上下文，不单独入库
tool_execution_end + isError=false：工具执行完成
tool_execution_end + isError=true：工具执行失败
```

### 2. 保留外部调用分类

保留并继续测试：

- `NOTIFICATION_CATEGORY_LABELS` 中的 `external_call`。
- API producer 投影到 `external_call`。
- 分类筛选 `external_call`。
- 声音 Profile、resolver 和规则 target 对 `external_call` 的支持。
- 旧声音 profile、旧分类查询和旧绑定输入中的 `plugin → external_call` 迁移。
- 未来外部插件公共 Notification API 的产品路线文档。

### 3. 通用事件筛选

保留独立事件筛选机制，但事件集合只包含当前通用语义：

```text
assistant_reply
tool
error
timeout
model_service_error
```

分类筛选和事件筛选仍然使用独立查询维度，`category=external_call` 与通用 `event` 可以组合使用。

## 验证门

- 定向测试确认插件专用事件不再被分类、适配、筛选或配置页面接受。
- 定向测试确认工具结果和工具失败仍正常入库、分类和触发声音。
- 定向测试确认外部插件 API producer 仍投影为 `external_call`。
- 全量 Node 测试通过，允许既有 Runtime 路径跳过项。
- `npm run check` 通过。
- `npm run pressure -- --scenario all --count 1000` 通过。
- `git diff --check` 通过。
- 重新打包并交付 ZIP，不执行 Git commit。
