# 堆叠走线回字（coil）Implementation Plan

> **For agentic workers:** Main session slices this. Do not dispatch one Wright brief across JS + Native + studio.

**Goal:** 堆叠走线增加「回字」：从停靠沿往哪长出发，转向内里，↓→↑← 越绕越小。新卡占角/新位仍独立。关「开新列」时回字芯片禁用。

**Architecture:** `wrap: coil`。第一边 = 用户 `grow`。下一边 = `stackWrapGrow(anchor, grow)`（内里那条）。然后反向，再反向。剩框按这一边最厚的卡往里收。小卡留洞。满了掀最旧。Native 用已有 `newest` + `direction` 还原 `grow`（`next` 则 grow=direction，`dock` 则 grow=opposite(direction)），不要再让走线改方向映射。JS `createStackLayout` 与 Native `layout_coil_wrap` 同一套收框。不新增 `.cpp`。

**Tech Stack:** Plugin JS wrap + 工作室走线芯片；Native `StackWrap::Coil` 进已有 `layout.cpp`。

## Global Constraints

- 产品版本保持 **0.1.8**，不升号。钉死 zip、`0.1.8-follow.zip`、`0.1.8-newest.zip` 都不准覆盖。
- 试包打 `dist/notification-hub-vnext-0.1.8-coil.zip`，完整插件 zip，不热换。
- 禁止覆盖安装位 `C:\Users\Ganlin\.hanako\plugins\notification-hub-vnext\runtime\notification-hub-runtime.exe`。
- 不改 CMake `VERSION`；不 cmake 重配；不新增必须进 cmake 的 `.cpp`。MSBuild 已有 vcxproj Release。
- 配置包仍不含通道规约。
- 用户词：回字。口头外号回子弯。代码：`coil`。不要螺旋/回旋当芯片。
- 走线不改新位。`stackGrowToNativeDirection` 仍只看 newest，不看 wrap。
- 默认走线仍 `parallel`。回字是点出来的。
- 开新列=关 时走线三颗全灰，点不了（现有 `aria-disabled`）。
- 满了仍掀最旧。剩余卡重新绕紧。
- 卡顿铁律：排版只在来卡/掀卡/改规约时算。跟随只挪窗口（DeferWindowPos / NOREDRAW），禁止因回字画画、ULW、`scene.changed`、空转 60fps。
- 构建：`D:\MyApplications\VS\MSBuild\Current\Bin\MSBuild.exe` 打 `build\runtime-set-charter\runtime\notification-hub-runtime.vcxproj` Release，拷到工作区 `plugin/runtime/`。

## 收框算法（JS / Native 同一套）

卡片数组默认先来的在前（oldest-first）。

- `newest === 'next'`：按数组顺序填，先来的占停靠角，新卡往心里走。
- `newest === 'dock'`（默认）：倒序填，最新一张占停靠角，旧卡往心里让。

```
grow          = 用户往哪长
wrapAxis      = stackWrapGrow(anchor, grow)   // 角落允许的另一边 = 内里
dirs          = [grow, wrapAxis, opposite(grow), opposite(wrapAxis)]
hug           = 停靠在 grow 轴上的那堵墙
                竖长：左停靠 hug=left，右停靠 hug=right
                横长：上停靠 hug=top，下停靠 hug=bottom
rect          = 工作区减去边距
```

循环直到卡排完：

1. 当前 `dir = dirs[i % 4]`。在 `rect` 里沿 `dir` 塞卡，直到下一张塞不下（主轴剩余 < 卡+间距）。这一边厚度 = 这排最厚的那张（竖走用宽，横走用高）。
2. 若一排一张都塞不进：这张卡放不下，OOB。
3. 把这一排放在 hug 那条边上，卡贴 hug（外侧），多出来的厚度朝内里。
4. 剩框从 hug 往里收 `厚度 + spacing`。
5. 下一 hug = 刚走的 `dir` 的远端：down→bottom，up→top，right→right，left→left。
6. `i += 1`。

左上 + 往下长，50×50 卡、间距 0、工作区 200×200、`newest: next`，十六张应对：

```
1 12 11 10
2 13 16  9
3 14 15  8
4  5  6  7
```

坐标：1=(0,0) 2=(0,50) 3=(0,100) 4=(0,150) 5=(50,150) 6=(100,150) 7=(150,150) 8=(150,100) 9=(150,50) 10=(150,0) 11=(100,0) 12=(50,0) 13=(50,50) 14=(50,100) 15=(100,100) 16=(100,50)。

Native 还原 grow：`newest==Next` 则 grow=direction，否则 grow=opposite(direction)。第一边用还原后的 grow，不要用 direction 当第一边。

`wrap==coil` 时不要先走 `layout_linear` 成功就返回；一律走 `layout_coil_wrap`。卡少、第一边就装下，自然只占第一条边。

## 文件

- Create: `docs/adr/ADR-009-stack-wrap-coil.md`
- Modify: `plugin/domain/stack-grow.js`
- Modify: `plugin/domain/channel-charter.js`
- Modify: `plugin/domain/card-visual-settings.js`
- Modify: `plugin/runtime/stack-layout.js`
- Modify: `plugin/routes/settings-visual.js`
- Modify: `plugin/routes/settings-visual-client.js`
- Modify: `runtime/scene/layout.hpp`
- Modify: `runtime/scene/layout.cpp`
- Modify: `runtime/scene/controller.cpp`（layout_json 的 wrap 已有分支，补 coil）
- Modify: `runtime/transport/named_pipe.cpp`
- Modify: `CURRENT-STATUS.md` / `docs/superpowers/plans/README.md` / `scripts/pack-try-zip.py`
- Test: `tests/node/stack-grow.test.mjs`
- Test: `tests/node/channel-charter.test.mjs`
- Test: `tests/node/visual-stack.test.mjs`
- Test: `tests/node/native-visual-payload.test.mjs`
- Test: `tests/node/settings-visual-route.test.mjs`

---

### Task 1: wrap 承认 coil，方向映射仍不看走线

**Files:**
- Modify: `plugin/domain/stack-grow.js`
- Modify: `plugin/domain/channel-charter.js`
- Modify: `plugin/domain/card-visual-settings.js`
- Test: `tests/node/stack-grow.test.mjs`
- Test: `tests/node/channel-charter.test.mjs`

**Interfaces:**
- `STACK_WRAPS = ['off','parallel','snake','coil']`
- `resolveStackWrap('coil') === 'coil'`；未知值仍 `parallel`
- `stackGrowToNativeDirection(anchor, grow, 'coil', newest)` 与 parallel 相同：dock 反向，next 不反向
- `CARD_WRAPS` 同步；`SPACE_FIELDS` 已有 wrap
- charter `channels.stack.wrap` 接受 coil

- [ ] 测试：coil 解析；coil+dock 仍反向；coil+next 不反向
- [ ] 实现：三处 WRAP 列表加 `coil`

---

### Task 2: JS 预览布局回字

**Files:**
- Modify: `plugin/runtime/stack-layout.js`
- Test: `tests/node/visual-stack.test.mjs`

**Interfaces:**
- `createStackLayout({ wrap: 'coil', newest, ... })` 走收框算法，不走 snake/parallel 分列

夹具（spacing 0, margin 0）：

```js
test('coil wrap fills inward from top-left growing down', () => {
  const layout = createStackLayout({
    anchor: 'top-left', spacing: 0, margin: 0, grow: 'down', wrap: 'coil', newest: 'next'
  });
  const cards = [];
  for (let i = 1; i <= 16; i += 1) cards.push({ cardId: String(i), width: 50, height: 50 });
  const result = layout({ workArea: { left: 0, top: 0, width: 200, height: 200 }, cards });
  const xy = Object.fromEntries(result.map((card) => [card.cardId, { x: card.x, y: card.y }]));
  assert.deepEqual(xy['1'], { x: 0, y: 0 });
  assert.deepEqual(xy['4'], { x: 0, y: 150 });
  assert.deepEqual(xy['7'], { x: 150, y: 150 });
  assert.deepEqual(xy['10'], { x: 150, y: 0 });
  assert.deepEqual(xy['12'], { x: 50, y: 0 });
  assert.deepEqual(xy['16'], { x: 100, y: 50 });
});

test('coil wrap dock keeps newest on the corner', () => {
  const layout = createStackLayout({
    anchor: 'top-left', spacing: 0, margin: 0, grow: 'down', wrap: 'coil', newest: 'dock'
  });
  const result = layout({
    workArea: { left: 0, top: 0, width: 200, height: 200 },
    cards: [
      { cardId: 'old', width: 50, height: 50 },
      { cardId: 'new', width: 50, height: 50 }
    ]
  });
  const byId = Object.fromEntries(result.map((card) => [card.cardId, card]));
  assert.equal(byId.new.x, 0);
  assert.equal(byId.new.y, 0);
  assert.equal(byId.old.x, 0);
  assert.equal(byId.old.y, 50);
});

test('coil wrap uses the thickest card on a side and leaves a hole', () => {
  const layout = createStackLayout({
    anchor: 'top-left', spacing: 0, margin: 0, grow: 'down', wrap: 'coil', newest: 'next'
  });
  const result = layout({
    workArea: { left: 0, top: 0, width: 120, height: 100 },
    cards: [
      { cardId: 'a', width: 40, height: 40 },
      { cardId: 'b', width: 60, height: 40 },
      { cardId: 'c', width: 40, height: 40 }
    ]
  });
  const byId = Object.fromEntries(result.map((card) => [card.cardId, card]));
  assert.equal(byId.a.x, 0);
  assert.equal(byId.a.y, 0);
  assert.equal(byId.b.x, 0);
  assert.equal(byId.b.y, 40);
  assert.equal(byId.c.x, 60, 'third card starts after the 60-wide first side');
  assert.equal(byId.c.y, 60);
});
```

第三张：第一边 down hug=left，a+b 高 80，c 再加 40 超过 100，转向 right，hug 变为 bottom；第一边厚度 max(40,60)=60，剩框从左收 60，底边从 x=60 往右排 c，y = 100-40 = 60。

- [ ] 现有蛇形/平行夹具不得被 coil 改掉
- [ ] 第一边装得下就只占一条边（两张 50×50、工作区 200×200，只有向下）
- [ ] 二维满了抛 `VISUAL_BEHAVIOR_LAYOUT_FAILED`

---

### Task 3: 工作室芯片

**Files:**
- Modify: `plugin/routes/settings-visual.js`
- Modify: `plugin/routes/settings-visual-client.js`
- Test: `tests/node/settings-visual-route.test.mjs`

- [ ] `wrapPad` 走线三颗：平行 / 蛇形 / 回字。`pathChip('coil', ..., '回字')`
- [ ] `open===false` 时三颗都 `is-off` + `aria-disabled=true`（现有 pathChip 已做）
- [ ] 注：coil → `越绕越小，满了掀最旧。`
- [ ] hidden select 加 `<option value="coil">`
- [ ] hydrate / collect / `lastWrapPath` 承认 coil（现在只记 parallel|snake，不记会把回字重开成平行）
- [ ] 点回字时若 `aria-disabled=true` 不写（现有判断保留）
- [ ] 弹幕区不得出现回字
- [ ] 测试：fragment 含 `data-wrap-path="coil"` 与 `>回字<`；collect `wrap:'coil'`；关开新列时 coil 芯片 `aria-disabled="true"`

hydrate 现为：

```js
setControl("prop-wrap", space.wrap === "off" || space.wrap === "snake" ? space.wrap : "parallel");
```

改成 off|snake|coil 原样，否则 parallel。

`lastWrapPath` 在 snake|parallel|coil 时更新。

---

### Task 4: Native 解析 + 排版

**Files:**
- Modify: `runtime/scene/layout.hpp`（`StackWrap` 加 `Coil`，不要垫到结构体新字段；这是枚举值）
- Modify: `runtime/transport/named_pipe.cpp`（`wrap == "coil"` → `StackWrap::Coil`）
- Modify: `runtime/scene/layout.cpp`（`layout_coil_wrap`；`layout_stack` 在 coil 时直接走它）
- Modify: `runtime/scene/controller.cpp`（`layout_json` wrap 分支加 coil）

**Interfaces:**
- 缺 wrap 仍 Parallel。未知 wrap 仍拒。
- coil 排版用 `options.newest` + `options.direction` 还原 grow，按 Task 2 同一套收框。
- Native `cards` oldest-first：Dock 从后往前填，Next 从前往后填。
- 不要改 snake / parallel 分支。
- 不要在 tick 里重算 coil。

- [ ] MSBuild Release；`--self-test` / `--follow-self-test` 仍绿
- [ ] 拷 exe 到工作区 `plugin/runtime/`，不碰安装位
- [ ] named-pipe-smoke 带 `NOTIFICATION_HUB_RUNTIME_PATH` 时，set-mode `wrap:"coil"` ACK，layout.wrap==`coil`；`wrap:"helix"` 仍拒

---

### Task 5: payload / ADR / 试包

- [ ] `spaceToNativeStackLayout({ wrap: 'coil' }).wrap === 'coil'`；direction 映射仍只看 newest
- [ ] `docs/adr/ADR-009-stack-wrap-coil.md`；ADR-006 走线若有表则补 coil
- [ ] CURRENT-STATUS / plans README 当前入口改到本计划
- [ ] `scripts/pack-try-zip.py` 打 `0.1.8-coil.zip`，校验钉死 0.1.8 与 newest 试包哈希未变

newest 试包哈希：`2C15540465B3BBE7E1EFEE8527CA08D8DD96B9E87198D7EA70E695696D4C16D5`  
钉死 0.1.8：`5EE8E3FBDF49B571DD76CBCE715710D2522D21F1D645CE9023FEA1D2346AB0E1`
