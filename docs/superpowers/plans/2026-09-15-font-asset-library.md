# 字体库（TTF/OTF）

> 独立库，不进 PNG/WebP 视觉素材库。不做 TTC / WOFF / 可变轴。不打冻结包。不改通道。

**Goal:** 用户能导入 TTF/OTF，在标题/正文字体下拉里选到它；工作室用 `@font-face` 预览，真卡走 Native 私有字体集。文件坏了或库里没了，回雅黑，不拒卡、不挡通知。

## 已拍板

- 库是地方、导入是动作：独立页 `/font-assets-page`，壳抄视觉素材库（分块有边）。这刀不做视觉包导入导出。
- 存储：`{dataDir}/font-assets/{id}.ttf|otf` + `{dataDir}/font-assets.json`。路径锁在库根内。
- 只收 TTF（`00 01 00 00` / `true`）和 OTF（`OTTO`）。拒 `ttcf`、`wOFF`、`wOF2`、空文件、扩展名和头不符、超过 32MB。
- SHA256 去重，重复导入返回同一条。
- 显示名：能读 name 表就用（优先 Windows Unicode 全名/家族名），读不到用去扩展名的文件名。
- 引用：`ownerType=profile`，`slot=card.minimal.parts.title.font` / `body.font`。有引用不能删。
- 零件字段：`fontAssetId` 可选。有它就用库字体；系统四档仍走 `fontFamily`。选系统字时清掉 `fontAssetId`。缺字体或加载失败 → 雅黑。
- 工作室：字体 select = 雅黑/黑体/宋体/Segoe + 已导入字体；旁边「导入」「字体库」芯片，学底图那一行。
- Native：新增命令 `font-assets.configure`（只加不改旧命令），形状抄 `visual-assets.configure`。零件解析必须认 `fontAssetId`，未知 key 仍拒卡。
- 中文路径：生产库在 `dataDir`。自测若工作区带中文，fixture 先拷 ASCII `%TEMP%` 再跑（底图已经踩过 WIC 坑）。

## 不要做

字体进视觉素材库、TTC/WOFF/可变轴、字体打进 `.nhvisual` 包、通道、PID、进度条、冻结 zip。

---

### 1. 格式校验

`plugin/domain/font-asset-format.js` + `tests/node/font-asset-format.test.mjs`

`inspectFontAssetBuffer(buffer, fileName)` → `{ format: 'ttf'|'otf', familyName }`。

### 2. 库 + 存储 + 快照

照 `visual-asset-library.js` / `storage` / `persistence` 另起三份：`font-asset-library.js`、`font-asset-storage.js`、`font-asset-persistence.js`。错误码换 `FONT_ASSET_*`。kind 不必做，字体没有 background/icon 分类。

### 3. Plugin 接入

`index.js`：dataDir 下建库、启动 restore、保存 profile 时同步 title/body 的 font 引用（扩展 `collectVisualProfileAssetReferences` 旁的 `collectVisualProfileFontReferences`）。缺 `fontAssetId` 保存失败 `FONT_ASSET_NOT_FOUND`。运行时画卡找不到则雅黑。

`manifest.json` 加上：
- `./routes/settings-font-assets.js`
- `./routes/settings-font-assets-page.js`

API：`GET /font-assets`、`GET /font-assets/:id`、`GET /font-assets/:id/file`（给 `@font-face`）、`POST /font-assets/import`（Windows 选择器，滤 `*.ttf;*.otf`）、`DELETE /font-assets/:id`。

库页：列表、搜索、导入、删除保护、返回通知视觉。

### 4. 工作室

`settings-visual.js` / `settings-visual-client.js`：
- 字体下拉含导入项，value 用 `font:{assetId}`
- collect 写出 `fontAssetId`，系统字不写该字段
- 预览：拉 file → blob URL → `@font-face` → `font-family:"nh-font-{id}"`
- 「字体库」跳 `font-assets-page`；「导入」调 import API 后刷新下拉

`card-visual-settings.js`：`fontAssetId` 加入 title/body 字段；格式同视觉素材 id。`card-part-tree.js` 把 id 写进零件。

### 5. Native

- `plugin/protocol/index.js` 与 `runtime/protocol/message.cpp` 增加 `font-assets.configure`
- 解析抄 `parse_visual_assets_config_payload`；`configure_font_assets`
- `CardPart.font_asset_id`；named_pipe 认 `fontAssetId`
- 画字：`dwrite_3.h`，有 `font_asset_id` 时 `CreateFontFileReference` → FontSetBuilder → 私有 `IDWriteFontCollection`，再 `CreateTextFormat(家族名, collection, …)`。缓存键加上 assetId。失败回雅黑。
- 编译：VS2022 BuildTools CMake  
  `& "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe" --build "build/vs2022-fill-fix" --config Release --target notification-hub-runtime`  
  拷到 `plugin/runtime/notification-hub-runtime.exe`

### 6. 测试

- 格式：TTF/OTF 头、拒 TTC/WOFF、扩展名不符
- 库：去重、引用保护、快照
- 路由/页：列表、删除 409、页标题「字体库」
- 工作室：collect 写出 `parts.title.fontAssetId`；系统字没有该字段
- Native：能跑的 protocol / 带 ASCII 路径的字体自测；不为 visual-self-test 绿条放宽底图断言

不要打 zip。Sage 验收后再打试看包。
