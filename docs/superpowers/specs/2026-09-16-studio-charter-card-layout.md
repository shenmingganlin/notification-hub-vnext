# 通知视觉工作室 · 结构 A（通道 / 这张卡）

日期：2026-09-16  
状态：静态规格，不改生产页、不改 Native / 协议 / collect  
对照原型：`docs/superpowers/prototypes/studio-charter-card-stack.html`、`studio-charter-card-ticker.html`  
词表：ADR-006。气质锁 2026-09-12 色板，不退三栏，不换皮。

## 1. 一句话

先定通道（全池一份法律），再定这张卡怎么走、活多久。换飞法只换这两组；卡面共用。

## 2. 信息架构（一屏竖流）

```text
通知视觉                              [保存]
副文案（结构 A 一句）

飞法：堆叠 | 弹幕 | 突脸（未实现）

上  通道     ← 全池法律，改了影响所有同飞法的卡
下  这张卡   ← 这张卡自己的动态 + 寿命，互不影响
   卡面     ← 外观 / 零件，权重更低，不另起一套
   预览     ← 只演当前飞法（原型里可动；生产仍可贴实时预览）

次级折叠：配置包 / 应用于事件 / 诊断
```

飞法门票仍是顶上芯片。换飞法 = 换「通道」块和「这张卡」块的内容。卡面不跟着换皮。

全局视觉开关保持在飞法之上，不进通道，不进配置包。

## 3. 分区与控件归属

无关控件是「不出现」，不是折叠。`#stack-section` / `#ticker-section` 可留作隐藏同步壳，可见结构拆成两个 group。

### 3.1 堆叠

| 区 | 可见文案 | 现有 id（沿用） | 域 |
|---|---|---|---|
| 通道 | 停靠 | `prop-anchor` + `.dock` / `data-anchor` | StackCharter |
| 通道 | 往哪长 | `prop-grow` + `.grow` / `data-grow` | StackCharter |
| 通道 | 开新行（或开新列）/ 走线 | `prop-wrap` + `data-wrap-open` / `data-wrap-path` | StackCharter |
| 通道 | 距左 / 距右 / 距上 / 距下 | `prop-margin-*` | StackCharter |
| 通道 | 卡片间距 | `prop-gap` | StackCharter |
| 这张卡 | 关闭方式 | `prop-dismiss-close` / `prop-dismiss-anywhere` / `prop-dismiss-auto` / `prop-dismiss-mode` | CardLife |
| 这张卡 | 停留（秒） | `hold-seconds`（hidden 仍 `prop-hold-duration`） | CardLife |
| 这张卡 | 悬停加亮 | `prop-hover-highlight` | CardLife |

边距不再塞进「更多」折叠：它们是通道法律，进通道主表面；停靠对面两面保持灰、禁用。

不要放：PID、跟随、`settle` 可见控件（现行只有 snap）。

### 3.2 弹幕

| 区 | 可见文案 | 现有 id（沿用） | 域 |
|---|---|---|---|
| 通道 | 带子（贴顶 / 贴底） | `ticker-band` + `#ticker-band-control` / `data-band` | TickerCharter |
| 通道 | 轨道数 | `ticker-track-count` | TickerCharter |
| 通道 | 同轨净空 | `ticker-min-gap` | TickerCharter |
| 通道 | 异轨间距 | `ticker-track-gap` | TickerCharter |
| 通道 | 点穿（芯片：不挡点击） | `ticker-click-through` | TickerCharter |
| 这张卡 | 方向（右 → 左 / 左 → 右） | `ticker-direction` + `data-ticker-direction` | TickerMotion |
| 这张卡 | 速度 | `ticker-speed` / `ticker-speed-val` | TickerMotion |
| 这张卡 | 速度随机 | `ticker-speed-random` | TickerMotion |
| 这张卡 | 悬停加亮 | `ticker-hover-highlight` | 卡片；点穿开着时锁定 |
| 这张卡 | 悬停暂停 | `ticker-hover-pause` | TickerMotion；点穿开着时锁定；与加亮独立 |

满轨策略：现行工作室没有可见控件 → **不要新造**。`overflow` 继续藏在规约默认值里。

带子高度仍可由轨道数带动（现逻辑），不单独做成与通道抢权的第三组。`ticker-band-ratio` 保持 hidden。

不要放：淡入淡出、函数路径、停靠角、四边距、停留秒数。

点穿开着：`ticker-hover-highlight` 与 `ticker-hover-pause` 都加 `is-locked`，说明句 `#ticker-hover-why` 显示。点穿关掉后两颗才能点，可同时开。

### 3.3 卡面（两种飞法都在，权重更低）

现有 `#appearance-section` 保留。可见标题改为「卡面」。零件芯片、根字段、底图、词表都留；不把通道法律塞进来。

标题、正文零件有内容源芯片：跟事件 / 自定义。自定义只改字，事件来了照飞，不会一直挂着。助手名不接。户口在零件上（`contentSource` + `customText`），跟配置包走，不进通道法律。

### 3.4 次级

配置包 / 应用于事件 / 诊断仍默认折叠。通道法律禁止搬进配置包区。

## 4. 文案（名实一致）

代码内部可继续用 `behaviorId` / `data-axis="behavior"`（collect 语义本刀不动）。**用户可见字符串**禁止再用「行为」「出现方式」当标题或万金油。

| 位置 | 现行 | 改为 |
|---|---|---|
| hero 副文案 | 选一种出现方式，只调这一组，看见它怎么动，再保存。 | 先定通道（全池一份法律），再定这张卡怎么走、活多久。换飞法只换这两组。 |
| `modeChips` 标题 / aria | 出现方式 | 飞法 |
| `#mode-face-hint` | 换堆叠或弹幕，外观不会另起一套。 | 换堆叠或弹幕，卡面不另起一套。 |
| `#pipeline-behavior` aria | 出现方式 | 飞法（控件 hidden，只改 aria） |
| 堆叠主标题 | 堆叠怎么出现 | 拆掉。上区叫「通道」，下区叫「这张卡」 |
| 弹幕主标题 | 弹幕怎么流 | 同上 |
| 通道 hint（堆叠） | 卡片从角落叠上来… | 全池一份法律。停靠、往哪长、走线、边距，改了所有堆叠卡都听。 |
| 通道 hint（弹幕） | 卡片从右往左流过… | 全池一份法律。带子、轨道、净空、点穿，改了所有弹幕卡都听。 |
| 这张卡 hint（堆叠） | （混在通道里） | 只改这张卡的关闭、停留、加亮。别的卡不受影响。 |
| 这张卡 hint（弹幕） | （方向写在通道里） | 只改这张卡的方向、速度、加亮和暂停。点穿开着时加亮和暂停点不到。 |
| 外观 summary | 卡片外观 | 卡面 |
| 弹幕带位置 | 弹幕带位置 | 带子 |
| 同轨间距 | 同轨间距 | 同轨净空 |
| 指针 | 指针 | 删掉这个万金油标签。点穿是通道字段名。 |
| 不挡点击 | 不挡点击 | 保留芯片字；它就是点穿的人话 |

芯片「堆叠 / 弹幕 / 突脸」不改。突脸仍「未实现」+ `#popup-why`。

禁止可见文案：行为通道、出现方式（当标题）、把方向叫通道、把点穿叫卡片。

## 5. 间距 / 层级

沿用 2026-09-12 视觉规格，只改结构节奏：

| 量 | 值 |
|---|---|
| 色板 | `bg #0e1513 / surface #17221f / raised #1d2b27 / text #e7f2ee / muted #9bb1a9 / line #304740 / accent #62d0a8 / strong #38b88d / ticker #56c8d8 / popup #f1c77a` |
| 页标题 | 23px / 700 / text。全页一个 h1 |
| 副文案 | 14px / muted |
| 飞法 → 通道 | 32px |
| 通道 → 这张卡 | 32px + 1px `line` 细分割（不是再套一张大卡片） |
| 这张卡 → 卡面 | 32px。卡面分组名 13px / 600 / muted |
| 卡面 → 预览 | 32px |
| 预览 → 次级 | 40px + 1px line |
| 组名 | 13px / 700 / text（通道、这张卡） |
| 标签 | ≥12px muted |
| 控件高 | 36px |
| 停靠 / 往哪长 | 空间控件，约 168×112（生产里可更高，不要退化成四个数字当主角） |
| 带子 | 220×96 带状，不要纯下拉当主角 |
| 字段网格 | 最多两列，`max-width: 720px` |

通道、这张卡：**靠留白成组**，不要再包一层 `details.fold.panel` 当主编辑器。卡面可以继续 `details`，默认开，但是 `.is-quiet`。

820 / 560 收法同 2026-09-12：单栏竖流，不回三栏；560 标题与保存上下排，字段一列。

## 6. 禁止项

- 不改 Native / 协议 / collect 字段语义
- 不改皮肤裁切、突脸真身、淡入、PID、路径飞法
- 不回到左中右三栏
- 不把通道法律塞进配置包区
- 不新造满轨、淡入、函数路径控件
- 不把关闭/停留/速度/方向写进通道
- 不把停靠/带子/点穿写进「这张卡」
- 用户可见文案不用「行为」「出现方式」当标题
- 本刀不写 `plugin/` 实现

## 7. 给墨斗的交接清单

只重组 DOM 和可见文案。id 尽量沿用。hidden 同步 select 保留。

### `modeChips(behaviorId)`

- 标题 / `aria-label`：出现方式 → **飞法**
- `#mode-face-hint` 改成「换堆叠或弹幕，卡面不另起一套。」
- 芯片 `data-axis="behavior"`、`data-value`、突脸锁定：不动

### `stackSection(props, behaviorId)`

拆成两个可见 group（不要一个 summary「堆叠怎么出现」）：

1. **通道** `#stack-charter`（或 `#stack-section` 内第一块）：停靠、往哪长、开新行/走线、边距四向、`prop-gap`。边距从 `details.more` 升到通道主表面。
2. **这张卡** `#stack-card`：关闭方式、停留秒数、`prop-hover-highlight`。

`behaviorId === 'ticker'` 时整组 `hidden`，不要灰掉。

### `tickerSection(ticker, behaviorId, hoverHighlight)`

拆成两个可见 group（不要一个 summary「弹幕怎么流」）：

1. **通道** `#ticker-charter`：带子、轨道数、同轨净空、异轨间距、`ticker-click-through`。删掉「指针」这个标签。
2. **这张卡** `#ticker-card`：方向芯片 + `ticker-direction`、速度滑杆、`ticker-speed-random`、`ticker-hover-highlight`、`ticker-hover-pause`（点穿开着锁定 + `#ticker-hover-why`）。两颗独立。

方向、速度从通道挪到「这张卡」。`behaviorId !== 'ticker'` 时整组 `hidden`。

### `appearanceSection(...)`

- summary / aria：卡片外观 → **卡面**
- 位置：必须在通道和这张卡之后
- 继续 `.is-quiet`；不要提到飞法

### `renderBody(...)`

- hero `<p>` 换成第 4 节那句
- `#pipeline-behavior` 的 aria-label：飞法
- 主列顺序：`modeChips` → 当前飞法的通道 → 当前飞法的这张卡 → `appearanceSection` →（若有预览台）→ `.studio-secondary`
- 不要把 `stackSection` 整块和 `tickerSection` 整块同时画成两套可见手风琴

### CSS（生产落地时）

- 新：`.group-charter` / `.group-card` 段距 32px，中间 1px line
- 废：把 `.stack-life` 嵌进 `.stack-layout` 第四列（寿命不再和停靠同一行）
- `.stack-layout` 只服务通道：停靠 | 往哪长 | 走线，下面再接边距网格
- 弹幕通道用现成 `.ticker-flow-stage` / `-lanes` / `-pointer`；速度块 `.ticker-flow-pace` 挂到「这张卡」
- 不换色板，不加光晕

### 验收（Sage）

打开两屏原型对照：上区全是法律，下区全是这张卡；切飞法卡面还在；可见字里没有「出现方式」「行为通道」。
