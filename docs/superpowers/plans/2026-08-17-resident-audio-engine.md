# Resident Audio Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变 Notification Hub 上层声音模型的前提下，建立一个由 Hana 插件生命周期管理的常驻原生音频引擎，实现低启动延迟、多个独立 voice 并行播放和统一混音。

**Architecture:** 插件只负责声音规则、资产注册、策略判断和 Audio Engine Host 生命周期；常驻 C++ Audio Engine 负责设备初始化、PCM 资产缓存、voice 管理和 WASAPI Shared Mode 混音。`audio.play` 采用异步语义：声音加入 mixer 后立即返回 `voiceId`，不等待播放结束；播放完成通过事件或内部诊断异步记录。

**Tech Stack:** Node.js ESM、现有 Named Pipe/JSON 协议、C++17、Windows WASAPI Shared Mode、16-bit PCM WAV；后续格式扩展使用 Media Foundation 解码为统一 PCM。

## Global Constraints

- 稳定回滚基线 `4ecbffd` 视为生产参照；任何实验不得覆盖或污染稳定交付路径。
- 第一阶段只支持 16-bit PCM WAV，不在同一阶段加入 MP3/M4A/AAC/WMA 解码。
- 保留 `soundId`、正式 `eventId`、声音规则、声音设置、试听、组合测试、`.nhsound`、`.nhcombo`、导入导出和删除语义。
- 一个播放请求对应一个独立 voice；正常路径不合并、不覆盖、不等待已有声音结束。
- 音频失败不得阻塞通知展示、设置保存或插件主生命周期。
- `audio.play` 只表示 voice 已接受并加入 mixer，不表示播放已完成。
- 必须验证真实 Hana 插件 `pluginDir`、onload/onunload、安装包路径和重复加载；裸客户端 smoke test 不能作为验收依据。
- 不执行 Git `reset`、`clean`、`push`；每个可交付阶段先建立可回滚提交。

---

## 文件结构与职责

### 第一阶段将创建的文件

- `plugin/domain/audio-engine-client.js`：面向 Node 的 Audio Engine 协议客户端；只负责请求、响应、事件和连接状态。
- `plugin/domain/audio-engine-host.js`：负责启动、ready、健康状态、崩溃检测、重启和关闭原生服务；不包含声音规则。优先复用现有 `RuntimeProcessManager` 的 generation、ready timeout、intentional stop 和 restart 语义，不复制一套不一致的进程状态机。
- `runtime/audio-engine/engine.hpp`：引擎生命周期和协议处理接口。
- `runtime/audio-engine/engine.cpp`：引擎主循环、请求分发和事件发送；音频渲染线程与 IPC 请求线程分离，任何 `audio.play` 都不能阻塞到 voice 完成。
- `runtime/audio-engine/asset-cache.hpp`：PCM 资产缓存接口。
- `runtime/audio-engine/asset-cache.cpp`：WAV 解析、统一 PCM 资产存储和卸载。
- `runtime/audio-engine/mixer.hpp`：voice 与混音接口。
- `runtime/audio-engine/mixer.cpp`：多 voice 混音、音量、结束回收和 limiter。
- `runtime/audio-engine/device-output.hpp`：WASAPI 输出接口。
- `runtime/audio-engine/device-output.cpp`：默认设备初始化、渲染线程和设备失效诊断。

### 第一阶段将修改的文件

- `plugin/index.js`：仅接入 Audio Engine Host 的创建、启动、关闭和诊断；不重写上层声音规则。
- `plugin/domain/audio-adapter.js`：将生产播放调用改为 Audio Engine 的异步 `load/play/stop` 语义；保留输入校验和资源边界。
- `plugin/domain/sound-scheduler.js`：保留重复策略语义，但播放调度不得等待完整音频；完成结果改为 accepted/failed。
- `plugin/protocol/index.js`：增加音频引擎请求类型和异步事件类型；协议沿用现有长度前缀 JSON frame，但 Audio Engine 使用独立 pipe 名称，不与 Notification Runtime 共用连接或请求序列。
- `runtime/CMakeLists.txt`：加入 `audio-engine` 目标及 WASAPI 依赖。
- `scripts/package-release.ps1`：仅在真实宿主级测试通过后加入引擎二进制。

### 测试文件

- `tests/node/audio-engine-client.test.mjs`：协议客户端请求、响应、事件和断线测试。
- `tests/node/audio-engine-host.test.mjs`：启动、ready、失败、重启、关闭和无残留测试。
- `tests/node/audio-adapter-engine.test.mjs`：上层 adapter 到异步 voice 的行为测试。
- `tests/native/audio-engine-mixer.test.cpp`：PCM 混音、并行 voice、音量和结束回收测试。
- `tests/native/audio-engine-host-smoke.test.ps1`：真实 EXE、Pipe、health 和 shutdown 验证。
- `tests/node/plugin-audio-engine-lifecycle.test.mjs`：模拟真实插件 onload/onunload 边界，随后补充实际宿主运行测试。

---

## Task 1: 冻结稳定基线并建立音频引擎实验边界

**Files:**
- Create: `docs/superpowers/plans/2026-08-17-resident-audio-engine.md`
- Create: `docs/adr/ADR-001-resident-audio-engine.md`

- [ ] **Step 1: 记录架构决策**

ADR 必须明确：单一常驻引擎、WASAPI Shared Mode、PCM 缓存、多 voice mixer、异步 play、宿主生命周期、失败不阻塞主流程。

- [ ] **Step 2: 建立可回滚提交**

运行：

```powershell
git status --short
git add docs/superpowers/plans/2026-08-17-resident-audio-engine.md docs/adr/ADR-001-resident-audio-engine.md
git commit -m "docs: define resident audio engine architecture"
```

预期：只提交设计和 ADR，不提交原生实验实现，不改变稳定运行代码。

- [ ] **Step 3: 检查工作区边界**

运行：

```powershell
git status --short
```

预期：确认当前失败原生实验修改仍未被误加入稳定交付提交。

---

## Task 2: 定义协议与生命周期状态机

**Files:**
- Create: `plugin/domain/audio-engine-client.js`
- Create: `plugin/domain/audio-engine-host.js`
- Modify: `plugin/protocol/index.js`
- Test: `tests/node/audio-engine-client.test.mjs`
- Test: `tests/node/audio-engine-host.test.mjs`

**Interfaces:**

- `createAudioEngineClient({ pipeName, requestTimeoutMs, transportFactory })`
  - Produces: `connect()`, `request(type, payload)`, `close()`, `on(event, handler)`, `isConnected()`。
- `createAudioEngineHost({ executablePath, spawnImpl, clientFactory, readyTimeoutMs, restartPolicy })`
  - Produces: `start()`, `health()`, `getStatus()`, `restart()`, `dispose()`。
- `audio.play` response: `{ accepted: true, voiceId: string }`。
- `audio.voice_finished` event: `{ voiceId: string, soundId: string, reason: "completed" | "stopped" | "failed" }`。
- Every request keeps its `requestId`; events carry `eventType`, `traceId`, `timestamp` and payload, and are never used as the synchronous completion of `audio.play`.
- `audio.load` is idempotent for the same `soundId + file fingerprint`; a changed file requires explicit unload/reload or returns `AUDIO_ASSET_CONFLICT`.
- `audio.play` rejects before creating a voice when engine is not ready, asset is not loaded, volume is invalid or an explicit voice/memory limit is reached; it never silently merges or replaces a voice.

- [ ] **Step 1: Write failing protocol tests**

测试必须覆盖：

```js
const result = await client.request('audio.play', { soundId: 'builtin.default', volume: 0.8 });
assert.equal(result.accepted, true);
assert.match(result.voiceId, /^voice-/);
```

以及：

```js
await assert.rejects(() => host.start(), /AUDIO_ENGINE_START_FAILED/);
assert.equal(host.getStatus().state, 'failed');
```

- [ ] **Step 2: Run tests and verify they fail**

运行：

```powershell
node --test tests/node/audio-engine-client.test.mjs tests/node/audio-engine-host.test.mjs
```

预期：因模块和接口尚未实现而失败。

- [ ] **Step 3: 实现最小客户端和 Host**

要求：

- 启动只允许一个并发 `startPromise`；
- 每个插件实例生成独立、可审计的音频 pipe 名称，禁止使用固定全局 pipe 导致多实例冲突；
- ready 超时必须终止子进程并清理 Pipe；
- 子进程异常退出必须转为结构化诊断，并记录实际 executablePath、exitCode、signal、stdout/stderr 摘要；
- `dispose()` 幂等；
- `audio.play` 不等待 voice 完成；
- 断线后状态变为 `degraded` 或 `failed`，不得静默假装 ready；
- 自动重启有 generation guard，旧进程的 close/error 事件不能污染新一代连接；
- 重启期间新播放明确返回 `AUDIO_ENGINE_NOT_READY`，不在 Host 层无限排队。

- [ ] **Step 4: 运行测试并确认通过**

运行：

```powershell
node --test tests/node/audio-engine-client.test.mjs tests/node/audio-engine-host.test.mjs
```

预期：全部通过，且覆盖 spawn 失败、Pipe 失败、ready 超时、重复 start、dispose 和重启。

- [ ] **Step 5: 提交协议边界**

```powershell
git add plugin/domain/audio-engine-client.js plugin/domain/audio-engine-host.js plugin/protocol/index.js tests/node/audio-engine-client.test.mjs tests/node/audio-engine-host.test.mjs
git commit -m "feat: add resident audio engine host protocol"
```

---

## Task 3: 实现独立 PCM 资产缓存

**Files:**
- Create: `runtime/audio-engine/asset-cache.hpp`
- Create: `runtime/audio-engine/asset-cache.cpp`
- Test: `tests/native/audio-engine-asset-cache.test.cpp`

**Interfaces:**

```cpp
struct PcmAsset {
  std::string sound_id;
  uint32_t sample_rate;
  uint16_t channels;
  std::vector<float> samples;
  uint64_t frame_count() const;
};

class AssetCache {
public:
  Result load(const std::string& sound_id, const std::filesystem::path& path);
  const PcmAsset* find(const std::string& sound_id) const;
  bool unload(const std::string& sound_id);
  void clear();
};
```

- [ ] **Step 1: 写失败测试**

覆盖：合法 16-bit PCM WAV、非 PCM、截断文件、重复 soundId、unload、路径错误和大小限制。

- [ ] **Step 2: 运行 native 测试确认失败**

运行：

```powershell
ctest --test-dir build/native-audio -R audio-engine-asset-cache --output-on-failure
```

- [ ] **Step 3: 实现 WAV 到 float PCM 的转换**

要求：只接受 PCM、1 或 2 声道、合理采样率；播放阶段不得再读文件。统一内部格式为 interleaved `float32`，缓存条目保存文件大小、最后写入时间和内容 hash，避免同 soundId 指向已变化文件时播放旧数据。

- [ ] **Step 4: 运行测试确认通过**

预期：所有资产缓存测试通过，错误包含稳定 code，不暴露原始路径给 UI。

- [ ] **Step 5: 提交缓存模块**

```powershell
git add runtime/audio-engine/asset-cache.* tests/native/audio-engine-asset-cache.test.cpp
git commit -m "feat: add resident audio PCM asset cache"
```

---

## Task 4: 实现 WASAPI 输出与多 voice Mixer

**Files:**
- Create: `runtime/audio-engine/mixer.hpp`
- Create: `runtime/audio-engine/mixer.cpp`
- Create: `runtime/audio-engine/device-output.hpp`
- Create: `runtime/audio-engine/device-output.cpp`
- Test: `tests/native/audio-engine-mixer.test.cpp`

**Interfaces:**

```cpp
struct Voice {
  std::string voice_id;
  std::string sound_id;
  uint64_t frame_position;
  float volume;
};

class Mixer {
public:
  Result play(const PcmAsset& asset, std::string voice_id, float volume);
  Result stop(const std::string& voice_id);
  size_t mix(float* output, size_t frames, uint32_t channels);
  std::vector<VoiceFinished> collect_finished();
  size_t active_voice_count() const;
};
```

- [ ] **Step 1: 写失败的纯内存混音测试**

覆盖：两个相同长度 voice 同时从 frame 0 开始、不同音量、不同长度、stop、自然结束和 voice 上限。

- [ ] **Step 2: 运行测试确认失败**

运行：

```powershell
ctest --test-dir build/native-audio -R audio-engine-mixer --output-on-failure
```

- [ ] **Step 3: 实现 Mixer**

要求：

- 每个 play 创建独立 voice；
- 不合并、不覆盖；
- 超过明确资源上限返回 `AUDIO_VOICE_LIMIT_REACHED`；
- 混音使用 float 累加；
- 输出前使用 limiter 或受控 soft clip，避免削波；
- voice 结束后生成完成事件。

- [ ] **Step 4: 实现 WASAPI Shared Mode 输出线程**

要求：

- 服务启动时初始化默认设备，并在 ready 前完成至少一次有效 buffer 获取；
- 渲染线程只负责请求缓冲、调用 Mixer、提交音频帧；
- IPC 线程不能直接写 WASAPI buffer；
- 设备失效返回结构化状态，不让渲染线程异常退出未记录；
- 不在 `audio.play` 路径初始化设备；
- 默认先使用稳定共享模式 buffer，不在第一版强行设置独占模式或极小 buffer；
- 记录 `engineReadyAt`、`playAcceptedAt`、`firstRenderAt`，用于真实延迟测量。

- [ ] **Step 5: 运行 native 测试与 self-test**

运行：

```powershell
cmake --build build/native-audio --config Release --target notification-hub-audio-service
git diff --check
ctest --test-dir build/native-audio --output-on-failure
```

- [ ] **Step 6: 提交 Mixer 和设备输出**

```powershell
git add runtime/audio-engine runtime/CMakeLists.txt tests/native/audio-engine-mixer.test.cpp
git commit -m "feat: add multi-voice WASAPI mixer"
```

---

## Task 5: 组装 Audio Engine 服务并验证真实 EXE

**Files:**
- Create: `runtime/audio-engine/engine.hpp`
- Create: `runtime/audio-engine/engine.cpp`
- Modify: `runtime/CMakeLists.txt`
- Test: `tests/native/audio-engine-host-smoke.test.ps1`

- [ ] **Step 1: 写宿主级 smoke test**

测试流程必须是：

```text
启动实际构建的 notification-hub-audio-service.exe
→ 等待 ready
→ audio.health
→ audio.load
→ 连续发送 5 个 audio.play
→ 确认得到 5 个不同 voiceId
→ audio.stop_all
→ audio.shutdown
→ 确认进程退出
```

- [ ] **Step 2: 实现服务请求分发**

服务必须支持：

```text
audio.health
audio.load
audio.unload
audio.play
audio.stop
audio.stop_all
audio.shutdown
```

`audio.play` 只能返回 accepted/voiceId；不能阻塞到播放结束。请求线程只创建 voice command 并投递给 mixer 状态队列，渲染线程在自己的时钟下消费命令；voiceId 在 accepted 前生成并保证唯一。

- [ ] **Step 3: 添加 voice_finished 事件**

事件发送失败不能破坏主渲染线程；事件发送必须由独立安全路径处理。

- [ ] **Step 4: 运行真实 EXE smoke test**

运行：

```powershell
pwsh -NoProfile -File tests/native/audio-engine-host-smoke.test.ps1 -ExecutablePath <实际构建路径>
```

预期：ready、health、5 个 voice、shutdown、进程退出全部通过。

- [ ] **Step 5: 提交引擎服务**

```powershell
git add runtime/audio-engine runtime/CMakeLists.txt tests/native/audio-engine-host-smoke.test.ps1
git commit -m "feat: assemble resident audio engine service"
```

---

## Task 6: 接入插件生命周期，但暂不替换生产播放

**Files:**
- Modify: `plugin/index.js`
- Modify: `plugin/domain/audio-engine-host.js`
- Test: `tests/node/plugin-audio-engine-lifecycle.test.mjs`

- [ ] **Step 1: 写失败生命周期测试**

覆盖：

```js
await plugin.onload(ctx);
assert.equal(plugin.getAudioEngineStatus().state, 'ready');
await plugin.onunload();
assert.equal(plugin.getAudioEngineStatus().state, 'stopped');
```

并覆盖重复 onload、启动失败不阻塞插件、onunload 无残留。

- [ ] **Step 2: 在 onload 中启动 Host**

要求：

- 使用真实 `ctx.pluginDir` 解析 EXE；
- 路径不存在时记录明确诊断；
- 启动失败不阻塞通知、设置和插件加载；
- 不允许每次试听重新启动服务。

- [ ] **Step 3: 在 onunload 中关闭 Host**

顺序：

```text
停止接受新播放
→ stop_all
→ shutdown
→ 等待进程退出
→ 超时才强制终止
```

- [ ] **Step 4: 运行 Node 生命周期测试**

```powershell
node --test tests/node/plugin-audio-engine-lifecycle.test.mjs
```

- [ ] **Step 5: 提交宿主接入**

```powershell
git add plugin/index.js plugin/domain/audio-engine-host.js tests/node/plugin-audio-engine-lifecycle.test.mjs
git commit -m "feat: manage resident audio engine with plugin lifecycle"
```

---

## Task 7: 替换底层播放调用并保持上层功能不变

**Files:**
- Modify: `plugin/domain/audio-adapter.js`
- Modify: `plugin/domain/sound-scheduler.js`
- Modify: `plugin/index.js`
- Test: `tests/node/audio-adapter-engine.test.mjs`

- [ ] **Step 1: 写失败适配测试**

覆盖：

```js
const result = await playNotificationSound({ decision, backend, options });
assert.equal(result.played, true);
assert.match(result.voiceId, /^voice-/);
```

并验证两个并发调用得到两个不同 voiceId，第二个不等待第一个结束。

- [ ] **Step 2: 实现 engine backend**

`playFile` 的流程：

```text
assetRegistry.resolvePlayback
→ engine.load(soundId, path)（只在缓存未命中时执行）
→ engine.play(soundId, volume)
→ 立即返回 accepted/voiceId
```

`playCue` 的内置声音必须映射到已加载的内置 PCM 资产，不能重新启动播放器。

- [ ] **Step 3: 修改试听返回语义**

设置页只等待 `accepted`，状态文案改为：

```text
已开始播放
```

不能等待完整音频播放结束。

- [ ] **Step 4: 保留现有策略和资源语义**

必须验证：

```text
全局静音仍阻止播放
soundId 解析不变
eventId 解析不变
.nhsound/.nhcombo 不变
删除与引用保护不变
```

- [ ] **Step 5: 运行 Node 回归测试**

```powershell
node --test --test-concurrency=1 tests/node/audio-adapter-engine.test.mjs tests/node/audio-adapter.test.mjs tests/node/plugin-lifecycle.test.mjs
```

- [ ] **Step 6: 提交适配层**

```powershell
git add plugin/domain/audio-adapter.js plugin/domain/sound-scheduler.js plugin/index.js tests/node/audio-adapter-engine.test.mjs
 git commit -m "feat: route notification sounds through resident engine"
```

---

## Task 8: 真实 Hana 宿主级验证与性能测量

**Files:**
- Create: `tests/host/real-plugin-audio-lifecycle.ps1`
- Create: `docs/superpowers/plans/2026-08-17-resident-audio-engine-results.md`
- Modify: `scripts/package-release.ps1`（仅验证通过后）

- [ ] **Step 1: 验证实际安装目录内容**

确认：

```text
plugin/index.js
runtime/notification-hub-audio-service.exe
manifest.json
所有 domain/protocol 文件
```

来自同一构建产物，不能混用旧文件。

- [ ] **Step 2: 执行真实宿主生命周期测试**

流程：

```text
安装/加载插件
→ onload
→ health ready
→ 设置页试听
→ 自定义 WAV 试听
→ 同时触发 2/5/10 个声音
→ 页面立即结束“正在试听”状态
→ 卸载插件
→ 确认服务退出
→ 重载插件
→ 再次试听
```

- [ ] **Step 3: 记录性能指标**

至少记录：

```text
服务 ready 时间
audio.play 请求到 accepted 时间
audio.play 到实际出声时间
2/5/10 voice 的 CPU 和内存
插件卸载后的残留进程数
设备断开/恢复后的状态
```

- [ ] **Step 4: 执行完整验证命令**

```powershell
npm run check
node --test --test-concurrency=1 tests/node/*.test.mjs
cmake --build build/native-audio --config Release
ctest --test-dir build/native-audio --output-on-failure
git diff --check
```

- [ ] **Step 5: 仅在全部通过后生成安装包**

安装包生成前确认：

```text
真实宿主设置页试听成功
自定义 WAV 成功
多 voice 不合并且不等待
重载后仍成功
卸载无残留服务
```

- [ ] **Step 6: 记录结果并提交**

```powershell
git add tests/host docs/superpowers/plans/2026-08-17-resident-audio-engine-results.md scripts/package-release.ps1
git commit -m "test: verify resident audio engine in Hana host"
```

---

## 延迟、并发与资源验收口径

所有性能数据必须在同一台 Windows 机器、同一输出设备、同一声音文件上采集，并区分冷启动和 warm path。

### 时间定义

- `T0`：Node 发送 `audio.play` 前的高精度时间戳。
- `T1`：Node 收到 `accepted + voiceId`。
- `T2`：Audio Engine 将该 voice 的第一个有效 frame 写入 WASAPI buffer。
- `T3`：可选的设备 loopback 实际回采起始时间；没有回采时不能把 T2 冒充“人耳实际听到”。
- `T4`：voice 完成事件到达 Node 的时间。

### 第一阶段性能目标

- 服务已 ready 且 WAV 已缓存时，`T1 - T0` 的 p95 ≤ 20 ms。
- 服务已 ready 且 WAV 已缓存时，`T2 - T0` 的 p95 ≤ 50 ms；最终数值以设备 buffer 实测为准。
- `audio.play` 到 `voice_finished` 的时间不参与“启动延迟”判断。
- 首次服务启动时间单独记录，不允许把服务启动时间隐藏进首次播放指标。
- 同时提交 2、5、10 个 voice 时，每个请求都返回不同 voiceId；不合并、不覆盖、不等待已有 voice。
- voice 完成后，缓存仍可复用；插件卸载后引擎进程、Pipe 和渲染线程全部退出。

### 资源边界

- 默认 `maxActiveVoices = 256`；超过后明确返回 `AUDIO_VOICE_LIMIT_REACHED`，不得静默合并或覆盖。
- `maxCachedPcmBytes` 必须是显式配置值；超过后 `audio.load` 返回 `AUDIO_CACHE_LIMIT_REACHED`，不得在 `audio.play` 时隐式淘汰正在播放的资产。
- 单个音频的最大时长、最大 PCM 字节数和最大 frame 数必须在 `audio.health` 中公开。
- 资源上限是异常保护，不是正常调度策略；正常声音请求不排队、不合并、不丢弃。

## 故障矩阵

| 故障 | Audio Engine 行为 | 插件行为 | 上层通知行为 |
|---|---|---|---|
| EXE 不存在/无法启动 | `failed`，返回路径和 spawn cause | 记录诊断，不反复同步重试 | 通知继续显示 |
| Pipe 连接超时 | 杀掉当前 generation，清理句柄 | 标记 degraded，可按策略重启 | 声音失败，不阻塞通知 |
| WASAPI 设备不可用 | `deviceAvailable=false` | 保留缓存，等待设备恢复 | 不阻塞通知 |
| 单文件损坏 | 该 `soundId` load 失败 | 资产标记 invalid | 其他声音继续 |
| voice 达到上限 | 返回 `AUDIO_VOICE_LIMIT_REACHED` | 记录明确失败 | 不合并、不覆盖 |
| 引擎崩溃 | 发送 exit 诊断并清理 pending | generation-safe 重启 | 重启窗口内声音失败，不阻塞通知 |
| 插件卸载 | stop_all、shutdown、等待退出 | 确认无残留进程 | 不留下后台进程 |

---

## 验收门槛

方案 A 只有同时满足以下条件才算可交付：

- [ ] 插件 onload 能启动唯一一个常驻 Audio Engine。
- [ ] Audio Engine ready 后，首次播放不再启动新的 PowerShell 或音频进程。
- [ ] WASAPI 设备只初始化一次，播放请求不重复初始化设备。
- [ ] 16-bit PCM WAV 已加载时，`audio.play` 在低延迟内返回 `accepted + voiceId`。
- [ ] 同时发送 2、5、10 个声音得到不同 voiceId，声音不合并、不覆盖、不等待已有 voice。
- [ ] 播放完成不会阻塞 `audio.play` 或设置页响应。
- [ ] 设备不可用、服务崩溃、Pipe 断开时有明确诊断，通知主流程仍继续。
- [ ] 插件卸载后服务进程退出，无残留进程。
- [ ] 插件重载后不会启动重复引擎，声音仍可播放。
- [ ] 上层 soundId、eventId、规则、设置和声音包功能回归通过。
- [ ] 未完成上述宿主级验收前，不生成交付安装包。
