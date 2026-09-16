# 零件开关 Implementation Plan

> **For agentic workers:** 按 TDD 垂直切片做。一次一个失败测试，再写最少实现。

**Goal:** 标题、正文能关。关掉的不画、不占位。弹幕关掉正文后真卡只留标题。

**Architecture:** 存在记在零件油漆上：`parts.body.show === false`。建树时不把关掉的孩子放进数组。Native 已按 `parts[]` 画，协议、声音、历史、冻结 zip 不动。

**Tech Stack:** Node 测试 + 现有工作室页。不改 C++。

## Global Constraints

- 版本仍 0.1.6，不升号
- 不改冻结包 `dist/notification-hub-vnext-0.1.6.zip`（SHA256 `2BD878DEF7D8CCFCD47FA0482E8444BC0D1B967AC0FBBA201B3F226A7BB54D88`）
- 不改 Native 协议 / 声音 / 通知历史
- 工作室不大改排版：只在「正在编标题/正文」里加一个显示芯片
- 关闭零件仍只跟关闭方式=关闭按钮走，不给关闭加 `show`
- 不做进度条、通道、外部下载口
- 词：开关 = 孩子在不在树上。不要用 enabled（会撞 visual.enabled）
- 字段名：`show`。缺省或 `true` = 在。只有 `false` 才关
- 标题和正文不能同时关：两个都是 false 时树仍留标题
- 关掉的从树里拿掉，剩下的走单字零件默认几何（不留空位）
- 试包用 `python scripts/pack-try-zip.py`，覆盖 `dist/notification-hub-vnext-0.1.6-part-tree.zip`；本计划实现完先跑测试，打包等 Sage 验收后再打

---

### Task 1: 建树可关正文/标题

**Files:**
- Modify: `plugin/domain/card-part-tree.js` `createDefaultTextPartTree`
- Test: `tests/node/card-part-tree.test.mjs`

**Interfaces:**
- Consumes: 现有 `{ width, height, ticker, popup, close }`
- Produces: 增加 `{ title = true, body = true }`。`title === false && body === false` 时按 `title: true` 处理

单字几何（标题在、正文关，或反过来）：

- 弹幕：跟现在 `height < 70` 的标题条一样，字零件铺满卡（左右 14，上下 8 或 4）
- 堆叠：一个字零件占原来标题+正文那块（`x = 30` 或 popup 36，`y = 24`，高到卡底留 22）

- [ ] **Step 1:** 写失败测试 `tall ticker with body off keeps only title filling the card`

```js
test('tall ticker with body off keeps only title filling the card', () => {
  const parts = createDefaultTextPartTree({ width: 480, height: 84, ticker: true, body: false });
  assert.equal(parts.some((part) => part.id === 'body'), false);
  assert.equal(parts.some((part) => part.id === 'title'), true);
  const title = parts.find((part) => part.id === 'title');
  assert.equal(title.x, 14);
  assert.equal(title.y, 8);
  assert.equal(title.w, 480 - 28);
  assert.equal(title.h, 84 - 16);
  validatePartTree(parts);
});
```

- [ ] **Step 2:** 跑这条，确认失败
- [ ] **Step 3:** 改 `createDefaultTextPartTree` 让它过
- [ ] **Step 4:** 再加 `stack with body off omits body and expands title`、`turning both text parts off still keeps title`
- [ ] **Step 5:** `node --test tests/node/card-part-tree.test.mjs`

---

### Task 2: 油漆能存 `show: false`

**Files:**
- Modify: `plugin/domain/card-visual-settings.js` `PART_PAINT_FIELDS` + `normalizeParts`
- Test: `tests/node/card-visual-settings.test.mjs`

`show` 只接受 boolean。`false` 即使没有 fill 也要留下 `{ show: false }`。`true` 不必写出。未知字段仍拒。

- [ ] **Step 1:** 失败测试：

```js
test('part paint keeps show false even without color', () => {
  const settings = createCardVisualSettings({
    types: { minimal: { parts: { body: { show: false } } } }
  });
  assert.deepEqual(settings.types.minimal.parts, { body: { show: false } });
});
```

- [ ] **Step 2:** `normalizeParts` 写入 `show: false`，空对象仍不进 parts
- [ ] **Step 3:** 跑 `tests/node/card-visual-settings.test.mjs`

---

### Task 3: 真卡 payload 不带关掉的零件

**Files:**
- Modify: `plugin/index.js` `notificationCardPayload` 里 `createDefaultTextPartTree(...)`
- Test: 优先接到已有 visual API / payload 测试。若没有现成入口，在 `tests/node/card-part-tree.test.mjs` 测纯函数即可，并在 `plugin/index.js` 用：

```js
title: visual?.parts?.title?.show !== false,
body: visual?.parts?.body?.show !== false
```

关闭仍只看 `dismissMode`，不要读 `parts.close.show`。

- [ ] 跑相关测试，确认 `parts` 数组没有 `id: 'body'`

---

### Task 4: 工作室显示芯片 + 预览不占位

**Files:**
- Modify: `plugin/routes/settings-visual.js` 外观折页
- Modify: `plugin/routes/settings-visual-client.js` collect / defaultPartRect / renderStudioPreview
- Test: `tests/node/settings-visual-route.test.mjs`

UI（不要重排整页）：

- 只在标题/正文的 `part-fields` 加一颗芯片：`显示`，`id="part-show"`，`aria-pressed`
- 隐藏域 `part-title-show` / `part-body-show`，空或 `"true"` = 开，`"false"` = 关
- 关着的零件芯片留着（还能点回来），加 `is-off` 或降低透明度
- 最后一个还开着的字零件：显示芯片不可关
- `collect()` 把 `show: false` 写进 `draft.parts`
- `defaultPartRect` 与 Task 1 单字几何一致
- `renderStudioPreview`：`show === false` 的标题/正文按钮不要插入。弹幕关正文后卡片里只有标题，不要留「从右往左」那一行

- [ ] 路由测试：页里有 `part-show`；collect 草稿 `parts.body.show === false` 时保存后再读仍在
- [ ] `node --test tests/node/settings-visual-route.test.mjs`

---

### Task 5: 回归

Run:

```
node --test tests/node/card-part-tree.test.mjs tests/node/card-visual-settings.test.mjs tests/node/settings-visual-route.test.mjs tests/node/plugin-visual-api.test.mjs
```

不要打试看包。不要改 `CURRENT-STATUS.md`（Sage 验收后写）。不要 commit。

**验收：**

1. 弹幕、正文 `show: false` → Native/payload 零件树无 body，标题铺满
2. 默认旧配置包不含 `show` → 行为与现在一样（标题+正文）
3. 标题、正文不能同时关掉
4. 关闭零件逻辑不变
)
