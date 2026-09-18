# 堆叠新位（占角 / 新位）Implementation Plan

> **For agentic workers:** Main session slices this. Do not dispatch one Wright brief across JS + Native + studio.

**Goal:** 堆叠通道可选手动选择新卡进哪一格：占角挤走旧卡，或旧卡不动、新卡开下一格。把走线蛇形偷偷改新位的漏洞收成显式法律。

**Architecture:** 通道规约字段 `newest: dock | next`，默认 `dock`。JS 把占角映射成 Native packing `direction` 与 `grow` 相反（现行 off/parallel）；新位不反向（现行 snake）。JS `createStackLayout` 同步。Native 解析并回写 `newest`，排版仍吃已映射的 `direction`。工作室通道芯片「占角 / 新位」。弹幕区不出现。

**Tech Stack:** Plugin JS charter + 工作室芯片；Native `scene.set-mode` 结构体末尾新字段；不新增 `.cpp`。

## Global Constraints

- 产品版本保持 **0.1.8**，不升号。钉死 zip `notification-hub-vnext-0.1.8.zip` 不准覆盖。follow 试包也不覆盖。
- 试包打 `dist/notification-hub-vnext-0.1.8-newest.zip`，完整插件 zip，不热换 community。
- 禁止覆盖安装位 `C:\Users\Ganlin\.hanako\plugins\notification-hub-vnext\runtime\notification-hub-runtime.exe`。
- Native 新字段只垫结构体末尾。不改 CMake `VERSION`；不 cmake 重配。MSBuild 已有 vcxproj Release。
- 配置包仍不含通道规约。
- 用户词：占角 / 新位。代码：`newest` / `dock` / `next`。不要顶部/底部/长边。
- 缺字段：JS 默认 `dock`；Native 旧管道没带 `newest` 当 `dock`。
- 走线不再决定新位。蛇形以前 = 新位，是 BUG。
- 满了仍掀最旧。落点 follow 让占角时旧卡追槽；新位时旧卡不动。
- 构建：`D:\MyApplications\VS\MSBuild\Current\Bin\MSBuild.exe` 打 `build\runtime-set-charter\runtime\notification-hub-runtime.vcxproj` Release，拷到工作区 `plugin/runtime/`。

## 文件

- Create: `docs/adr/ADR-008-stack-newest.md`
- Modify: `CONTEXT.md`（已写词条）
- Modify: `plugin/domain/channel-charter.js`
- Modify: `plugin/domain/stack-grow.js`
- Modify: `plugin/domain/card-visual-settings.js`
- Modify: `plugin/domain/native-visual-payload.js`
- Modify: `plugin/runtime/stack-layout.js`
- Modify: `plugin/runtime/recovery-snapshot.js`
- Modify: `plugin/routes/settings-visual.js`
- Modify: `plugin/routes/settings-visual-client.js`
- Modify: `runtime/scene/layout.hpp`
- Modify: `runtime/transport/named_pipe.cpp`
- Modify: `CURRENT-STATUS.md` / `docs/superpowers/plans/README.md` / `scripts/pack-try-zip.py`
- Test: `tests/node/channel-charter.test.mjs`
- Test: `tests/node/stack-grow.test.mjs`
- Test: `tests/node/visual-stack.test.mjs`
- Test: `tests/node/native-visual-payload.test.mjs`
- Test: `tests/node/recovery-snapshot.test.mjs`
- Test: `tests/node/settings-visual-route.test.mjs`

---

### Task 1: 规约承认 newest

**Files:**
- Modify: `plugin/domain/channel-charter.js`
- Test: `tests/node/channel-charter.test.mjs`

**Interfaces:**
- Produces: `CHARTER_NEWEST_IDS = ['dock','next']`；默认 `dock`；未知值 `CHARTER_NEWEST_UNSUPPORTED`，`expected: 'dock|next'`；`migrateStackCharterFromSpace` 读 `space.newest`

- [x] 测试：默认 dock；snap 式接受 next；orbit 拒绝
- [x] 实现：`STACK_CHARTER_FIELDS` 加 `newest`；defaults `dock`

### Task 2: 方向映射不再被蛇形劫持

**Files:**
- Modify: `plugin/domain/stack-grow.js`
- Modify: `plugin/domain/native-visual-payload.js`
- Modify: `plugin/domain/card-visual-settings.js`
- Test: `tests/node/stack-grow.test.mjs`、`tests/node/native-visual-payload.test.mjs`

**Interfaces:**
- `stackGrowToNativeDirection(anchor, grow, wrap, newest)`：`newest === 'next'` 时 direction = grow；否则与 grow 相反。`wrap` 不再改变反向。
- `spaceToNativeStackLayout` 写出 `newest: space.newest === 'next' ? 'next' : 'dock'`
- `SPACE_FIELDS` 含 `newest`；值只许 dock|next

- [x] 旧测试「snake keeps native direction equal to grow」改成显式 `newest: 'next'`
- [x] 默认（dock）时 snake 也反向
- [x] payload deepEqual 带 `newest: 'dock'`

### Task 3: JS 预览布局听 newest

**Files:**
- Modify: `plugin/runtime/stack-layout.js`
- Test: `tests/node/visual-stack.test.mjs`

**Interfaces:**
- `createStackLayout({ ..., newest })` 默认 `dock`
- wrap off/parallel + dock：现行（新卡在角）
- wrap off/parallel + next：旧卡在角，新卡沿 grow 开下一格
- snake + next：现行蛇形（先来的在停靠）
- snake + dock：发卡序列倒过来再蛇形，新卡在停靠

- [x] 现有「newest on the corner」夹具保持
- [x] 加 next 夹具：bottom-right grow up，old 在角，new 在上
- [x] 现有蛇形夹具显式 `newest: 'next'`

### Task 4: 工作室芯片

**Files:**
- Modify: `plugin/routes/settings-visual.js`
- Modify: `plugin/routes/settings-visual-client.js`
- Test: `tests/node/settings-visual-route.test.mjs`

- [x] `newestPad`：芯片 占角 / 新位；隐藏 select `#prop-newest`
- [x] 放在走线与落点之间；弹幕区不得出现
- [x] collect / hydrate / `[data-newest]` 点击；默认占角
- [x] `SYNC_ELEMENT_IDS` + client `syncIds` 加 `prop-newest`
- [x] 蛇形说明删掉「停靠是最先来的那张」
- [x] 通道 hint 补「新位」

### Task 5: 恢复快照

**Files:**
- Modify: `plugin/runtime/recovery-snapshot.js`
- Test: `tests/node/recovery-snapshot.test.mjs`

- [x] `newest` 缺省通过；`next`/`dock` 通过；其他拒绝 `CHARTER_NEWEST_UNSUPPORTED`

### Task 6: Native 解析

**Files:**
- Modify: `runtime/scene/layout.hpp`（`StackNewest { Dock, Next }` 垫在 `StackLayoutOptions` 末尾，默认 Dock）
- Modify: `runtime/transport/named_pipe.cpp`
- 排版仍用 JS 映射后的 `direction`，不要在 Native 再反向一次

- [x] 缺 `newest` → Dock
- [x] `next` / `dock` 收下；别的拒绝
- [x] health/layout json 能读到 newest（若已有 layout json）
- [x] MSBuild Release；`--self-test` 绿
- [x] 拷 exe 到工作区 `plugin/runtime/`，不碰安装位

### Task 7: ADR + 试包

- [x] `docs/adr/ADR-008-stack-newest.md`；ADR-006 表补一行新位
- [x] CURRENT-STATUS / plans README 当前入口改到本计划
- [x] `scripts/pack-try-zip.py` 打 `0.1.8-newest.zip`，并校验钉死 0.1.8 zip 哈希未变
