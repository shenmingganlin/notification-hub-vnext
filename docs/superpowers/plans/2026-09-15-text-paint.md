# 2026-09-15 刀二：字号 / 系统字体 / 彩色字（待刀一收口）

## 目标

标题、正文可调字号、系统字体、单色或每字随机色。零件宽高是房间，字号是住客；字太大按框裁切。导入 TTF 后置。

## 字段（可选，缺省 = 现状）

写在 `parts.title` / `parts.body`（关闭、根没有）：

| 字段 | 缺省 | 含义 |
|---|---|---|
| `fontSize` | 标题 20 / 正文 13 | 8–72 |
| `fontFamily` | `yahei`（渲染回退链：Microsoft YaHei → Segoe UI） | `yahei` / `heiti` / `songti` / `segoe` |
| `textPaint` | `solid` | `solid` \| `rainbow` |

`fill` 仍是单色字。`textPaint=rainbow` 时忽略 fill 画字（UI 灰掉填充）。

宽高标签：`宽（1–720）` → `区域宽（1–720）`；高同理。卡宽卡高不动。

## Native

- 拆掉进程级共用 `title_format`/`body_format` 当唯一字号来源；按 `(family, size, weight)` 缓存 `IDWriteTextFormat`
- 家族：`Microsoft YaHei` / `SimHei` / `SimSun` / `Segoe UI`；Create 失败则雅黑，再失败 Segoe
- 标题 SemiBold + NO_WRAP；正文 Regular + WRAP。裁切仍靠零件 rect
- rainbow：`IDWriteTextLayout` 按簇上色；种子 = 卡片 id（或 title+body 稳定哈希），**禁止按帧洗牌**
- 色相轮饱和色；弹幕描边保留
- 旧卡不带字段 = 20/13 + 单色 + 雅黑回退（中文现状）

## UI

- 仅标题/正文：字号数字、字体下拉、芯片「彩色字」
- 彩色字开：填充 disabled；关：填充回来
- 舞台预览：字号/字体用 CSS；彩色字把文案拆成 span，颜色用同一稳定哈希，不要随机闪

## 非目标

导入字体包、通道、底图圆角、改 JSON `opacity` 名。
