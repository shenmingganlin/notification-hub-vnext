# Visual Asset Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立与配置包生命周期解耦的最小视觉素材库，支持 PNG/WEBP/JPG 导入、元数据、SHA256 去重、引用跟踪、搜索与删除保护。

**Architecture:** 素材库由纯领域注册表、文件存储适配器和持久化快照三层组成。导入先校验格式与图片头、计算 SHA256，再以内容哈希去重并安全复制到库目录；引用以明确的 owner/type/id 记录，不使用不可追溯的裸计数。第一阶段不接 Skin、Effect 或配置包，只提供稳定 API 供后续模块绑定。

**Tech Stack:** Node.js 18+ ESM、node:fs/promises、node:crypto、node:path、Node 内置 test runner。

## Global Constraints

- 第一阶段支持 PNG、WEBP、JPG/JPEG；SVG 不进入本阶段。
- 配置包不能携带 JavaScript、Renderer、DLL、EXE、shell command 或新算法。
- 素材路径必须限制在素材库根目录内，禁止路径穿越和任意外部引用。
- 重复内容按 SHA256 去重，不按文件名去重。
- 被引用素材默认不可删除，错误必须包含可读引用清单。
- 视觉失败不能阻塞通知记录、声音播放或插件生命周期。
- 使用结构化文件工具修改源码；完成前运行 focused tests、node --check 与 git diff --check。
- 不执行 git reset、clean、push 或 commit。

---

### Task 1: 固化图片头解析与导入校验

**Files:**
- Create: `plugin/domain/visual-asset-format.js`
- Test: `tests/node/visual-asset-format.test.mjs`

**Interfaces:**
- Produces `inspectVisualAssetBuffer(buffer, fileName)`，返回 `{ format, width, height, hasAlpha }`。
- 接受 PNG、WEBP、JPG/JPEG；拒绝空数据、伪造扩展名、超限尺寸和不支持格式。

- [ ] 写测试覆盖 PNG RGBA、PNG RGB、WEBP VP8X alpha、JPG、扩展名不匹配和坏头。
- [ ] 运行 `node --test tests/node/visual-asset-format.test.mjs`，确认先失败。
- [ ] 用纯 Node Buffer 解析必要图片头，不引入新的图片依赖。
- [ ] 再运行该测试并确认通过。

### Task 2: 建立素材领域注册表

**Files:**
- Create: `plugin/domain/visual-asset-library.js`
- Test: `tests/node/visual-asset-library.test.mjs`

**Interfaces:**
- `createVisualAssetLibrary({ storage, now })`。
- `importBuffer({ name, kind, buffer, tags })` 返回冻结素材记录。
- `get(assetId)`、`list(query)`、`findBySha256(sha256)`。
- `addReference(assetId, { ownerType, ownerId, slot })`、`removeReference(...)`、`references(assetId)`。
- `remove(assetId)`：无引用时删除记录并调用 storage.remove；有引用时抛出 `VISUAL_ASSET_IN_USE`，details 包含引用清单。

- [ ] 写测试覆盖正常导入、元数据、格式归一化、SHA256 重复导入返回同一 assetId。
- [ ] 写测试覆盖 kind、name、tags、assetId 校验和不可变返回值。
- [ ] 写测试覆盖多个引用、重复引用幂等、移除引用和删除保护。
- [ ] 运行测试确认失败。
- [ ] 实现注册表，引用使用结构化对象而非裸计数。
- [ ] 再运行测试确认通过。

### Task 3: 实现文件存储与快照持久化

已完成：固定 rootDir 的文件存储、路径穿越拒绝、临时文件 rename、独立版本快照保存/加载，以及素材库快照恢复和索引重建。

**Files:**
- Create: `plugin/domain/visual-asset-storage.js`
- Create: `plugin/domain/visual-asset-persistence.js`
- Test: `tests/node/visual-asset-persistence.test.mjs`

**Interfaces:**
- `createVisualAssetStorage(rootDir)`：`put(assetId, format, buffer)`、`read(assetId, format)`、`remove(assetId, format)`、`resolveAssetPath(assetId, format)`。
- `saveVisualAssetSnapshot(snapshot, filePath)`、`loadVisualAssetSnapshot(filePath)`。
- 存储路径固定为 `<rootDir>/<assetId>.<format>`，所有解析结果必须位于 rootDir 内。

- [ ] 写测试覆盖目录创建、文件写入读取、路径穿越拒绝、原子快照保存和坏快照隔离。
- [ ] 写测试覆盖素材记录与文件扩展名一致、重复导入不产生第二份文件。
- [ ] 运行测试确认失败。
- [ ] 复用现有视觉注册表持久化的临时文件 + rename 模式，但使用独立版本号和错误码。
- [ ] 再运行测试确认通过。

### Task 4: 接入最小 API 边界

已完成：Plugin 生命周期恢复/保存、受保护列表/详情/删除路由，以及受控内部 `importVisualAsset()` API；multipart 上传仍未开放。

**Files:**
- Modify: `plugin/index.js`
- Create or Modify: `plugin/routes/settings-visual-assets.js`
- Test: `tests/node/visual-asset-api.test.mjs`

**Interfaces:**
- `listVisualAssets(query)`、`importVisualAsset(input)`、`removeVisualAsset(assetId)`、`getVisualAsset(assetId)`。
- `GET /visual-assets`、`GET /visual-assets/:assetId`、`DELETE /visual-assets/:assetId`。
- 导入端点先采用插件内部 Buffer/API 测试入口；不在本任务引入任意 multipart 解析器。

- [ ] 写测试覆盖 API 正常响应、重复素材、被引用删除错误和未知素材 404。
- [ ] 运行测试确认失败。
- [ ] 在插件生命周期中创建独立 asset library；初始化/持久化失败只产生诊断，不阻塞 onload。
- [ ] 注册只读列表、详情和受保护删除路由。
- [ ] 再运行测试确认通过。

### Task 5: 文档与回归门禁

页面切片已完成：新增素材库页面、搜索/kind 筛选、元数据与引用状态展示、受保护删除和视觉设置入口。

安全导入切片已完成：新增 Windows 受控文件选择器、`importVisualAssetFromPicker()` 和 `POST /visual-assets/import`；不保存原始路径，不开放 SVG、URL 或任意 multipart 上传。

**Files:**
- Modify: `CURRENT-STATUS.md`
- Modify: `docs/superpowers/plans/2026-08-18-visual-system-master-plan.md`

- [ ] 记录素材库领域模型、支持格式、删除保护和当前未接入配置包/Skin/Effect 的边界。
- [ ] 运行 `node --test tests/node/visual-asset-*.test.mjs tests/node/plugin-visual-api.test.mjs`。
- [ ] 运行 `node --check` 检查所有新增/修改 JS 文件。
- [ ] 运行 Native 相关 focused smoke，确认素材库失败不影响已有视觉链路。
- [ ] 运行 `git diff --check`，确认无空白错误。
