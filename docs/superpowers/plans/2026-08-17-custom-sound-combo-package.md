# 自定义声音组合包 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增可传播的自定义声音组合包，在携带音频文件的同时保存 `eventId -> soundId + volume` 绑定，并与现有纯音频资产包保持独立。

**Architecture:** 保留 `.nhsound` 作为纯音频资产包，只包含自定义音频资产及其元数据；新增 `.nhcombo` 作为自定义声音组合包，包含组合配置和该配置引用的自定义音频资产。组合包导入复用现有音频包的校验、冲突策略和原子回滚能力，但只有全部音频导入成功后才提交声音绑定；失败时同时回滚音频资产和绑定配置。

**Tech Stack:** Node.js ESM、JSON 包格式、现有 `sound-package.js` / `sound-package-importer.js`、`sound-binding.js`、`sound-profile.js`、Node test runner、Hana HTML route。

## Global Constraints

- 声音绑定只允许正式事件模型：`eventId -> soundId + volume`。
- 不允许导入或生成 `category`、旧 `event`、`importance`、旧 `rules`、旧 `soundRules` 字段。
- 只允许携带 `kind: custom` 的音频；内置声音不嵌入包。
- 导入必须校验 Base64、文件大小、SHA256、事件目录和声音绑定字段。
- 导入必须支持 `reject`、`replace`、`keep-existing` 三种声音资产冲突策略；默认 `reject`。
- 组合绑定冲突必须提供明确策略，禁止静默覆盖已有事件绑定。
- 音频资产与绑定配置必须事务性提交，任一步失败都回滚。
- 不执行 Git commit、push、reset、clean。
- 使用结构化文件工具修改源码；完成全量测试、语法检查和 `git diff --check` 后才重新打包。

---

## 设计结论

### `.nhsound`：音频资产包

职责：传播声音文件本身。

内容：

```json
{
  "format": "notification-hub-sound-package",
  "version": 1,
  "name": "我的音效库",
  "assets": [
    {
      "soundId": "custom.xxx",
      "kind": "custom",
      "format": "wav",
      "relativePath": "custom.xxx.wav",
      "fileSizeBytes": 1234,
      "sha256": "...",
      "dataBase64": "..."
    }
  ]
}
```

不包含声音绑定，不包含全局声音策略。

### `.nhcombo`：自定义声音组合包

职责：传播一组“声音 + 事件绑定”。

内容：

```json
{
  "format": "notification-hub-sound-combo-package",
  "version": 1,
  "name": "我的通知声音组合",
  "profile": {
    "version": 1,
    "soundOverrides": [
      {
        "eventId": "tool.execution.failed",
        "soundId": "custom.alert",
        "volume": 0.85
      }
    ]
  },
  "assets": [
    "与 profile.soundOverrides 引用的 custom soundId 对应的音频资产"
  ]
}
```

组合包只导出当前选定的事件绑定和这些绑定引用的自定义声音；不导出全局开关、全局音量、重复抑制等机器级偏好。

---

## 文件边界

### Task 1: 拆分纯音频包格式

**Files:**
- Modify: `plugin/domain/sound-package.js`
- Modify: `plugin/domain/sound-package-exporter.js`
- Modify: `plugin/domain/sound-package-importer.js`
- Modify: `tests/node/sound-package.test.mjs`

**Interfaces:**
- `createSoundPackage({ name, assets })` 生成不含 profile 的 `.nhsound` 包。
- `parseSoundPackage(text)` 拒绝未知的 `profile` 字段。
- `exportSoundPackage({ name, registry, assetRoot, soundIds })` 可选择导出全部自定义资产或指定 `soundIds`。
- `importSoundPackage(...)` 只提交音频资产，不修改声音绑定。

- [ ] **Step 1: Write failing tests**

新增断言：

```js
assert.throws(
  () => parseSoundPackage(JSON.stringify({
    format: 'notification-hub-sound-package',
    version: 1,
    name: 'invalid',
    profile: {},
    assets: []
  })),
  (error) => error.code === 'SOUND_PACKAGE_FIELD_UNKNOWN'
);
```

并新增 `soundIds` 过滤测试，确认只导出指定的自定义声音。

- [ ] **Step 2: Run focused test and verify failure**

Run:

```powershell
node --test tests/node/sound-package.test.mjs
```

Expected: 新增 profile 字段和 `soundIds` 测试失败。

- [ ] **Step 3: Implement minimal format split**

从 `PACKAGE_FIELDS` 删除 `profile`，从 `createSoundPackage` 删除 `profile` 参数和输出；导出器将 `referencedIds` 改为可选的显式 `soundIds`；导入器删除 `commit(profile)` 和 `rollbackCommit` 绑定语义，只保留资产事务。

- [ ] **Step 4: Run focused test**

```powershell
node --test tests/node/sound-package.test.mjs
```

Expected: PASS。

---

### Task 2: 新增声音组合包领域模块

**Files:**
- Create: `plugin/domain/sound-combo-package.js`
- Create: `plugin/domain/sound-combo-package-exporter.js`
- Create: `plugin/domain/sound-combo-package-importer.js`
- Modify: `plugin/domain/sound-binding.js`
- Modify: `plugin/domain/sound-profile.js`
- Test: `tests/node/sound-combo-package.test.mjs`

**Interfaces:**

```js
createSoundComboPackage({ name, profile, assets })
parseSoundComboPackage(text)
serializeSoundComboPackage(value)
validateSoundComboPackage(value)

exportSoundComboPackage({ name, profile, registry, assetRoot })
importSoundComboPackage({ packageText, assetRoot, registry, profile, conflict, bindingConflict, commitProfile, rollbackProfile })
```

组合包约束：

- `profile.soundOverrides` 必须是规范化的 `eventId/soundId/volume` 绑定。
- 每个 `soundId` 必须在 `assets` 中出现，除非它是受允许的内置声音；内置声音不得嵌入。
- 每个 `eventId` 必须通过事件目录的 `presentationEligible` 校验。
- 一个组合内不能有重复 `eventId`。
- 绑定冲突策略：`reject`、`replace`、`keep-existing`，默认 `reject`。
- `replace` 只替换组合包声明的事件绑定，不修改其他事件。

- [ ] **Step 1: Write failing tests**

覆盖：

1. 组合包只接受新字段；旧 `category/event/importance` 被拒绝。
2. 未知或不可表现事件被拒绝。
3. 组合包导出只携带被绑定引用的自定义资产。
4. 缺少引用音频时导出失败。
5. `replace` 只覆盖同 eventId 绑定。
6. `reject` 遇到绑定冲突时不修改 profile 或 registry。
7. 音频导入成功但 profile 提交失败时，音频和 profile 都回滚。
8. `keep-existing` 保留已有绑定并导入未冲突绑定。

- [ ] **Step 2: Run focused test and verify failure**

```powershell
node --test tests/node/sound-combo-package.test.mjs
```

Expected: 模块不存在或接口尚未实现，测试失败。

- [ ] **Step 3: Implement normalization and transaction boundary**

组合包模块负责格式、字段和事件校验；导出器读取 `profile.soundOverrides` 并收集引用资产；导入器先调用纯音频资产导入事务，再通过 `commitProfile` 提交合并后的 profile，失败时调用 `rollbackProfile` 并回滚资产导入。

- [ ] **Step 4: Run focused test**

```powershell
node --test tests/node/sound-combo-package.test.mjs
```

Expected: PASS。

---

### Task 3: 接入插件 API 与声音设置 UI

**Files:**
- Modify: `plugin/index.js`
- Modify: `plugin/routes/settings-sound.js`
- Modify: `plugin/routes/settings.js`
- Modify: `tests/node/custom-sound-configuration.test.mjs`
- Modify: `tests/node/settings-sound-route.test.mjs`
- Modify: `tests/node/sound-package.test.mjs`

**Interfaces:**

新增插件方法：

```js
exportSoundComboPackage(input)
importSoundComboPackage(input)
```

新增设置页面动作：

```text
导出音频包
导入音频包
导出自定义组合包
导入自定义组合包
```

UI 语义：

- 音频包按钮放在“音频库”区域。
- 自定义组合包按钮放在“自定义声音”区域。
- 导出组合包前显示组合摘要：事件数量、声音数量、事件名称列表。
- 导入组合包沿用页面内冲突选择，不使用 `window.confirm`。
- 组合包导入成功后刷新自定义绑定列表和音频库。
- 导入组合包不改变全局声音开关、全局音量和重复抑制设置。

- [ ] **Step 1: Write failing route/API tests**

断言新增导出/导入动作、`.nhcombo` 文件名、组合摘要和冲突选项；断言旧 `.nhsound` 导入仍然只影响音频库，不创建绑定。

- [ ] **Step 2: Run focused tests and verify failure**

```powershell
node --test tests/node/custom-sound-configuration.test.mjs tests/node/settings-sound-route.test.mjs tests/node/sound-package.test.mjs
```

- [ ] **Step 3: Implement API and UI wiring**

复用现有文件导入导出和页面状态刷新逻辑；新增独立的组合包 endpoint/action，禁止把组合包伪装成普通 `.nhsound`。

- [ ] **Step 4: Run focused tests**

```powershell
node --test tests/node/custom-sound-configuration.test.mjs tests/node/settings-sound-route.test.mjs tests/node/sound-package.test.mjs
```

Expected: PASS。

---

### Task 4: 全量验证、文档和安装包

**Files:**
- Modify: `CURRENT-STATUS.md`
- Modify: `docs/superpowers/plans/2026-08-17-custom-sound-combo-package.md`
- Modify: relevant package/export/import tests

- [ ] **Step 1: Run focused package tests**

```powershell
node --test tests/node/sound-package.test.mjs tests/node/sound-combo-package.test.mjs tests/node/custom-sound-configuration.test.mjs tests/node/settings-sound-route.test.mjs
```

- [ ] **Step 2: Run full verification**

```powershell
npm test
npm run check
git diff --check
```

Expected: 全部测试无失败；语法检查通过；`git diff --check` 只有既有换行提示。

- [ ] **Step 3: Build installable ZIP**

```powershell
& .\scripts\package-release.ps1 -Configuration Release
```

校验：

```powershell
Get-FileHash 'dist\notification-hub-vnext-0.1.0-alpha.16.zip' -Algorithm SHA256
```

- [ ] **Step 4: Update status and stage deliverables**

记录 `.nhsound` 与 `.nhcombo` 的职责、冲突策略、事务回滚行为、测试统计和新 ZIP SHA256；交付新 ZIP 之前不得让用户安装验收。

---

## Self-review

- 双包职责：Task 1 保证 `.nhsound` 纯资产，Task 2/3 负责 `.nhcombo` 组合传播。
- 事件模型：Task 2 明确拒绝旧字段并校验 `presentationEligible`。
- 音频随包：Task 2 导出引用资产，导入复用资产事务。
- 数据安全：Task 2/3 明确 profile 与资产双向回滚。
- 用户体验：Task 3 分开音频包与组合包入口，并显示导入摘要和冲突策略。
- 兼容性：旧 `.nhsound` 仍可导入；旧的 profile 结构不会被新组合包接受。
- 验证：Task 4 覆盖聚焦测试、全量测试、语法、diff 检查和安装包校验。
