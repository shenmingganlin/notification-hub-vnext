# 2026-09-15 字描边（textStroke）

## 目标

标题 / 正文 / 助手名可开「字描边」并选颜色。默认关。弹幕不再强制黑边，重影消失。堆叠和弹幕同一套。

字描边 ≠ 零件框描边。`stroke` / `strokeWidth` 仍是框。宽度本刀不动，halo 仍是 1.35px 八向。

## 字段

写在 `parts.title` / `parts.body` / `parts.assistantName`：

| 字段 | 缺省 | 落盘 |
|---|---|---|
| `textStroke` | `false` | 仅 `true` 写入；`false` 省略 |
| `textStrokeColor` | `#0a0d0d`（旧 Native 黑边） | 仅 `textStroke===true` 且合法 `#RRGGBB` 时写入 |

关闭、图标、根：未知字段，拒绝。

## 不做

- 不改描边宽度、算法、零件框描边组
- 不改 VERSION / 冻结包 0.1.6.zip / ticker.direction
- 不打 zip（Sage 验收后再打 `dist/notification-hub-vnext-0.1.7-try.zip`）
- 不竖向弹幕、不突脸、不裁切

## JS

- `card-visual-settings.js`：`TEXT_PART_PAINT_FIELDS` 加两字段；validate；normalize 仅 true+色落盘
- `card-part-tree.js`：`paintPartTree` 文本零件写 `textStroke === true`、合法色；默认 false 不写树（或写 false 亦可，Native 缺省 false）
- `settings-visual.js`：
  - hidden：`part-{id}-text-stroke`、`part-{id}-text-stroke-color`
  - 「文字」组、字样式芯片下面：芯片「字描边」+ 颜色（关则藏色）
  - 不要放进「描边」组
- `settings-visual-client.js`：read/write/flush/collect/chip/selectPart
  - **`collect()` 内联** `id === "title" \|\| id === "body" \|\| id === "assistantName"`，禁止调外部 helper（测试切片 collect）
  - 关：不写 `textStroke` / `textStrokeColor`
- 芯片开默认色 `#0a0d0d`

## Native

- `CardPart` **末尾**加：`bool text_stroke{}; std::string text_stroke_color;`（`fit_compensate` 之后）
- `named_pipe.cpp` 解析 `textStroke` / `textStrokeColor`；未知键仍拒绝，所以必须认
- `renderer.cpp`：
  - 弹幕 `draw_part_label(..., outline=true)` → `outline = drawn.text_stroke`
  - 堆叠已是 `false`，改成同一条件
  - halo 刷：合法 `text_stroke_color` 用该色，否则旧 `text_stroke_brush`
  - 无零件树回退：不要再 `draw_outlined_text`，默认无边
- 八向 1.35px 算法不动

## 测试

- settings persist true+色；false 省略；close/icon 拒绝
- paintPartTree 写入文本零件，跳过 close
- collect 开写入、关省略；SSR hidden / 芯片文案「字描边」
- Node 相关测全绿

## 构建

CMake：`C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe`  
目录：`build/vs2022-fill-fix`  
target：`notification-hub-runtime`  
编完拷 `plugin/runtime/notification-hub-runtime.exe`

git 工作区本来就脏，只动本刀文件。
