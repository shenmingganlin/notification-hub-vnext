# 声音工作台导出、资产添加与分层音量实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让声音工作台支持指定位置导出、直接添加自定义音频，并为全局、分类和规则提供可解释的乘算音量。

**Architecture:** 声音库只表示当前 registry 中已经拥有且可解析的声音资产，内置和自定义资产共用 registry。前端导出优先使用 `showSaveFilePicker()` 写入用户选定的位置，能力不可用或用户取消时保留普通下载回退。自定义音频通过受控导入 API 写入插件 assetRoot，生成安全 soundId 和校验元数据。最终音量采用 `clamp(global.volume * category.volume * rule.volume, 0, 1)`，不改变全局静音和一次通知一次播放请求约束。

**Tech Stack:** Node.js ESM、Hono route、浏览器 File System Access API、Windows WAV/受控音频后端、Node test runner。

## Global Constraints

- 不保存用户音频的绝对路径；规则只引用稳定 `soundId`。
- 全局声音关闭绝对阻断播放，critical 不能绕过。
- 导入失败必须回滚文件、registry 和 profile。
- 现有 `.nhsound` 导入导出保持兼容。
- 页面切换留在当前 iframe，不新增 Page surface。
- 只修改声音领域、声音设置页和对应文档测试，不改 Runtime、诊断、通知中心和已确认顶部导航。
- 不执行 Git commit。

---

### Task 1: 导出到指定位置

**Files:**
- Modify: `plugin/routes/settings-sound.js`
- Test: `tests/node/settings-sound-route.test.mjs`

**Interfaces:**
- Consumes: `sound-package-export` 返回的 `packageText` 和 `name`。
- Produces: 前端 `savePackage(data)`，优先调用 `window.showSaveFilePicker()`，写入 `Blob`；不支持时调用现有 `<a download>` 回退。

- [x] Step 1: 增加静态测试，要求声音页包含 `showSaveFilePicker`、`.nhsound` 类型和普通下载回退。
- [x] Step 2: 把 `downloadPackage(data)` 改为异步 `savePackage(data)`。
- [x] Step 3: 使用用户手势触发保存对话框，建议文件名 `${name}.nhsound`，类型过滤为 `application/json` / `.nhsound`。
- [x] Step 4: 对 `AbortError` 显示“已取消导出”，不报告为系统故障；其他错误回退普通下载并保留反馈。
- [x] Step 5: 运行声音设置路由 focused 测试。

---

### Task 2: 直接添加自定义音频

**Files:**
- Modify: `plugin/domain/custom-sound-asset.js`
- Modify: `plugin/domain/sound-asset-registry.js`
- Modify: `plugin/routes/settings.js`
- Modify: `plugin/routes/settings-sound.js`
- Modify: `plugin/index.js`
- Create: `tests/node/sound-asset-import.test.mjs`
- Modify: `tests/node/settings-route.test.mjs`
- Modify: `tests/node/settings-sound-route.test.mjs`

**Interfaces:**
- Consumes: multipart 文件字段 `audio`、可选 `name` 和 `soundId`。
- Produces: `POST /sound-asset-import` 返回当前 `assets`、`soundId`、`asset`；文件复制到 assetRoot，registry 和元数据由现有生命周期持久化路径管理。

- [x] Step 1: 写 WAV、受支持格式、空文件、超大文件、非法扩展名、重复 soundId 和路径穿越的失败测试。
- [x] Step 2: 增加安全的 `soundId` 推导：优先显式 soundId，其次文件名 slug；重复时返回冲突，不静默覆盖。
- [x] Step 3: 实现受控导入函数，校验字节、格式、大小、SHA-256，写临时文件后原子 rename，再加入 registry；失败清理临时文件。
- [x] Step 4: 接入 route，读取 multipart 表单字段，调用导入函数并保存 registry；当前只开放 WAV，其他格式等播放后端升级。
- [x] Step 5: 声音页增加“添加 WAV 音频”按钮和隐藏 file input；上传后刷新声音库并显示生成的 soundId。
- [x] Step 6: 运行资产导入、设置路由和插件生命周期 focused 测试。

---

### Task 3: 分层乘算音量

**Files:**
- Modify: `plugin/domain/sound-profile.js`
- Modify: `plugin/domain/sound-rule-resolver.js`
- Modify: `plugin/routes/settings-sound.js`
- Modify: `tests/node/sound-profile.test.mjs`
- Modify: `tests/node/sound-rule-resolver.test.mjs`
- Modify: `tests/node/settings-sound-route.test.mjs`

**Interfaces:**
- Consumes: `global.volume`、选中分类的 `volume`、选中规则的 `volume`。
- Produces: resolver decision 的 `volume` 为 `clamp(global.volume * category.volume * rule.volume, 0, 1)`，另返回 `volumeLayers` 供诊断和页面解释。

- [x] Step 1: 写全局 80%、分类 50%、规则 50% 得到 20% 的测试；缺省分类/规则层按 100% 计算；0% 仍然为 0%。
- [x] Step 2: 允许 profile policy 的 `volume` 继续使用 0～1，并明确继承层不覆盖时使用 1 而非重复乘默认值。
- [x] Step 3: resolver 计算 `volumeLayers` 和最终 `volume`，保持旧 profile 兼容。
- [x] Step 4: 页面为每个分类增加 0～100% 音量输入，保存时写入 `categories[category].volume`。
- [x] Step 5: 分类行显示“分类音量”，全局说明改为“最终音量为全局 × 分类 × 规则”。
- [x] Step 6: 运行 focused 声音测试和全量测试。

---

### Task 4: 文档、构建与交付

**Files:**
- Modify: `CURRENT-STATUS.md`
- Modify: `docs/superpowers/plans/2026-08-14-sound-deepening.md`
- Modify: `package.json`

- [x] Step 1: 记录声音库语义、添加自定义音频和乘算公式。
- [x] Step 2: 纳入新增模块和测试的 `npm run check`。
- [x] Step 3: 运行 `npm test`、`npm run check`、`git diff --check` 和 Release 打包校验。
- [x] Step 4: 通过 `stage_files` 交付验收包和变更文档，不执行 Git commit。
- [x] 资源边界修复：导入与导出改为 Hana `resource.pick` + Node `ctx.resources.materialize/write` 主路径，浏览器文件 API 仅保留兼容回退。
