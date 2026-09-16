# ADR-001：采用常驻原生 Audio Engine

- 状态：Proposed
- 日期：2026-08-17
- 范围：Notification Hub 声音播放底层

## 背景

稳定版本使用 PowerShell/MCI/SoundPlayer 播放声音。当前代码在生产实例中以 `persistent: false` 创建后端，因此每次播放都会承担 PowerShell 进程冷启动，并且试听请求等待同步播放完成，造成约 1 秒的体感延迟。多个 PowerShell Helper 能提供有限并行，但会把音频并行建模为进程并行，成本和生命周期复杂度随并发增长。

## 决策

采用一个由插件生命周期管理的常驻原生 Audio Engine：

1. Audio Engine 只启动一次，并使用独立 Named Pipe；不得与 Notification Runtime 共用进程或 pipe。
2. Audio Engine 在 ready 前完成 WASAPI Shared Mode 设备初始化。
3. 声音在 load 阶段解码/转换为统一的 interleaved float32 PCM 并缓存；第一阶段只支持 16-bit PCM WAV 输入。
4. 每次 `audio.play` 创建独立 voice，由单个 Mixer 统一混音；不合并、不覆盖、不等待已有 voice。
5. `audio.play` 在 voice 被接受并加入引擎命令队列后立即返回 `accepted + voiceId`；播放完成通过异步事件报告。
6. Audio Engine 失败只能影响声音，不得阻塞通知展示、设置保存和插件主生命周期。
7. 上层声音规则、`soundId`、`eventId`、设置及 `.nhsound`/`.nhcombo` 语义保持不变。

## 协议边界

请求：

- `audio.health`
- `audio.load`
- `audio.unload`
- `audio.play`
- `audio.stop`
- `audio.stop_all`
- `audio.shutdown`

`audio.play` 返回：

```json
{"accepted":true,"voiceId":"voice-42"}
```

完成事件：

```json
{"eventType":"audio.voice_finished","payload":{"voiceId":"voice-42","soundId":"custom.alert","reason":"completed"}}
```

事件不是 `audio.play` 的同步完成信号。所有请求和事件保留 `requestId`/`traceId`/`timestamp`。

## 生命周期

```text
stopped → starting → ready → degraded → restarting → ready
                         └──────────────→ failed
ready → stopping → stopped
```

- `start()` 必须幂等并共享一个 start promise。
- 每个插件实例使用唯一 pipe 名；重启使用 generation guard，旧进程的 close/error 不能污染新进程。
- ready 超时、spawn 失败、Pipe 失败和服务提前退出必须保留 executablePath、exitCode、signal 和 stderr 摘要。
- `onunload` 的关闭顺序为：停止接受新播放、`stop_all`、`shutdown`、等待退出、超时才强制终止。

## 并发和资源边界

正常路径每个请求独立创建 voice，不能因为相同声音而合并。为防止异常输入耗尽资源，第一版设置显式的 `maxActiveVoices`、单资产最大 PCM 大小和总缓存上限；达到上限时返回明确错误，不静默丢弃或覆盖。

## 延迟口径

- T0：发送 play 前的 Node 高精度时间。
- T1：Node 收到 accepted。
- T2：引擎首次将该 voice 的有效帧写入 WASAPI buffer。
- T3：可选的设备 loopback 实际回采起始时间。

服务 ready 且资产已缓存时，目标为 T1-T0 p95 ≤ 20ms、T2-T0 p95 ≤ 50ms；T3 必须用回采测量，不能用 T2 冒充人耳延迟。

## 后果

### 正面

- 消除每次 PowerShell 冷启动。
- 设备只初始化一次。
- 多个声音在一个 mixer 内自然并行，进程数量固定。
- 播放请求可以立即返回，试听 UI 不必等待完整音频。

### 负面

- Audio Engine 成为声音系统单点故障，需要健康检查、设备失效诊断和重启策略。
- WASAPI 设备切换、PCM 缓存、混音削波和进程生命周期需要完整测试。
- MP3/M4A/AAC/WMA 需要后续 Media Foundation 解码，不纳入第一阶段。
- 真实 Hana 宿主的 pluginDir、安装路径和 onload/onunload 必须作为正式验收边界。

## 未决但有边界的问题

- 第一阶段使用稳定的 WASAPI Shared Mode buffer，不强求独占模式或极小 buffer；由实测决定后续调优。
- Media Foundation 解码作为后续独立阶段，不与引擎骨架和首次 PCM 验收混合。
- 输出跟随系统默认播放设备（`eRender` + `eConsole`）。默认设备变化或当前流失效时，引擎重开 WASAPI Shared 流，不另选私有设备。
