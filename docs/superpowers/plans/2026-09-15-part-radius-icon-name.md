# 零件收尾：区域圆角 + 图标 + 助手名

> 一份身份喂图标和助手名。圆角是零件框，不是新 kind。不打冻结包。不改通道 / 突脸 / 进度 / 声音 / 历史 / 整页排版。

**Goal:** 每个零件能设区域圆角（拉满即圆）。可打开两个默认关闭的孩子：图标、助手名。图标两种图源：助手头像（跟人走）或自定义素材。真卡和试一条同一套零件。

## 已拍板

- **一段字 = 来源助手** `{ id, name, avatarPath }`。图标（助手头像模式）和助手名同喝这一杯。
- **代表图只读** `agents/{id}/avatars/agent.{png,jpg,jpeg,webp}`，后缀按这个顺序取第一张。这是 Hana 自己的脸，和 `appearance-summary.json` 的 hash 同一张。不要用文件夹里的 `avatar.jpg` 当代表图。
- **不改 Hana 原图，不拷进视觉素材库。** 调的是零件框：位置、大小、圆角、边框。图 cover 进框。皮肤裁切不做。
- **自定义** 才走素材库 `backgroundAssetId`。
- **默认关。** `parts.icon.show !== true`、`parts.assistantName.show !== true` 时默认树与今天一模一样，现有测试不能被这俩孩子撑破。
- **关闭** 仍是 `kind:close`（要点得中）。板子改走圆角矩形；半径默认半边长，28×28 就是圆。
- **旧识别优雅化：** 留会话路径 `/agents/{id}/` 和 `event.agentId` / channel `sender`。丢掉写死色板、emoji 冒充头像、按 modelId 猜人。
- 关闭态必须能存上（`show: false` 显式写）。系统/关图标自定义时 `assetId: null`。

## 不要做

突脸、进度条、下载报数、底图裁切、TTC/字体、改工作室整页排版、改协议旧命令、Native 声音、历史、冻结 zip、把助手脸 import 进视觉素材库。

---

### 1. 身份解析

`plugin/domain/agent-identity.js` + `tests/node/agent-identity.test.mjs`

```
resolveAgentsDir(ctx) 候选（第一个存在的目录）：
  ctx.agentsDir
  path.join(ctx.userDataDir, 'agents')
  path.join(ctx.hanaDir, 'agents')
  path.join(os.homedir(), '.hanako', 'agents')

readAgentIdentity(agentsDir, agentId) → { id, name, avatarPath | null }
  name: config.yaml 里 agent.name（手工 YAML，照旧插件只抽 name；不要抄 THEME_PALETTE）
  avatarPath: avatars/agent.png → .jpg → .jpeg → .webp 第一张存在的

resolveAgentId({ event, sessionPath, record })
  1. record.agent.id
  2. event.agentId
  3. channel sender
  4. sessionPath 里 /agents/([^/]+)/
  没有 → null（零件不画，不崩）

stageAgentAvatar(dataDir, identity) → cache 相对路径
  拷到 {dataDir}/agent-avatar-cache/{id}-{sha256}{ext}
  hash 没变不重拷
  给 Native / 工作室用 ASCII 缓存，避开 WIC 中文路径
```

事件适配器 ingest 时把 `notification.agent = { id, name }` 写上（avatar 不进记录，路径运行时再解析）。`prepareNotificationInput` 已经 spread notification，记录能吃到。

`notificationCardPayload` 再解析一次（旧记录 `agent:null` 仍能从 session 认人）。

### 2. 零件树 / 保存

`card-part-tree.js`

- `createDefaultTextPartTree` 增加可选 `icon=false`、`assistantName=false`。默认 false，现有断言不动。
- 打开时默认框（堆叠）：
  - 图标 `kind:image` id `icon`：`16,22,40,40`，`radius` 20
  - 助手名 `kind:text` id `assistantName` binding `assistantName`：图标开则 x=66，否则 x=30；`y=16,h=18`
  - 图标开则标题/正文 `textLeft=66`；助手名开则标题 y=36
- 弹幕：图标 `8,(h-24)/2,24,24`；默认仍关。
- `paintPartTree`：所有零件可写 `radius`（整数 0–240）。`title`/`body`/`assistantName` 走字饰；`icon` 可写 `backgroundAssetId` / `backgroundFit`（cover）/ fill（没图时的色块）。
- 关闭无 radius 时，绘制侧按 `min(w,h)/2`。

`card-visual-settings.js`

- `PART_IDS` 加上 `icon`、`assistantName`
- `PART_PAINT_FIELDS` 加上 `radius`
- icon 另收：`source`（`assistant`|`custom`）、`assetId`（可 null）、`show`
- assistantName 当文字零件（字号/字体/字饰 + show + radius）
- collect/normalize：关显示写 `show: false`；自定义关掉写 `assetId: null`；source 缺省按 `assistant`

### 3. 工作室（只加芯片和控件，不改整页）

`settings-visual.js` / `settings-visual-client.js`

- 零件芯片：根 / 标题 / 正文 / 关闭 / **图标** / **助手名**
- 选中任一孩子：现有 左/上/宽/高 + **区域圆角（0–240）** + 描边
- 图标、助手名也有「显示」（可全关，不要套标题/正文的「最后一件锁」）
- 图标专有：芯片「助手头像」「自定义」
  - 助手头像：说明「真通知跟人走。预览用样例助手。」样例下拉**不写进配置包**（内存/预览专用）
  - 自定义：素材下拉 + 导入/素材库，学底图那一行，**不要**「调整底图」
- hidden 字段补 `icon` / `assistantName`（含 radius、show、source、assetId）
- collect 必须写出关闭态

预览卡：`notificationCardPayload` 同源。试一条若没有 agent，用样例助手身份。

视觉页 payload 带 `studioAgents: [{ id, name }]`（有 `agent.*` 的优先）。头像文件 `GET /agent-avatars/:id/file` 读缓存或原文件。

### 4. Native

- `CardPart` 加 `int radius{}`；named_pipe 认 `radius`（0–240）。未知 key 仍拒卡。
- scene.create 可选字符串 `assistantName`。`part_text`：binding `assistantName` 返回它。
- 新命令 `agent-avatars.configure`，形状抄 `visual-assets.configure`（rootDir + items: id, relativePath, sha256, format）。只加不改旧命令。
- 画 `kind:image`：不要 `continue`。解析顺序：
  1. `backgroundAssetId` → 现有视觉素材（自定义）
  2. 零件 id / 绑定对应的 `agentAvatarId`：用 **同一个** `backgroundAssetId` 字段装 `agent.{id}`，在 `agent-avatars` 表里解析；不要和第二套 id 字段打架。约定：`backgroundAssetId` 以 `agent.` 开头走助手缓存，否则走视觉库。
- 图：现有 `request_wallpaper` + cover 填零件框 + `FillRoundedRectangle`（半径 `min(radius, min(w,h)/2)`）。没图：`fill` 色块同样圆角。描边 `DrawRoundedRectangle`。
- `kind:close`：椭圆改成圆角矩形（半径默认半边长），X 还在。
- 文字零件描边框改圆角。弹幕循环不要只画 text：图标若开了也要画。
- 编译：
  `& "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\CMake\CMake\bin\cmake.exe" --build "build/vs2022-fill-fix" --config Release --target notification-hub-runtime`
  若该 cmake 路径不存在，用字体库计划里那条 VS2022 BuildTools 路径。拷到 `plugin/runtime/notification-hub-runtime.exe`

插件发卡前：助手头像模式调用 `stageAgentAvatar` + `agent-avatars.configure`（脏了再配），零件 `backgroundAssetId = 'agent.' + id`。

### 5. 事件适配

`notification-event-adapter.js`：ingest 的 `notification.agent = { id, name }`。session 从现有 `sessionPath` 抽。没有 id 就别写假 agent。

试看/测试通知：能带 agent 就带；没有则零件按「不画」而不是崩。

### 6. 测试

- 身份：name 来自 yaml；代表图是 `agent.png` 不是 `avatar.jpg`；缺图 avatarPath null；会话路径抽出 id
- 零件树：默认仍无 icon/assistantName；show true 才出现；radius 写入
- 保存：`show: false`、`source: 'assistant'`、自定义 `assetId: null`
- 工作室 collect：关图标/助手名再读回来仍是关
- Native smoke：`kind:image` 不再被拒；带 radius 的 close；`assistantName` 文本；未知 key 仍拒
- 旧测试：默认树、标题正文关闭、弹幕 10 发路径不要被这刀改清场逻辑

不要打 zip。Sage 验收后再打试看包。
