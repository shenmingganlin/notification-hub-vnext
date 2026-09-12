# Notification Hub vNext

Notification Hub vNext is a Windows notification scene system for HanaAgent.

## Direction

- Node.js plugin domain manages notification semantics, policies, state, pages, widgets, diagnostics, and migration.
- C++20 Native Scene Runtime manages native windows, layout, physics, interaction, rendering, particles, DPI, and GPU composition.
- The two processes communicate through a versioned JSON protocol over Windows Named Pipe.
- `legacy-reference/notification-hub-0.2.1` is retained for behavior comparison and migration only; it is never included in the vNext release package.

## Current status

Current stable baseline: `0.1.5`.

The project has completed the repository foundation, protocol and diagnostic contracts, the main Native Runtime lifecycle/configuration closure, and the core notification data path. Alpha.8 has passed real Hana validation for stable card creation, one-click-one-card dismissal, and remaining-card layout reflow.

The current product work is Windows-first and remains focused on the Notification Center and page structure. The confirmed direction is: image-based top-level navigation cards, a default Notification Center page, independent settings-domain pages, a complete notification list with compact per-card summaries, and full details on demand. The sidebar remains a lightweight quick-control surface; detailed configuration and diagnostics belong to pages.

The vNext plugin owns its Hana `onload/onunload` lifecycle, launches only the bundled Native Runtime, and persists SceneState below its own `dataDir`.

Authoritative documentation:

`VERSION` is the canonical release version. Package metadata, the plugin manifest, CMake Runtime metadata, protocol hello defaults, and release audits must match it. Historical diagnostic JSON files may contain older observed versions and are excluded from current release checks; they are not edited.

- `notification-hub-vnext-plan.md`: the only complete project plan.
- `CURRENT-STATUS.md`: current implementation status and reproducible acceptance evidence.
- `SIDEBAR-PAGE-PRODUCT-PLAN.md`: sidebar/page product responsibilities and sequence.
- `FRONTEND-DESIGN-GUIDELINES.md`: frontend information architecture and visual/layout rules.

## Repository layout

- `plugin/`: Node.js plugin domain and surface adapters
- `runtime/`: C++ Native Scene Runtime
- `schemas/`: versioned protocol and domain schemas
- `tests/`: unit, protocol, fault-injection, performance, and window regression tests
- `docs/`: architecture and engineering documentation
- `legacy-reference/`: isolated legacy source and behavior reference

## Development prerequisites

- Windows 10/11
- Node.js >= 18
- npm
- Visual Studio Community 2026 with the Desktop development with C++ workload
- CMake and CTest from the Visual Studio 2026 installation
- Windows 10/11 SDK

Use a Visual Studio 2026 Developer Command Prompt or Developer PowerShell when building native code. This supplies the matching MSVC and Windows SDK environment without manually adding compiler internals to the system PATH.

## Commands

```powershell
npm run check
npm test

# Run silent, machine-readable sound pressure scenarios. These use fake players and do not emit real audio.
npm run pressure -- --scenario eager --count 1000
npm run pressure -- --scenario duplicate --count 1000
npm run pressure -- --scenario failures --count 300
npm run pressure -- --scenario mute --count 500
npm run pressure -- --scenario all

cmake --preset debug-vs2026
cmake --build --preset debug-vs2026
ctest --preset debug-vs2026

# Build an installable ZIP for manual drag-and-drop installation in Hana.
# The ZIP contains manifest.json at its root and the Release Runtime below runtime/.
& pwsh -NoProfile -Command '& .\\scripts\\package-release.ps1 -Configuration Release'
# Explicit artifact paths are also supported and must come from one current build output directory.
& pwsh -NoProfile -Command '& .\\scripts\\package-release.ps1 -RuntimePath .\\build\\debug-vs2026\\runtime\\Release\\notification-hub-runtime.exe -AudioEnginePath .\\build\\debug-vs2026\\runtime\\Release\\notification-hub-audio-engine.exe'
```

## Hana 真实事件与压力测试

当前桌面会话中的声音配置“助手回复完成”来自 Hana `message_end` 事件，表示一轮助手回复完成，不等于下一轮用户消息。频道新消息、工具完成、工具失败、超时和系统警告是独立测试语义。

在启用 full-access 插件工具后，Hana 有两条明确的验收入口，不能混用：

- 工具：`notification-hub-vnext_notification-hub-run-test`，验证工具入口。
- 命令：`/notification-hub-vnext_notification-hub-run-test`，验证斜杠命令入口。

两条入口都会通过同一个受控 EventBus capability 进入 Notification Hub，但每条生成记录都会在 `metadata.testEntryPoint` 和返回摘要的 `entryPoint` 中标明 `tool` 或 `command`。它们是插件验收入口，不伪造 Hana Pi 的 `tool_execution_end`；真实宿主工具事件仍需通过真实 Agent session 验收。

旧的动态工具 `run-notification-test` 保留兼容，但不再作为区分工具与命令的证据。参数限制为最多 100 条、间隔 0～5000ms，并支持：

```json
{
  "count": 10,
  "intervalMs": 100,
  "events": ["chat_message", "channel_message", "tool_completed", "tool_error", "timeout", "system_warning"],
  "createCards": true,
  "playSound": true,
  "label": "多事件声音压力测试"
}
```

每张测试通知都会标注 `[压力测试]`、事件名称、序号、总数和语义说明，不伪装成普通业务通知。`createCards:false` 只写入通知并可选择播放声音；`playSound:false` 不调用声音调度器。动态工具执行结果遵循 Hana 工具返回契约：可读摘要位于 `content[0].text`，完整结构化结果位于 `details`，避免宿主把普通 JavaScript 对象显示为 `[object Object]`。真实设备压力建议从 6～10 条开始，不要直接把 CLI 的 1000 条吞吐测试改成真实声音。

## 模型服务异常类别

Notification Hub 将明确的 `model_service_error` 事件归入用户类别“模型服务异常”。该类别同时投影到 Notification Center 的“系统”和“错误”筛选，但内部只保留一个 `model_service` 策略身份，429、502、503 等 HTTP 状态只作为诊断技术字段。

内部 API 接缝为 `notificationApi.ingestModelServiceError(input)`。安全 metadata 仅保留 `httpStatus`、`provider`、`model`、`operation`、`taskKey`、`retryable`、`retryAfterMs`、`attempt` 和受控 `incidentKey`，不会写入 API Key、Authorization、完整 prompt 或 Provider 原始响应。连续错误按 `provider + model + operation + task/session scope` 形成事故键；缺少 scope 时使用 `unknown-scope`，不能据此证明不同后台任务属于同一事故。

事件适配器除明确的 `model_service_error` 外，还接受带模型服务边界证据的 `message_end` 或普通 `error`：例如 Provider/Model/operation 上下文与结构化 HTTP 错误组合，或明确的模型服务来源标记。裸 HTTP 状态、裸 `Service temporarily unavailable`、裸“操作未能完成”以及无模型服务证据的失败回复不会被猜测为模型服务异常。Hana 当前具体广播字段是否稳定，仍需现场诊断证据确认，日志不能作为生产事件源。

## 外部调用分类与工具事件

外部插件主动通过公共 Notification API 产生的通知使用 canonical 分类 `external_call`，页面显示为“外部调用”。旧配置和旧查询中的 `plugin` 分类仍作为兼容别名读取，并在规范化时迁移为 `external_call`；这条分类能力保留给视觉、模式之后的外部插件 API 阶段。

Hana 当前调用桌面控制等插件时，宿主已经将它呈现为普通工具事件。因此 Notification Center 不再提供独立的“插件”事件筛选，声音设置也不再提供“插件”事件选项。相关通知统一使用“工具”“执行完成”“执行失败”等已有工具语义；普通工具事件不会被猜测成插件专用事件。

Notification Center 仍保留两排筛选：第一排按分类，第二排按通用事件。分类“外部调用”用于未来外部插件主动产生的 API 通知；事件排只保留助手回复、工具、超时和错误等通用事件。声音规则继续支持 `external_call` 分类，旧声音 profile 中的 `category: plugin` 会在读取和规范化时迁移为 `external_call`。

视觉 profile、视觉 resolver 和 Runtime visual payload 本轮保持不变，视觉兼容通过 presentation 边界维持；外部插件 API 将在视觉和模式阶段之后单独接入。

## 声音实验台与规则解释

声音设置页提供“声音实验台”和“声音规则解释”两个受控入口。实验台只选择要模拟的通知组合、次数和间隔，不选择声音；具体声音完全由上方已保存的组合规则决定。实验台的分类、事件和普通/重要选项集合与上方配置一致，但选择状态独立，也不会修改上方配置。它使用正式的声音策略、调度器、Windows 播放后端和诊断链路，但不会写入通知历史；全局静音仍然绝对生效。实验请求只等待调度启动，播放完成或失败由正式诊断链路异步记录，不会被整段音频时长阻塞。规则解释读取正式 resolver 的最终决策，展示命中方式、规则 ID、声音、分层音量、重复抑制、调度和播放结果，不在页面端重新猜测规则，也不展示音频路径、原始正文或敏感数据。


The repository preset targets the confirmed `Visual Studio 18 2026` x64 generator.

## Audio formats

The resident Audio Engine decodes and mixes these formats on Windows through Media Foundation:

```text
.wav  PCM WAV (including 16-bit and 24-bit PCM)
.mp3  MP3
.m4a  AAC-LC in an MP4/M4A container
.aac  AAC/ADTS
.wma  WMA
```

Compressed audio is decoded to float32 PCM and then follows the same AssetCache, Mixer, independent voice, and WASAPI path as WAV. The current matrix has been verified with real Hana playback for WAV, MP3, M4A, AAC, and WMA samples. Unsupported or damaged media remains diagnostic-only and may use the legacy Windows fallback; audio failure must not block notification delivery, settings persistence, or plugin shutdown. Support for unusual codecs and system-specific Media Foundation extensions remains conditional on the codecs installed on Windows.

## vNext and legacy isolation

The vNext package uses the plugin ID `notification-hub-vnext`. Its Native Runtime is loaded from the installed vNext plugin directory, its SceneState and recovery files use the vNext `dataDir`, and each host instance uses a `notification-hub-vnext-*` Named Pipe. The package does not contain the legacy plugin, legacy helper, or legacy data files. Installing it by dragging the generated ZIP into Hana therefore leaves the existing `notification-hub` plugin untouched; both plugins may run concurrently.

## Version

Current stable version: `0.1.5`

## License

MIT. See [LICENSE](./LICENSE).
