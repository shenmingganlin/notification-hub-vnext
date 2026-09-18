# 自定义文字（零件内容源） Implementation Plan

**Goal:** 标题、正文零件可以跟事件，或写死自定义字。只改字。事件来了照飞，不会一直挂着。

**Architecture:** `contentSource: event|custom` 和 `customText` 长在 title/body 零件上，跟配置包走，不进通道法律。Native 只吃写好的 `title`/`body`。Plugin 发卡时用 `resolvePartContent` 替换。助手名不接。

## Global Constraints

- 产品仍 **0.1.8**。钉死包 `notification-hub-vnext-0.1.8.zip` SHA256 `CA8484EC76A32751CB4698A2F09CB7F7AB0FAF4BD0F93689B5BE32508E851B21` 不准覆盖。
- overlay / follow / newest / coil / hover 历史试包不准覆盖。hover SHA256 `DCD480E3931079902DA1777AE9323D3732F8997E09C3AB45278EC2269871A980`。试包 `dist/notification-hub-vnext-0.1.8-content.zip` SHA256 `7A3FB7EF6491F659D650183110CAA1C2E81289A48DF135164C2AB607481872F8`（3958700 字节）。
- 不是新飞法，不是常驻。不做路径飞、淡入、粒子、入场出场、皮肤裁切。
- 本刀 JS-only，不 cmake、不 MSBuild、不热换。须整包重装。
- title 自定义禁止空串；body 自定义可空。event 时省略 `contentSource`，可留 `customText` 方便切回去。

## 文件

- Modify: `plugin/domain/card-visual-settings.js`（校验 + `resolvePartContent`）
- Modify: `plugin/routes/settings-visual.js` / `settings-visual-client.js`
- Modify: `plugin/index.js`（发卡、试一条、实验台、预览）
- Test: `tests/node/card-visual-settings.test.mjs` / `settings-visual-route.test.mjs` / `plugin-visual-api.test.mjs`
- Pack: `scripts/pack-try-zip.py` → `0.1.8-content.zip`

## 验收

1. 标题自定义：事件来了标题仍是写死字，卡照飞照走。
2. 正文自定义、标题跟事件：两路独立。
3. 试一条 / 实验台 / 实时预览不覆盖写死字。
4. 助手名没有内容源芯片。
5. 配置包带着字走。钉死包与 hover 哈希未变。
