# 当前状态快照（2026-08-15，Windows）

## 2026-09-16 词表 + 通道规约（0.1.8 进行中）

计划：`docs/superpowers/plans/2026-09-16-lexicon-and-channel-charter.md`。ADR-006 已写。

Git：`f389d29` 为 0.1.7 回滚点；分支 `reform/0.1.8-lexicon`。

已落地：`channel-charter` 户口；视觉设置带 `channels` + `flight`；配置包 strip 规约；Native 不再用后一张卡覆盖带子/净空；出生方向读这张卡。
弹幕规约走 `scene.set-charter`（试一条/预览/真卡发卡前写入）。堆叠仍走 `scene.set-mode`。未发 charter 时 Native 仍可用第一张卡播种。
Native 内部 `FlightChannelState`；scene-state JSON 仍叫 `behaviorChannels`。JS 飞法解析正名为 `visual-event-native-flight.js`。
`createFlightProfile` 只组装门票 + `CardLife`；`maxVisible` 仍挂着兼容，容量真正在 policy。

未做：工作室 A 排版、PID follow、路径飞法、淡入、VERSION 0.1.8、事件巷文件物理切换、诊断旧码并行。

## 2026-09-15 0.1.7 开线

零件收口。版本升到 0.1.7，行为优化从弹幕方向开始。弹幕 `direction` 整池二选一：默认 `left`（右→左），`right` 为左→右。文案/影子/试一条/Native 进出屏一起改。0.1.6 冻结包 `dist/notification-hub-vnext-0.1.6.zip` 仍不动。试看包改打 `dist/notification-hub-vnext-0.1.7-try.zip`。

## 2026-09-15 零件填充=字体色

弹幕 Native 之前用默认白笔写字，忽略 `parts.title.fill` / `parts.body.fill`。舞台 CSS 是对的，试一条和实时预览不变。现已跟堆叠一样：有 hex 填充就当字体色。标题/正文控件文案改为「填充（字体颜色）」。关闭钮仍是底色。冻结包未动。

- 试看包 `dist/notification-hub-vnext-0.1.6-part-tree.zip` SHA256 `B01821B2D71628CD717D2AF582636CA07BCC234A5921CBB6FBE2DF49C0006BB0`（753940 字节 / 194 条）

## 2026-09-15 零件开关

标题 / 正文能关。关掉的不进树、不画、不占位；弹幕关正文后只留标题，标题铺满字区。两个字零件不能同时关。关闭钮仍只跟关闭方式。进度条 / 下载报数封存。Native 协议 / 声音 / 历史 / 冻结包未动。

- 字段：`parts.title.show` / `parts.body.show`；只有 `false` 才关
- 工作室：编标题或正文时多一颗「显示」
- 测试：`card-part-tree` + `card-visual-settings` + `settings-visual-route` + `plugin-visual-api` 共 113 项全绿
- 试看包 `dist/notification-hub-vnext-0.1.6-part-tree.zip` SHA256 `073585FE03402EDB8C5C4DEC83E0A24F1ABBA21E55B141D048EDD6E55E1ADCB1`（755359 字节 / 194 条）
- 冻结 SHA256 仍是 `2BD878DEF7D8CCFCD47FA0482E8444BC0D1B967AC0FBBA201B3F226A7BB54D88`

## 2026-09-14 堆叠停靠 + 关闭方式

0.1.6 解冻后剩下的 Native 卡面 bug：试一条堆叠总贴右上；关闭方式三选一。

- Native create 重排只看 `has_active_layout`，不再因 `behaviorChannelId` 就扣到 TopRight
- JS 堆叠 `scene.create` 前先 `scene.set-mode`（`space.anchor` + `gap`）；弹幕不发
- 工作室关闭方式改芯片：关闭按钮 / 任意点击二选一；超时自动收可叠加，默认关
- Native `autoDismiss` + timeoutMs 上限 120000；插件不再用 `cardLifetimeSeconds` 120s 杀 Native 视觉卡
- 弹幕仍出屏回收，不走超时
- 试看包 `dist/notification-hub-vnext-0.1.6-part-tree.zip` SHA256 `432DACC752FAE614AFA55369D4BF3F0D4C4C58CCB28F3015E7AC8ECB55747E7B`（752520 字节 / 195 条）
- 冻结验收包 SHA256 仍是 `2BD878DEF7D8CCFCD47FA0482E8444BC0D1B967AC0FBBA201B3F226A7BB54D88`
- 边距仍未进 Native（flush）；不动声音 / 历史 / 突脸 / 内存优化

## 2026-09-13 计划心智：卡面与通道

现行设计 `docs/superpowers/plans/2026-09-13-card-face-and-channel.md`。卡面 = 根零件 + 孩子；通道 = 一种飞法一个池。

零件树：根已是一等零件 `{id:root, kind:block}`，后面才是标题、正文、关闭。描边、填充、底图已接到真卡。Native 圆角卡板优先用根的 fill/stroke/底图；没有根再回退 appearance。子零件循环跳过 root，避免直角叠圆角板。工作室排版未改：没选中仍在编根，根色和底图仍写 appearance，下发时映射到根零件。裁切仍是窗口切割溢出，wallpaper clip = halo 几何（`bounds ± overflow`）；cover-to-card；同比例 + scale=1 无溢出血。`backgroundPadding` 存着但未进 dest。悬停加亮已接：默认关。弹幕点穿开着时悬停变灰。绘制溢出已接：默认 0；加上后窗口比可点框大一圈，多出来的皮不抢鼠标。选中零件已接：点标题/正文/关闭只出那一件的填充和描边，写进真卡。弹幕没有关闭。不加放大。词表已接：根上加名字，零件可跟名字走，改名字的色引用一起变；Native 只吃解析后的色值。一键清除视觉卡已在标题旁，不是下一刀。声音、历史未动。内存占用过大先记下，不进这刀。底图/裁切已并进根的皮，不是子零件 `kind:image`。试看包 `dist/notification-hub-vnext-0.1.6-part-tree.zip` SHA256 `A747CD92BEDF0C172B7BA6A0E73E92BF0494746E0B8722477FF398E458BE2DFF`（完整插件包，749653 字节 / 195 条，不是冻结验收包）。拖动后分层图跟 HWND 一起走，关闭手势不会被拖动手势卡住。堆叠左侧装饰条和弹幕底边装饰条已删。舞台堆叠只演一张卡。关闭零件只在关闭方式=关闭按钮时出现。字裁在卡面里。

## 2026-09-13 0.1.6 冻结

真机确认弹幕工作室「帅呆」后封口。版本停在 0.1.6，不升号。工作室排版、协议、Native 声音、通知历史不再改。

- 验收包：`dist/notification-hub-vnext-0.1.6.zip`
- SHA256：`2BD878DEF7D8CCFCD47FA0482E8444BC0D1B967AC0FBBA201B3F226A7BB54D88`
- 已验收：默认安静、事件自选飞或叠、弹幕怎么流竖读、随机可点、异轨间距、试一条走草稿
- 真机还需摸：标题旁「清除屏幕上的视觉卡」（清屏幕卡，不动通知历史）
- 冻结期内不改产品。解冻后下一刀按 09-13：Native 读最小零件树。背景素材/裁切并进零件皮，不单列皮肤阶段。突脸 = 新池，后做

## 2026-09-12 通知视觉页 · 试一条贴标题、走草稿

真机发现试一条在设置壳里掉到折页下，且测的是事件已绑定配置包，不是当前工作室。

- 试一条挪到标题行，贴着保存
- `POST /visual-try-one` 用 `collect()` 草稿出一张真实卡，不要求绑定事件，不写历史
- 弹幕草稿带 `behavior.ticker` + `visual.ticker`；折叠区「实验细节」仍测已绑定事件
- 测试：`settings-visual-route` + `plugin-visual-api` 全绿
- 版本仍 0.1.6；已拷到 `~/.hanako/plugins/notification-hub-vnext`，需重载插件后真机才吃到

## 2026-09-12 通知视觉页 · 卡片工作室落地

用户确认静态稿后，生产页从工程工作台收成卡片工作室。

- 规格：`docs/superpowers/specs/2026-09-12-visual-studio-elegance.md`
- 静态稿：`docs/superpowers/prototypes/visual-studio-elegance.html`
- 生产：`plugin/routes/settings-visual.js`；测试 `tests/node/settings-visual-route.test.mjs`
- 第一屏：出现方式芯片 → 当前旋钮 → 卡片外观 → 单通道预览 + 保存
- 配置包 / 应用到事件 / 实验细节 / 诊断默认折叠
- Native、声音、协议未改；版本仍 0.1.6

## 2026-09-12 卡片两轴分离（根修复）+ 设置页两轴重构

背景：`CARD_TYPES` 曾有两个矛盾定义——未接线的内容结构契约（`card-composition-contract.js`，后已删除）与运行时 `card-visual-settings.js` 把「外观＋出现方式」揉成 `minimal/danmaku/popup`。同时系统里另有一条真实行为轴（表现绑定的 `behaviorProfileId`）。现行以 ADR-005 为准。

决策：`docs/adr/ADR-002-card-type-behavior-axis.md`；实现计划：`docs/superpowers/plans/2026-09-12-card-behavior-axis-separation.md`。

- **卡片种类回归内容结构轴**：`CARD_TYPES` 对齐 `CARD_TYPE_IDS`（已实现仅 `minimal`）；`card.types[*].behavior` 删除。
- **出现方式独立为 `profile.behaviorId`**：词表 `stack/ticker/popup`，已实现仅 `stack`；`danmaku` 收敛为迁移期别名 `ticker`。
- **v1→v2 迁移**：新增 `plugin/domain/visual-profile-migration.js`（纯函数、幂等）；两套存储的 load 路径都会经 `createVisualProfile` 自动升级，旧数据不再因版本号被拒绝。
- **运行时投影**：`native-visual-payload`、`runtime/scene-state`、`visual-rule-resolver` 三处 `cardType` 白名单收敛到单一来源；几何参数改由 `properties.space` 承载。
- **设置页**：顶部改为「出现方式｜卡片种类」双格轴条，左栏改为「起步预设」；未实现能力显示但 `aria-disabled` 并带**非颜色**文字标记「未实现」；删除装饰性「出现方式」下拉。
- **验证**：`npm run check` 338 文件通过；全量 `npm test` **1021 项 / 994 通过 / 0 失败 / 27 跳过**；`git diff --check` 退出码 0。
- 页面不变量实测：实心主按钮 1 个、禁用控件 0 个、无 `data-visual-mode` 残留、`danmaku` 残留 0、收集草稿为 `version:2` 且含 `behaviorId`。
- 待办：真机安装新包验收设置页两条轴的呈现与保存闭环。

## 2026-09-11 视觉页收敛（Round 2 · IA 收缩）

目标：把通知视觉页从“配置表单”收敛为“看得见的都是能用的”。规格与验收见 `docs\superpowers\plans\2026-09-11-visual-page-convergence.md`。

- 移除 24 个未实现或静默失效的控件：外形（模糊/阴影/边框）、排版、入场退场时长、关闭按钮位置、资源边界、特效全区、语义颜色 5 色、悬停/展开/点击开关。
- 解锁 `关闭方式`（`dismissMode`）：Native `window.cpp` 对 `timeout`/`anywhere` 有真实分支，此前误标“后续加入”锁死。
- `properties.shape` 成为外形属性唯一来源；`skin.decoration` 的 `borderRadius`/`opacity` 改为派生，去除双轨。
- 主操作层级：常规流程仅保留 1 个实心按钮（`保存视觉设置`）；模式卡选中态改为描边 + 左侧色条。
- 清理死代码：`if(false&&previewStage…)` 分支、被注释的 `profileCard`/`renderProfileList`、`visibility:hidden` 占位；移除“第 1 阶段 · 基本能力”“已接通”等工程文案；模式卡首字改英文（消除“极极简”）。
- 数据模型全部保留（`skin.semanticColors`、`effects.slots`、`properties.typography/interaction/resource`），只移除 UI 入口，Profile 导入导出不受影响。

渲染实测：disabled 24→0，coming 角标 24→0，实心按钮 7→1，编辑器 1530→928px，页面 3249→2647px。

验证：`settings-visual-route.test.mjs` 19/19；`plugin-lifecycle.test.mjs` 74/74；`npm run check` 336 文件；全量 `npm test` **1012 项，985 通过，0 失败，27 跳过**；`git diff --check` 退出码 0。

### 附带结清：既有失败测试（3 条）

- 两条视觉断言过期（`interaction` 字段缺失、显式宽度与宽高比矛盾），已修正。
- 其中一条存在**测试隔离缺陷**：夹具 `dataDir` 指向真实安装目录 `C:\Hana\data\notification-hub-vnext`，事件绑定持久化默认开启，测试会读本机状态——这是它“时好时坏”的根因，已显式关闭。
- 一条淘汰测试夹具缺通道身份，按“通道作用域淘汰”语义修正。

本轮未修改 Native 协议、声音、通知记录与插件生命周期；未执行 Git commit。

## 2026-08-20 第四轮现场修复：通知视觉 / 通知行为信息架构

- 设置导航将“事件表现”更名为“通知行为”，描述收敛为卡片行为、行为通道、重要性与事件绑定。
- “通知视觉”现在只负责卡片设计、实时预览、保存视觉方案、导出视觉包和打开素材库；事件应用与逐事件测试已移出。
- “通知行为”新增视觉方案应用、行为通道、事件绑定编辑、重要性关键词和六类真实通知测试；继续复用既有 Visual Profile、Event Presentation 和通知测试 API。
- 声音页“最近声音状态”显式跨高级工具两列铺满，避免诊断列表被压在半宽卡片中。
- 修复并验证动态行为页脚本转义，避免模板字符串中的换行正则破坏浏览器脚本解析。

当前轮次继续完成 focused、全量 Node、Native Named Pipe 和 0.1.4 打包验证。

- focused 设置与生命周期测试：75 通过、0 失败。
- 全量 Node 测试：868 个测试中 841 通过、0 失败、27 跳过。
- `npm run check`：311 个 JavaScript 文件通过；`git diff --check` 通过。
- Native Named Pipe：3 项全部通过。
- 最新 `0.1.4` ZIP：179 个文件，SHA256 `17A039131B69AF3C4D4669D5AE555D9FE8CA5D1E52585E18F6F59CD205EFA3E5`。

## 2026-08-20 第三轮现场修复：协议闭环与页面收敛

- 修复 Native Scene Card 根节点字段泄漏：`gap`、`margin` 仍用于 Plugin 侧布局计算，但不再发送给 Native 严格 `scene.create` 解析器。
- 修复异步 `scene.changed` SceneState 校验：Plugin 现在接受 Native 返回的完整受控 `visual.cardType`、`visual.behavior` 和 `visual.appearance`，同时继续拒绝未知字段和越界值。
- 真实 Named Pipe `named-pipe-behavior-channel`、`named-pipe-scene-event`、`named-pipe-smoke` 通过；Node 全量测试 `841` 通过、`0` 失败、`27` 跳过。
- 视觉页删除四步工作流条、重复步骤编号、重复素材入口和视觉页导入包按钮；保留单一“打开素材库”按钮，导航保留 `pluginIframeTicket`、`pluginSurfaceSession`、`token`。
- 声音页将音频库移出“高级工具与诊断”，置于自定义声音之后独立占满一行；高级区只保留实验台、规则解释和诊断。
- 设置壳层固定导航按钮字重，并隐藏声音/视觉 fragment 内重复的壳层标题，避免动态 fragment 的全局 `button` 样式污染导航。
- 新计划：`docs\\superpowers\\plans\\2026-08-20-visual-workbench-acceptance-repair.md`。
- 本轮 0.1.4 修复包：`dist\\notification-hub-vnext-0.1.4.zip`，179 个文件，SHA256 `17FBB64DFB9DD42011D35D9B571F7708CBC8D253E69AD9B313E51CF1BCFF647B`。


## 最新追加：Phase 4 配置包导入导出 — Plugin API/UI 闭环

- 新增 `visual-package-io.js`：`exportVisualPackage()` 将 Profile/Binding/Asset 序列化为 ZIP；`previewImportVisualPackage()` 预览导入结果；`importVisualPackage()` 支持 copy/skip/overwrite 三种冲突策略。
- 配置包新增 `settings/assets.json`，保留素材名称、种类和标签等元数据。
- 导入时按 SHA256 复用相同素材，并自动改写 Profile 内的 `backgroundAssetId`；补充跨机器 ID 映射测试。
- Plugin 新增配置包 API：导出到 Windows 保存对话框、multipart/JSON base64 预览、按明确策略导入。
- 视觉素材库页面新增导出视觉包、冲突策略选择和导入视觉包入口。
- manifest 校验器补齐 `format` 字段闭环，导出后可重新导入。
- `adm-zip` 作为纯 JS ZIP 依赖加入项目。
- `visual-package-io.test.mjs` 20 个测试，路由测试 5 个；全量 `npm test` 820 通过、0 失败、27 跳过。

Phase 4 原子导入与失败恢复已完成：导入前保存 Profile、Binding、Asset 快照；素材、Profile 或 Binding 阶段失败时恢复完整状态，并清理本次写入的素材文件；失败报告包含 `failed`、`rolledBack`、`failedStage`、`error` 和 `rollbackReason`。

Phase 4 详细导入报告已完成：导入报告新增 `issues[]` 和 `issueSummary`，区分缺失素材依赖、无效/不可用事件绑定、Profile 冲突跳过、素材冲突复用和被跳过的绑定；设置页会显示问题数量及回滚失败阶段，不再把事务失败显示为成功。

Phase 4 导入诊断导出已完成：新增纯 JSON 诊断文档 `notification-hub-visual-package-import-diagnostics`，保存最近一次导入报告，不携带素材二进制；新增 `POST /visual-package-diagnostics-export` 和视觉素材库“导出导入诊断”入口；无导入记录时返回稳定的 `VISUAL_PACKAGE_DIAGNOSTIC_NOT_FOUND`。

Phase 4 已完成。后续进入卡片种类、更多行为、Skin 或 Effects 系统前，建议先做一次真实 Plugin 页面验收。

发布修复：`0.1.0` 安装包遗漏生产依赖 `adm-zip`，会导致 Plugin 加载时报 `Cannot find package 'adm-zip'`。已修正正式打包脚本，将唯一生产依赖完整纳入 ZIP，并发布 `0.1.1`。

页面修复：`0.1.1` 视觉设置页因遗留元素监听异常停在“读取中”，且素材库入口只存在于独立页面。已修复初始化错误、重复标题和状态节点，设置页新增素材库入口、单条测试通知和 4 条堆叠测试，素材库工具栏支持窄窗口换行；发布 `0.1.2`。

体验修复：`0.1.2` 声音实验台一次试听会同时写入启动态和最终态两条诊断，已改为只保留最终结果；视觉素材 Windows 文件选择器启用 Per-Monitor DPI；声音设置页改为双栏信息布局，小窗口自动单栏回退；发布 `0.1.3`。

视觉工作台第一轮重构：视觉页从内部“视觉规则/分类预设”面板改为“设计方案 → 应用到事件 → 逐个测试 → 导出视觉包”的主流程。新实例自动拥有可导出的“默认视觉方案”；新增视觉方案保存/替换、方案列表、应用预览、正式事件选择和行为通道入口；视觉测试默认一次覆盖聊天、频道、工具完成、工具失败、超时、系统警告六类事件。测试关闭声音时仍经过正式通知 ingest 链路，不再绕过视觉卡片创建。全量 Node 测试 `836` 通过、`0` 失败、`27` 跳过；`npm run check` 覆盖 `309` 个 JavaScript 文件通过。

当前待真实 Hana 页面验收：确认新视觉页布局、方案保存后导出、选择事件后应用行为通道、六类逐事件测试，以及 Native 卡片关闭后的状态回收。Skin、Effects 和更多卡片种类暂不进入，先完成这条页面闭环。

2026-08-20 诊断修复：用户导出的诊断标记插件版本为旧 `0.1.0`，20 次 `scene-create` 均返回 `RUNTIME_SCENE_CARD_INVALID`，卡片数为 0；此前同类 alpha.16 现场已确认根因是 Plugin 将行为身份混入严格 Native presentation。当前源码已保持 `presentation` 与独立 `behavior` 分离。另补上 Plugin→Native 视觉协议边界投影：视觉设置允许的 `anchor/gap/margin/width/height` 不再进入 Native 严格解析的嵌套 visual，宽高继续映射到卡片根节点；空背景素材不发送 null。新增回归覆盖 rich visual settings、Native payload 投影和当前 Release Runtime Named Pipe 创建。`pluginVersion` 与包版本统一为 `0.1.4`。

修复验证：`npm run check` 通过，覆盖 `311` 个 JavaScript 文件；全量 Node 测试 `840` 通过、`0` 失败、`27` 跳过；`git diff --check` 通过。待重新安装修复包后再做真实 Hana 现场验收。

2026-08-20 第二轮现场反馈修复：
- BUG1：视觉页素材库链接由普通相对链接改为保留 `pluginSurfaceSession/token` 的受保护 surface URL，避免从设置 fragment 跳转时丢失凭据而返回 `forbidden / missing_credential`。
- BUG2：应用事件区新增持续的“已选择 N 个事件”和“预览将影响 N 个事件”摘要；应用结果把 unchanged 也计入总数，不再在重复应用时显示误导性的 `0 个事件`。事件/测试序号继续统一从 1 开始。
- BUG3：测试生成器现在为六类测试事件传递稳定的 canonical eventId，不再让工具完成/失败和超时被误判为聊天事件；实际应用到事件的 Registry Profile 会在 legacy Runtime Scene 路径中生效。新增当前 Release Native Runtime 的真实验证：自定义工具视觉方案 + `applied.main` 行为通道成功创建卡片，`failed=0`、`cardsCreated=1`、`sceneFailures=[]`。
- 测试反馈补充生成数量、卡片创建数量、失败数量和事件标签；Scene 创建失败现在会回填到测试结果，而不是只写诊断后仍显示“发送成功”。
- 六类测试事件改为使用稳定 canonical `eventId`，因此测试声音调度的物理播放分组从旧的 3 组恢复为按真实事件语义计算的 4 组；这是测试语义修正，不改变正式通知的声音/视觉独立边界。

页面结构按计划收缩：视觉页移除重复的“保存当前设计”按钮，增加实时本地预览、停靠位置真实读取、方案 ID 自动生成/只读显示，并扩大留白与卡片间距；声音页将音频库、实验台、规则解释和诊断归入“高级工具与诊断”折叠区，主区只保留全局声音和自定义绑定。视觉页面与声音页面继续复用同一 fragment/full-page 代码路径。

本轮交付包：`dist\\notification-hub-vnext-0.1.4.zip`，SHA256 `AE7162B037B16D96D0E690917D7A712BF8488D0A516D0FDBB62C22DE9C7DBE01`，包内 `179` 个文件，manifest `0.1.4`。

## 最新追加：Plugin focused tests — 裁剪方式与图片内边距 domain 验证 + 测试

- 更新 `card-visual-settings.js`：新增 `CARD_FITS` 常量（fill/contain/cover），`backgroundFit` 和 `backgroundPadding` 加入 `APPEARANCE_FIELDS` 和 `MINIMAL_CARD_DEFAULTS`，新增对应验证逻辑。
- 更新 `card-visual-settings.test.mjs`：7 个测试全部通过，覆盖新字段默认值、接受有效值、拒绝无效值、`CARD_FITS` 导出。
- 关联测试（visual-stack、plugin-visual-api、event-presentation-settings 等）全部通过，无回归。

## 最新追加：Plugin 设置页 UI 集成 — 裁剪方式与内边距控件

- 卡片外观设置页新增「裁剪方式」下拉选择（拉伸填满/完整显示/裁剪填满），对应 `backgroundFit` 字段。
- 新增「图片内边距」数字输入（0-40px），对应 `backgroundPadding` 字段。
- `render()` 函数读取新字段，`collect()` 函数保存新字段，预览更新监听器覆盖新字段。
- 所有已有测试通过，前端语法检查通过。

## 最新追加：B 方向全部完成 — 图片绘制区域配置

- 新增 `VisualStyle::background_padding` 字段（float，0~40px），控制图片绘制区域与卡片边缘的间距。
- Validator 检查 padding 范围 0~40。
- Named Pipe parser 新增 `backgroundPadding` 解析。
- Controller `card_json` 序列化新增 `backgroundPadding`。
- Renderer 绘制图片时从卡片 bound 中减去 padding 得到绘制区域，`contain`/`cover` 计算时使用 padding 后的区域。
- 所有 9 个 visual-focused 测试通过。

## 最新追加：B 方向第三步 — 透明 PNG 与 opacity 组合

- 新增 `visual-asset-semi.png` 半透明红色 PNG fixture（alpha=128）。
- 新增 CLI 自测 `--visual-asset-opacity-self-test`，使用半透明 PNG + opacity=0.5，采样验证像素值在正确范围内。
- WIC 解码为 32bppPBGRA 保留 alpha 通道，Direct2D DrawBitmap 的 opacity 参数应用在已有 alpha 之上，有效 alpha = bitmap_alpha × opacity。
- 半透明 PNG 正确与背景色混合，opacity 0.5 进一步降低整体透明度。
- 所有 visual-focused 测试通过。

## 最新追加：B 方向第二步 — 图片裁剪模式（contain/cover）

- 新增 `VisualStyle::background_fit` 字段，支持 `fill`（默认，拉伸填满）、`contain`（保持比例，完整显示，居中）、`cover`（保持比例，填满区域，裁剪多余）。
- Validator 检查 `background_fit` 只能是 `fill`/`contain`/`cover` 三者之一。
- Named Pipe parser 新增 `backgroundFit` 解析。
- Controller `card_json` 序列化新增 `backgroundFit` 字段。
- Renderer `capture_offscreen()` 根据 `background_fit` 计算图片绘制目标矩形，使用 `GetSize()` 获取 bitmap 实际尺寸。
- 新增 `visual-asset-wide.png` fixture（100x50 红色矩形，非正方形）。
- 所有已有测试通过，未新增单独测试。

## 最新追加：B 方向第一步 — WEBP/JPG Native 解码支持

- 控制器 `resolve_visual()` 从仅允许 `png` 扩展到允许 `png`、`webp`、`jpg` 三种格式。
- WIC 在 Windows 10/11 上原生支持 WEBP 和 JPEG 解码，Render 无需额外代码。
- 新增 `visual-asset-red.jpg` 和 `visual-asset-red.webp` 真实 fixture。
- CLI 自测 `--visual-asset-self-test` 新增 SHA256 参数，兼容多格式。
- 新增测试覆盖：
  - `native-visual-asset-render.test.mjs`：PNG 1/1、JPEG 1/1、WEBP 1/1 像素渲染
  - `named-pipe-visual-multi-format.test.mjs`：JPEG 和 WEBP 通过 manifest → scene.create 完整链路
- Native Release 0 警告、0 错误。

## 最新追加：文件替换竞态窗口关闭

- 将 SHA256 验证从控制器（`resolve_visual` 时验证）**移到渲染器**（`load_background_bitmap` 时验证，紧邻 `CreateDecoderFromFilename`）。
- 新增 `VisualStyle::background_asset_sha256` 承载 manifest 中的 SHA256，由控制器在 resolve 时设置。
- 渲染器在打开文件调用 WIC 解码前，先计算文件 SHA256 并与 manifest 记录比对，不匹配则立即回退 backgroundColor。
- 验证和文件读取在同一个函数体、同一帧内完成，竞态窗口不复存在。
- 所有 visual-focused smoke 和 manifest-focused test 全部通过。

## 最新追加：大小写与 canonical path 一致性修复

- `visual_asset_file_is_trusted()` 中 `GetFinalPathNameByHandleW` 返回真实磁盘大小写，而前缀来自 `GetFullPathNameW`（保持输入大小写）。
- 将 `std::wstring::rfind` 大小写敏感比较改为 `_wcsnicmp` 大小写不敏感比较，避免有效文件因大小写不一致被误判为越界。
- 不影响安全边界：大小写不同不会让路径跳出 root 目录，只会导致误报。

## 剩余风险：文件替换竞态窗口

- 从 `visual_asset_file_is_trusted()` 验证文件到 Renderer 实际读取文件之间，存在一个 TOCTOU 窗口。
- 这不是安全绕过：替换后的文件路径仍然受 rootDir 边界约束（路径在 configure 时固定），Renderer 的 WIC 解码失败也会回退 backgroundColor。
- 因此这是一个 **时效性缺口**，不是安全漏洞：最坏情况是看到旧图片或回退背景色。
- 当前不作代码缓解，作为已接受风险记录。

## 最新追加：Manifest 重复 assetId / SHA256 Native 级拒绝

- `parse_visual_assets_config_payload` 在解析完所有 asset 记录后，使用 `std::unordered_set` 检查重复的 assetId 和 SHA256（大小写归一化）。
- 发现重复时返回 `VISUAL_ASSET_MANIFEST_DUPLICATE` 错误，拒绝整个配置请求。
- 新增 Native Named Pipe 测试覆盖 duplicate assetId 和 duplicate SHA256 两种拒绝场景。
- Native Release 0 警告、0 错误；manifest smoke 1/1、card fallback smoke 1/1、manifest focused 2/2 全部通过。

## 最新追加：Reparse Point / Junction 安全防护

- `visual_asset_file_is_trusted()` 在 SHA256 校验前增加 `GetFinalPathNameByHandleW` + `VOLUME_NAME_DOS` 调用，获取文件真实最终路径。
- 过滤 `\\?\` 前缀后，将最终路径与 `rootDir` 前缀比对，拒绝所有通过 junction/symlink/mount point 重解析到素材根目录外的文件。
- 现有 manifest trust smoke、PNG render smoke、fallback smoke 和 manifest focused 全部通过。
- Native Release 0 警告、0 错误。

## 最新追加：Configure 后文件篡改重新验证

- SceneController 在每次解析 `backgroundAssetId` 时重新执行 root 边界、文件存在性和 SHA256 校验，不再永久信任 configure 时的结果。
- 因此 manifest 配置后文件被替换/篡改，下一次 scene.create/update 会立即清除资源引用并回退 backgroundColor。
- 校验逻辑已放入 SceneController 引用解析路径，覆盖创建和更新，而不是只在 transport ACK 阶段判断。
- Native manifest trust / scene card fallback smoke 1/1、有效 PNG render smoke 1/1 通过；Native Release 0 警告、0 错误。

## 最新追加：Manifest Trust → Scene Card 回归

- 新增真实 Named Pipe smoke：`tests/node/named-pipe-visual-asset-card-fallback.test.mjs`。
- 使用真实 PNG 和实际 SHA256，验证有效 manifest + `backgroundAssetId` 时 SceneState 保留资源引用。
- 使用错误 SHA256 重新 configure 后，资源被降级为不可用；scene.create 仍返回 ACK，SceneState 不回传 `backgroundAssetId`。
- 使用 `enabled: false` 的 manifest 记录时，scene.create 同样成功并回退 backgroundColor。
- Native manifest trust / scene card fallback smoke 1/1 通过。

## 最新追加：Native WIC PNG 失败回退回归

- 新增损坏 PNG fixture：`tests/fixtures/visual-asset-corrupt.png`。
- 新增 `--visual-asset-fallback-self-test <pngPath>`，验证 WIC 解码失败时卡片仍完成绘制，并回退到指定 `backgroundColor`。
- 新增 Node wrapper：`tests/node/native-visual-asset-fallback.test.mjs`。
- 实际损坏 PNG fallback smoke 1/1 通过；有效 PNG render smoke 1/1 通过。
- 本轮尚未把 SHA256 篡改/disabled manifest 通过 Named Pipe 创建卡片做成独立回归。

## 最新追加：Native WIC PNG 真实渲染回归

- 新增真实 1x1 红色 PNG fixture：`tests/fixtures/visual-asset-red.png`。
- 新增 `--visual-asset-self-test <pngPath>`，通过 SceneWindow、WIC、Direct2D 和 CPU pixel capture 验证图片颜色确实进入卡片背景区域。
- 新增 Node wrapper：`tests/node/native-visual-asset-render.test.mjs`。
- 修复 Renderer 的 COM 初始化，使 WIC Imaging Factory 在独立 Native self-test 中可用。
- Native WIC PNG 渲染 smoke 1/1 通过；manifest focused 2/2 通过；Native Release 0 警告、0 错误。

## 最新追加：Native WIC PNG 解码与 Direct2D 绘制

- Renderer 初始化 WIC Imaging Factory。
- 已验证的 PNG manifest 记录会通过 rootDir + relativePath 生成受控路径，并在 renderer 中由 WIC 解码为 `32bppPBGRA`。
- 解码成功后创建 Direct2D bitmap，并绘制到 Minimal 卡片背景区域；失败时保留已有纯色背景绘制。
- bitmap 按路径缓存，resize/reset 时释放，避免设备尺寸变化后复用失效资源。
- Native Release 0 警告、0 错误；manifest focused 2/2、Named Pipe smoke 1/1 通过。
- 尚未完成带真实图片文件的窗口像素级 smoke，下一步补充真实 PNG fixture 和渲染回归。

## 最新追加：Native Visual Asset 文件安全校验

- Plugin 发送给 Native 的 manifest 使用固定 `dataDir/visual-assets` 作为 `rootDir`，素材 `relativePath` 改为 root 内的文件名，避免目录重复。
- Native 在配置 manifest 时组合 `rootDir + relativePath`，使用 Windows full path 做 root 边界检查，拒绝目录、越界路径和无法读取的文件。
- Native 使用 CryptoAPI 计算文件 SHA256；文件不存在、读取失败或 hash 不匹配时将 enabled 记录降级为不可用，仍不阻塞 Runtime。
- 本轮仍未接入 WIC 解码或 Direct2D 绘制。
- Native Release 0 警告、0 错误；Named Pipe manifest smoke 1/1 通过。

## 最新追加：Native Visual Asset Root 绑定

- Plugin manifest 现在携带受控 `rootDir`，值来自既有固定素材目录 `dataDir/visual-assets`。
- Native `visual-assets.configure` 要求 rootDir 为安全的绝对 Windows 路径，并将其保存到 SceneController；素材仍只能通过 manifest 的 relativePath 引用。
- 本轮只完成 root 绑定，不执行文件存在性、canonical path、SHA256、WIC 或 Direct2D。
- Native Release 0 警告、0 错误；Named Pipe manifest smoke 1/1 通过。

## 最新追加：Native backgroundAssetId 安全解析

- SceneController 创建/更新卡片时解析 `backgroundAssetId`，只保留 manifest 中存在、enabled 且 `format === png` 的引用。
- 未注册、disabled 或非 PNG 素材不会阻塞卡片创建；Native 清空有效图片引用，继续使用 `backgroundColor`。
- SceneState 保持旧兼容：回退时不回传空的 `backgroundAssetId`。
- Native Release 0 警告、0 错误；Named Pipe manifest smoke 1/1 通过。
- 当前仍未执行文件读取、SHA256 比对、WIC 解码或 Direct2D 绘制。

## 最新追加：Native Visual Asset Manifest 完整记录

- Native `visual-assets.configure` 现在解析并保存 `assetId`、`format`、`relativePath`、`sha256`、`enabled` 五项受控记录。
- 校验 assetId 格式、format 白名单、SHA256 64 位十六进制、相对路径安全性及路径末尾与 assetId/format 的一致性。
- `has_visual_asset()` 只对 enabled 记录返回 true；disabled 记录保留在索引中但不可作为有效视觉资源。
- 本轮仍不执行文件读取、SHA256 文件比对、WIC 解码或 Direct2D 绘制。
- Native Release 0 警告、0 错误；Named Pipe manifest smoke 1/1 通过。

## 最新追加：Native Visual Asset Manifest 索引

- Native `visual-assets.configure` 不再只统计 assetCount：现在会提取并保存受控 assetId 索引，支持 `has_visual_asset()` 与数量查询。
- 配置成功后 Native SceneController 持有当前 manifest 的 assetId 集合；重复 idempotency 请求不会重建索引。
- 当前仍只建立 assetId 索引，未把文件路径、格式和 SHA256 用于图片 I/O；卡片创建失败回退语义和 WIC 解码留到下一阶段。
- Native Release 构建 0 警告、0 错误；真实 Named Pipe manifest smoke 1/1 通过。

## 最新追加：Native Visual Asset Manifest 通道

- Native protocol 新增 `visual-assets.configure`，与音频 `config.update` 分离。
- Native 接收声明式 manifest，校验 version、素材数组、路径穿越/反斜杠/URL、素材数量上限，并返回 `applied` 与 `assetCount` ACK；支持 idempotency 去重。
- Plugin 新增 `applyVisualAssetManifest()`；默认不自动启用，只有 `visualAssetManifestEnabled === true` 才在 Runtime 启动/重试后发送，失败只记录 Notification Diagnostic。
- 新增 Named Pipe manifest smoke：正常配置、重复请求、非法路径拒绝通过。
- Native Release 构建 0 警告、0 错误；Plugin lifecycle 单独复跑 58/58 通过。一次全量 lifecycle 并行回归出现 1 个既有声音时序波动，单测复跑通过。
- 当前仍未接入 WIC 图片解码和 Direct2D DrawBitmap。

## 最新追加：Visual Asset Manifest 契约

- 新增 `visual-asset-manifest.js`：从已注册素材生成声明式 manifest，包含 `assetId`、`format`、`relativePath`、`sha256`、`enabled`。
- manifest 校验拒绝绝对路径、路径穿越、反斜杠路径、扩展名不匹配、重复 assetId/SHA256 和未支持格式。
- Plugin runtime API 新增 `getVisualAssetManifest()`；当前先完成契约与生成，尚未发送到 Native config.update，避免把音频配置通道强行扩大。
- Native 已支持受控 `backgroundAssetId` 解析/SceneState 回传；实际 WIC 解码和图片绘制仍待 manifest 通道接入后实现。
- manifest、Minimal 视觉和素材 focused 测试 19/19 通过，JS 语法与 `git diff --check` 通过。

## 最新追加：Minimal 背景素材引用闭环

- Minimal appearance 新增受控 `backgroundAssetId` 字段，只接受安全 assetId，不接受路径、URL、CSS 或 Renderer 配置。
- 视觉设置页从素材库读取已注册素材，增加“背景素材”选择；保存时 Plugin 校验素材存在，并同步 `profile / card.minimal.background` 结构化引用。
- 替换素材会先建立新引用、成功保存配置后解除旧引用；配置更新失败会回滚新引用。被 Minimal 引用的素材删除仍返回 409。
- Native visual parser/SceneState 回传支持 `backgroundAssetId`；未绑定素材时不新增空字段，保持旧 SceneState JSON 兼容。
- 当前已完成“assetId 配置—页面选择—Plugin 引用保护—Native 受控回传”，Native 尚未按 assetId 解码/绘制图片。
- focused 视觉、素材、页面和 Native smoke 通过；Native Release 构建 0 警告、0 错误。

## 最新追加：Visual Asset Library 安全导入

- 新增 Windows 视觉素材文件选择器，只显示 PNG/WEBP/JPG/JPEG；取消、失败和超时均有独立错误边界。
- `importVisualAssetFromPicker()` 只把选择结果作为一次性读取来源，元数据不保存原始路径；文件内容仍由素材库解析、SHA256 去重和固定 rootDir 存储。
- 素材库页面新增“导入素材”按钮，导入成功后立即加入列表；不开放外部 URL、SVG、任意路径或 multipart 上传。
- 新增 `POST /visual-assets/import` 受控入口；素材、页面、Plugin lifecycle focused 测试 71/71 通过，JS 语法与 `git diff --check` 通过。

## 最新追加：Visual Asset Library 页面

- 新增 `visual-assets-page` 页面：素材列表、名称/标签搜索、kind 筛选、尺寸/格式/透明度/文件大小/SHA256 摘要/引用数量展示。
- 页面明确展示当前导入边界：暂不开放任意本地路径、外部 URL 或 multipart 上传；导入仍使用受控 Plugin API。
- 被引用素材显示“正在使用”并禁用删除；未引用素材使用二次点击确认删除，删除失败展示 API 错误。
- 通知视觉页面新增“素材库”入口，manifest 注册素材 API 与素材库页面 route。
- 页面脚本语法、页面结构、API、Plugin lifecycle 与素材 focused 测试 15/15 通过。

## 最新追加：Visual Asset Library Plugin API 接入

- Plugin 构造时创建独立视觉素材库，素材目录为 `dataDir/visual-assets`，快照为 `dataDir/visual-assets.json`。
- onload best-effort 恢复素材快照；onunload 保存快照；恢复/保存失败只进入 Notification Diagnostic，不阻塞通知、声音、Runtime 或插件生命周期。
- 新增受保护 API：`GET /visual-assets`、`GET /visual-assets/:assetId`、`DELETE /visual-assets/:assetId`；删除被引用素材返回 409 和引用清单，未知素材返回 404。
- 导入能力暂通过受控 Plugin API `importVisualAsset()` 提供，尚未开放 multipart 或任意文件路径上传。
- API 与 Plugin 生命周期 focused 测试 69/69 通过；manifest JSON、JS 语法和 `git diff --check` 通过。

## 最新追加：Visual Asset Library 文件存储与恢复

- 新增受控 `visual-asset-storage.js`：素材文件只能写入固定 rootDir，assetId/format 白名单校验，导入使用临时文件与 rename，拒绝路径穿越。
- 新增独立版本 `visual-asset-persistence.js`：素材快照原子保存、缺失文件返回空、损坏快照返回明确错误。
- 素材库新增 `restoreSnapshot()`，恢复时校验 assetId、format、SHA256、重复记录和结构化引用，并重新建立去重索引与引用计数。
- 素材领域、存储与恢复 focused 测试 9/9 通过；新增 JS `node --check` 与 `git diff --check` 通过。

## 最新追加：Visual Asset Library 最小领域切片

- 新增 `visual-asset-format.js`：受控解析 PNG、WEBP、JPG/JPEG 图片头，提取尺寸与 alpha 信息，拒绝坏头、扩展名伪装、未支持格式和超限尺寸。
- 新增 `visual-asset-library.js`：支持素材导入、SHA256 内容去重、元数据冻结、标签/种类搜索、结构化引用跟踪和被引用删除保护。
- 当前仍未接入配置包、Skin、Effect 或页面上传；素材库先作为独立领域基础设施存在。
- 素材格式与领域 focused 测试 6/6 通过，新增 JS `node --check` 与 `git diff --check` 通过。

## 最新追加：Minimal 卡片视觉事实闭环

- Minimal 卡片属性编辑器原本已经存在，本轮没有重复造表单；补齐页面预览对这些属性的实时反映：尺寸、宽高、背景色、圆角和透明度修改后，页面内预览同步变化。
- 视觉设置路由保留受控字段、保存接口和服务端校验；未开放 CSS、脚本或任意样式输入。

- Native Runtime 已补齐 SceneState/health 中的完整受控 visual 回传：`cardType`、`behavior`、`appearance` 不再在回传时丢失。
- 真实 Named Pipe smoke 使用大尺寸、wide 比例、自定义背景色、圆角和透明度字段往返验证通过；Native Release Runtime 经 MSBuild 构建 0 警告、0 错误。
- 相关 Native smoke 3/3、视觉/生命周期/容量 focused 67/67 通过；`node --check` 与 `git diff --check` 通过。

## 最新追加：Runtime restart promotion 恢复验证

- 真实验证同一 Plugin 实例的 Runtime restart：promotion pending 在 `stopRuntimeAfterFailure → retryRuntime` 后仍可自动/显式 retry，Native scene.create 成功，queue 清空。
- 第二张卡的 `scene.create.request` lifecycle trace 恰好为 1，确认没有重复提交。
- 本轮真实 Native 生命周期与基础/容量矩阵 7/7、Node focused 回归 68/68 通过；`node --check` 与 `git diff --check` 通过。


## 2026-08-16：声音设置收敛为事件绑定模型

- 按用户确认删除旧声音绑定模型：页面不再显示独立“声音规则”编辑器，原“自定义声音”区域成为唯一声音绑定入口。
- 自定义声音顺序固定为：先选择声音，再选择作用事件，再设置组合音量；删除分类、旧事件和普通/重要选择。
- 声音绑定统一为 `eventId -> soundId + volume`；候选事件直接来自事件目录，新增正式事件 `delivery.important_sound`，重要声音不再依赖 importance。
- 删除 `soundRules` 声音规则通道、旧 `soundOverrides(category/event/importance)`、旧分类策略和旧声音重要性绑定；视觉规则仍独立保留。
- 声音组合、试听、导入绑定、资产引用清理和运行时 resolver 全部改用新事件身份。
- 验证：Node 全量测试 678 项，665 通过、13 跳过、0 失败；`npm run check` 通过，221 个 JavaScript 文件；`git diff --check` 通过（仅有既有 CRLF 提示）。
- 已重新生成 alpha.16 可安装 ZIP：`dist\\notification-hub-vnext-0.1.0-alpha.16.zip`；SHA256：`8DCC4FD99332EDEAB2029B2A2F7AFBA275A0CFB3F2402637B2FC5AA9729097D8`。已校验包含 manifest、Runtime、声音绑定模型和声音设置页面。
- 追加恢复链路修复：Runtime 回放单条 `scene.create` 失败时，不再中止整个重启；记录 `RUNTIME_RECOVERY_ENTRY_SKIPPED`、底层 `cause/message`，隔离失败 entry 并继续恢复后续卡片。新增回归测试。
- 根据验收反馈调整声音设置：全局声音独立提升到页面顶部；修复自定义声音事件下拉为空（状态接口现在带 `effectRuleTargets`，并有页面兜底）；通知中心新增标题、摘要、正文、通知 ID、来源和类型搜索；“其他错误”筛选排除已经命中“工具失败”的通知，避免分类重叠。
- 新增声音页面、通知中心搜索和“其他错误”排除的回归测试。
- 追加体验修复：选择事件时保留当前未保存的声音草稿，不再覆盖已选声音；搜索框移动到通知中心页面顶部标题区。
- 最新验证：Node 全量测试 680 项，667 通过、13 跳过、0 失败；`npm run check` 通过，222 个 JavaScript 文件；`git diff --check` 通过。
- 最新安装包 SHA256：`C3D37A07E6C10ED7FE0088C3F16EC06CC402E9A948C8D94D85EF495E6439D462`。
- 2026-08-17 声音回归修复：真实诊断文件显示工具成功通知的 `canonicalEvent` 已是 `tool.execution.succeeded`，但 `soundInput.eventId` 仍残留为 `chat.assistant_reply.completed`，导致工具成功错误命中聊天声音。已让 `canonicalEvent` 显式 eventId 优先，并在 selector 更新时同步重建 soundInput；新增真实通知分流回归测试。
- 事件分流根因修复：Hana 事件适配器此前把 `hana-tool-result-实例ID` 等去重 ID 错误写入 `event.eventId`，未知 ID 被 canonical 语义回退为助手回复；现已分离正式 `eventId` 与实例去重 ID，工具成功/失败分别固定为 `tool.execution.succeeded/failed`，助手、频道、系统事件也使用正式事件身份。
- 声音修复验证：聚焦声音与事件适配器测试全部通过；Node 全量测试 685 项，672 通过、13 跳过、0 失败；`npm run check` 通过，226 个 JavaScript 文件；`git diff --check` 通过。
- 自定义声音组合包已接入：新增 `.nhcombo` 领域格式、导出器、导入器、插件 API 和声音设置页面入口；组合包携带 eventId 绑定及所引用的自定义音频，不修改全局声音设置；旧 `.nhsound` 音频包入口保持不变。
- 组合包安装验收前验证：Node 全量测试 683 项，670 通过、13 跳过、0 失败；语法检查 226 个文件通过；`git diff --check` 通过。
- 验证：Node 全量测试 679 项，666 通过、13 跳过、0 失败；`npm run check` 通过，221 个 JavaScript 文件；`git diff --check` 通过（仅有既有 CRLF 提示）。

## 2026-08-16：统一效果规则编辑器首版

- 新增 `effect-rules.js`：声音和视觉规则共用稳定的 `id/name/enabled/eventIds/effect` 结构；规则目标只允许 `presentationEligible` 事件，同一规则内多事件为 OR。
- `event-presentation-settings` 新增 `soundRules`、`visualRules` 持久化字段，旧 `global/categories/events/soundOverrides` 仍保留作为兼容回退。
- 新增统一规则 API：`getEffectRules`、`upsertEffectRule`、`removeEffectRule`，并提供 `/effect-rules/:kind` GET/POST/DELETE 路由。
- 声音设置增加“先选择声音和音量，再选择作用事件”的规则编辑器；视觉设置增加“先选择视觉预设和强度，再选择作用事件”的规则编辑器。规则删除使用页面内二次确认，不调用浏览器原生确认弹窗。
- 声音规则命中后覆盖旧声音策略并应用规则音量；视觉规则命中后覆盖旧分类预设和强度；未命中继续沿用旧配置和默认回退。
- 验证：Node 全量测试 695 项，682 通过、13 跳过、0 失败；`npm run check` 通过，覆盖 221 个 JavaScript 文件；`git diff --check` 通过（仅有既有 CRLF 提示）。
- 已按标准发布脚本重新打包 alpha.16 可安装 ZIP：`dist\\notification-hub-vnext-0.1.0-alpha.16.zip`；SHA256：`59517F731A5D3055DBBC809E0ADA7527955B3984BAB099D3B5F5FF6F3DE0BA8D`。已校验包含 `manifest.json`、`runtime/notification-hub-runtime.exe`、`domain/effect-rules.js`、声音与视觉设置页面。下一步交给用户安装后进行真实 Hana 验收。

## 2026-08-16：通知中心筛选第一阶段重构

- 通知中心筛选从旧的多组单值分类按钮，改为与当前事件模型一致的三层结构：快速视图（全部/未读/重要）、事件类型（助手回复/工具成功/工具失败/超时/模型服务异常/其他错误）、高级筛选（来源 Hana/API、通道 当前对话）。
- 页面脚本统一使用 `filterState`，事件类型支持同组多选并集；来源、通道和快速视图与事件条件同时生效；增加清除筛选与条件摘要。
- 查询继续使用兼容的 `event`、`producerKind`、`channelKind` 参数，未删除既有单值 `category`/`event` 读取能力；批量读/删、详情和显示设置逻辑未改动。
- 视觉上将内部分类从主筛选区降级为卡片标签，避免把 `tool_error`、`model_service_error` 等交叉语义误呈现为互斥分类。
- 验证：通知中心、分类、事件与分类投影相关 Node 测试 34/34 通过；`npm run check` 通过，覆盖 219 个 JavaScript 文件；`git diff --check` 通过（仅有既有 CRLF 提示）。
- 本轮未修改声音设置页面，未执行 Git commit；下一步可在真实页面确认筛选交互，再进入声音分组重构。

## 2026-08-16：新版包真实 Hana 验收收口（20:41，Windows）

- 新会话实际发现静态工具 `notification-hub-vnext_notification-hub-run-test` 与动态工具 `notification-hub-vnext_run-notification-test`；旧会话缺少工具 schema 的原因确认是会话级工具快照未刷新，不是插件 manifest 或工具文件注册失败。
- 静态工具真实调用通过：`ok=true`、`entryPoint=tool`、`generated=1`、`failed=0`、`historyWritten=true`、`storedNotifications=1`。
- 斜杠命令由 Hana 聊天输入框直接发送后真实执行通过：`/notification-hub-vnext_notification-hub-run-test`；现场返回生成 1 条、失败 0 条、写入历史 1 条，确认走 slash dispatcher，而非 Agent 转述或 PowerShell。该入口的 `entryPoint=command` 由插件实现契约与现场执行路径确认。
- 动态兼容工具真实调用通过：`ok=true`、`entryPoint=internal`、`generated=1`、`failed=0`、`historyWritten=true`、`storedNotifications=1`；`internal` 是旧生命周期动态入口的预期标识，不冒充静态 tool/command。
- 真实 Scene 自动过期验收：动态工具以 `count=3`、`createCards=true`、`playSound=false` 创建 3 张卡片，返回 `generated=3`、`failed=0`、`storedNotifications=3`；用户现场确认卡片自然过期无异常，未发现 Shelf 越界或 ACK 异常。
- 当前真实验收结论：静态工具、动态工具、斜杠命令、Scene 创建、卡片自动过期和布局修复均通过；本轮没有新的 `TRANSPORT_ACK_TIMEOUT`。历史 ACK 现场仍须按 `details.type` 解释：`health` 不得归因于 `scene.dismiss`。
- 产物（筛选 UI 版本，重新打包）：`dist\\notification-hub-vnext-0.1.0-alpha.16.zip`；SHA256：`CED5C92AFAED1EF530064716A4622D7BC948B05040C0DEF38341F850F6A4D9C8`。
- 本轮未修改运行时代码，未执行 Git commit；筛选 UI 包已按标准发布脚本重新打包并校验，下一步由用户安装后进行真实页面验收。

## 2026-08-16：修复行为通道 Shelf 布局越界

- 新诊断附件中的 4 个真实错误均为 `LAYOUT_SHELF_OUT_OF_BOUNDS`，发生在 `scene-create` 阶段的 `chat.main`/`tool.main` 行为通道；与工具调用失败和 `scene.dismiss` ACK 超时无关。
- 根因是多行为通道分配独立 lane 后，`ticker` 通道仍强制横向 Shelf；lane 宽度不足以容纳第二张卡片时，Native 直接回滚布局并报告越界。
- Native 行为通道布局现在保留 Shelf 优先策略；仅当 Shelf 横向越界时，自动回退为同一通道内的纵向 Stack。若纵向空间也不足，仍返回真实布局错误，不隐藏异常。
- 新增行为通道真实 Named Pipe 回归：两张 ticker 卡片在窄 lane 中改为纵向排列；通道移除后恢复完整工作区宽度时重新使用横向 Shelf；dismiss 后剩余卡片继续正确重排。
- 验证结果：Release Native 构建成功；专项 `runtime_named_pipe_behavior_channel_smoke` 通过；完整 Release CTest `28/28` 通过；Node 全量测试 `689` 项，`676` 通过、`13` 跳过、`0` 失败；`npm run check` 通过，覆盖 `219` 个 JavaScript 文件；`git diff --check` 无差异错误。
- 尚未完成新版包重启后的真实 Hana 复验；下一步需安装新包，用静态工具再次生成 5 张卡片，确认诊断不再出现新的 `LAYOUT_SHELF_OUT_OF_BOUNDS`。

## 2026-08-16：诊断并修复 scene-expire 的 ACK 超时风险

- 新上传的真实诊断导出确认：`scene-expire` 阶段记录的两条 `TRANSPORT_ACK_TIMEOUT` 实际 `details.type` 是 `health`，说明周期 health 请求超时后污染了同一 PipeClient 上的其他 pending 请求，外层自动过期回调再将错误归因到 `scene-expire`；不能把该记录直接解释为 Native `scene.dismiss` 本身超时。
- `PipeClient` 现在将请求串行化：health、scene.create、scene.dismiss 等请求不会在同一 Named Pipe session 上并发 pending；单个请求失败不会再把并发请求的错误交叉传播。新增回归覆盖 health 超时后下一条 scene 请求重新连接并独立结算。
- 修复静态验收入口暴露：`plugin/manifest.json` 增加 `contributes.tools` 的 `notification-hub-run-test`；斜杠命令改为 Hana slash dispatcher 要求的 `handler(context)`，使用 `context.hub.eventBus.request()`，名称带完整 `notification-hub-vnext_` 前缀。
- Node 全量测试：`689` 项，`676` 通过、`13` 跳过、`0` 失败；`npm run check` 通过，覆盖 `219` 个 JavaScript 文件；`git diff --check` 无差异错误。
- 以上修复尚未经过新版包重启后的真实 Hana 验收，尤其需要确认 Agent 工具列表出现 `notification-hub-vnext_notification-hub-run-test`，并重新观察自动过期期间是否仍有 `health`/`scene-expire` ACK 超时。

- 后续真实工具测试发现 `runNotificationTest()` 仍等待旧的单数属性 `notificationSceneDrainPromise`；Scene queue 重构后实际状态是按 channel 保存的 `notificationSceneDrainPromises` Map，导致工具结果可能早于 Scene 创建完成返回。
- 新增 `waitForNotificationSceneQueues()`，在测试工具返回前等待所有 channel drain promise 和新增队列均清空，并新增回归测试覆盖多 channel queue。
- 更新后的 Node 全量测试为 `687` 项，`674` 通过、`13` 跳过、`0` 失败；`npm run check` 通过，覆盖 `219` 个 JavaScript 文件；`git diff --check` 无差异错误。
- 当前待真实 Hana 安装新版包后重新验证：工具结果必须在 Scene 创建完成后返回，并继续观察自动过期 dismiss 的 ACK。

- 用户截图明确显示：`TRANSPORT_ACK_TIMEOUT`，请求 `req-node-7580`，阶段 `scene-expire`。失败发生在通知卡片自动过期触发的 `scene.dismiss`，不是工具/命令入口本身。
- 风险根因是多个卡片过期 timer 可能同时直接向单客户端 Named Pipe 发送 dismiss；Native dismiss 还会执行窗口销毁和剩余卡片重排，后续 ACK 可能超过默认 2 秒窗口；用户点击关闭、Native scene.changed 和自动过期也可能对同一卡片重复 dismiss。
- 新增 `plugin/domain/scene-dismiss-queue.js`：Scene dismiss 按通知卡片串行执行，同一 notificationId 的重复请求复用同一个 Promise；插件卸载时清理未执行项。
- 通知场景 `scene.dismiss` 使用 10000ms 专用 ACK timeout；overflow 淘汰也复用同一 dismiss 路径；Native 已经先删除卡片时的 `RUNTIME_SCENE_CARD_NOT_FOUND` 视为幂等完成。
- 当前证据支持“并发 dismiss 排队/重复 dismiss 竞态”为首要假设；单张卡片 Native 操作超过 10 秒或 ACK 写回失败仍需要下一次真实现场诊断区分。
- focused 回归：Scene dismiss queue 与插件生命周期共 57 项通过；`npm run check` 通过，覆盖 219 个 JavaScript 文件；`git diff --check` 无差异错误。

## 2026-08-16：补齐独立工具入口与斜杠命令入口

- 现场问题确认：此前只有动态 `run-notification-test`，它生成的是插件内部测试通知，不能证明用户调用的是“工具入口”还是“命令入口”；桌面上的“工具执行完成”卡片也可能来自 Desktop Orchestrator，不能据此判定 Notification Hub channel。
- 根据 Hana 插件规范新增静态工具 `plugin/tools/notification-hub-run-test.js` 和静态命令 `plugin/commands/notification-hub-run-test.js`。工具默认只生成 `tool_completed` 测试事件，命令同样固定生成 `tool_completed`，两者通过同一受控 EventBus capability `notification-hub-vnext.run-test` 进入 Notification Hub。
- 每次结果增加 `entryPoint: tool|command`，每条记录的 metadata 增加 `testEntryPoint`，诊断摘要仍只显示受控事件和行为通道字段。旧动态工具保留兼容。
- 该入口验证的是 Notification Hub 自己的验收工具/命令路径，不伪造 Hana Pi `tool_execution_end`；真实宿主工具事件仍需由真实 Agent session 单独证明。
- focused 回归：工具/命令注册、插件生命周期共 57 项通过；`npm run check` 通过，覆盖 217 个 JavaScript 文件；`git diff --check` 无差异错误。

## 2026-08-16：补充 Scene 行为通道可读诊断

- 真实 Hana 卡片创建已恢复，但窗口标题无法区分目标插件卡片、宿主工具卡片和事件 channel；本轮没有把无法确认的视觉现象宣称为异通道通过。
- 新增 `plugin/domain/scene-behavior-diagnostics.js`，从 Runtime health 的 SceneState snapshot 生成受控只读摘要：卡片 id、坐标、尺寸、eventId/categoryId/eventTypeId、visualProfileId、behaviorProfileId、behaviorChannelId，以及 channel cardOrder/profileId。
- 摘要最多暴露 50 张卡片和 50 个 channel，不包含标题、正文、进程输出、路径或脚本；诊断页新增“行为通道与卡片”面板，用于直接确认同通道堆叠和异通道隔离。
- 全量 Node 测试：681 项，668 通过、13 跳过、0 失败；`npm run check` 通过，覆盖 214 个 JavaScript 文件；`git diff --check` 无差异错误。

## 2026-08-16：真实 Hana 诊断发现并修复 Scene card payload 拒绝

- 真实 Hana 诊断确认 Runtime `running`、Pipe `connected`、版本 `0.1.0-alpha.16`，但所有通知 Scene 创建均返回 `RUNTIME_SCENE_CARD_INVALID`，因此现场无法看到通知卡片；卡片数量保持为 0。
- 根因是 `plugin/index.js` 将 `behaviorProfileId`、`behaviorChannelId` 同时写入 `presentation` 和独立的 `behavior` 对象。Native 严格 parser 的 presentation 白名单只接受 `eventId`、`categoryId`、`eventTypeId`、`visualProfileId`，重复字段导致整个 `scene.create` payload 被拒绝。
- 已修复为：presentation 只携带事件/视觉身份，行为身份只保留在独立 `behavior` 对象中。现有 Native channel parser 和 snapshot 契约不变。
- 生命周期回归断言已同步更新；focused 62 项中 61 通过、1 项需要 Runtime executable 路径而被测试框架跳过；全量 Node 测试 679 项，666 通过、13 跳过、0 失败；`npm run check` 通过，`git diff --check` 无差异错误。
- 旧 alpha.16 ZIP 已被本地现场诊断证明不可用于 Scene 创建；修复后必须重新安装新的同版本 ZIP，不能继续使用旧包。真实 Hana 现场验收需从新包重新开始。

## 2026-08-15：alpha16 卡片行为与视觉第一刀、声音事件修复

- 版本推进到 `0.1.0-alpha.16`，本轮开始将现有卡片正式命名为“极简卡片”，默认排列行为命名为“简单排列”。
- 视觉设置页正在从“通知视觉”改为“行为与视觉”：全局视觉只保留一个总开关；新增卡片种类选择；第一刀加入极简卡片的简单排列、工作区域、尺寸、宽高比、背景色、圆角和透明度字段。
- 新增受控 `card` 配置模型，旧视觉配置自动迁移到 minimal 默认值；不开放任意 CSS、HTML、坐标、脚本或未实现卡片类型。
- 最终 Runtime visual payload 现在携带受控 minimal 卡片字段；Native Runtime Debug/Release 构建与 CTest 27/27 已通过，alpha.8 创建、关闭和排列回归保持通过。
- 工具事件细分为 `tool_success`（工具执行成功）和 `tool_error`（工具执行失败），声音设置、实验台和 Notification Center 已同步显示，并保持旧事件兼容。
- 修复嵌套 Hana/Pi 模型服务失败 payload 被 adapter 门禁丢弃的问题：嵌套 `error/response/failure/result/payload` 和 `message_end` 失败证据现在可进入 `model_service_error → warning → scheduler`。
- 声音 focused 回归：工具事件切片 71 项、模型服务/声音接缝 66 项均通过；视觉/生命周期 focused 63 项通过；全量 Node 测试 628 项，616 通过、12 跳过、0 失败；`npm run check`、声音压力测试和 `git diff --check` 通过；Runtime Release CTest 27/27 通过。真实 Hana 模型服务失败声音和 alpha16 卡片视觉仍待现场验收。

## 最新追加：声音系统收尾并行审查

- 四个只读助手分别审查声音调度/Windows backend、声音领域配置、事件到声音链路、声音设置页与测试覆盖。
- 修复 scheduler 同步抛错与 rejected Promise 穿透通知链路的问题；失败现在转为稳定的 `failed` 结果并进入声音诊断。
- 修复模型服务错误嵌套 payload、response、error、failure、result 的事件 ID 提取，避免重复事件重复声音。
- `workModeMuted` 现在进入 NotificationApi、声音预览和音频资产试听的有效静音边界；旧 `updateSettings()` 入口同步 `globalSoundEnabled` 与 `profile.global.enabled`。
- 未知事件不再继承 `arrived` 声音绑定；旧 type policy 与 importance policy 迁移增加更具体交叉规则，避免同 specificity 冲突。
- 非持久 Windows backend 跟踪并清理活动 PowerShell 子进程，降低插件卸载后的进程残留风险。
- 声音收尾验证：全量 Node 测试 621 项，609 通过、12 跳过、0 失败；本轮新增音频/诊断 focused 27 项、页面/生命周期/工具 focused 59 项均通过；`npm run check`、声音压力测试和 `git diff --check` 通过。
- 声音设置页面增加统一请求超时、稳定错误码和 revision 仲裁；持久化绝对路径不再通过声音状态 API 暴露；试听明确提示局部策略被绕过；动态测试工具返回 `historyWritten` 说明当前测试通知仍写入历史。
- 真实 Hana 重载、Windows 扬声器单次试听、重复声音合并、全局静音、动态六事件测试和声音诊断已由用户现场确认全部通过；声音阶段正式收口。未执行 Git commit。

## 最新追加：收缩插件事件，保留外部调用 API 分类

- 现场验证确认：Hana 调用桌面控制等插件时，用户侧语义已经是普通工具事件；因此删除 `plugin_use`、`plugin_call_start`、`plugin_execution_start`、`extension_start` 专用事件适配、分类投影、事件筛选和声音事件选项。
- Notification Center 事件筛选现在只保留助手回复、工具、超时和错误等通用事件；声音配置和声音实验台同样不再出现“插件”事件。工具开始事件不单独入库，工具结果和工具失败继续按既有链路处理。
- `external_call` 分类保留，专门服务未来视觉、模式之后的外部插件公共 Notification API；旧 `plugin` 分类仍作为兼容输入迁移为 `external_call`，没有回滚这条产品能力。
- 声音规则继续支持 `external_call` 分类，但不再支持 `external_call + plugin` 事件组合；通用工具声音链路、全局静音、正式 resolver、scheduler、Windows backend 和诊断边界保持不变。
- 本轮明确不修改视觉 profile、视觉 resolver、视觉设置页或 Runtime visual payload；外部插件 API 按产品顺序在视觉和模式之后接入。
- 定向回归：100 项通过；全量 Node 测试：611 项，599 通过、12 跳过、0 失败；`npm run check`、声音压力测试和 `git diff --check` 均通过。
- 本轮 Release：`dist\\notification-hub-vnext-0.1.0-alpha.15.zip`，SHA256：`1655BD1DA7056F8126DCCFDDA49E3BD85404212FC67582110E0CD2E9B973AE1F`。

## 最新追加：声音实验台与规则解释器

- 声音设置页新增“声音实验台”，通过 `runSoundWorkbench()` 和 `POST /sound-workbench-run` 只选择要模拟的通知组合、次数和间隔；不提供声音选择，具体声音完全由上方已保存的组合规则决定。分类、事件和普通/重要选项集合与上方配置一致，但选择状态独立。实验事件不写入通知历史，正式经过 resolver、scheduler、Windows backend 和 sound diagnostic；实验请求只等待调度启动，播放完成或失败由诊断链路异步记录。
- 声音设置页新增“声音规则解释”，通过 `explainSoundSettings()` 和 `POST /sound-rule-explain` 输出安全的决策解释：命中规则、命中层、声音、global/category/rule/final 音量、重复抑制、调度和播放结果。
- 新增 `plugin/domain/sound-rule-explanation.js`，解释器只消费正式决策与诊断结果，不复制声音匹配逻辑；新增 `sound-workbench` 诊断来源，仍不展示绝对路径、原始正文、PowerShell 脚本或音频数据。
- 实验台次数限制为 1～20，间隔限制为 0～2000ms；全局静音是绝对边界，实验台不会强制绕过声音策略。
- 本轮 focused 回归：63 项通过；全量 Node 测试：608 项，596 通过、12 跳过、0 失败；`npm run check`、`npm run pressure -- --scenario all --count 1000` 和 `git diff --check` 均通过。
- 本轮交互与性能修复新增回归：实验台不再展示或传递 `soundId`，组合规则决定最终声音；实验请求不等待完整音频播放，后台继续记录最终播放结果。focused 回归与全量 Node 测试均通过；`npm run check`、声音压力测试和 `git diff --check` 均通过。
- 本轮修复后的 Release：`dist\\notification-hub-vnext-0.1.0-alpha.15.zip`，SHA256：`79D7A124CA7F908F8E99AC1DC5B9DA8A2F5FF046BABC6E1C7D75914B64FBC3DD`。

## 最新追加：模型服务真实错误接缝修复

- 已复现并定位唯一静音 bug：宿主真实错误若以 `message_end + stopReason=error`，或普通 `error` 事件携带结构化 Provider/HTTP 错误到达，旧适配器会在 `completed` 门禁前直接返回 `ignored-event`，因此不会进入 `NotificationApi.ingestModelServiceError()`，声音链路完全没有机会执行。
- 修复 `plugin/events/notification-event-adapter.js`：识别结构化 `status/httpStatus/statusCode`、嵌套 `response/error/failure/result/payload`、Provider/Model/operation 上下文和 `model_service/provider_error` 明确标记；合并嵌套 status 与外层上下文后进入统一模型服务错误入口。
- `message_end` 只有在失败 stopReason 且带模型服务边界证据时才放行；普通文本错误、裸 HTTP 状态和无上下文的 `Service temporarily unavailable` / “操作未能完成”均保持 ignored，避免误报模型服务异常。模型服务错误进入声音 profile 后默认命中 `model_service → warning`，首个 active incident 的 decision 为 `play: true`。
- 新增真实接缝回归：`message_end` 里的结构化 503、普通 `error` 里的 `error.response.status=502`、根级 `response.statusCode=503` 均能在有 Provider/Model/operation 上下文时生成 `model_service_error` 并进入声音调度；补充反例覆盖裸文本、无关 HTTP 错误和无 Provider 证据的失败回复。
- 本轮 focused 回归：41 项通过；全量 Node 测试：602 项，590 通过、12 跳过、0 失败；`npm run check`、`npm run pressure -- --scenario all --count 1000` 和 `git diff --check` 均通过。真实 Hana EventBus 的实际 payload 仍需用新包现场触发确认。
- 严格边界修复后的 Release：`dist\\notification-hub-vnext-0.1.0-alpha.15.zip`，SHA256：`4DA2028BE471FE1F1E7BF05F23E093CA654D91179F2A6BA06EA6E973094EB94A`。现场验证前不能宣称真实宿主已完成接入。

## 最新追加：WAV 分组音量与模型服务 incident 生命周期

- 修复自定义 WAV 播放在 MCI 打开失败时退回 `SoundPlayer.PlaySync()`、从而绕过分组音量的问题：WAV 现在优先通过 MCI 执行 `setaudio ... volume`，失败时使用带 `MediaPlayer.Volume` 的受控 fallback；不再使用无音量控制的 `SoundPlayer` 播放自定义 WAV。
- 新增 WAV backend 回归，确认请求音量进入 WAV 播放脚本、MCI 与 fallback 都保留音量语义；MP3 的 `mpegvideo + setaudio` 路径继续通过测试。真实 Windows 驱动、编码和扬声器听感仍需现场验收。
- notification aggregation 与 deduplication 的稳定键现在优先使用 `metadata.incidentKey`；同一模型服务事故的不同 attempt 不会因为共享 `source + type` 或 session 而错误混合，不同 task scope 会分开。
- `model_service` 增加进程内/持久化通知记录可承载的 incident 生命周期：`firstSeenAt`、`lastSeenAt`、`attemptCount`、`cycle`、`status`；同一 active incident 更新原卡片，恢复后 `model_service_recovered` 关闭当前 incident，后续再次失败创建新 cycle。
- 明确恢复事件仍只更新 incident 元数据，不创建新的普通恢复卡片；未确认 Hana 稳定 EventBus 契约前，以上仍是内部 API/adapter 接缝，不能宣称真实宿主已接入。
- 本轮 focused 回归覆盖 WAV 音量、incidentKey 优先级、连续 attempt、恢复和恢复后重新失败，已通过；全量 Node 测试：594 项，582 通过、12 跳过、0 失败；`npm run check`、`npm run pressure -- --scenario all --count 1000` 和 `git diff --check` 均通过。
- Release 已重新打包：`dist\\notification-hub-vnext-0.1.0-alpha.15.zip`，SHA256：`3E395D58E9EAEDCB66620D2EA38CBB687355B4E6501FC03063AD4E201DD24FF1`。ZIP 共 96 项，已确认包含 `index.js`、`manifest.json`、`runtime/notification-hub-runtime.exe`、`domain/model-service-error.js`、`events/notification-event-adapter.js` 和 `domain/audio-adapter.js`。

## 2026-08-15：声音测试复用正式调度路径与模型服务异常类别垂直切片

- 设置页 `testSoundSettings()` 与 `testSoundAsset()` 已切换到正式 `soundScheduler` 和正式 Windows backend，移除测试路径强制 `suppressDuplicates: false` 与独立 preview scheduler。
- 新增并发回归：同一实际声音在 active 播放期间第一条返回 `played`、后续返回 `merged`；播放 Promise settle 后再次测试恢复 `played`；全局静音仍然阻断测试声音。
- scheduler 播放结果补充安全的 `soundKey` 与 `suppressDuplicates` 字段；诊断仍不包含绝对路径、脚本、原始正文或音频数据。声音页面文案已明确“行为与真实通知一致；播放中的同类声音会被合并”。
- 新增用户类别 `model_service` / “模型服务异常”，并投影为 `model_service + system + error` 标签；系统与错误筛选均可命中，声音和视觉 profile、规则目标、绑定层及试听输入均支持该类别。
- 新增安全模块 `plugin/domain/model-service-error.js` 与 `NotificationApi.ingestModelServiceError()`；保留有限 HTTP/Provider/Model/operation/task scope/retry/incident 字段，429、502、503 不成为用户分类，API Key、完整响应和正文不会进入 metadata。
- 连续模型错误使用带 task/session scope 的 incident key；明确事件适配器只处理结构化 `model_service_error`，未知普通 `error` 不误报。当前尚未获得 Hana 稳定通用模型错误 EventBus 契约，因此不能宣称真实宿主事件已接入。
- 本轮 focused 回归：184/184 通过；全量 Node 测试：589 项，577 通过、12 跳过、0 失败；`npm run check` 通过；`npm run pressure -- --scenario all --count 1000` 四场景通过；`git diff --check` 无差异错误。
- Release 已重新打包：`dist\\notification-hub-vnext-0.1.0-alpha.15.zip`，SHA256：`E628ED71895F3486D8FE6905F61FFF7A30F7FE95768BD5798987A748ADD0A616`。ZIP 校验包含根目录 `index.js`、`manifest.json`、`runtime/notification-hub-runtime.exe`、`domain/model-service-error.js` 和 `events/notification-event-adapter.js`，共 96 项。


## 2026-08-15：修复不同逻辑 cue 映射到同一物理声音时的重复播放

- 用户现场复现证明，之前只按逻辑 `cue` 合并仍然不够：`tool-failed`、`warning`、`error` 在 Windows 全音量路径都可能播放同一个 `Windows Exclamation.wav`，`channel-incoming` 与 `plugin-notice` 也可能共享 `notify.wav`。
- 根因是 scheduler 默认把不同 cue 当成不同声音，真实测试工具因此可以同时启动多个实际相同的系统声音。
- 新增 `resolveSoundPlaybackKey()`：自定义 `soundId` 独立；全音量内置 cue 按实际 Windows media 文件归并；低音量内置 cue 使用生成音调，按逻辑 cue 独立。scheduler 新增 `keyOf` 注入点，默认行为保持 `soundId ?? cue` 兼容。
- `run-notification-test` 现在返回每条结果的调度状态，能够直接看到 `played` 或 `merged`，不再只显示策略阶段的 `allowed`。
- 真实插件级复现已通过：12 条六类测试事件只启动 4 次 backend，8 条同物理资源请求返回 `merged`；播放结束后再次触发可恢复播放。
- 本轮 focused 声音与测试工具回归 51/51 通过；全量 Node 测试 577 项，565 通过、12 跳过、0 失败；`npm run check`、`git diff --check` 和 CLI 压力测试 `all --count 1000` 通过。
- Release ZIP 已重新生成并校验：`notification-hub-vnext-0.1.0-alpha.15.zip`，SHA256：`B7A4902D5A6F860B7BF53F61BEA195A257378969923ED351A5BAFE62D504EDF6`。

## 2026-08-15：确认“抑制重复声音”采用 active 播放窗口语义

- 用户语义已明确：同一最终 `soundId/cue` 在播放 Promise 未结束前只播放一次，后续同类请求返回 `merged`；不同声音各自独立播放；第一条结束后同类声音立即恢复播放。
- 不引入 `stableKey` 冷却窗口，也不把 `cooldownMs` 作为普通声音的时间抑制机制；通知级去重仍由 NotificationApi 独立负责。
- 新增 NotificationApi 端到端回归：同 cue active 时 scheduler/backend 只有一次调用，不同 cue 同时调用，首条 settle 后同 cue 再次调用并返回 `played`。
- Windows 非持久音频 backend 的 Promise 以独立 PowerShell 子进程 `close` 为完成边界；内置 cue 使用 `SoundPlayer.PlaySync()`，自定义文件使用同步播放命令，自动化测试确认 backend 不走共享 FIFO。
- 本轮 focused 声音回归 109/109 通过；全量 Node 测试 574 项，562 通过、12 跳过、0 失败；`npm run check`、`git diff --check` 和 CLI 压力测试 `all --count 1000` 通过。
- 当前剩余验收只在真实 Hana/扬声器：确认现场设置最终 `suppressDuplicates`、`soundId/cue` 一致，并观察同 cue 播放期间诊断是否为 `merged`。自动化证据不等价于真实设备听感。

## 2026-08-15：修复动态工具返回值被桥接为 `[object Object]`

- 根因已确认：`ctx.registerTool()` 的动态工具应返回 Hana SDK 风格的 `{ content: [{ type: 'text', text }], details }`；原 `run-notification-test` 直接返回普通 JavaScript 对象，跨会话桥接因此显示为 `[object Object]`。
- 新增动态工具薄适配层 `createNotificationTestToolResult()`：保留 `runNotificationTest()` 的原结构化结果给内部 API，同时为 Hana 工具提供 JSON 文本摘要和 `details` 结构化字段。
- README 已补充返回契约，避免把工具调用成功误判为声音或入库字段已被模型读取。
- 回归验证：先确认旧测试在新断言下失败，再完成最小实现后 focused 测试 1/1 通过；全量 Node 测试 573 项，561 通过、12 跳过、0 失败；`npm run check` 通过；`git diff --check` 通过。
- CLI 压力回归 `all --count 1000` 通过：eager 1000 played、duplicate 1 played/999 merged、failures 900 played/100 failed、mute 1000 skipped，全部 settled、无 dropped。
- Release ZIP 已重新生成并校验：`notification-hub-vnext-0.1.0-alpha.15.zip`，SHA256：`57EA9677A44A44048A1AE382096A0B9DF447A2B1990101D2A79BD539D7E15E31`；压缩包根目录 `index.js` 已确认包含适配层。
- 真实 Hana 仍需安装此新包并由新会话重跑工具，才能验证桥接层现在能读取 `content[0].text` 与 `details`；真实扬声器听感仍需现场确认。

## 2026-08-15：压力命令与 Hana 多事件测试工具完成，发现并修正连续对话事件去重问题

- 新增 `npm run pressure -- --scenario eager|duplicate|failures|mute|all --count N`，输出单行 JSON 统计；默认使用 fake player，不产生真实声音。CLI 已验证 eager、duplicate、failures、mute 四种场景。
- 新增 `plugin/domain/notification-test-generator.js` 和受控动态工具 `run-notification-test`：最多 100 条、间隔 0～5000ms，支持 `chat_message`、`channel_message`、`tool_completed`、`tool_error`、`timeout`、`system_warning`；每条卡片带 `[压力测试]`、事件名、序号、总数和语义说明。
- 工具支持独立控制 `createCards` 与 `playSound`；全局静音仍只阻断声音，不阻断测试通知入库或卡片生成。
- 用户发现的事件语义已确认：当前桌面聊天的 `message_end` 表示助手回复完成，不等于下一轮用户消息。声音设置页已将聊天 `arrived` 改名为“助手回复完成（当前事件）”，并在页面说明中标注边界；频道、工具完成、工具失败、超时、系统警告均作为独立测试事件说明。
- 修复事件适配器错误：当 Hana 事件缺少 `eventId/messageId/id` 时，不再把 `sessionPath` 写成每条通知的 `traceId`；连续对话事件现在能分别入库和分别触发声音。新增回归覆盖同一 session 下无事件 ID 的两轮 `message_end`。
- 本轮新增 focused：CLI、测试事件生成器、动态工具、事件适配器和声音页面 36 项通过；全量 Node：573 项，561 通过、12 跳过、0 失败；`npm run check`、`git diff --check` 通过；CLI `all --count 1000` 四场景全部 settle，无 dropped。Release 包已在本轮源码变更后重新生成，Release ZIP SHA256：`5DE1266088FB122348847EBDBC913F3F593336C79C9C01DBBDCDC36429669ED1`。

## 2026-08-15：声音压力测试第一轮完成

- 新增 `tests/node/sound-pressure.test.mjs`，覆盖 1000 条关闭抑制的 eager 请求、1000 条同 cue 活跃合并、1000 条 active 请求 clear、300 条交错播放失败恢复、250 条真实 `NotificationApi` 通知链路、500 条全局静音通知和 128 个独立 Windows backend cue 进程启动。
- 压力测试全部通过：8/8；测试使用受控 fake player 和 spawn seam，不直接向真实音频设备发出 1000 条声音。
- 当前结果重点证明：无 scheduler 等待队列增长、无 `dropped`、只在 active 窗口合并、settlement 后同 cue 可再次播放、`clear()` 能结算全部上层 Promise、同步播放失败和 `played:false` 会被传播、全局静音不调用播放器、失败后后续播放可恢复、非持久 Windows backend 不产生 backend FIFO，并能将 spawn error/非零退出转成受控失败。
- 第一项测试明确标注为 eager 吞吐契约，不把 `maxQueue` 误当资源上限；128 个 backend 进程测试只验证 spawn seam 的独立启动，不等价于真实设备混音或系统资源安全。
- 真实设备听感、长时间 Hana 生命周期、真实 PowerShell 子进程残留和资源上限仍需第二轮小规模现场压力测试。

## 2026-08-15：声音仍合并/排队的三层根因已定位并修复

- 根因一：声音设置页只修改 `profile.global.suppressDuplicates=false`，但 `sound-rule-resolver` 合并分类默认策略时会让分类默认 `true` 覆盖全局 `false`，最终 decision 重新变成 `suppressDuplicates:true`，scheduler 因此返回 `merged`。现已将全局关闭设为绝对边界，分类和规则不能重新开启合并。
- 根因二：试听后端使用 `persistent:true`，PowerShell runner 内部只有一个 active 请求和一个 FIFO queue，多个试听请求即使经过 eager scheduler，仍然在 backend 串行。现已改为试听使用非持久 backend，并明确将试听 decision 设为 `suppressDuplicates:false`。
- 根因三：Windows 内置 cue 使用 WinMM `PlaySound` 的异步单流调用；多个 Node 请求虽已并发，但后一个系统音效可能覆盖前一个，用户听感仍像串行。现已改为每个请求独立 PowerShell 进程中的 `System.Media.SoundPlayer.PlaySync()`，避免共享 WinMM 单流。
- 诊断记录现在额外保留最终 `decision.suppressDuplicates`、调度 `soundKey` 和 `scheduling.suppressDuplicates`，现场可以直接判断合并是否来自最终策略。
- 新增插件级真实链路回归：保存全局关闭 → 真实 `NotificationApi.ingestEvent()` → 最终 decision → scheduler/backend，确认不会出现 `merged`；新增 Windows backend 独立进程并发启动测试，以及全局抑制边界测试。
- 本轮声音 focused 回归：109/109 通过；全量 Node：556 项，544 通过、12 跳过、0 失败；`npm run check`、`git diff --check` 和 CTest 27/27 通过。Release 包已重新生成，SHA256 为 `9FFB9811657F84E95589A10724D6666148DE4260981539D6C744F7CC23BCB726`。真实 Hana 仍需重载此包进行最终听感验收。

## 2026-08-15：关闭声音抑制时的突发声音丢失已定位

- 初步曾将问题归因为 `maxQueue=8`，并临时提高到 `64`；后续最小复现证明这仍然保留了不需要的串行排队，现已由下面的 eager 播放模型替代。
- 当前声音调度语义已收敛：抑制开启时，只对已经活跃的相同 `soundId/cue` 返回 `merged`；不同声音立即独立播放。抑制关闭时，所有声音立即独立播放，不进入等待队列，不发生合并。
- `waitForIdle()` 和 `clear()` 已改为跟踪全部活跃播放；播放失败、清理和卸载都能结算各自 Promise。`maxQueue` 仅保留为兼容性参数校验，不再决定声音是否丢弃。
- 真实 `NotificationApi.ingestEvent()` 最小复现确认：抑制关闭时 3 个请求产生 3 次 backend 调用，抑制开启且同 cue 时产生 1 次调用，其余返回 `merged`；抑制开启但 cue 不同时也会立即产生多次调用。
- 本轮声音 focused 回归 171/171 通过；全量 Node 553 项，541 通过、12 跳过、0 失败；`npm run check`、`git diff --check` 和 CTest 27/27 通过。Release 包已重新生成，SHA256 为 `0BADE4C0905804ABC1CE75DE51B385325131F5AF9F9D9862564145B05D7E8579`。真实 Hana 仍需重载此包进行重叠播放听感验收。

## 2026-08-16：事件语义与表现绑定重构第一批落地

- 新增 `docs/superpowers/plans/2026-08-16-notification-event-presentation-refactor.md`，覆盖唯一事件身份、Canonical Event、二值重要性、声音/视觉/行为绑定、行为通道、生命周期、页面、侧边栏、外部 API 和真实 Hana 验收。
- 新增 `plugin/domain/notification-event-catalog.js`：内置事件目录采用唯一 `categoryId + eventTypeId`，生成稳定 `eventId`；Runtime、Delivery 等非普通通知事件标记为 diagnostic/internal 或 `presentationEligible=false`。
- 新增 `plugin/domain/notification-semantics.js`：Canonical Event 工厂、校验、旧事件转换；现有 ingestion 双写 `metadata.semantic`、`eventId`、`categoryId`、`eventTypeId`，保留旧 type/classification 兼容字段。
- 新增 `plugin/domain/notification-importance.js`：重要性对外收敛为 `normal/important`，默认普通，支持关键词命中；旧 `low/normal/high/critical` 通过 `importanceClass` 兼容投影，不改变现有声音 resolver 的旧行为。
- 新增 `notification-presentation-profile.js`、`notification-presentation-selector.js`：Global → Category → Event 继承，声音、视觉、行为绑定共享唯一事件身份；旧 presentation input 继续保留，避免立即破坏既有声音/视觉测试。
- 新增 `notification-behavior.js`、`notification-behavior-manager.js`：相同 `behaviorChannelId` 的卡片共同作用，不同通道隔离；当前已完成领域层和快照测试，Runtime 行为管理器仍待下一阶段接入。
- 新增 `event-presentation-settings.js`、`event-presentation-settings-store.js` 与 `routes/settings-events.js`；设置壳子新增“事件表现”视图、事件目录和重要性关键词入口，当前 Store 尚未接入独立持久化文件。
- NotificationApi 和 Native Scene payload 已携带事件身份、visualProfileId、behaviorProfileId、behaviorChannelId；alpha.8 创建、关闭、重排和点击稳定基线未改动。
- 验证证据：最新 `npm test` 653 项，641 通过、12 跳过、0 失败；`npm run check` 通过，语法检查覆盖 206 个 JavaScript 文件；`git diff --check` 无差异错误；新增事件目录、语义、重要性、表现绑定、行为通道、设置页面和 Scene payload focused 回归通过。
- 新增 `event-presentation-settings-store-store.js`、`event-presentation-settings-persistence.js`、`event-presentation-settings-persistence-config.js`：事件表现设置现在拥有独立版本化 JSON 快照、原子替换、路径/开关/debounce 配置、restore/observe/flush 和诊断接缝；默认文件为 dataDir 下的 `event-presentation-settings.json`。
- 插件 onload/onunload 已接入事件表现设置 restore、应用、观察和 flush；状态 API 只暴露 enabled/pending，不暴露持久化绝对路径。
- 修复审查发现的两个一致性问题：restore 异步期间若本地 revision 变化，不再用旧磁盘快照覆盖本地修改，并会重新排队最新快照；后台保存失败保留 pending snapshot 并安排自动重试。
- 事件表现持久化 focused 与真实临时目录生命周期集成回归通过；当前全量验证为 `npm test` 665 项、653 通过、12 跳过、0 失败；`npm run check` 通过，语法检查覆盖 211 个 JavaScript 文件；`git diff --check` 无差异错误。
- 声音 resolver 事件级迁移第一刀已落地：`soundProfileId` 进入统一 `soundInput`；显式 `soundProfiles` 策略优先于旧 labels、soundOverrides 和 rules；未知 profile 显式报告 `fallbackReason`，非法 ID 不再破坏通知摄取；未声明新策略时继续走旧声音规则，保护自定义声音绑定兼容。
- 事件目录为工具失败、超时、阻止、取消、频道失败、模型服务失败/超时、会话持久化失败和外部接入失败提供了明确 soundProfileId；catalog 默认身份只有在 sound profile 中显式声明策略时才激活，避免迁移期间静默改音。
- 新增视觉 `visualProfiles` 显式策略：事件 `visualProfileId` 优先于旧 labels 的 category priority，支持受控 preset、intensity 和 minimal card override；未知/非法 profile 安全回退并保留 `fallbackReason`；Canonical Event 的 `categoryId` 现在优先决定视觉主类别。
- 视觉身份已进入 `visualInput`；Native Scene payload 进一步拆成 `visual`、`presentation`、`behavior` 三个受控对象，旧 visual 决策字段保持兼容，事件身份和行为通道不再混进 visual 决策。
- Node 侧已建立按 `behaviorChannelId` 管理的 Behavior Manager registry：同通道卡片共享 manager 状态，异通道独立；卡片创建、驱逐、关闭和卸载会维护 channel 生命周期。SceneState 与 Native Runtime Named Pipe card parser/controller 已增加可选 presentation/behavior metadata，旧 minimal card payload 仍可回退。
- 视觉与行为 focused 回归 65/65 通过；最新全量 `npm test` 676 项，664 通过、12 跳过、0 失败；`npm run check` 通过，覆盖 211 个 JavaScript 文件；`git diff --check` 无差异错误。
- 已定位 Visual Studio Community 2026：`D:\MyApplications\VS`，MSVC `14.51.36231`，Windows SDK `10.0.26100.0`；CMake/CTest 来自 VS 安装目录，现有 `build\debug-vs2026` 可复用。
- Native Runtime 已按 Debug 和 Release 配置编译；Release CTest 当前 `28/28` 通过。新增 `runtime_named_pipe_behavior_channel_smoke` 覆盖同 channel 共同堆叠、不同 channel 独立 lane、dismiss 后各自重排和 metadata 生命周期。
- Native controller 已建立 `behaviorChannelId → BehaviorChannelState` registry：卡片按 channel 分组维护顺序、profile 和 card lifecycle；多 channel 时划分独立工作区 lane，`ticker` channel 使用 shelf/right 行为；旧无 behavior 卡片继续进入 `__legacy__` group，旧单一 layout 输出保持兼容。
- Scene snapshot 新增可选 `behaviorChannels` 生命周期元数据；旧 snapshot 不含该字段时仍通过。SceneState validator、recovery replay 已同步保留 behavior/presentation metadata。
- Node Scene queue 已从单一全局队列改为按 `behaviorChannelId` 的 queue/promise registry；不同 channel 可独立 drain，同 channel 保持顺序，卸载时统一清理。
- 最新全量 `npm test`：679 项，666 通过、13 跳过、0 失败；`npm run check` 通过，覆盖 212 个 JavaScript 文件；`git diff --check` 无差异错误。
- 曾在并行 CTest 中出现一次既有 `runtime_scene_controller_self_test` 关闭时序失败；单测连续复现和之后完整 Debug/Release CTest 均通过，当前记录为一次未复现的并发现场波动，未修改 alpha.8 测试绕过。
- 当前未执行 Git commit；工作区原有大量未提交变更继续保留，不能据此宣称整个重构或真实 Hana 现场验收完成。

## 总目标

做一个能被 HanaAgent 插件生态调用，并最终可以跨平台运行的通知场景平台：先完成稳定的 Windows Native Runtime，再开放版本化公共通知服务，最后扩展其他平台的 Native Runtime。

## 当前稳定基线

```text
0.1.0-alpha.16
```

当前安装包：`dist\\notification-hub-vnext-0.1.0-alpha.16.zip`

当前安装包 SHA256：`415C35F590DDB5200DE03487A7778726C8823C668A3218CCED6AFE8A25A1197E`

## 2026-08-15：声音诊断与可解释性第一条垂直切片完成

- 新增 `plugin/domain/sound-diagnostic.js`，统一规范化并深冻结声音诊断记录，区分 `played`、`failed`、`skipped`、`suppressed`、`merged`、`queued`、`dropped`、`cleared` 和 `unavailable`。
- 诊断记录只保留结构化输入、声音决策、调度结果、播放证据和用户可读解释；主动排除绝对路径、原始正文、PowerShell 脚本和音频数据。
- NotificationApi 增加非阻塞 `onSoundDiagnostic` 接缝；通知策略拒绝、调度合并/抑制、播放器成功/失败均可进入有限内存诊断列表。
- 声音试听和音频资产试听也会记录结构化结果；全局静音试听记录 `skipped`，不会调用播放器。
- 声音设置状态新增 `soundDiagnostics`，保留原有配置诊断 `diagnostics` 兼容字段；列表最多保留 30 条，不写入持久化文件。
- 声音设置页新增“最近声音状态”只读面板，显示来源、事件、重要性、声音、最终音量、调度状态、播放状态和解释；保持 iframe、响应式和无横向隐藏。
- focused 声音诊断、试听、NotificationApi、生命周期和页面测试：67/67 通过；全量 Node：550 项，538 通过、12 跳过、0 失败；`npm run check` 与 `git diff --check` 通过。
- 后续修复：状态面板已移动到声音页面最后，增加“刷新状态”“删除状态”“导出状态”；自动每 3 秒只请求 `sound-settings-status` 并替换 `sound-diagnostics-list`，不重建配置和音频库区域。
- 修复真实任务应用链路：页面的“全局声音”保存现在同步写入 `profile.global.enabled`，避免仅 `globalSoundEnabled=true` 而 profile 仍保持默认 `enabled=false`，导致真实通知返回 `policy-disabled`。自定义声音绑定本身已通过真实 `NotificationApi.ingestEvent()` 入口确认能解析为 `soundId` 并进入 `playFile`。
- 新增声音状态清除和导出 API；导出为受控 JSON 状态文件，不包含音频路径、脚本或正文。
- 声音设置页面、状态刷新、自定义声音链路和真实任务声音行为已完成现场验收；声音阶段不再有现场阻塞，后续按产品顺序进入视觉策略。

alpha.8 仍是 Native Runtime 交互稳定基线；alpha.11 在此基础上包含 Notification Center 产品化、设置视图导航修复和版本元数据同步。

alpha.8 已通过真实 Hana 验收：

- 连续创建卡片时不再在左上角闪现。
- 鼠标点击只关闭一张卡片。
- 多卡片关闭后剩余卡片正确重排。

后续前端和 Runtime 改动都必须保护这条稳定基线。

## 当前阶段

- 地基门：已通过。旧版隔离、Node/C++ 工程、协议、诊断、测试工具链已建立。
- Runtime 门：已通过。生命周期诊断、配置热更新、关闭重排、真实 Runtime 页面状态和 Shelf 多通知压力复测均已通过；Runtime / Pipe 连接正常，未再出现 Shelf 布局溢出。
- 通知门：已通过。真实 EventBus → Store → persistence → API → Notification Center 的通知闭环已获得证据，通知详情和 Widget 入口已部分验收。
- 产品门：进行中。阶段一“侧边栏与页面稳定”、阶段二“通知卡片分类”和阶段三“分类声音策略”均已完成用户真实 Hana 验收与自动化回归；下一阶段进入视觉策略正式迁移与验收。
- 生态门：未开始。公共通知 API 仍需版本、schema、能力发现、权限和文档产品化。
- 跨平台门：暂不考虑。Windows 产品稳定发布前不引入跨平台 Runtime 大抽象。

## 当前产品与前端设计决策

以下方案已经确定，但尚未全部实现：

- 顶部使用图像化导航卡片，进入通知中心、设置、Runtime 和诊断等大类空间；不使用僵硬的纯文字命令栏。
- 默认进入通知中心；进入大类后，每个领域使用独立页面完成自己的职责。
- 设置采用“设置中心入口页 + 声音、桌面布局、视觉与主题、历史与隐私等独立领域页面”，不制作一张无限增长的长表单。
- 通知历史完整保留；Notification Center 页面显示上限可由用户设置为 30、100、500、1000、无限或 1～10000 的自定义值。单条通知默认只压缩为一行标题和两行摘要，查看详情时展示完整正文、来源、类型、状态和 metadata。
- 侧边栏只负责通知简要、Runtime 状态、简单音量和快速视觉设置；复杂配置、历史、诊断和开发验收移入页面。
- 页面和侧边栏必须真正自适应，宽屏多列、中等宽度重排、窄屏单列，任何宽度不得出现横向遮挡。

详细设计入口：

- 总路线：`notification-hub-vnext-plan.md`
- 当前状态：`CURRENT-STATUS.md`
- 侧边栏与页面产品基准：`SIDEBAR-PAGE-PRODUCT-PLAN.md`
- 前端设计基准：`FRONTEND-DESIGN-GUIDELINES.md`

## 2026-08-13：设置统一壳子第一阶段完成自动化闭环

- `/settings` 已收敛为一个统一设置壳子：保留顶部大类导航，新增设置分类侧栏、当前子页面标题、统一状态反馈和内容挂载点。
- 设置分类首批接入“常规与显示”“声音”“通知视觉”；“历史与隐私”保留为禁用占位，不伪造尚未存在的历史清理 API。
- 新增同一 iframe 内的 `GET /settings-content?view=general|sound|visual` 片段接口；子页面只替换 `#settings-view-content`，不重新加载整个 body，不新增 Hana Page surface，不使用 `document.open()` / `document.write()`。
- “常规与显示”接入通知显示数量和桌面卡片持续时间，保留 `0～3600` 秒语义；显示设置和卡片设置独立保存，保存其中一项不会用旧状态覆盖另一项。
- 声音和通知视觉沿用既有 API、服务端初始状态、超时、Hana API fetch/fallback、保存和预览逻辑；片段移除了旧的重复顶部导航和已不存在控件的事件监听。
- Runtime、诊断、通知中心已确认布局和顶部图标未改。
- focused 设置、声音、视觉、页面导航：12 项通过；全量 Node：489 项，477 通过、12 跳过、0 失败；`npm run check` 与 `git diff --check` 已通过。真实 Hana 视觉、内部切换和保存行为待重载新包后验收。

## 2026-08-13：设置与通知中心第二轮问题修复

- 通知中心批量删除改为一次 Store 批量移除，并并行处理可见桌面卡片 dismiss；前端去掉批量删除后的重复刷新。
- 通知列表刷新增加内容签名短路：数据没有变化时不重建 DOM；列表卡片采用 `content-visibility: auto`，并按每批 40 张卡片分帧挂载，降低大列表首屏阻塞。
- 声音设置默认音量改为用户可理解的 0～100%，提交时转换回后端内部 0～1；保存区下沉到页面尾部，并同步设置壳子顶部状态反馈。
- 声音试听结果现在区分“策略未播放”“试听实际播放”“播放器失败”；试听会绕过普通策略阈值进行一次受控播放，但全局声音关闭仍然绝对阻断。
- 通知视觉片段补齐本地状态节点，预览异步回调在视图切换后检测节点是否仍存在，避免 `Cannot set properties of null (setting 'textContent')`；保存区下沉到页面尾部并同步壳子状态。
- focused 设置、声音、视觉、通知中心、插件生命周期回归通过；全量 Node：491 项，479 通过、12 跳过、0 失败；`npm run check` 与 `git diff --check` 已通过。尚未完成真实 Hana 复测。

## 当前产品路线

```text
阶段 1：侧边栏与页面稳定
    ↓
阶段 2：通知卡片分类：聊天、频道、工具、错误、插件等
    ↓
阶段 3：分类声音策略
    ↓
阶段 4：分类视觉策略
    ↓
阶段 5：模式制作
    ↓
阶段 6：公共通知 API
    ↓
阶段 7：稳定化与正式发布
```

Runtime 生命周期、Shelf 多卡片、Notification Center、响应式侧边栏和页面导航属于阶段 1；alpha.8 是 Native Runtime 交互稳定基线，alpha.11 是当前交付版本。

阶段 8 的跨平台 Runtime 暂不进入当前路线。

## 当前实现进度：通知中心第一前端切片

已完成代码与自动化测试闭环：

- Notification Center 路由不再向 Store 传递固定 `limit: 100`，完整列表由 Store 返回；本轮测试使用 101 条通知确认没有人为数量上限。
- 单条卡片标题增加一行视觉截断，摘要增加两行视觉截断；原始 `content`、`summary` 和 metadata 没有被删除或改写。
- 默认卡片 metadata 收缩为“来源 + 状态”；通知类型保留在详情面板，避免默认卡片信息过密。
- “查看详情”仍然是完整内容入口；详情显示完整正文、来源、类型、状态和 metadata。
- 未读通知的“标记已读”改为紧凑的可访问图标按钮，批量选择与批量标记已读行为保留。
- 窄宽度下筛选控件允许换行，卡片内边距和详情网格降级为单列；没有使用 `overflow-x: hidden` 掩盖布局问题。

验证：

- `node --test tests/node/notification-center-route.test.mjs`：13/13 通过。
- `npm run check`：通过。
- `npm test`：368 项，356 通过、12 跳过、0 失败。
- `npm run check`：通过；`git diff --check`：通过。
- alpha.3 时代残留的 3 个版本断言已同步为 alpha.8；这属于测试基线修复，不改变运行时行为。

## 当前实现进度：Notification Center 显示上限

已完成代码与自动化测试闭环：

- 默认显示上限为 100，避免 2100 条通知一次性生成大量 DOM。
- 设置页新增 30、100、500、1000、无限、自定义选项；自定义范围为 1～10000。
- 显示上限独立持久化到 `notification-display-settings.json`，不进入 Native Runtime `config.update`，也不影响声音和布局设置。
- Notification Center 当前页面支持快速切换并应用显示上限；接口返回 `displayedCount`、`displayLimit` 和 `hasMore`。
- Store 和历史文件仍然保留完整通知；上限只作用于当前页面的查询和渲染负载。
- `无限`明确表示取消路由级上限，数量极大时仍可能增加页面渲染成本。

验证：

- Notification Center、设置路由、显示设置校验与持久化 focused：24/24 通过。
- 全量 Node：367 项，355 通过、12 跳过、0 失败。
- `npm run check` 和 `git diff --check` 通过。

## 2026-08-13：通知中心布局、显示设置与删除功能第一轮重做

- 通知中心页面由单条拥挤工具栏改为标题区、筛选区、显示设置区、批量操作区和通知列表五个清晰区域；通知卡片增加未读层级、分类信息、详情、标记已读和删除动作。
- 页面显示数量和桌面卡片持续时间现在由同一份 `notification-display-settings.json` 状态保存；显示数量保存后使用服务端标准化返回值更新页面，并重新请求列表。
- 桌面卡片持续时间新增 `cardLifetimeSeconds`，范围为 `0～3600` 秒；`0` 表示新桌面卡片立即自动消失，不删除通知历史。该设置作用于新卡片，已有卡片不强制改写剩余时间。
- Notification Center 新增单条删除和批量删除接口，删除历史时会尝试关闭对应桌面卡片；删除不会影响新的通知产生。
- 顶部设置导航图标更换为同一 `viewBox`、同一几何中心的齿轮 SVG，内圈与外轮廓均以 `(12,12)` 为中心。
- 本轮 focused 86 项通过；全量 Node 487 项，475 通过、12 跳过、0 失败；`npm run check` 与 `git diff --check` 已通过。
- 后续修复：自动刷新现在只更新通知接收区，不再在定时刷新时覆盖显示数量和卡片持续时间输入；保存流程会通过 Notification Center 自己的读写接口二次确认服务端值；删除后强制重新拉取通知列表，已读卡片也可以选择删除；布局和图标保持不变。
- 本轮 focused Notification Center 20 项通过；全量 Node 487 项，475 通过、12 跳过、0 失败；`npm run check` 与 `git diff --check` 已通过。Runtime 和诊断页面未改。尚未完成真实 Hana 视觉和真实 mutation 验收。

## 2026-08-13：试听声音失败修复

- 根因：Windows 内置声音的 PowerShell WAV 生成脚本使用 `.join("`n")`，向 PowerShell 5.1 传入了字面量 `` `n ``，导致脚本解析失败、进程退出码为 1，底层返回 `{ played: false }`。
- 修复：改用 JavaScript 实际换行 `.join("\\n")`；当前真实 Windows 后端最小调用返回 `{"played":true}`。
- 调度器现在识别底层播放器返回的 `played:false`，对外报告 `status: "failed"`，并保留 `diagnostic` 和内层播放结果，不再把失败包装成外层 `status: "played"`。
- 新增回归覆盖 PowerShell 脚本真实换行、调度器底层失败传播、插件试听端到端失败传播。
- focused 声音回归：67/67 通过；全量 Node：493 项，481 通过、12 跳过、0 失败；`npm run check` 与 `git diff --check` 通过。
- 当前验收包 SHA256：`604FCCD8E575454C31D9B783D9A29E4DA3C47C9FED13373010E0600A41DE7C55`。
- 用户已在真实 Hana 中确认最新包试听声音可以正常播放；阶段三声音策略的试听链路正式验收通过。下一步转入通知视觉策略的真实 Hana 验收。

## 2026-08-13：阶段四分类视觉策略第一条垂直切片完成

- 用户明确要求：阶段四完成后先细磨声音与视觉，暂不开始模式制作；本轮不实现模式、公共 API、复杂动画、粒子或任意主题编辑器。
- 新增 `visual-rule-resolver.js`：消费冻结 `visualInput`，按 `error → tool → channel → chat → plugin` 固定优先级选择一个主分类；critical 使用 `critical` preset；全局视觉关闭绝对生效；非法 profile 安全回退到 `minimal`。
- `visualInput` 现在携带 `importance`；通知场景通过 PresentationPlan 和分类投影生成视觉 decision，不从正文重新猜测。
- Native Runtime 的 `scene.create` 现在接受严格白名单 `visual` 对象：`enabled`、`preset`、`intensity`、`category`；C++ Runtime 按 preset 改变卡片受控表面/强调色，未开放任意 CSS、坐标、粒子或动画 DSL。
- SceneState、Recovery snapshot 和恢复重放已同步保留视觉 decision；旧卡片 payload 不带 visual 时保持兼容。
- 已通过 Runtime Debug 构建；带 visual 字段的真实 Named Pipe smoke 已通过，旧 health、scene.update、scene.dismiss、layout 和 recovery 链路保持通过。
- focused 阶段四相关 Node：当前覆盖视觉 resolver、PresentationPlan、插件生命周期、SceneState、Recovery、视觉路由；全量 Node：498 项，486 通过、12 跳过、0 失败；`npm run check` 与 `git diff --check` 已通过。
- Release Runtime 已重新构建并通过打包内容校验；当前阶段四验收包 SHA256：`C6FF1DF67E021758A5F881BEA2CFD71F430575D199D896BFF5470AF3ACDB33CE`。
- 真实 Hana 阶段四验收尚未完成；通过后再收口阶段四。阶段四收口后下一步为细磨声音与视觉，模式制作仍不开始。

## 2026-08-14：声音设置工作台简化完成自动化闭环

- 声音设置页由“分类默认 + 自定义声音卡片 + 独立声音测试”重构为两个职责清晰的区域：`声音配置` 与 `音频库`。
- `声音配置`只负责分类、事件、普通/重要、音频选择、保存和测试当前组合；`已自定义声音`列表支持逐条测试和解除配置。
- `音频库`只负责本地音频导入、`.nhsound` 导入导出、资产试听和删除；导入音频不再要求同时选择三层绑定。
- 用户层重要性收敛为“普通 / 重要”；内部仍兼容 `low / normal / high / critical`，错误类事件自动锁定为重要。
- 当前组合试听支持未保存的临时 `soundId`，不写入 profile、不写通知历史；全局声音关闭时仍绝对阻止试听。
- 删除正在被组合、分类、全局或高级规则引用的声音会返回 `SOUND_ASSET_IN_USE` 和引用清单；解除配置只解除精确组合，不删除音频资产。
- 旧 `categories.*.soundId` 和高级规则仍可读取，新的声音工作台不再写入分类默认区域。
- 新增声音绑定用户映射、引用扫描、绑定解除路由和相关回归测试。
- 验证：全量 Node `544` 项，`532` 通过、`12` 跳过、`0` 失败；`npm run check` 通过；`git diff --check` 通过；CTest `27/27` 通过。
- 修复真实 Hana 解除配置返回 `SOUND_ASSET_API_UNAVAILABLE`：`removeSoundBindingConfiguration` 已加入 Runtime settings API facade，路由现在能到达插件实现；无能力时改报 `SOUND_BINDING_API_UNAVAILABLE`。
- 收敛用户事件选项：聊天只显示“新消息”，频道只显示“收到消息”，工具只显示“执行完成”，错误只显示“发生错误”，插件只显示“收到通知”；内部 `rate_limit` / `rate_limited` 等旧事件仍保留兼容，页面不再显示两个相同的“触发频率限制”。
- 进一步按用户反馈收敛声音工作台：用户分类固定为“聊天、频道、插件”，事件固定为“新消息、超时、错误、工具”，超时和错误自动锁定为重要；底层旧分类和事件继续兼容读取。
- 音频库删除改为确认后级联删除：确认提示会列出将一起删除的组合、分类默认和全局引用；不再要求先解除配置，也不提供取消删除按钮。
- 自定义组合新增独立 0～100% 音量，保存到 `soundOverrides[].volume`，解析时与全局音量相乘；组合试听使用当前组合音量。
- 真实 Hana 的窄宽度、导入后音频选择、全局静音、组合试听、级联删除和声音包往返仍待重载最新包后验收。

## 2026-08-14：阶段四真实验收通过，声音深度打磨启动

- 用户已完成阶段四“分类视觉策略”真实 Hana 验收，阶段四第一条视觉垂直切片正式通过。
- 用户明确后续主线改为“把声音做到极致”；视觉策略、卡片样式、弹幕式行为、叠加、物理、动画、粒子和模式暂时冻结，后续另立大阶段详细制作。
- 新增声音深度打磨计划：`docs/superpowers/plans/2026-08-14-sound-deepening.md`。
- 声音深挖路线分为：声音契约与测量基线、调度与混音内核、音色与语义层级、响度与音量曲线、Windows 播放后端、设置/试听/诊断、真实听感校准和稳定发布收口。
- 当前选择先完善现有 PowerShell/PCM WAV 后端；只有测量证明进程启动延迟或设备控制成为瓶颈，才单独评估常驻 Windows 播放 helper。
- 声音系统必须继续保持全局静音绝对生效、一次通知一次主声音、失败不阻塞通知入库、结构化诊断和受控内置 cue 边界。
- 用户新增三项声音主需求：所有声音种类支持自定义、不限制为固定内置 cue；支持独立 `.nhsound` 声音配置包导入/导出以便分享；优化声音设置前端成为声音工作台。
- `docs/superpowers/plans/2026-08-14-sound-deepening.md` 已扩展为自定义声音资产、`.nhsound` 包和声音工作台路线；内置 cue 只作为默认内容，不再作为声音种类上限。
- 自定义声音采用稳定 `soundId` 和声音资产注册表；规则只引用 soundId，资产保存相对路径和校验信息，避免绝对路径污染配置。
- 第一条实现切片已完成：新增 `custom-sound-asset.js` 与 `sound-asset-registry.js`；自定义声音使用稳定 `soundId`、相对路径、格式、时长、文件大小、SHA-256 和启用状态；内置声音通过同一 registry 暴露。
- `sound-profile.js` 与 `sound-rule-resolver.js` 已支持任意自定义 `soundId`，旧 `cue` 配置保持兼容；`audio-adapter.js` 已支持通过 registry + asset root 解析自定义文件并播放，缺失资产返回结构化诊断。
- 本轮新增自定义资产、注册表、profile/resolver 和真实 file backend focused 回归；当前声音基础 focused 组合测试：73/73 通过。
- 已完成自包含 `.nhsound` 声音包领域层：JSON 包携带 profile 和 base64 音频资产，校验格式、大小、SHA-256、相对路径、重复 soundId 和内置资产边界；导入支持 reject/replace/keep-existing，并对文件、registry 和 profile 做回滚。
- 已将声音资产 registry 接入插件生命周期：自定义资产保存在独立 `sound-assets` 目录和 `sound-assets.json` 元数据中，onload 恢复，onunload 保存；通知播放、声音试听、页面声音库使用同一 registry。
- 已新增声音包 API：`GET /sound-assets-status`、`POST /sound-package-import`、`POST /sound-package-export`、`POST /sound-asset-test`。
- 声音设置页已增加第一版声音工作台：声音库列表、单项试听、导入 `.nhsound`、导出当前配置、导入/导出/播放状态反馈；页面保持当前 iframe、响应式布局和无横向遮挡约束，并对导入名称做 HTML 转义。
- 包、资产、设置和生命周期 focused 回归当前为 90/90 通过；全量 Node 当前为 520 项，508 通过、12 跳过、0 失败；`npm run check` 与 `git diff --check` 已通过。
- Release Runtime 打包内容校验已通过；当前声音工作台验收包：`dist\\notification-hub-vnext-0.1.0-alpha.11.zip`，SHA256：`ABB026DD3A4188F968E199A8B228F661D1B57ABED519AA5D4DB383FC14ADF2D3`。
- Release 包已确认包含 `domain/sound-package.js`、`sound-package-importer.js`、`sound-package-exporter.js`、`sound-asset-registry.js`、`routes/settings.js`、`routes/settings-sound.js` 和 Runtime。
- 真实 Hana 声音工作台验收尚未完成，必须验证导入/导出、单项试听、长名称、窄宽度和自定义声音实际播放；自动化证据不能替代真实页面验收。
- 声音工作台新增“导出到指定位置”：改为 Node 侧 Windows `SaveFileDialog`，Node 先生成 `.nhsound` 临时文件，再由 PowerShell STA 保存对话框复制到用户选定的完整文件路径；有 180 秒超时、取消结果和临时文件清理。
- 声音工作台新增“添加音频”：文件会复制到插件受控 `sound-assets/custom/` 目录，registry 只保存安全 soundId、相对路径、格式、大小和 SHA-256；当前复用旧插件已验证的 WAV、MP3、M4A、AAC、WMA 格式集合。
- Windows 播放后端对 WAV 使用 MCI waveaudio 并回退 SoundPlayer，对 MP3/M4A/AAC/WMA 使用 MCI mpegvideo；实际解码能力仍由当前 Windows 媒体组件决定，播放失败会反馈结构化诊断，不把导入成功冒充为播放成功。
- “声音库”定义为当前已经拥有并可解析的声音资产集合，包含内置声音和已添加自定义声音；自定义资产现在支持删除，删除同时处理受控文件、registry 和持久化元数据。
- 分类音量已进入三层乘算：`最终音量 = 全局音量 × 分类音量 × 规则音量`，每层默认 100%，结果限制在 0～100%；resolver 同时返回 `volumeLayers` 供页面和诊断解释。
- 声音工作台每个小分类新增 0～100% 分类音量输入，保存时写入 `profile.categories.<category>.volume`。
- 本轮新增资产上传与分层音量后，全量 Node：523 项，511 通过、12 跳过、0 失败；`npm run check` 与 `git diff --check` 通过。
- Release 包已重新生成并确认包含 `domain/sound-asset-importer.js`、`domain/sound-rule-resolver.js`、`routes/settings.js`、`routes/settings-sound.js` 和 Runtime；当前验收包 SHA256：`2EB493B51C094C377EE3B1A64240BF993430FFC7B5FC794951C9756AC1CE8DC2`。
- 本轮发现原先两个按钮的失败点是把文件选择放进了异步宿主资源请求，导致当前 iframe 环境下没有可靠用户手势；同时已确认普通 `.nhsound` 导入的浏览器文件输入可用。
- 当前稳定路径改为：添加音频使用用户点击直接触发的 `<input type=file>`，二进制通过 multipart 发送给 Node，由 Node 读取、校验并复制到受控资产目录；导出请求由 Node 打开 Windows 保存对话框并直接写入目标文件。
- Hana `resource.pick` / `ctx.resources.materialize/write` 仍保留为受控扩展路径，但不再阻塞当前两个按钮的主流程。
- alpha.13 修复包：导出用的独立 WinForms 保存对话框显式启用 Per-Monitor V2 DPI Awareness，解决高 DPI 下界面模糊；同时保留 UTF-8 BOM 和 ASCII 脚本文本修复。
- 删除自定义声音前等待声音调度器完全空闲，并对 Windows 短暂文件占用增加有限重试；页面会显示删除阶段和底层原因。
- 声音库按钮改为“添加本地音频”“导入声音包”“导出声音配置包”，明确说明 `.nhsound` 是包含声音资产与策略配置的分享包。
- alpha.13 全量 Node：530 项，518 通过、12 跳过、0 失败；`npm run check` 与 `git diff --check` 通过；Runtime Release 已重建；Release 包 SHA256：`2EC1FD5994F13D128EB0749DBA2FB7CCA6DDC0C6CFA9E050DD01FF94BEF641B9`。
- 由于当前 Hana 中 `window.hana.resources` 资源选择链路未表现为可用，添加音频保留同步浏览器文件输入；导出由 Node 侧 Windows 保存对话框处理。
- alpha.14 修复自定义声音删除页面交互：移除 iframe 中可能被宿主吞掉的 `window.confirm()`，改为页内两步确认；第一次点击立即显示“确认删除”，第二次点击才提交，提交中显示“删除中…”，失败恢复按钮并显示错误码、阶段和底层原因。
- alpha.15 修复 `.nhsound` 重复导入体验：默认仍安全拒绝冲突，但页面现在显示冲突 soundId，并提供“覆盖本地声音”“保留本地声音”“取消”三个页内选项；后端已有的 replace/keep-existing 事务策略被正式接入工作台。
- alpha.15 全量 Node：530 项，518 通过、12 跳过、0 失败；`npm run check` 与 `git diff --check` 通过；Runtime Release 已重新构建；Release 包结构校验通过；SHA256：`AF9F2910EE404926B0BF80E5EC5C3320AECEFB1A7C1AD1773BFE8FCCC67411AA`。
- alpha.14 全量 Node：530 项，518 通过、12 跳过、0 失败；`npm run check` 与 `git diff --check` 通过；Release 包结构校验通过；SHA256：`C986E1290C5A4E3AAD1974FFA61677D35CF91B1496475A9489CCC6785652570F`。
- 本轮仍未执行 Git commit；必须重载 alpha.14 后真实 Hana 验收导出清晰度、自定义声音删除和重载恢复。

## 当前已知阻塞与下一步

- 侧边栏第一轮代码已完成：现有 `/widget` 已收敛为最近通知、Runtime 健康摘要、通知中心/设置入口和快速音量/全局静音控制；Shelf 参数、测试卡片、清空测试卡片和 SceneState 调试内容已从首屏移出，原有 Runtime 测试 API 仍保留供后续 Runtime/Diagnostics 页面使用。
- 侧边栏响应式实现使用 `minmax(0, 1fr)`、`min-width: 0`、换行和窄屏单列规则，没有使用 `overflow-x: hidden` 掩盖溢出；仍需在真实 Hana 宿主宽度下验证 `scrollWidth`、最小宽度、按钮和长通知内容。
- 旧版 Widget 曾在最小宽度出现横向滚动和右侧遮挡；当前 alpha.11 侧边栏已由用户在真实 Hana 中确认宽度舒适，后续视觉改动仍需保护该结果。
- 用户已在真实 Hana 中确认显示上限无问题，包含当前设置与重载行为；历史数据不被显示上限截断的自动化验证保持通过。
- 用户已确认 Widget → Notification Center 通知深链接能够打开对应详情。
- 用户已确认 Notification Center 详情页面完整正文、metadata、状态语义和不自动标记已读行为正常。
- 顶部图像化大类导航卡片和设置页导航骨架已完成代码与自动化验证；Runtime 页面第一版已接入当前 iframe 内部路由，诊断入口仍明确标注为即将开放。
- alpha.11 已将设置导航改为当前 iframe 内的客户端视图加载：通过 `hana.api.fetch()` 获取 route 内容并切换视图，避免跨 Page surface 导航丢失 `pluginIframeTicket` 导致 404。
- 这条导航修复已完成真实 Hana 点击验收；Node 全量 390 项，378 通过、12 跳过、0 失败，`npm run check` 和 `git diff --check` 通过。
- 阶段 1“侧边栏与页面稳定”已完成：用户真实 Hana 验收确认侧边栏宽度、显示上限、通知详情、Widget 深链接和设置导航均正常；focused 页面测试 25 项通过。
- 阶段 1 自动化回归：全量 Node 390 项，378 通过、12 跳过、0 失败；`npm run check` 和 `git diff --check` 通过；alpha.11 安装包必需文件和根 manifest 版本检查通过。
- 阶段 2 已正式启动：实施计划为 `docs/superpowers/plans/2026-08-12-card-classification.md`。
- 阶段 2 Task 1 与 Task 2 已完成第一轮分类投影：提供 `projectNotificationCategories()`、`NOTIFICATION_CATEGORY_LABELS` 和 `NOTIFICATION_CATEGORY_VERSION`；支持聊天、频道、工具、错误、插件多标签及结构化命中证据。
- 当前分类结果保持原始通知事实不变，结果深冻结、标签顺序稳定；未知通知返回空标签和 `unknown`，正文关键词不会触发错误分类。
- 阶段 2 分类筛选与 Notification Center 第一轮接入已完成：新增 `filterNotificationsByCategories()`，支持 `any/all` 集合语义、稳定错误码和输入不变；Notification Center 支持分类标签展示、分类筛选和分类响应元数据。
- 阶段 2 分类核心已完成：新增 `createNotificationPresentationInput()`，冻结分类结果，并向未来视觉与声音策略分别提供安全输入；不携带任意 CSS、音频路径、Runtime 坐标或窗口参数。
- 阶段 2 已完成真实 Hana 验收：用户确认分类标签、多标签、分类筛选、详情/显示上限、Widget 深链接和设置导航全部正常；自动化预验收通过。阶段二正式收口，下一步进入阶段三分类声音策略；暂不接入复杂视觉或模式。
- 阶段三产品方案已确认并写入 `docs/superpowers/plans/2026-08-12-sound-visual-settings.md`：设置中心拆成声音、视觉、主题等小页面；声音/视觉共享结构化 `appliesTo` 匹配条件但分别持久化；声音采用全局默认、分类默认、对象规则和最终生效预览四层结构。本阶段先实现声音策略与声音页面，视觉页面先保留清晰骨架。
- 阶段三自动化切片已完成：共享 target、PresentationPlan 声音输入、声音 profile/resolver、scheduler、独立 sound-settings 持久化、NotificationApi 接缝、Windows 七 cue registry、独立声音 Store 生命周期、声音设置页面骨架、当前 iframe 内 `settings → settings-sound` 切换、四个声音接口和结构化最终生效预览均已接入。
- 阶段三验证证据：`npm test` 为 475 项，463 通过、12 跳过、0 失败；`npm run check` 与 `git diff --check` 通过。新验收包 SHA256 为 `1498B868C415D7F0F890F359533CA2B2E06515489C41738FA52C9D53B0794A3F`。
- 真实 Hana 已确认最新包中的声音页能够显示“已读取”，服务端注入的初始 `profile`、`revision`、`status` 和 `persistence` 状态生效；声音页首屏初始化阻塞已关闭。该证据只覆盖页面读取链路，不等同于声音播放策略已完成真实验收。
- 为真实声音策略验收补齐了页面测试接缝：声音页新增分类声音开关、结构化测试输入（分类/事件/重要性）、“测试当前策略”按钮和受控反馈；保存请求明确同时提交 `globalSoundEnabled` 与 profile，避免把全局静音误当作 profile.enabled。
- 用户已完成真实 Hana 声音行为验收并确认全部通过：全局静音对普通/high/critical 均绝对生效；分类开关行为正确；多标签通知只产生一个主声音；重复通知抑制正确；critical 可按策略优先/绕过 quiet 与重复抑制，但不能绕过全局静音；播放失败和测试声音回退保持受控，不阻断通知链路。阶段三声音行为阻塞关闭。
- 自动化回归保持 475 项，463 通过、12 跳过、0 失败；`npm run check` 与 `git diff --check` 通过。当前验收包 SHA256 为 `8D149B5CECFFE12B9C34C2D944842FECB174E1AC932C39C45C68E7D9837B1410`。阶段三下一步进入视觉策略页面骨架与共享分类输入复用，暂不进入复杂模式或公共 API。
- 用户新增后续事项：阶段二收口后返回补建 Runtime 页面和诊断页面；Runtime 页面第一版已完成自动化实现，诊断页面仍待补建，不能将此事项误称为完整产品门完成。
- 分类稳定后，声音和视觉分别复用同一分类结果，并允许每个分类独立设置声音和视觉；模式再负责组合这些策略；公共 API 最后开放外部插件声明自身分类、声音和视觉需求。
- 阶段三第一版边界：结构化 AND 规则只支持分类、生产者、事件、重要性；不实现任意 DSL、NOT、正文关键词、自定义声音导入或复杂视觉策略；一条通知最多选择一个主声音并产生一次播放请求。
- 视觉策略第一刀已完成代码与自动化闭环：新增独立 `visual-settings` profile、受控 preset 白名单、独立 VisualSettingsStore 与快照持久化、`/settings-visual` 普通 iframe route、状态/更新/预览 API；本轮将页面名称收敛为“通知视觉”，删除与“主题”的冲突入口，并补充真实通知卡片预览。
- 视觉页首屏服务端注入有限状态，前端使用 `window.hana.api.fetch()`、fallback session header、Promise.race 8 秒超时和内联脚本语法回归检查；不允许任意 CSS、HTML、路径或 Runtime 坐标进入 profile。
- 视觉/声音页面修复自动化证据：全量 Node 484 项，472 通过、12 跳过、0 失败；本轮新增声音分类开关继承、Windows 音量波形编码、视觉后端预览请求和通知中心设置入口初始状态回归。`npm run check` 与 `git diff --check` 已通过。真实 Hana 页面验收尚未完成。
- 所有未完成项必须通过真实测试或真实 Hana 证据后再从这里移除。

## 当前实现进度：Runtime 页面第一版

已完成代码与自动化测试闭环：

- 新增 `/runtime` 页面及 `runtime-status`、`runtime-retry` 页面接口；Runtime 不新增 Hana 顶层 Page surface，继续通过当前 iframe 内部视图切换进入。
- Runtime 页面展示运行状态、Named Pipe 连接、版本、卡片数量、布局、工作区、SceneState 持久化和最近错误；原始 stdout/stderr 与技术日志保留给后续诊断中心。
- 新增 Runtime 状态投影 `getRuntimePageStatus()`，不暴露内部 `sceneCards` 列表；新增 `retryRuntime()`，运行态重复操作不会创建第二个 Runtime，失败时保留可重试结构化错误。
- focused Runtime 页面、导航与生命周期测试：41 项通过、0 失败。
- 本轮全量 Node：418 项，406 通过、12 跳过、0 失败；`npm run check` 通过；`git diff --check` 通过。
- 真实 Hana Runtime / Shelf 验收已完成：用户确认 Runtime 正常运行、Named Pipe 已连接、连续通知创建与旧卡片回收正常，未出现新的 `LAYOUT_SHELF_OUT_OF_BOUNDS`；恢复态传输诊断未继续显示为当前红色故障。
- 修复内部页面切换的定时器泄漏：设置页、通知中心和 Runtime 页在视图切换前清理各自的刷新定时器，避免旧设置脚本继续访问新 Runtime DOM 导致 `Cannot set properties of null (setting 'checked')`。
- 修复侧边栏 Runtime 状态展示：`running + connected` 时不再把 `TRANSPORT_RECONNECT_RETRY` 等已恢复的瞬态传输诊断显示为红色当前错误；改为黄色“连接曾短暂重试，当前已恢复”提示，真正未连接或失败状态仍显示红色错误。
- 新增只读诊断中心首版：新增 `/diagnostics` 与 `/diagnostics-status`，汇总 Runtime、Named Pipe、设置和通知链路的有限结构化诊断；展示状态、错误/警告计数、可恢复记录、错误码、stage、traceId 和恢复/布局摘要，不暴露 stdout、stderr 或完整 `sceneCards`/内部卡片列表。
- 诊断入口已接入当前 iframe 内部导航，页面刷新定时器遵守 `notification-hub-view-before-unload` 清理协议；日志导出、清空记录和开发验收工具仍后置。
- 修复诊断页首版两个真实 Hana 问题：`hana.api.fetch()` 改为直接请求 `diagnostics-status`，并将非法的 `width: min(100% - 32px, 1080px)` 改为显式内容轨道与响应式 `max-width`，同时补充响应格式错误码和窄屏宽度约束。
- 根据真实 Hana 截图重新做页面视觉收口：设置、Runtime、通知中心统一改用 `width: 100% + max-width + padding`，消除所有 `min(100% - ...)`；公共导航卡片降低高度、强化 active/focus 层级；诊断中心调整为固定内容轨道、平衡双栏、状态摘要、清晰错误态和更高对比度。
- 修复 Runtime 页面“重试没用”：运行中的 Host 若 Pipe 已断开，或保留了 `TRANSPORT_RECONNECT_RETRY` 等可恢复传输诊断，手动重试现在会真正重建 Host；Runtime 页面和诊断中心将已恢复的瞬态诊断显示为黄色“连接已恢复”/历史记录，不再投影为当前红色故障。
- 根据真实 Hana 诊断发现并修复通知卡片造成的 `LAYOUT_SHELF_OUT_OF_BOUNDS`：新通知进入 Shelf 前会考虑工作区宽度、非通知卡片和当前通知卡片尺寸，必要时按最旧通知优先逐张回收，再创建新卡片；通知历史 Store 不受影响，回收只改变桌面可见态并标记旧卡片 dismissed。新增生命周期回归测试覆盖 Shelf 溢出回收。

## 历史记录（按时间保留原始验收证据）

### 2026-08-13：补齐视觉后端预览与通知中心设置入口状态

- 当前视觉页修改分类或重要性后，会调用 `POST /visual-settings-preview`，将当前受控 profile 与结构化 labels 交给后端 `previewVisualSettings()`，再用后端 decision 更新卡片预览的最终 preset、视觉开关和策略确认状态。
- `previewVisualSettings()` 现在接受可选的受控 profile 预览输入，并继续通过 `createVisualProfile()` 校验，不允许任意 CSS、HTML、路径或 Runtime 参数进入预览链路。
- `/notification-center?view=settings` 现在和 `/settings` 一样服务端读取并注入声音、视觉初始状态，不再绕过状态 API。
- 新增视觉预览请求和 Notification Center 设置入口的 focused 回归；全量 Node 当前为 484 项，472 通过、12 跳过、0 失败。
- 本轮验收包 SHA256：`8B25677881E68FB51703999F66A55C3F87E94AF13F06B68BFF195CF9EEB5FDDC`；未执行 Git commit。

### 2026-08-13：修复声音交互与页面导航，等待真实 Hana 复测

- 修复声音 resolver 的分类开关 bug：此前 `categoryPolicy.enabled || global.enabled` 会把关闭的分类重新打开；现在显式 `false` 能阻断该分类，同时未配置分类继续继承全局 enabled/volume。
- 修复 Windows 内置声音音量无效：此前虽然 decision 带有 volume，但 `SystemSounds.Play()` 完全忽略音量；现在 Windows cue 通过 PowerShell 生成短 PCM WAV，按 0～1 振幅播放，并新增编码回归测试。
- 声音页面保留全局声音、音量、重复抑制和五类分类开关的真实提交；分类默认不再因 profile 缺省而全部显示关闭；API 请求优先 `hana.api.fetch()`，失败时回退到带 `X-Hana-Plugin-Surface-Session` 的 fetch。
- 页面导航移除设置中心、声音页、视觉页之间的 `document.open()/document.write()` 切换，改为当前 iframe 内 DOM 挂载和 route HTML 加载；声音与视觉均增加“返回设置中心”，声音可进入通知视觉，视觉可返回声音/设置中心。
- “视觉与主题”统一改名为“通知视觉”，明确只控制桌面通知卡片视觉，不控制 Hana 页面主题；视觉页加入分类/重要性选择和真实通知卡片预览，修改时即时更新页面预览。
- 当前自动化证据：全量 Node 483 项，471 通过、12 跳过、0 失败；focused 相关测试 26 项通过；内联页面脚本解析通过。本轮验收包 SHA256：`B10784F1C806DF6B5504AC121CDA8C48D40205ACB51463B38E7A41B34B001694`；未执行 Git commit。

### 2026-08-13：视觉策略页面骨架完成自动化闭环，等待真实 Hana

- 新增独立视觉 profile 与 Store：全局/分类受控 preset、revision、saved/applied/apply-failed 状态和独立 `visual-settings.json` 持久化边界。
- 新增 `/settings-visual`、`visual-settings-status`、`visual-settings-update`、`visual-settings-preview`；设置中心当前 iframe 内可从设置首页切换到视觉与主题，再切回声音，不新增 Page surface。
- 首屏状态服务端注入，前端 API 主路径与 fallback、8 秒独立超时、错误态和内联脚本语法均有 focused 覆盖；不实现复杂动画、粒子、模式组合或 Runtime 坐标下发。
- 全量 Node：481 项，469 通过、12 跳过、0 失败；`npm run check` 与 `git diff --check` 通过。
- 当前验收包 SHA256：`59307A86E9288B34417BF3C398D05F52C474184CCF1C38C3DC5C52AF68873424`。
- 真实 Hana 页面验收待用户重载后确认；未执行 Git commit。

### 2026-08-13：阶段三声音策略真实 Hana 验收通过

- 用户完成最新 SHA256 为 `8D149B5CECFFE12B9C34C2D944842FECB174E1AC932C39C45C68E7D9837B1410` 的包验收，并确认全部声音测试通过。
- 覆盖全局静音、普通/high/critical 边界、分类开关、多标签单主声音、重复抑制、critical 优先与回退失败处理；全局静音不可被 critical 绕过。
- 声音设置页的服务端初始状态注入也在此前真实验收中确认，页面读取链路与声音行为均已闭环。
- 阶段三声音策略正式收口；视觉策略页面骨架已实现，复杂模式和公共 API继续后置。
- 未执行 Git commit。

### 2026-08-13：声音设置页真实 Hana 读取链路恢复

- 用户重载 SHA256 为 `AD4505378F28EDAAB0E8A86EBFB74C2F26874964F46C09CDD1A76A47D6917837` 的验收包后，确认声音页面显示“已读取”。
- 这证明服务端注入有限初始声音状态的方案在真实 Hana iframe 中生效，页面不再依赖首个前端 API 请求才能脱离加载态。
- 本次证据关闭的是页面初始化阻塞；阶段三声音行为随后通过真实播放/静音/去重/回退验收完成收口。
- 未执行 Git commit。

### 2026-08-12：阶段二分类真实 Hana 验收通过

- 用户完成阶段二真实 Hana 回归并确认“全部没问题”。
- 分类标签、多标签投影、聊天/频道/工具/错误/插件筛选均正常。
- 详情、显示上限、Widget 深链接和设置导航回归正常，没有出现 404 或页面级回归。
- 阶段二正式收口；分类声音策略作为下一阶段，继续沿用统一分类投影，不提前混入视觉、模式或公共 API。
- 未执行 Git commit。

### 2026-08-12：Runtime / Shelf 真实 Hana 复测通过

- 用户完成最新 alpha.11 验收包安装后的真实 Hana 复测，并明确确认“完全没问题”。
- Runtime 页面显示正常运行，Named Pipe 已连接。
- 快速产生多条通知后，新通知能够继续出现，Shelf 没有越界，旧通知可正常回收。
- 测试后没有新增 `LAYOUT_SHELF_OUT_OF_BOUNDS`；`TRANSPORT_RECONNECT_RETRY` 不再作为当前红色故障。
- 该结果关闭 Runtime / Shelf 修复阻塞，阶段二分类真实验收仍未完成；未执行 Git commit。

### 2026-08-12：阶段二最终自动化预验收与真实 Hana 收口前

- 阶段二 focused 预验收：27 项通过、0 失败。
- 全量 Node：399 项，387 通过、12 跳过、0 失败。
- `npm run check` 通过；`git diff --check` 通过。
- 已生成当前验收 ZIP：`dist\\notification-hub-vnext-0.1.0-alpha.11.zip`。
- 当前验收 ZIP SHA256：`4C31953FC94EC65EFEC4E0537A7FF3CD21B5B4E47293EF4D1450872067E2F910`。
- 真实 Hana 验收尚未由用户确认，阶段二暂不标记为正式收口。
- 用户验收重点：分类徽标与多标签、聊天/频道/工具/错误/插件筛选、详情与显示上限、Widget 深链接、设置导航无 404；Runtime 与诊断页继续保持后续补建事项。
- 未执行 Git commit。

### 2026-08-12：阶段二 PresentationPlan 接缝完成

- 新增 `plugin/domain/notification-presentation-plan.js` 与 focused 测试。
- `createNotificationPresentationInput()` 将同一份冻结分类结果分别提供给 `visualInput` 与 `soundInput`，并保留解释证据。
- 接缝仅包含 `notificationId`、分类、视觉输入、声音输入和解释；不允许任意 CSS、音频路径、Runtime 坐标或窗口参数进入领域输出。
- 已覆盖非法通知、分类对象、过期分类版本、结果深冻结和输入不变。
- 全量 Node：399 项，387 通过、12 跳过、0 失败；`npm run check` 和 `git diff --check` 通过。
- 用户确认阶段二收口后补建 Runtime 与诊断页面；该事项已写入当前状态，避免上下文刷新遗忘。
- 未执行 Git commit。

### 2026-08-12：阶段二分类筛选与 Notification Center 第一轮接入

- 新增 `plugin/domain/notification-category-filter.js` 与 focused 测试，支持 `any/all` 集合筛选、未知分类拒绝、输入顺序和记录不变。
- Notification Center 列表请求支持 `category` 查询参数；分类筛选在完整候选集上执行后再应用显示上限，避免先截断导致漏项。
- Notification Center 客户端请求分类元数据并展示中文分类徽标：聊天、频道、工具、错误、插件；新增插件分类筛选入口。
- 分类元数据通过 `includeClassification=true` 显式请求，避免破坏旧列表响应契约。
- 全量 Node：397 项，385 通过、12 跳过、0 失败；`npm run check` 和 `git diff --check` 通过。
- 未执行 Git commit。

### 2026-08-12：阶段二卡片分类启动与分类投影第一刀

- 已生成并交付阶段指导计划：`docs/superpowers/plans/2026-08-12-card-classification.md`。
- 已完成分类投影第一轮 TDD：7 项 focused 测试通过。
- `projectNotificationCategories(record)` 当前输出版本、标签、通信/事件/生产者 facets、状态、命中证据和来源。
- 已覆盖聊天、外部频道、工具、错误、API 插件、多标签组合、结构化 fallback、未知分类、正文关键词不猜测、输入不变和深冻结。
- 当前只实现分类语义，不改变卡片视觉、声音、模式或公共 API。
- 未执行 Git commit。


### 2026-08-12：alpha.11 修复 Page surface 导航 404

- 根因已确认：Hana 的 `pluginIframeTicket` 只存在于当前 iframe 文档 URL，宿主转发到插件后端时会剥离；服务端 route 无法可靠读取或传递该 ticket。
- 直接跨 Page surface 或普通插件页面链接会触发新的 iframe 文档请求，因缺少有效 ticket 返回 404。
- 修复方案：保持正式 Page surface 为 `/notification-center`，顶部设置卡片使用当前 iframe 内的客户端视图切换；页面通过 `hana.api.fetch()` 获取 `settings` route HTML，再在当前 iframe 内替换视图。
- `pluginSurfaceSession` 继续只用于 iframe 内 API 请求，不代替 `pluginIframeTicket`。
- alpha.11 全量 Node：390 项，378 通过、12 跳过、0 失败；`npm run check` 和 `git diff --check` 通过。
- 真实 Hana 点击验收通过，用户确认设置导航恢复正常。
- 安装包：`dist\\notification-hub-vnext-0.1.0-alpha.11.zip`。
- SHA256：`BE2EFBA154BF4FA6ACDD0F6235573B5F7D2F844F0914E93976524CF150B0DE6E`。
- 未执行 Git commit。

### 2026-08-12：阶段一侧边栏与页面稳定闭环验收完成

- 用户在真实 Hana 中确认：侧边栏宽度舒适；显示上限正常；Notification Center 详情正常；Widget 通知深链接正常；设置导航正常且没有 404。
- 页面 focused 测试：25 项通过、0 失败。
- 全量 Node：390 项，378 通过、12 跳过、0 失败。
- `npm run check` 通过；`git diff --check` 通过。
- alpha.11 ZIP SHA256：`BE2EFBA154BF4FA6ACDD0F6235573B5F7D2F844F0914E93976524CF150B0DE6E`；包内必需 route、Runtime 和 manifest 文件检查通过，根 manifest 版本为 `0.1.0-alpha.11`。
- 阶段一完成，下一阶段进入卡片分类，不提前实现声音、视觉、模式或公共 API。
- 未执行 Git commit。

### 2026-08-10：Hana 关闭后进程未退出，阻塞 community Runtime 更新

- 用户已执行 HanaAgent 关闭，但系统仍观察到可见 HanaAgent 窗口，且存在多个 HanaAgent 进程和一个 `notification-hub-runtime.exe` 进程。
- 当前旧 community Runtime 仍被占用，文件大小为 `257536` 字节；新 Runtime 为 `276480` 字节，因此最后的二进制替换尚未完成。
- 这说明 Hana 的关闭/自动拉起链路存在生命周期异常，不能继续要求用户重复重启；后续应先定位主进程退出与 Runtime 子进程回收，再完成替换。
- 用户提出通过带版本号 ZIP 手动拖入更新 community 版；已生成 `notification-hub-vnext-0.1.0-alpha.2.zip`，包含 Notification Center 页面和新 Release Runtime。ZIP SHA256：`C48F01C686BB0FCC6B5159A6FCE869AE91B4B110EECF60E0E1E008E2B0EC1A95`。
- alpha.2 包生成前已完成版本元数据同步、Release Runtime 构建、Node 全量 344 项（332 通过、12 跳过、0 失败）、`npm run check`、Runtime self-test 和 config self-test；ZIP 内容校验确认含根 `manifest.json` 与 `runtime/notification-hub-runtime.exe`。
- ZIP 已通过文件卡片交付；用户已手动安装 `0.1.0-alpha.2`，community 实例当前报告版本 `0.1.0-alpha.2`、状态 `loaded / activated`，无 activation error。
- 安装后的 community 实例已注册 `Notification Center` 页面；fresh 桌面截图确认顶部 `Notification Center` 标签存在，右侧 Shelf/书桌栏也显示通知中心卡片。
- 安装后的 community Runtime 文件为 `284160` 字节，运行进程路径指向 `C:\Users\Ganlin\.hanako\plugins\notification-hub-vnext\runtime\notification-hub-runtime.exe`；启动日志显示 Runtime `running`、Pipe `connected`。Runtime 具体配置 ACK 行为仍单独观察。
- 未强杀 Hana 进程，未执行 Git commit。

## 当前主线：产品门收口

当前产品主线按以下顺序推进：

1. 真实 Hana 验收侧边栏响应式宽度和显示上限持久化。
2. 完成 Notification Center 详情与 Widget 深链接的页面级验收。
3. 实现声音和视觉共用的分类策略解析器，匹配优先级为具体插件、API 生产者、业务类型、通信渠道、来源、全局默认。
4. 在策略稳定后分别接入声音策略和视觉策略，最后开放声音与视觉设置页。

以下 Native Runtime 收口记录保留为历史实施依据。

顺序固定为：

1. 卡片关闭/窗口销毁后的布局重排。
2. 宿主配置热更新与 saved/applied/apply-failed 状态一致性。
3. 主动关闭、异常销毁、传输断开的结构化错误上报。
4. Release、CTest、Named Pipe、ProcessManager、SceneState 和 Hana 页面联合回归。

### 分类轴校准结论

当前通知模型里已经有 `type`、`source`、`agent`、`session`、`channel` 字段；本轮已把 `channel.kind` 的第一版契约和筛选路径产品化，`plugin` 仍等待外部插件公共 API 接入后再开放。

- `type`：业务类型，例如 `assistant_message`、`tool_error`、`system_notification`。
- `source`：进入 vNext 的宿主适配路径，例如 `hana.session`、`hana.tool`、`hana.system`；保留为详情、诊断和高级筛选信息。
- `plugin`：真正通过公共服务生产/提交通知的外部插件，例如未来的 `download-plugin`、`other-plugin`；不能用 `source` 代替，也不应把 notification-hub 自己默认写成每条 Hana 核心通知的生产插件。
- `channel`：Hana 通信/交互渠道，例如 `chat`、`telegram`、`feishu`、`qq`、`wechat`；不能与旧版 channel aggregation 混为一谈。
- `agent/session`：宿主和会话上下文，不是业务类型，也不是生产插件。

### “Hana 会话通知”和“对话通知”的术语边界

当前实现里的“对话通知”筛选实际按 `type === assistant_message`，表示通知内容是助手完成回复；“Hana 会话通知”筛选实际按 `source === hana.session`，表示事件从 Hana 会话适配器进入。两者目前通常同时命中，但语义不同：

- notification-hub 是 Hana 自己的基础服务插件，Hana 核心 EventBus 事件不需要伪装成由 notification-hub 生产；`source=hana.session` 更适合放在详情、诊断或高级来源筛选中。
- “Hana 会话通知”当前没有必要作为一级业务筛选按钮，应降级到通知详情、诊断或高级来源筛选。
- “对话通知”改名为“聊天通知”，表示 Hana 桌面聊天渠道中的通知；它不再解释为 `source=hana.session`。
- “频道通知”本轮已完成第一版筛选：以 `channel.kind !== chat` 识别外部 Hana Channel/Bridge 通知，`chat` 单独作为“聊天通知”。后续再细分 Telegram、飞书、QQ、微信等。
- “插件通知”暂不做一级筛选，等外部插件真正通过公共通知 API 接入并产生 `plugin` 数据后，再做动态插件选择器；当前不为没有真实数据的概念增加空按钮。

### 已完成的小切片：页面骨架与卡片分类第一版

- 新增统一页面导航卡片：通知中心、设置、Runtime、诊断；当前页面高亮，Runtime/诊断在路由尚未开放前显示为“即将开放”，不制造假链接。
- 导航使用内嵌 SVG 图标，并保留 Hana `token` 与 `pluginSurfaceSession` 查询参数；宽屏四列、中等两列、窄屏单列。
- `NotificationRecord` 新增可选结构化 `producer`：`{ kind: 'api', id, label? }` 或 Hana 生产者标识；当前缺省不会改变历史记录形状。
- `producer.kind=api` 表示接入方式，`producer.id/label` 表示具体生产者；产品分类只展示“插件”，不再把“API”作为并列卡片。
- `NotificationStore.list()` 仍保留 `producerKind` 供协议、详情和诊断使用，Notification Center 不再提供“API 卡片”入口。
- 当前只完成分类契约与筛选投影，声音/视觉策略将在分类稳定后单独实现。
- focused：页面导航、分类、Record、Store、Notification Center、Settings 共 24 项通过。

### 已完成的小切片：频道通知筛选

- `NotificationRecord.channel` 已形成结构化契约：`{ kind, id? }`；`kind` 必须为非空字符串，`id` 存在时也必须为非空字符串。
- Hana 桌面 `session:message` / `message_end` / 工具事件 / 系统警告在适配器没有显式频道时归一化为 `{ kind: 'chat', id: 'desktop' }`。
- 事件携带显式 Bridge 频道时保留其 `kind` 与 `id`，例如 `{ kind: 'telegram', id: 'chat-1' }`；没有显式字段的外部插件事件不会经过此 Hana 核心适配器。
- `NotificationStore.list()` 新增 `channelKind` 精确筛选和 `channel=true/false` 外部频道筛选；未知/缺失频道不会伪装成外部频道。
- Notification Center 新增“聊天通知”和“频道通知”；聊天使用 `channelKind=chat`，频道使用 `channel=true`，并增加 `/notification-channel` 固定路由。
- “Hana 会话通知”已从一级页面筛选中移除，`source=hana.session` 仍保留给 API 高级/诊断查询。
- `producer` 第一版契约已建立：允许 `hana` 与 `api` 两种 kind；API producer 必须带稳定 id。这里的 API 是接入方式，插件是产品层生产者身份，二者允许同时存在但不作为两个一级分类。
- Notification Center 已移除重复的“API 卡片”入口，保留“插件通知”分类；`producerKind=api` 仍可用于协议、详情和诊断查询。
- 旧版 `channel_new_message` 兼容路径已接入 vNext 适配器：支持 `channelName`、`channelId`、嵌套 metadata/payload 及 `message.body/text/content`；即使旧载荷缺少频道 ID，也不会回退为桌面聊天。
- `/phone/sessions/` 下的 `message_end` 回执不会再生成重复聊天通知；同时保留 `dm_new_message` 的独立来源边界。
- TDD focused：频道归一化、旧版频道事件、电话会话去重、Record 校验、Store 频道查询、API/页面路由共 25 项通过。
- 本轮新增 `channel_new_message` 无频道 ID、旧版嵌套载荷和 `dm_new_message` 回归覆盖；全量 Node：406 项，394 通过、12 跳过、0 失败；`npm run check` 通过；`git diff --check` 通过。
- 追加修复频道工具分类：真实 Hana 的 `channel_reply` 工具结果使用 `result.details.channel`，适配器现在从工具结束载荷或工具开始事件缓存恢复频道上下文；频道工具结果投影为 `channel + tool`，失败时为 `channel + tool + error`。
- 防误判回归覆盖：普通工具正文仅提到 `#频道名` 时仍保持 `chat + tool`；本轮全量 Node：410 项，398 通过、12 跳过、0 失败；`npm run check` 通过；`git diff --check` 通过。

### 已完成的小切片：宿主配置热更新联合回归

- 插件级失败路径已覆盖：Runtime 返回 `RUNTIME_CONFIG_AUDIO_INVALID` 时，`updateSettings()` 返回 `status=apply-failed`，保留 `savedRevision`，不伪装成已应用。
- 真实 Named Pipe 首次发现工作区 `plugin/runtime/notification-hub-runtime.exe` 为旧二进制：`config.update` 返回 generic ACK，缺少 `applied/revision/audio`；源码 handler 本身已具备正式结果字段。
- 已使用 VS2022 BuildTools 重新生成 Release Runtime，替换 vNext 隔离目录二进制，并完成 dev 插件 disable → reload。
- 新 Release Runtime 的真实 Named Pipe 测试 1/1 通过：`config.update` 成功 ACK、重复幂等、旧 revision 拒绝、非法音量拒绝、未知字段拒绝。
- Hana 设置页面真实验收完成：将默认音量从 `1` 改为 `0.95`，点击“保存声音设置”后真实页面反馈“设置已保存并应用”；页面显示设置状态“已应用”、当前 revision `2`、已应用 revision `2`、Runtime `running · 已连接`、持久化已启用。
- Node 全量：340 项，328 通过、12 跳过、0 失败；`npm run check` 通过；`git diff --check` 通过。

### 已完成的小切片：关闭卡片后重排

- 修复 `runtime/scene/controller.cpp`：`pump_messages()` 不再直接删除异常/用户关闭的卡片，而是统一调用 `dismiss_card()`。
- `dismiss_card()` 在当前布局存在且仍有剩余卡片时重新应用 Stack/Shelf；失败时恢复被删除卡片的内存状态并返回错误。
- `runtime/app/main.cpp` 的 Scene Controller self-test 已增加双卡片关闭重排断言。
- 曾先运行失败，真实暴露剩余卡片关闭后仍位于 `y=180`；修复后剩余卡片正确回到 `y=0`。
- Release 构建通过；`notification-hub-runtime --scene-controller-self-test` 通过。
- Runtime 全量 CTest：27/27 通过。
- Node 全量测试：337 项，325 通过、12 跳过、0 失败；`npm run check` 通过；`git diff --check` 通过。
- 全量 CTest 首次暴露的 ProcessManager 失败来自旧 recovery fixture 使用过时的 `config.update` payload；已更新为当前 `revision + audio` 契约后重跑通过，未放宽生产校验。

### 2026-08-10：Runtime 生命周期诊断收口

- Host Adapter 生命周期状态已稳定为 `starting`、`running`、`reconnecting`、`stopping`、`stopped`、`crashed`、`stop-failed`、`failed`。
- Runtime 异常退出与 Named Pipe 断开均保留结构化错误：`code`、`category`、`reason`、`recoverable`、`userAction`、`notifyUser`、`details`；主动停止不产生 stop error。
- Native Runtime 的 `scene.changed` 事件现在带 `result.change`：`status`、`reason`、`target`、`targetId`、`recoverable`、`notifyUser`、`error`。
- 已自动验证显式 `scene.dismiss` 与用户点击卡片关闭两条 Native 路径；用户关闭的原因是 `user-close`，显式关闭的原因是 `scene.dismiss`，两者都不通知用户且不可恢复，因为它们是已完成的用户/宿主意图。
- Named Pipe 传输断开为 `reconnecting`，错误类别为 `transport`，可恢复、建议 retry、`notifyUser=true`。
- 窗口异常销毁已在 Native 控制器中归一化为 `window-destroyed`，可恢复、需要通知用户；通过 Runtime owner-thread 的隔离测试探针验证，未直接操作 Hana 真实桌面窗口。
- 真实 Runtime 回归已使用注册的 `build/vs2022-debug/runtime` CTest 路径执行：27/27 通过；覆盖 Scene Controller、Named Pipe、ProcessManager、SceneState persistence、Host Adapter 和重启。
- Node 全量：342 项，330 通过、12 跳过、0 失败；`npm run check` 与 `git diff --check` 通过。

### 2026-08-10：通知中心第一小刀，查看通知详情

- 新增 `GET /notification-detail/:notificationId`，通过现有 Notification API 读取单条通知；不存在时返回 404 和 `NOTIFICATION_STORE_NOT_FOUND`。
- Notification Center 列表卡片新增“查看详情”按钮，在当前页面展开详情，不改变既有“标记已读”语义。
- 详情展示标题、时间、状态、来源、类型、完整正文以及可展开的元数据。
- TDD 过程已完成：详情路由测试先红，最小路由实现后转绿；页面详情控件断言先红，接入面板和请求逻辑后转绿。
- focused API、Store、Notification Center：22 项通过，0 失败。
- `node --check plugin/routes/notification-center.js`：通过；`git diff --check`：通过，仅有工作区既有 LF/CRLF 转换提示。
- dev 插件已 reload 并激活，真实 Hana 页面已通过 fresh UIA 定位到“查看详情”按钮；使用 lease + signature-match + `dryRun=false` 的 `InvokePattern` 点击成功，且未传确认短语。
- 详情面板展开后的完整正文/元数据尚未获得可靠的页面级可见证据：当前页面有 100 条通知、卡片列表高度异常，且窗口焦点/截图曾出现滞后；因此暂不宣称真实 UI 详情验收完成。
- 当前已确认真实 UI 的边界：Notification Center 页面、通知卡片和“查看详情”按钮均存在，点击动作本身成功；打开详情未观察到自动标记已读的证据，但仍需在稳定前台窗口下完成最终核对。
- 没有执行 Git commit。

## 2026-08-10：新 Runtime 部署到 dev 隔离实例

- 已先停用旧 dev run `dev_1786357452679_feb00433660b`，确认目标文件句柄释放后再替换。
- 已将 `build/vs2022-debug/runtime/Release/notification-hub-runtime.exe` 部署到 `plugins-dev/notification-hub-vnext/runtime/notification-hub-runtime.exe`。
- 源文件与目标文件 SHA256 在复制命令内完成一致性校验，目标文件大小 `276480` 字节。
- 已重新加载并激活 dev 插件：`dev_1786363601290_d0e81c8990e6`；插件状态 `loaded / activated`，无 activation error，仍 shadow community 实例。
- reload 后日志确认新 Runtime 完成 Named Pipe ready、Host Adapter `running`、PipeClient `connected` 和 `Native Runtime started`。
- `open-notification-center` plugin scenario 通过；当前未执行真实 UIA 点击，只完成页面 Surface 打开能力验证。
- 用户手动打开设置页后完成真实页面级只读验收：fresh UIA 未暴露 WebView 内部 Runtime 文本，随后对前台 Hana 窗口进行 printWindow 截图核验；页面显示 `Host running`、`Pipe connected`、连接状态“已连接”、`Runtime 正常运行`，并显示设置状态“已应用”、当前 revision `2`、已应用 revision `2`。

### 当前未完成

- 通知详情真实 UI 验收仍差最后一步：在稳定前台 Hana Notification Center 中确认展开面板显示完整正文、来源、类型、状态和元数据，并确认查看详情不自动改为已读。
- 生命周期错误字段的页面可见性尚未做异常注入验证；本轮只验证正常连接路径，不伪造崩溃或传输断开状态。
- 窗口异常销毁的实际事件仍仅在隔离 Runtime owner-thread 探针中验证，未直接操作 Hana 真实桌面窗口。
- Shelf 真实多卡片视觉与交互收口。
- Cascade/Focus/Freeform 和完整物理关系系统。

---

## 2026-08-10：系统通知真实 EventBus → Store → persistence → API 闭环验收完成

### 真实正向证据

- 通过公开 `/api/sessions/archive`、`/api/sessions/restore` 和 `/api/sessions/switch` 完成可逆的真实会话生命周期切换，没有修改会话 JSONL、伪造通知或破坏分支。
- 宿主日志真实出现：`session restore: ... unhealthy (7/10 recent assistant messages had stopReason=error)`。
- vNext EventBus 订阅真实收到 `session_unhealthy_warning`，事件字段为 `type`、`recentErrors: 7`、`totalChecked: 10`。
- 适配器真实处理结果为 `handled: true`，写入 `type: system_notification`、`source: hana.system`、`importance: high`；正文为“会话恢复检查发现 7/10 条近期助手消息异常，建议新建会话。”
- Store 记录从恢复后的 92 条增长到 97 条，其中新增系统通知 1 条；其稳定 ID 为 `hana-system-session-unhealthy-warning-...-7-10`，没有冒充宿主原生事件 ID。
- 持久化文件 `notification-store.json` 已更新到 `2026-08-10T08:08:11`，reload 后系统通知仍能从文件恢复。
- 真实 API `/notification-system` 返回 HTTP 成功、`totalCount: 1`，记录字段与 Store 一致。
- 真实 dev reload：`dev_1786349398979_9007990d48be`，状态 `loaded / activated`；reload 后 `/notification-system` 仍返回 1 条，证明恢复链路有效。

### 结论与边界

- `EventBus → Store → persistence → Notification Center API` 正向闭环已完成。
- 旧的临时诊断日志、诊断分支和临时 `notification-event-adapter-v2.js` 已从工作区清理；生产适配器恢复为正式文件名。
- 已完成 Notification Center 最后一项真实 UI 证据：fresh UIA 打开顶部 `Notification Center`，随后对系统筛选按钮进行截图定位、窗口守卫校验和显式确认的受保护坐标点击；截图显示页面 `已连接`，系统按钮 active，摘要为 `共 1 条系统通知，按最新时间排列`，卡片显示 `会话健康警告`、重要级别、`hana.system / system_notification / formatted` 以及真实 `7/10` 正文。
- 右侧宿主书桌栏另有独立的“加载失败”面板，不属于 Notification Center 页面请求；Notification Center 主页面自身状态为 `已连接`，系统通知卡片正常渲染。

### 自动化验证

- focused/相关测试：337 项，325 通过、12 跳过、0 失败。
- `npm run check`：通过。
- `git diff --check`：通过；仅报告仓库既有 LF/CRLF 转换提示。

## 2026-08-10：固定工具/系统路由 live 筛选修复并验收

### 当前状态

- 前一轮发现：宿主 live 实例中 `/notification-tools`、`/notification-system` 以及 `?tool=true`、`?system=true` 返回全量记录；`/notification-errors` 与 `?error=true` 正常。
- 先做了 live 最小矩阵，确认 query/source/error 参数能传播，只有 tool/system 条件在当前 live 实例中未生效。
- 工作区与 dev copy 的 `notification-store.js`、`notification-api.js`、`notification-center.js`、`index.js` SHA256 一致；一次 reload 因目录占用返回 EPERM，按 Windows 经验先 disable 再 reload 成功。
- 为防止固定路由在 Store/宿主实例出现筛选失效时越权返回无关通知，按 TDD 在 Notification Center API 路由响应边界增加 `tool` / `system` 防御性筛选；固定选项仍由路由强制传入，页面客户端过滤继续保留。
- 最新 dev reload：`dev_1786342581251_3c9a1da68971`，状态 `loaded / activated`。

### live API 证据

使用 Bearer 认证请求当前 live endpoint，返回如下：

| endpoint | 结果 |
|---|---:|
| `/notification-status` | 77 条：55 `assistant_message`、22 `tool_error` |
| `/notification-tools` | 22 条：全部 `tool_error` |
| `/notification-system` | 0 条 |
| `/notification-errors` | 22 条：全部 `tool_error` |
| `/notification-status?tool=true` | 22 条：全部 `tool_error` |
| `/notification-status?system=true` | 0 条 |
| `/notification-status?error=true` | 22 条：全部 `tool_error` |
| `/notification-status?source=hana.tool` | 22 条：全部 `tool_error` |

这证明 live API 对外的工具/系统固定筛选已生效，不再返回普通 `assistant_message`。

### 真实 UI 与验收边界

- 已完成的真实 UI 空状态证据仍有效：系统按钮 active，摘要 `共 0 条系统通知，按最新时间排列`，列表 `暂无通知`。
- 本轮修复的是 API 路由响应边界与页面防御过滤，不代表真实 `system_notification` warning 已产生。
- 真实 UI 已重新验收：通过 fresh UIA 打开 `Notification Center`；“工具通知”按钮点击后 active，页面卡片均为 `hana.tool / tool_error`，摘要显示 25 条工具通知。数量高于 API 矩阵时的 22 条，是因为本轮 UIA 查询失败事件又产生了 3 条真实 `tool_error`，不是伪造数据。
- 随后点击“系统通知”后按钮 active，摘要显示 `共 0 条系统通知，按最新时间排列`，空状态为 `暂无通知`。
- 真实系统 warning 仍未出现，`system_notification` 契约继续按 provisional 处理。
- 本轮做了一次合法的真实恢复观测：通过 fresh UIA、signature-match、Invoke 打开可见会话“Hanako MC进入世界失败分析”。这是宿主实际 `switchSession`/restore 路径，不修改会话文件。恢复后 Store 仍为 81 条，`system_notification: 0`、`hana.system: 0`，说明该会话当前并不满足宿主健康 warning 条件，或事件未被宿主发出。
- 当前不能再用普通可见会话证明正向 warning；下一步应先建立只读的宿主会话健康状态/事件观测，等待自然出现的 unhealthy session 或 branch persistence warning。禁止改写 JSONL、破坏分支或伪造 EventBus 事件。
- 已从宿主 bundle 只读确认健康判定：恢复时仅检查目标 JSONL 最后 10 条 `message.role=assistant`，`stopReason === 'error'` 达到 3 条才发出 `session_unhealthy_warning`；历史上有错误但最近 10 条不足 3 条的会话不会触发。
- 找到一个磁盘上最近 10 条 assistant 中有 7 条 error 的旧会话，但它当前不在 HanaAgent 可见会话列表中；按既有约束不能把磁盘文件当作可恢复 UI 对象。通过搜索/坐标尝试打开的可见候选会话恢复后 Store 仅新增真实 `assistant_message`，仍为 `system_notification: 0`。
- 因此真实正向 warning 目前仍被“可见且满足最近 10 条错误阈值的会话”这一条件阻塞；不能通过改写归档 JSONL 或破坏分支绕过。
- 进一步核对 Store 的真实 EventBus 分布：仅有 `message_end: 58` 与 `tool_execution_end: 25`，没有 `session_unhealthy_warning` 或 `session_branch_persistence_warning`。
- 找到的满足阈值旧会话（`2026-07-29T12-07-09-949Z...jsonl`）未在当前可见会话列表中；尝试搜索后点击的可见候选并非该文件。随后未继续盲点，避免把错误会话当成目标。
- 当前下一步应停止随机 UI 操作，等待用户提供可见的目标异常会话，或等待宿主自然产生 warning；代码和数据均不再为触发验收而改动。
- 底层 Store/宿主旧实例为何只对 tool/system 选项失效，尚未得到单一可证实根因；当前通过路由边界保证外部 API 语义正确，后续如再出现需继续追宿主实例生命周期。

### 自动化验证

- focused route + Store：10 项通过，0 失败。
- `npm run check`：通过。
- `git diff --check`：通过，仅有既有 LF/CRLF 转换提示。

## 2026-08-10：系统通知筛选真实 UI 空状态修复并验收

### 当前状态

- 已接入宿主明确的 `session_unhealthy_warning` 和 `session_branch_persistence_warning`。
- 输出 `type: system_notification`、`source: hana.system`、`importance: high`。
- 宿主未提供事件 ID 时，适配器按事件类型、sessionPath 和事件专属字段生成确定性去重键；该键不冒充宿主原生 ID。
- 健康警告保留 `recentErrors` / `totalChecked`；分支保存警告保留 `reason` / `message`；均保留 `metadata.busEventType`。
- `session_status` 保持生命周期-only，不写历史通知。
- Store 增加 `system: true/false` 筛选；Notification Center 增加“系统通知”按钮和固定 `/notification-system` 路由。

### 自动化验证

- focused 适配器、分类器、Store、路由、生命周期：55 项通过，0 失败。
- `npm run check`：通过。
- `git diff --check`：通过，仅有既有 LF/CRLF 转换提示。

### 真实运行态核对

- dev reload：`dev_1786339129254_9f553e701a49`，状态 `loaded / activated`。
- reload 后只读 Store：64 条记录，其中 `assistant_message: 49`、`tool_error: 15`；来源为 `hana.session: 49`、`hana.tool: 15`；`system_notification: 0`，`hana.system: 0`。
- `open-notification-center` plugin scenario：通过；当前未用真实 UIA Invoke 点击系统筛选按钮。

### 真实验收边界

- 当前尚未触发真实宿主 warning 事件；没有伪造 Store 记录。
- 因此暂不宣称系统通知的真实 EventBus → Store → persistence → Notification Center 正向闭环完成。
- 下一步应先用真实会话恢复异常或真实分支持久化失败触发一次 warning，再做 fresh UIA + signature-match + Invoke 验收“系统通知”。

## 2026-08-10：工具通知筛选真实闭环完成

### 当前状态

- Notification Center 新增“工具通知”筛选。
- 工具通知判定为 `type ∈ {tool_use, tool_result, tool_error}` 或 `source === 'hana.tool'`。
- Store、路由、固定 `/notification-tools` 路径和页面 UI 均已实现。
- 非法 `tool` 参数返回结构化 `NOTIFICATION_CENTER_QUERY_INVALID` 或 `NOTIFICATION_STORE_TOOL_INVALID`。

### 自动化验证

- focused Store + Notification Center route：9 项通过，0 失败。
- `npm run check`：通过。
- 全量 `npm test`：331 项，319 通过、12 跳过、0 失败。
- `git diff --check`：通过，仅有既有 LF/CRLF 转换提示。

### 真实验收证据

- dev reload：`dev_1786330587102_878857ad9f6d`，状态 `loaded / activated`。
- dev Store 共 53 条记录，其中 7 条为工具通知：7 条 `tool_error`，来源均为 `hana.tool`；`tool_result` 仍为 0。
- fresh UIA + signature-match + Invoke 点击 `tool-filter` 后，按钮变为 active，摘要显示 `共 7 条工具通知，按最新时间排列`，与 Store 一致。

### 未完成边界

- 真实 Pi 成功工具事件 `isError === false` 仍未产生，不伪造 `tool_result`。
- 下一步可进入系统通知契约，或等待真实 Pi 成功工具事件后单独完成其 UI 验收。

## 2026-08-10：普通 Pi 工具完成通知切片完成代码闭环，错误链路真实验收完成

### 当前状态

- 已接入 Pi `tool_execution_end` 且 `isError === false` 的成功工具事件。
- 输出 `type: tool_result`、`source: hana.tool`、标题 `工具执行完成`。
- 正文读取 Pi 原生 `result.content[].text`，兼容字符串结果和 `result.text/message`。
- 使用 `eventId`、`messageId`、`id` 或 `toolCallId` 作为稳定通知 ID。
- `EventClassifier` 增加 `tool_result`：成功、通知、非异常。
- 空成功正文忽略；失败工具仍单独输出 `tool_error`。
- focused 适配器、分类器、生命周期测试：41 项通过，0 失败。

### 自动化验证

- focused 适配器、分类器、生命周期：41 项通过，0 失败。
- `npm run check`：通过。
- 全量 `npm test`：331 项，319 通过、12 跳过、0 失败。
- `git diff --check`：通过，仅有既有 LF/CRLF 转换提示。

### 真实验收证据

- dev 插件 reload 后保持 `loaded / activated`。
- Store 只读统计：48 条记录，`tool_result: 0`，`tool_error: 3`。
- 三条 `tool_error` 的共同证据：`source === 'hana.tool'`、`metadata.busEventType === 'tool_execution_end'`、`metadata.isError === true`，并包含真实 `toolName`、`toolCallId` 与错误正文。
- fresh UIA + signature-match + Invoke 点击 `error-filter` 后，按钮为 active，摘要显示 `共 3 条错误通知，按最新时间排列`，与 Store 数量一致；卡片标题为 `工具执行失败`。

### 未完成边界

- 当前真实会话仍未产生 `isError === false` 的 Pi `tool_execution_end`，所以 `tool_result` 仅完成代码与自动化测试，不宣称成功工具通知 UI 已验收。
- 下一步另起“工具通知”筛选小切片，不在本轮继续猜测宿主事件路径。

## 2026-08-10：补齐 Pi 原生工具错误正文，等待真实 session 事件

### 当前状态

- 宿主 Pi agent-core 源码确认：`tool_execution_end` 顶层包含 `toolCallId`、`toolName`、`result`、`isError`。
- 工具执行抛错时，错误正文位于 `result.content[].text`，而不是保证出现在顶层 `error` 字段。
- vNext 适配器已增加 `result.content` text block 回退提取。
- 新增 Pi 原生载荷测试，先红后绿。
- focused 适配器 + 生命周期测试：30 项通过，0 失败；目标文件语法检查和 `git diff --check` 通过。
- 全量 `npm test`：329 项，317 通过、12 跳过、0 失败。
- dev 插件重新安装并加载成功：`dev_1786328718451_711887363179`，状态 `loaded / activated`。
- reload 后只读 Store：44 条记录，`tool_error: 0`。

### 真实验收边界

- 外层 `read`/`exec_command` 失败仍未产生 `tool_error`，dev Store 当前没有真实 `tool_error` 记录。
- 这次修复解决的是已确认的 payload 缺口，不等于真实 EventBus → Store 已验收。
- 下一步从真正 Pi session 执行器路径触发或采样一次事件；成功后再做错误筛选 UIA 验收。

## 2026-08-10：外层工具失败探针未产生 tool_error，宿主事件路径继续确认

### 证据

- 通过 HanaAgent 的 `read` 工具读取不存在路径，得到明确的 `Path not found` 错误。
- 随后只读读取 dev Store：总记录为 44 条，`tool_error` 为 0 条；新增记录是普通 `assistant_message`，`metadata.busEventType` 为 `message_end`。
- dev 插件诊断仍为 `loaded / activated`，页面路由仍正常。
- 宿主 bundle 的 EventBus 实现确认 `ctx.bus.subscribe(callback, { types })` 会按 `event.type` 过滤；Pi session 事件流中存在 `tool_execution_end`，并由 session executor 的 `emitSessionEvent` 转发。

### 判断

- API 层 `read`/`exec_command` 失败不等于 Pi agent session 的 `tool_execution_end` 失败事件。
- 当前不能用外层工具失败作为真实 `tool_error` 入库证据，也不修改 Store 或扩大适配器猜测。
- 下一步只观察一次真正经过 Pi session 执行器的工具失败路径，同时对照 `self-evolve` 与 vNext 的事件证据。

## 2026-08-09：工具执行错误通知切片完成代码闭环，真实事件验收阻塞

### 当前状态

- 已接入稳定的 `tool_execution_end` 且 `isError === true` 事件。
- 生成 `type: tool_error`、`source: hana.tool`、标题 `工具执行失败` 的通知。
- 错误正文读取 `event.error`，并支持错误对象及 `result.error/message/text` 回退。
- 使用 `eventId`、`messageId`、`id` 或 `toolCallId` 去重；无错误正文时忽略。
- 复用现有 `NotificationApi.ingestEvent()` 和 `EventClassifier`，分类结果为 `tool_error`。
- focused 适配器 + 生命周期测试：29 项通过；全量测试：328 项，316 通过、12 跳过、0 失败；`npm run check` 和 `git diff --check` 通过。
- dev 插件已重新 reload：`dev_1786285081734_db1da63e8d09`，状态 `loaded / activated`。
- reload 后 dev Store 基线为 42 条，`tool_error` 为 0 条。
- 已执行一次受控预期失败命令尝试触发真实工具错误事件；等待 2 秒后 Store 仍为 42 条，没有新增 `tool_error` 记录。

### 判断

- 工具错误通知的领域代码闭环已完成。
- 真实 EventBus 事件到 Store 的正向验收尚未完成，不能把自动化测试当作真实数据证据。
- 当前没有伪造通知记录，没有修改已有 Store 数据。
- 普通工具成功通知、系统通知和重要通知正向验收继续保持未完成边界。

## 2026-08-09：按来源筛选真实闭环完成

### 当前状态

- **按来源筛选已完成。**
- Store 使用 `source` 精确匹配，不把来源推断成通知类型；空字符串和非字符串参数均有结构化校验。
- 页面新增 `source-filter`，固定筛选来源 `hana.session`，按钮文案为 `Hana 会话通知`。
- 自动化验证：focused 9 项通过；全量 326 项（314 通过、12 跳过、0 失败）；`npm run check`、两个目标文件语法检查和 `git diff --check` 均通过。
- dev reload 首次因目录 EPERM 失败，先 disable 旧 dev run 后重新 reload 成功；当前 dev run：`dev_1786283602588_4e413e3d6faf`，状态 `loaded / activated`。
- fresh UIA 通过签名校验和 Invoke 打开顶部 `Notification Center`，再定位并点击 `source-filter`；按钮 active，页面状态为 `已连接`。
- 页面摘要为：`共 40 条Hana 会话通知，按最新时间排列`。
- 只读读取 dev Store 得到 40 条记录，其中 40 条 `source === 'hana.session'`，其他来源 0 条；摘要数量与真实 Store 一致，未发现 `读取失败`。

### 边界

- 当前真实 Store 只有 `hana.session`，因此真实正向数量闭环已完成；其他来源的精确排除由 Store 测试覆盖，未伪造通知数据。
- 重要通知正向验收仍被真实数据阻塞，当前没有 `high` 或 `critical` 记录。
- 工具通知和系统通知暂缺稳定的 vNext 入库契约与真实记录，不在本轮猜测实现。

## 2026-08-09：授权后重要通知筛选真实数据验收

### 当前状态

- 用户已授权继续推进下一小计划。
- `important-filter` 已通过 fresh snapshot + signature-match + UIA Invoke。
- 页面摘要显示：`共 0 条重要通知，按最新时间排列`；当前请求成功且 UIA 查找 `读取失败` 为 0。
- 当前 dev Store 共 39 条记录，`importance` 分布为 `normal: 39`，没有真实 `high` 或 `critical` 通知。
- 因此已验证空结果路径，尚未宣称“正向保留重要通知”验收完成；不伪造 high/critical 数据。
- 下一步应等待真实重要通知产生，或由用户在真实业务路径触发一条明确的 high/critical 通知后，再完成正向筛选验收。

## 2026-08-09：对话通知筛选真实验收完成

### 当前状态

- **对话通知筛选已完成。**
- 判定规则严格采用 `type === 'assistant_message'`，与真实事件适配器写入契约一致。
- `NotificationStore.list({ conversation })` 已支持正反筛选和非法参数诊断。
- Notification Center 页面已增加可通过 UIA 定位的 `conversation-filter`，查询使用 `conversation=true`。
- dev 插件运行实例：`dev_1786281292595_c384f42e2afb`，状态 `loaded / activated`。
- 当前 dev Store 类型分布为 `assistant_message: 38`，来源 `hana.session: 38`。
- 通过 fresh snapshot + signature-match + UIA Invoke 点击“对话通知”后，按钮变为 active，摘要显示 `共 38 条对话通知，按最新时间排列`，页面显示真实卡片标题 `助手回复完成`。
- focused 9 项、全量 326 项（314 通过、12 跳过、0 失败）、`npm run check` 和 `git diff --check` 均通过。
- 本刀已闭环，下一步可进入后续通知筛选小切片。

## 2026-08-09：错误通知筛选真实失败诊断与闭环完成

### 当前状态

- **错误通知筛选已完成真实验收。**
- 根因是 `plugin/routes/notification-center.js` 把 Hono 的 `c.req.query`、`c.req.header` 方法取出后未绑定调用，导致 `this.url` 读取失败，服务端返回 `Cannot read properties of undefined (reading 'url')`。
- 最小修复改为 `c.req.query(name)`、`c.req.header(name)`，没有放宽鉴权、改变 Runtime 或增加伪造数据。
- dev 插件运行实例：`dev_1786280505945_8add8b7f39a0`，状态 `loaded / activated`。
- 真实 HTTP：普通列表 HTTP 200、37 条通知；错误筛选 HTTP 200、0 条通知。
- 真实 UIA：新鲜快照 + 签名校验 + Invoke 点击 `error-filter` 后，按钮 active，摘要为 `共 0 条错误通知，按最新时间排列`，列表显示 `暂无通知`。
- 真实 UIA 再查找 `读取失败` 返回 0 个匹配；页面没有 `NOTIFICATION_CENTER_READ_FAILED`。
- 当前错误筛选这一刀已闭环，下一步才可进入“对话通知筛选”。

### 执行纪律纠偏

- 不把 focused 测试通过当作真实 UI 完成；本次同时取得宿主 HTTP 和 UIA 证据。
- 不伪造错误通知记录来证明筛选有效。
- Hana 重启后若 dev slot 消失，先恢复 dev 副本，再做任何 UI 证据采集。
- 不执行 Git commit。

## 2026-08-09：未读筛选与单条标记已读切片进行中

### 已完成

- `NotificationStore.list({ unread: true })` 已实现：返回状态不为 `read` 的记录；`unread: false` 返回已读记录。
- Notification Center 列表路由支持 `?unread=true|false`，并对非法值返回结构化 `NOTIFICATION_CENTER_QUERY_INVALID`。
- 新增 `POST /notification-status/:notificationId/read`，复用 `NotificationApi.setNotificationStatus()`，不存在的通知返回 404。
- 页面增加“全部通知 / 未读通知”筛选框和单条“标记已读”按钮。
- focused 测试：19 项通过，0 失败。
- 全量测试：326 项，314 通过，0 失败，12 跳过。
- `npm run check` 通过；`git diff --check` 无新增空白错误。

### 真实 UI 验收进度

- dev 插件已从工作区重新 reload，当前 dev run：`dev_1786263917559_f0b45c07ce26`。
- 真实 UIA 已确认页面出现新的 `status-filter` 组合框，当前显示“全部通知”。
- dev Store 当前有 23 条记录，状态均为 `formatted`，因此存在真实未读数据。
- 早期 HTML `<select>` 的 ValuePattern 写入没有触发 change 事件；已将筛选控件改为两个普通按钮，避免 UIA 可见但事件不落地的问题。
- 重新 reload 后，通过签名校验的真实 UIA 点击 `unread-filter` 已生效；只读检查显示按钮变为 active，摘要显示“共 23 条未读通知，按最新时间排列”。
- UIA 全量树确认“标记已读”按钮存在，但其 bounds 位于页面内部滚动区域的屏幕外位置；视觉模型未返回有效坐标，鼠标滚轮降级仅完成 dry-run，未执行盲目滚动或点击。
- 已通过稳定 automationId `mark-read-notification-f711accb-2457-489d-abd7-efd61915076e` 定位离屏“标记已读”按钮，并通过签名校验的 UIA Invoke 执行点击。
- 真实结果：目标通知不再出现在未读筛选结果中；dev Store 中目标记录状态为 `read`，`updatedAt` 更新为 `2026-08-09T08:57:54`；状态分布由 23 条 `formatted` 变为 22 条 `formatted` + 1 条 `read`。
- 上一刀已闭环。重要通知筛选和错误通知筛选的代码切片已实现，均只增加查询与页面按钮，不扩展搜索、排序、分页或批量操作。
- 错误筛选出现真实 UI 摘要与 dev Store 计算不一致：按钮 active 证据成立，但页面显示 25 条；需先修正该查询传播问题，再进入下一刀。
- 当前 dev Store 共 25 条记录，状态为 24 条 `formatted` + 1 条 `read`，重要性全部为 `normal`；因此真实点击“重要通知”后的空列表行为尚缺真实数据证据，未伪造高重要性通知。
- 下一刀“错误通知筛选”已实现：错误记录判定覆盖 `status=failed`、错误类型以及事件分类中的超时、限流、中断、工具/提供商错误等明确异常；页面新增可通过 UIA 定位的“错误通知”按钮。
- 当前 dev Store 没有符合错误判定规则的真实记录；真实 UIA 已定位并点击 `error-filter`，按钮确实变为 active，但此前页面摘要显示“共 25 条错误通知”，与 Store 直接计算的 0 条不一致。
- 已完成针对性修复：带 `?error=true`、`?important=true` 或 `?unread=true` 的列表请求不再走 `window.hana.api.fetch()`，改走带完整 `pluginSurfaceSession/token` 的 URL `fetch()` 回退；无查询参数的请求仍优先走宿主 API。
- 进一步增加服务端 query 读取回退：当 `c.req.query(name)` 没有返回值时，从 `c.req.url` 或 `c.req.raw.url` 解析查询参数。
- 新鲜 Notification Center 页面已真实验收到：`error-filter` 可激活，但摘要显示“共 30 条错误通知”。同期读取 dev Store 得到 30 条记录，29 条 `formatted`、1 条 `read`，全部为 `assistant_message`、`completed`、`normal`，按错误规则应为 0 条。因此查询参数仍在 Hana 宿主路由链路中丢失，尚未宣称闭环完成。
- 为绕过宿主 query 丢失及嵌套路由兼容问题，页面错误筛选现在请求扁平、无 query 的 `/notification-errors`；服务端固定传入 `{ error: true }`。原有 `/notification-status?error=true` 和 `/notification-status/error` 仍保留。
- 本轮 focused 6 项、全量 326 项（314 通过、0 失败、12 跳过）、`npm run check` 均通过。
- 最新 dev reload 为 `dev_1786272643647_be41c166b75b`，状态 `loaded / activated`；plugin scenario `open-notification-center` 通过，但当前 Hana UIA 暂未重新看到顶部 Notification Center 标签，需下一轮继续做 UI Surface 重挂载后验收。
- dev reload 曾因目录 EPERM 失败，按经验先 disable 再 reload 已恢复；随后 UI 顶部标签注册出现短暂消失，plugin scenario `open-notification-center` 本身通过，但当前 UIA 暂未重新看到 Notification Center 标签。

### 当前边界

- 本轮未修改旧版 `notification-hub`。
- 未修改 Native Runtime C++ 代码。
- 未执行 Git commit。

## 2026-08-09：真实 Notification Center 验收完成

### 真实 Hana UI 证据

- 当前运行实例为 dev：`dev_1786260700312_f5f46965266d`，状态 `loaded/activated`，Page Surface `/notification-center` 存在。
- 通过签名校验的受限 UIA 点击打开顶部 `Notification Center`，页面成功显示通知卡片标题“助手回复完成”。
- 卡片内容来自 dev Store，字段已确认 `source: hana.session`、`type: assistant_message`、`title: 助手回复完成`。
- 通过 UIA 点击“刷新列表”后，页面仍显示“助手回复完成”，没有出现读取失败或空状态。
- 切换到“聊天”再返回 `Notification Center` 后，页面重新挂载仍显示同一通知标题，证明持久化恢复路径有效。

### dev Store 证据

- 正确数据文件：`C:\\Users\\Ganlin\\.hanako\\plugin-data\\dev\\notification-hub-vnext\\notification-store.json`。
- 当前记录数：`22`。
- 最新两条 `createdAt`：`2026-08-09T07:48:18.056Z`、`2026-08-09T07:48:00.896Z`。
- 完整记录按 `createdAt` 倒序检查结果：`strictCreatedAtDescending: true`。
- community 文件 `C:\\Hana\\data\\notification-hub-vnext\\notification-store.json` 仍只有 2 条旧测试记录，不属于当前 dev 验收数据。

### 边界

- 本轮没有修改业务源码，没有伪造通知记录，没有执行 Git commit。
- Hana 重启后 dev slot 仍需重新激活；这属于宿主开发插件槽生命周期问题，不能与 vNext 业务验收混同。

## 2026-08-09：真实事件验收路径修正与子任务重试结果

> 第一次子 agent 审查在完成前失败，没有返回技术结论；缩小任务范围后重试成功。重试确认事件订阅注册顺序和 `NotificationApi` 替换时机没有静态 bug。

### 关键发现：此前读取了错误的 Store

- community 副本使用：`C:\\Hana\\data\\notification-hub-vnext\\notification-store.json`；该文件仍只有 2 条旧测试记录。
- dev 副本使用：`C:\\Users\\Ganlin\\.hanako\\plugin-data\\dev\\notification-hub-vnext\\notification-store.json`；当前已有 20 条通知记录。
- dev Store 的最新记录包含本轮 ChatGPT 会话和子 agent 审查产生的 `assistant_message`，字段为 `source: hana.session`、`type: assistant_message`、标题“助手回复完成”。
- dev Store 最后更新时间为 `2026-08-09T07:45:30` 附近，说明修复版真实 `message_end → NotificationApi → NotificationStore → persistence` 链路已经工作。
- 之前“修复版没有新事件”的判断仅适用于 community Store，不能作为 dev 实例失败证据。

### 子 agent 重试结论

- `startNotificationEventSubscription()` 在 `startNotificationPersistence()` 替换 `notificationApi` 之后执行，顺序正确。
- `ctx.bus.subscribe((event, sessionPath) => ...)` 形式符合宿主 EventBus 契约。
- 若仍出现未入库，应优先检查实际运行实例和对应 `plugin-data\\<source>\\<pluginId>` 数据目录，再检查真实事件 payload；不应继续读取固定的 `C:\\Hana\\data` 路径。

## 2026-08-09：顶部 Notification Center 入口消失的根因确认

> 这是 Hana 开发插件槽生命周期问题，不是 vNext Notification Center 路由代码导致的入口注册失败。

### 复现与证据

- Hana 重启后，`plugin_dev_diagnostics` 显示 `devSlots: []`，实际运行实例回退为 `community:notification-hub-vnext`。
- community 副本诊断显示 `hasRouteApp: false`、`pages: []`；因此顶部唯一的 `Notification Center` Page Surface 消失，但 Runtime widget 仍可见，表现为插件局部失效。
- 使用同一工作区的 `plugin` 目录重新安装并以 `allowFullAccess: true` reload 后，dev 副本恢复为 `loaded/activated`，并显示 Page Surface `/notification-center`。
- Hana UIA 只读检查随后重新发现顶部 `Notification Center` 标签，说明入口恢复与 dev 副本恢复同步发生。
- 当前修复版 dev run：`dev_1786260700312_f5f46965266d`。

### 宿主实现确认

- 宿主 bundle 中 `PluginDevService` 构造函数初始化 `this._slots = new Map()`。
- 安装时通过 `_rememberSlot()` 将 dev slot 写入该内存 Map；`plugin-dev-runs` 只写运行回执，不被启动流程读取为活动 slot。
- `initPlugins()` 每次宿主启动都会新建 `PluginDevService`，随后直接 `pluginManager.scan()` 和 `loadAll()`，没有从 dev source/run 状态自动恢复 slot 的逻辑。
- 因此开发版不能依赖宿主重启后自动保留；若 community 副本没有相同 Page Surface，入口会消失。

### 处理结论

- 本轮不修改 vNext 业务代码，避免用 manifest 或页面代码掩盖宿主开发槽限制。
- 开发期间 Hana 重启后，需要重新从 `...\\notification-hub-upgrade\\plugin` 安装 dev slot，并用 `allowFullAccess: true` reload。
- 重新激活后再进行真实事件和 Notification Center 验收；community 副本不能作为修复版证据。
- 该宿主侧问题应另立平台修复项：持久化 dev slot 元数据并在 `initPlugins()` 中恢复，或提供明确的“重启后自动重载开发插件”机制。

## 2026-08-05：Notification Center 设置页鉴权跳转修复

> 用户从 Notification Center 点击“声音与布局设置”时，设置页请求返回 `{"error":"forbidden","reason":"missing_credential","connectionKind":"local"}`。根因是页面间普通相对链接没有传递宿主签发的 `pluginSurfaceSession`。

### 修复内容

- Notification Center 和设置页的互相跳转链接改为在页面加载时继承当前 URL 的 `pluginSurfaceSession` 和本地 `token`。
- 页面内 API 回退请求也复用同一份凭据传播逻辑，避免轮询请求丢失 `token` 后再次得到 403 JSON。
- 后端鉴权边界未放宽；没有令牌时仍保留普通相对链接，兼容独立预览和无宿主凭据场景。
- 两个页面的 API 请求继续优先使用 `hana.api.fetch()`，只有宿主未注入 API 时才使用带凭据的 URL 回退。
- 新增回归断言覆盖双向页面导航。

### 验证

- 修复前回归测试：Notification Center 跳转链接断言失败。
- 修复前回退 API 请求复现：直接 `fetch("settings-status")` 返回 `403 {"error":"forbidden","reason":"missing_credential"}`，页面将其当作 JSON 二次解析并显示 `Unexpected non-whitespace character after JSON at position 4`。
- 修复后 focused route tests：`9` 通过，`0` 失败。
- 两个修改页面 `node --check`：通过。

### 当前状态

- 页面间跳转的 `missing_credential` 已通过真实 Hana 点击路径验证消失：设置页 URL 携带 `pluginSurfaceSession`，页面显示 Runtime `running · 已连接`、布局状态“已应用”。
- token 回退请求修复已通过真实页面验证：重载后设置页连续等待 4 秒无 JSON 解析错误；“通知中心”返回链接同时携带 `token` 和 `pluginSurfaceSession`。
- 先前 dev slot 因停用而暂时消失，导致当时不能把 community 副本当作修复版证据；已从当前工作区重新安装并激活 dev slot。
- 当前最新 dev run：`dev_1785989270799_224096454da4`，状态 `loaded/activated`；dev 副本已 shadow community 副本，源目录与目标目录适配器 SHA256 一致。
- 重新激活后的 Store 仍未包含新记录；本轮助手回复结束后，下一轮读取 Store 作为第一条新事件证据。
- 不执行 Git commit。

## 2026-08-05：真实 Hana 助手回复事件切片实现完成

> 状态边界：代码实现和自动化回归已完成。宿主日志已证明当前聊天的 `message_end` 确实进入 `ctx.bus`；此前未入库的原因是事件发生时仍运行旧适配器。修复版已重新加载，真实 Notification Center 卡片验收仍待以新实例收到的记录为证。

### 本轮目标

接入 Hana `ctx.bus.subscribe()` 的 `session:message` / `role=assistant` 事件，使真实助手回复经过 vNext NotificationApi、Store 和持久化链路进入 Notification Center。

### 已完成能力

- 新增 `plugin/events/notification-event-adapter.js`：
  - 只处理非空助手回复。
  - 映射为现有 `message_end` / `end_turn` ingestion 事件。
  - 写入来源 `hana.session`、类型 `assistant_message` 和标题“助手回复完成”。
  - 保留 `sessionPath`、事件时间和 trace 信息。
  - 以 `eventId`、`messageId` 或 `id` 做稳定去重。
  - 将摄取异常转成结构化诊断，不向 Hana bus 回调抛出异常。
- 修改 `plugin/index.js`：
  - 通知持久化启动后注册 bus 订阅。
  - 插件卸载时先释放事件订阅，再停止通知持久化。
  - `ctx.bus` 缺失时保持现有生命周期行为。
  - 事件适配失败写入受限的 `notificationDiagnostics`。
- 新增适配器测试，覆盖助手回复映射、事件过滤、稳定 ID 去重和异常隔离。
- 扩展插件生命周期测试，覆盖 bus 订阅、释放、bus 缺失和摄取失败诊断。
- `package.json` 的 `npm run check` 已加入适配器源码和测试。

### 本轮验证

- 适配器 focused Node：`4` 通过，`0` 失败。
- 生命周期 focused Node：`22` 通过，`0` 失败。
- `npm run check`：通过。
- `npm test`：`324` 项，`312` 通过，`12` 跳过，`0` 失败。
- `git diff --check`：通过；仅报告工作区既有 LF/CRLF 转换提示。
- 12 项跳过测试均为需要 CTest 提供 Runtime 可执行路径的集成测试。

### 当前边界

- 代码级真实事件链路已完成，适配器支持宿主 `message_end` 契约，并保留 `session:message` 兼容路径。
- 适配器会忽略 `toolUse`、`error` 和 `aborted` 中间事件；新增回归测试已覆盖工具调用中间事件不写 Store。
- 宿主日志已证明当前聊天 session `C:\Users\Ganlin\.hanako\agents\chatgpt\sessions\2026-08-01T00-23-35-120Z_019fbab4-6fd0-78e7-805d-495854aa1c07.jsonl` 的 `message_end` 已进入全局 `ctx.bus`；此前正常 assistant 回复均被旧适配器记录为 `ignored-event`。
- 已先停用开发插件，再重载修复版；最新 dev run 为 `dev_1785937959690_b770ca7576f2`，当前状态 `loaded/activated`，源目录与 dev 目录适配器 SHA256 一致。
- 真实只读 Hana 验收确认窗口句柄 `133194`、Notification Center Page Surface 和 Runtime 正常运行。
- 修复版重载后，持久化 Store 仍为两条旧测试记录；新实例尚未有可核对的正常 assistant `message_end` 入库记录，因此真实通知卡片、刷新、持久化恢复和第二条消息倒序尚未宣称完成。
- Hana 聊天消息编辑器是自定义控件，UIA 未暴露为可操作 `Edit`；不开放键盘或剪贴板回退，不再要求用户重复发送测试消息。
- 第一阶段仍只接入助手回复事件，不接入工具事件、用户消息、Runtime 诊断或第三方来源。
- 未实现通知筛选、详情、删除、清空和批量操作。
- 未执行 Git commit。

## 2026-08-05：真实 message_end 契约修正与回归

### 当前修复后的验证结果

- 适配器 focused：`5` 通过，`0` 失败；新增测试覆盖 `message_end` 最终回复与 `toolUse` 中间事件过滤。
- 全量 `npm test`：`325` 项，`313` 通过，`12` 跳过，`0` 失败。
- 宿主日志回放证据：旧适配器已观察到当前聊天的正常 assistant `message_end`，但均返回 `handled:false / ignored-event`；这解释了此前 Store 没有新增记录。
- 修复版最新 dev run：`dev_1785937959690_b770ca7576f2`，已加载并激活；重载后尚未产生可核对的新正常 assistant `message_end` 记录。
- `C:\Hana\data\notification-hub-vnext\notification-store.json` 仍为 2 条旧测试记录，最后写入时间为 `2026-08-05T18:48:52.8521495+08:00`。
- `npm run check` 通过；`git diff --check` 无空白错误，仅报告工作区既有 LF/CRLF 转换提示。

- 宿主 bundle 已确认真实助手完成事件是 `message_end`，助手消息位于 `event.message`，正文通常是 `message.content` 文本块数组。
- `plugin/events/notification-event-adapter.js` 已支持 `message_end`，同时保留 `session:message` / `role=assistant` 兼容路径。
- 适配器支持 `message.id`、`eventId`、`messageId` 和 `id` 稳定去重；数值时间转换为 ISO；非法时间交由 `NotificationRecord` 产生 `NOTIFICATION_RECORD_TIMESTAMP_INVALID` 诊断。
- 生命周期 focused：`27` 通过，`0` 失败；适配器 focused：`5` 通过，`0` 失败。
- 全量 `npm test`：`325` 项，`313` 通过，`12` 跳过，`0` 失败。
- `npm run check`：通过；`git diff --check`：通过，仅有工作区既有 LF/CRLF 转换提示。
- 开发插件已重载，最新 dev run：`dev_1785927257358_ae2e1f893496`；首次 reload 的 `EPERM` 已按“停用 dev slot 后重载”路径恢复。
- 真实 Hana UI 通过受限 UIA 点击打开 Notification Center，页面显示“暂无通知”，没有“读取失败”或“通知列表暂时不可用”。
- 当前剩余验收门槛：在修复版实例收到下一条正常 assistant `message_end` 后，核对 Store 新增 `assistant_message` 记录；随后刷新页面并验证持久化和 `createdAt` 倒序。无需用户重复发送专门的测试消息。
- 本轮未执行 Git commit。

## 2026-08-05：Notification Center 第一条垂直切片完成

### 本轮目标

从 Hana 主界面进入 Notification Center，读取通知历史并展示明确的空状态、失败反馈，同时保留声音设置、Runtime 状态和 Shelf 布局能力。

### 已完成能力

- 新增 `plugin/routes/notification-center.js`：
  - `GET /notification-center` 页面路由。
  - `GET /notification-status` 只读通知列表 API。
  - 复用 `NotificationApi.listNotifications({ limit: 100 })`，由 Store 按 `createdAt` 倒序返回。
  - 展示标题、摘要或正文、来源、类型、重要性、状态和时间。
  - 提供“暂无通知”、API 不可用和列表读取失败状态。
  - 手动刷新与 5 秒自动刷新。
- Notification Center 与设置页互相跳转，设置页仍保留 `/settings` 路由。
- `plugin/manifest.json` 将唯一主 Page Surface 注册为 `/notification-center`，并加入开发场景 `open-notification-center`。
- 页面优先使用 `hana.api.fetch()`；兼容当前 Hana 宿主未注入 `window.hana` 的情况，从 iframe 当前 URL 读取 `pluginSurfaceSession`，回退到同插件 `fetch()` 请求。
- 新增 `tests/node/notification-center-route.test.mjs`，并扩展设置页契约测试覆盖该兼容路径。

### 本轮验证

- Notification Center focused Node：`5` 通过，`0` 失败。
- Settings route focused Node：`4` 通过，`0` 失败。
- `npm run check`：通过。
- `npm test`：`317` 项，`305` 通过，`12` 跳过，`0` 失败。
- `git diff --check`：通过；Git 仅报告工作区既有 LF/CRLF 转换提示。
- Dev plugin reload：成功，当前 dev run 为 `dev_1785924881471_9ba01fe2a595`。
- 真实 Hana UI 验收：
  - 通过受限 `auto-review` 控制会话点击顶部 `Notification Center` 标签。
  - UIA 签名校验通过，实际 `InvokePattern` 点击成功。
  - 页面标题显示“通知中心”，状态正常，空列表显示“暂无通知”。
  - 未发现“读取失败”或“通知列表暂时不可用”。

### 当前边界

- 第一阶段保持只读，暂不实现筛选、批量操作、删除、清空和通知详情。
- 当前开发环境没有历史通知，因此真实页面验收覆盖的是空状态；带通知卡片的排序展示由 Node 路由测试覆盖。
- 未执行 Git commit。

## 2026-08-05：正式 Shelf 布局设置切片完成

### 本轮目标

把临时 Runtime 验收面板中的 Shelf 布局操作提炼为正式设置 API，并在设置页提供布局编辑、应用状态和失败反馈：

```text
设置页布局编辑
→ POST /layout-update
→ NotificationHubVNextPlugin.updateLayoutSettings()
→ scene.set-mode
→ Runtime SceneState / recovery snapshot 自动持久化
```

### 已完成能力

- 新增 `plugin/domain/runtime-layout.js`：
  - 集中校验 Shelf 的方向、锚点和间距。
  - 使用稳定错误码 `RUNTIME_LAYOUT_INVALID`。
  - 保留 `SHELF_LAYOUT_DEFAULTS` 和独立领域边界。
- 新增正式 `updateLayoutSettings()` API：
  - 通过已有 `scene.set-mode` 协议应用 Shelf 布局。
  - Runtime 不可用时返回 `RUNTIME_LAYOUT_RUNTIME_UNAVAILABLE`。
  - 应用失败时返回 `layoutStatus.status = 'apply-failed'` 和原始错误码、消息。
  - `layoutStatus.applied` 只在成功后更新，失败时保留上一次成功布局。
- 设置状态 API 新增 `layoutStatus` 投影：
  - `requested`：最近一次正式布局请求。
  - `applied`：上一次成功布局，首次读取时由 Runtime health 布局补齐。
  - `status`：`saved`、`applied` 或 `apply-failed`。
  - `error`：最近一次正式布局应用错误。
- 新增 `POST /layout-update` 路由：
  - 非法参数返回 HTTP 400 和结构化错误。
  - Runtime 不可用返回 HTTP 503。
  - Runtime 应用失败作为业务结果返回，页面可以展示失败状态和旧布局。
- 设置页将只读桌面场景扩展为正式布局编辑区：
  - 停靠位置：左上、右上、左下、右下。
  - 排列方向：向左、向右。
  - 卡片间距：0 到 200 px。
  - 提供“保存布局”按钮、布局状态和诊断信息。
  - 页面仍通过 `hana.api.fetch()` 调用插件路由。
- `npm run check` 文件清单加入 `plugin/domain/runtime-layout.js`。
- 保留旧 `applyRuntimeTestLayout()` API，未修改旧版插件。
- 开发槽安装并加载当前工作区插件，诊断确认 Page Surface `/settings` 已注册；community 旧副本被 dev 副本 shadow。
- 将现有 Runtime 构建产物暂存到 `plugin/runtime/notification-hub-runtime.exe`，并通过 VS2022 Release 构建替换为当前源码产物。

### 本轮验证

- focused Node：`23` 通过，`0` 失败。
- `runtime_named_pipe_config_update_smoke`：`1/1` 通过。
- Page Surface 路由：HTTP `200`，页面含“Notification Hub 设置”和“保存布局”。
- 受保护 Surface Session API：`settings-status` 返回声音 `revision=1`、`appliedRevision=1`、`status=applied`，Runtime `running/connected`。
- 真实页面成功路径：通过页面控件提交 `top-left`、`right`、`36px`，页面反馈“布局已保存并应用”；后端 Runtime health 和 SceneState 均回读同一布局。
- Runtime 不可用路径：开发 Runtime 缺失时，`layout-update` 返回 `RUNTIME_LAYOUT_RUNTIME_UNAVAILABLE`；补齐并重编译后成功应用。
- `npm run check`：通过。
- `npm test`：`312` 项，`300` 通过，`12` 跳过，`0` 失败。
- `git diff --check`：通过；仅报告工作区既有 LF/CRLF 转换提示。
- 未执行 Git commit。

### 已知边界

- Hana 当前插件管理设置页只展示 configuration，没有直接打开 Page Surface 的导航按钮；Page Surface 已注册且通过受保护路由完成验收。
- 独立浏览器打开 Page Surface 时没有宿主注入的 `window.hana.api`；本轮使用等价受保护 API 适配器完成页面行为验证，真实页面代码仍走 `hana.api.fetch()`。
- 当前布局编辑只覆盖 Shelf 的方向、锚点和间距，不包含真实多显示器选择、卡片主题或高级布局参数。
- 完整 CTest 之前记录的两个独立问题仍未处理：
  - `runtime_controller_desktop_visual_self_test`：桌面捕获未检测到可见卡片像素。
  - `runtime_process_manager_smoke`：重启测试等待窗口内未观察到 `restarted` 事件。

## 2026-08-11：单条标记已读真实 UI 验收闭环

### 真实 UI 与持久化证据

- 当前验收目标为 community `notification-hub-vnext` `0.1.0-alpha.2`，页面为中间深色 `Notification Center`；右侧粉色栏确认属于旧版 `notification-hub` widget，不计入本轮证据。
- 第一条长 JSON 通知的离屏 UIA `InvokePattern` 曾通过签名校验并返回 `invoke-complete`，但 community Store 未变化；因此未把该次调用误判为业务成功。
- 重新定位到当前可见的真实“工具执行失败”通知卡片后，使用窗口守卫保护的坐标点击执行“标记已读”。点击时间约为 `2026-08-11T00:41:30Z`，目标窗口为 HanaAgent，命中窗口校验通过。
- 点击后 community Store `C:\Users\Ganlin\.hanako\plugin-data\notification-hub-vnext\notification-store.json` 出现真实状态变化：目标记录 `hana-tool-error-call_Q6zyiQVvVexp31BUoT8iN8Na` 从 `formatted` 变为 `read`，`updatedAt` 为 `2026-08-11T00:41:30.68Z`。
- 该目标记录字段为 `type=tool_error`、`source=hana.tool`、标题“工具执行失败”；Store 在点击后立即观察到 `269` 条记录、`268` 条未读。随后页面/工具自身产生了新的真实通知，当前 Store 增长到 `275` 条、`274` 条未读，因此数量只能按点击时刻解释。
- 这证明了真实 UI 点击 → `POST /notification-status/:notificationId/read` → `NotificationApi.setNotificationStatus()` → Store 持久化的单条已读链路。

### 验收边界

- 已闭环的是当前可见“工具执行失败”卡片的单条标记已读；此前离屏长卡片 `hana-tool-result-call_0WfGjmq7X9vbntFsRsX3vLvI` 仍为 `formatted`，没有被宣称为已读。
- 页面截图可确认 Hana 已恢复前台、Notification Center 主页面仍正常渲染；由于页面定时刷新和长卡片重排，成功反馈文字未能稳定保留在后续截图中，最终状态以点击时刻的 Store 持久化记录为准。
- 未修改旧版 `notification-hub`，未伪造 Store 数据或 EventBus 事件，未执行 Git commit。

## 2026-08-11：详情面板稳定性修复，alpha.3 包已生成

### 修复内容

- `plugin/routes/notification-center.js`：将详情面板放到通知列表之前，避免 100 条长卡片把详情内容推到很远的页面底部。
- 增加“关闭详情”按钮；关闭后清空详情内容并恢复列表刷新。
- 详情面板打开期间暂停 5 秒自动刷新，避免整列表重绘导致详情面板消失或目标位置漂移。
- 切换通知筛选时自动关闭旧详情，避免详情内容与新筛选条件混淆。
- `tests/node/notification-center-route.test.mjs` 增加详情面板位置、关闭按钮和打开期间暂停刷新的行为断言。

### 验证结果

- focused Notification Center 测试：9/9 通过。
- 全量 Node 测试：344 项，332 通过、12 跳过、0 失败。
- `npm run check`：通过。
- Runtime Release 构建：通过。
- Runtime self-test、config self-test、protocol self-test、transport self-test、window self-test、render self-test：全部通过。
- `git diff --check`：通过；仅有仓库既有 LF/CRLF 转换提示。

### 发布包

- 版本：`0.1.0-alpha.3`。
- ZIP：`notification-hub-vnext-0.1.0-alpha.3.zip`。
- SHA256：`984C7370CBB53EB538388F07164E7E1388D1AF26E52300A0E52F96F10A46DA85`。
- 包内已核对根 `manifest.json`、`runtime/notification-hub-runtime.exe`、插件页面代码和版本元数据。
- alpha.3 已由用户手动安装到 community，磁盘 manifest 版本为 `0.1.0-alpha.3`。

## 2026-08-11：alpha.3 详情面板真实 UI 验收通过

### 安装与页面证据

- 用户手动安装后，读取 community 插件目录 `C:\Users\Ganlin\.hanako\plugins\notification-hub-vnext\manifest.json`，版本为 `0.1.0-alpha.3`。
- Hana 主窗口重新读取后，顶部 `Notification Center` 标签可见并可激活；当前页面为 vNext 深色通知中心，未把旧版粉色 `notification-hub` widget 计入证据。
- 先使用“错误通知”筛选，列表缩小到真实 `tool_error` 通知，避免直接操作顶部超长 JSON 通知。

### 详情展开证据

- 通过 fresh screenshot + vision 定位当前第一张错误通知右下角“查看详情”按钮，坐标为 `(1663, 1021)`；点击前后均经过 Hana 窗口句柄 `3277922` 守卫。
- 点击后截图确认详情面板位于通知列表之前，并显示：标题“工具执行失败”、时间、状态 `formatted`、来源 `hana.tool`、类型 `tool_error`、正文，以及“关闭详情”按钮。
- 点击详情后等待超过 5 秒自动刷新周期，详情面板仍然可见，证明详情打开期间暂停刷新逻辑生效。
- 详情展开没有改变通知状态：对应真实 Store 记录 `hana-tool-error-call_QJR35tY9IIeRu3NlDsuKnd8i` 与 `hana-tool-error-call_cuvN1tP3zZtp9FZRzqX8GubM` 均保持 `status=formatted`，`type=tool_error`、`source=hana.tool`。
- 过程中没有写入 Store，没有伪造通知或 EventBus 事件；仅产生了正常的工具执行通知。

### 验收结论

- alpha.3 的 Notification Center 详情面板真实 UI 验收通过。
- 本次已证明：真实通知 → 查看详情 → 完整详情字段显示 → 等待自动刷新周期后仍稳定 → 通知状态保持不变。
- 仍未执行 Git commit；旧版 `notification-hub` 保持隔离。

## 2026-08-11：真实通知 → Native Scene 投影切片完成，等待 community 重新安装验收

### 根因

- 真实 `ctx.bus → NotificationEventAdapter → NotificationApi → NotificationStore` 链路此前已经成立。
- 但 `NotificationStore.add()` 后没有生产代码调用 Runtime `scene.create`；`scene.create` 只用于 Runtime 测试卡片和恢复重放。
- 因此 community Store 能增长，`scene-state.json` 仍保持 `cards=[]`，桌面上看到的粉色卡片也不属于 vNext。

### 实现

- `plugin/index.js` 增加 Store 到 Native Scene 的最小投影编排：通知写入后进入队列，Runtime 启动后补发，不回滚 Store 数据。
- 使用稳定卡片 ID：`nh-vnext-notification-<encoded notificationId>`；发送给 Runtime 的 payload 只包含 `id/title/body/x/y/width/height`。
- 按当前 Runtime work area 和 Shelf 布局生成合法初始几何；Native Runtime 的 Shelf 引擎继续负责最终排列和关闭后的重排。
- 通知展示后 Store 状态转为 `shown`；当前验收修订包临时将默认 `runtimeHints.lifetimeMs` 设为 `60000`（1 分钟），到期调用 `scene.dismiss` 并转为 `expired`；双卡片验收完成后恢复为 8000ms。
- 监听 Native `scene.changed`：用户关闭 vNext 卡片后，Node 侧清理计时器并将对应记录转为 `dismissed`。测试卡片和旧版插件不匹配该稳定 ID，不会被误认。
- 页面、Runtime 和旧版插件边界未改变；没有伪造 Store 数据或 EventBus 事件。

### TDD 与验证

- 先增加失败回归：真实 `message_end` 进入 Store 后必须收到对应 `scene.create`；修复后通过。
- 增加 Native Scene 关闭回归：两张真实通知卡片创建后，Native Scene 为空时两条记录转为 `dismissed`。
- focused plugin lifecycle：28/28 通过。
- 全量 Node：346 项，334 通过、12 跳过、0 失败。
- `npm run check`：通过。
- Runtime Release 构建：通过。
- CTest：27/27 通过。
- `git diff --check`：通过；仅有仓库既有 LF/CRLF 转换提示。

### 新包

- 版本：`0.1.0-alpha.3`。
- 新 ZIP：`notification-hub-vnext-0.1.0-alpha.3.zip`。
- SHA256：`E686EA2E06EB930894B6175531CB8A8D1F0631C3B502539651EAC05FE44CBF9C`。
- 这是同一版本号的修订安装包，原因是 alpha.3 初始包之后补入了通知到 Native Scene 的生产投影；安装前后的行为不能混用。

### 当前边界

- 新包尚未重新安装到 community，因此尚不能宣称真实 Hana Shelf 多卡片验收通过。
- 安装新包后，应由用户手动触发两条真实回复，立即读取 community `scene-state.json`，确认两张卡片属于 `nh-vnext-notification-` 前缀；再进行 fresh UIA/视觉定位、关闭一张、检查剩余卡片重排与持久化。
- 当前验收修订包临时使用 1 分钟卡片生命周期，目的是完成双 `assistant_message` 卡片的 Shelf、关闭重排和持久化验收；验收完成后恢复默认 8 秒。

## 2026-08-11：双卡片关闭同步发现问题，已修复并等待重新安装

### 真实证据

- 60 秒修订包重启后已真正生效：新 Store 记录携带 `runtimeHints.lifetimeMs=60000`。
- 实时监控只统计 `type=assistant_message` 且 `status=shown` 的 vNext 卡片，成功捕获两张：
  - 第一张：`x=0,y=1308`。
  - 第二张：`x=432,y=1308`。
- 两张卡片属于同一 `notification-hub-runtime` 进程，SceneState 与桌面窗口位置一致，Shelf 横向排列已得到真实证据。

### 关闭动作与问题

- 通过 fresh screenshot + vision 定位左卡关闭按钮，并由窗口句柄守卫确认命中 `notification-hub-runtime`。
- Native 点击确实关闭了左卡，但 Node 收到 `scene.changed` 后把两张助手记录都标记为 `dismissed`，随后 SceneState 显示的是工具结果卡片，未能证明剩余助手卡片重排。
- 根因是 `handleNativeSceneChanged()` 只看快照中哪些卡片缺失；关闭/重排事件的中间快照可能暂时缺少其他卡片，不能据此批量判定所有通知卡片已关闭。

### 修复

- 当 `scene.changed` 提供 `change.target=card` 和 `change.targetId` 时，只同步这个明确被关闭的通知卡片，并清理它的计时器。
- 保留无明确 targetId 时的快照兜底逻辑，用于 Runtime 重启或旧事件兼容。
- 将插件生命周期回归测试改为验证“两张 shown → 明确关闭第一张 → 第一张 dismissed、第二张仍 shown”。
- focused lifecycle：28/28 通过。

### 当前状态

- 60 秒修复包尚未重新生成和安装；上一轮真实点击使用的是旧包，不能作为修复后的关闭重排证据。
- 下一步：完成全量验证、生成新修订包；用户重新安装并重启 HanaAgent 后，再重复两张 assistant_message 卡片验收，点击左卡后立即复读 SceneState，确认剩余卡片移动到 `x=0` 并持久化。

## 2026-08-11：确认一次点击关闭两张卡片的 Native 根因并修复

### 根因

- `SceneWindow::window_proc()` 在 `WM_LBUTTONDOWN` 命中关闭按钮时已经调用 `request_close("user-close")`，关闭第一张卡片。
- 第一张卡片销毁后，Runtime 立即把剩余卡片重排到原来的左侧位置。
- 原实现又在 `WM_LBUTTONUP` 对当前窗口重新调用 `click_client_point()`；此时鼠标抬起事件可能落到刚重排过来的第二张卡片，导致同一次真实点击再次触发关闭。
- 因此这是 Native Runtime 的 `down → close/reflow → up → second hit-test` 问题，Node 的 `targetId` 同步修复无法阻止它。

### 修复

- 关闭按钮只在 `WM_LBUTTONDOWN` 阶段命中一次。
- `WM_LBUTTONUP` 只结束拖动，不再重新命中关闭按钮。
- 同时移除共享 Runtime 线程中 `WM_DESTROY` 的 `PostQuitMessage(0)`，避免销毁一张卡片时污染同线程消息泵。
- Runtime 自测增加：第一张卡关闭并重排后，模拟原始 `WM_LBUTTONUP`，第二张卡必须仍存在且 HWND 有效。
- ProcessManager 保留 Native `scene.changed` 的 `change` 元数据，确保 `targetId` 在完整事件链路中不丢失。

### 新鲜验证

- Native Runtime Release 构建：通过。
- CTest：`27/27` 通过。
- Node 全量测试：`347` 项，`335` 通过、`12` 跳过、`0` 失败。
- `npm run check`：通过。
- `git diff --check`：通过。

### 新修订包

- 版本：`0.1.0-alpha.3`。
- ZIP：`dist/notification-hub-vnext-0.1.0-alpha.3.zip`。
- SHA256：`7F3385CECCB213B15E7691E6D9DDBF717BA2CC891E3FA901861EC6343DC73CBF`。
- 该包必须重新安装并重启 HanaAgent；旧进程和旧 Runtime 不具备这次 Native 修复。

## 2026-08-11：Native 双卡片关闭真实 Hana 验收通过

- 用户安装新修订包并重启 HanaAgent 后，Runtime 进程确认来自 community vNext 目录。
- 两条新的真实 `assistant_message` 已进入 Native Runtime，初始位置为：左卡 `x=0`，右卡 `x=432`。
- 使用 fresh screenshot、视觉定位和 `notification-hub-runtime` 窗口命中守卫，真实点击左卡关闭按钮一次。
- 点击后即时证据：
  - 左卡 `notification-18e3de8f-78fb-419a-b021-029464169d2d`：`dismissed`。
  - 右卡 `notification-73154001-dea2-495d-a5d0-29efa53146ed`：仍为 `shown`。
  - SceneState `cardOrder` 的第一项为右卡，右卡坐标为 `x=0,y=1308`。
  - 桌面窗口列表仍保留右侧助手卡片对应的 Native Runtime 窗口；工具结果卡片属于本轮工具调用产生的附加通知，不计入助手卡片结论。
- 这证明修复后的真实 Hana 环境中，一次点击只关闭一张卡片，另一张卡片正确保留并向左重排。
- 双卡片真实验收完成后，正式默认生命周期已从验收用 `60000ms` 恢复为 `8000ms`；相关 Profile、兜底逻辑和测试断言已同步。
- 需要再交付一个恢复 `8000ms` 的安装包，用户安装后无需重新做双卡片验收，只需确认包版本和默认配置。

## 2026-08-11：alpha.4 Notification Center 批量标记已读代码闭环

### 已完成

- `NotificationStore.setStatuses(notificationIds, 'read')` 支持指定 ID 批量更新。
- 批量更新先完整检查所有 ID，缺失 ID 时整批拒绝，不产生部分写入。
- 重复 ID 去重；已读记录幂等，不更新时间戳，不发多余 Store change。
- 一次真实状态变更只发出一个 `status-batch` change，持久化协调器只排队一次最新快照。
- `NotificationApi.setNotificationsStatus(notificationIds, status)` 已接入。
- 新增 `POST /notification-status/batch`，接受 `{ notificationIds, status: 'read' }`。
- Notification Center 增加选择框、全选当前筛选结果、已选数量和“批量标记已读”按钮。
- 页面只提交当前筛选中用户选择的未读通知 ID；空选择不发请求，执行后保持筛选并刷新列表。

### 自动化验证

- focused Store/API/Notification Center 与持久化：`37/37` 通过。
- Node 全量：`355` 项，`343` 通过、`12` 跳过、`0` 失败。
- `npm run check`：通过。
- `git diff --check`：通过；仅有工作区既有 LF/CRLF 转换提示。

### 未完成边界

- 尚未生成 alpha.4 安装包。
- 尚未在真实 Hana 页面中选择两条真实未读通知并执行批量操作。
- 未执行 Git commit；旧版 `notification-hub` 保持隔离。

## 2026-08-11：alpha.4 批量标记已读安装包已生成

- 版本已从 `0.1.0-alpha.3` 提升为 `0.1.0-alpha.4`。
- `package.json`、`package-lock.json`、`plugin/manifest.json` 和 `VERSION` 已保持一致。
- 发布脚本 ZIP 条目校验已兼容 Windows 压缩包中的反斜杠路径。
- Release 包已通过脚本校验，包含根 `manifest.json`、`runtime/notification-hub-runtime.exe`，且没有嵌套插件根目录或旧版身份引用。
- 安装包：`dist/notification-hub-vnext-0.1.0-alpha.4.zip`。
- SHA256：`28B0FD65E8C99987336012CF61D4DB7EBE7FCF239FAAB9C3B090640158565CCB`。
- 当前尚未在真实 Hana 页面执行批量操作；下一步是用户手动安装并重启 HanaAgent 后，选择两条真实未读通知完成验收。

## 2026-08-11：Native 关闭时序再次修复，进入 alpha.5

### 现场反馈

- 用户在正确 vNext 页面继续验收时发现：一次点击仍可能关闭两张卡片。
- 用户明确观察到关闭动作在鼠标按下和松开阶段都触发。
- 之前只移除 `WM_LBUTTONUP` 二次命中，但 `WM_LBUTTONDOWN` 仍立即关闭并触发重排，输入时序仍不安全。

### 修复

- `WM_LBUTTONDOWN` 只记录关闭按钮按下，不再调用 `request_close()`。
- `WM_LBUTTONUP` 只有在同一张卡片仍持有关闭按钮按下状态、且抬起点仍在关闭按钮内时，才提交一次关闭。
- `WM_CAPTURECHANGED` 清理未完成的关闭按下状态。
- Native 自测增加“down 不改变场景、匹配 up 才关闭”的断言。
- Named Pipe 原生事件探针同步发送匹配的 down/up，避免测试只模拟半个点击。

### 新鲜验证

- Release Runtime 构建：通过。
- CTest：`27/27` 通过。
- Node 全量：`355` 项，`343` 通过、`12` 跳过、`0` 失败。
- `npm run check`：通过。
- Native 关闭时序 focused：`2/2` 通过。

### 交付边界

- alpha.4 包不能证明这次新的 down/up 状态机修复。
- alpha.5 安装包已生成：`dist/notification-hub-vnext-0.1.0-alpha.5.zip`。
- SHA256：`9C4D85E897F7F62FFA8E2D20735748F35DCD77A8ACA1441B28D1B8C8FAC660B5`。
- 需要安装并重启 `0.1.0-alpha.5` 后，再在真实 Hana vNext 页面验证一次双卡片关闭。

## 2026-08-11：默认卡片持续时间调整为 2 分钟，进入 alpha.6

- 按用户要求，将默认 `runtimeHints.lifetimeMs` 从 `8000ms` 调整为 `120000ms`。
- 兜底生命周期同步调整为 `120000ms`，显式传入的 Profile 生命周期仍优先。
- Profile 默认值、Profile Resolver 测试和 Notification Profile 测试已同步。
- 版本统一为 `0.1.0-alpha.6`，页面与 Native Runtime 继续同包发布。
- alpha.6 安装包已生成：`dist/notification-hub-vnext-0.1.0-alpha.6.zip`。
- SHA256：`3EC1236217FA4B3FC5268A81733A78643AA81654085690CD436606C4FBBF3C81`。
- 已重新安装并重启 HanaAgent；本次真实双卡片验收已完成。

### alpha.6 真实双卡片验收证据（2026-08-11 16:06，UTC+8）

- fresh 场景开始时存在两张真实助手通知卡片：
  - `notification-0e08d1d1-9360-4ce1-8dfe-a2dc9bc6c509`，窗口 `x=0,y=1308`。
  - `notification-d3f1733a-1326-4ab2-bbf2-5ce14650aecd`，窗口 `x=432,y=1308`。
- 对第一张卡片关闭按钮执行一次受保护真实点击，目标窗口句柄为 `3870888`，命中守卫通过。
- 点击后即时结果：
  - 第一张窗口消失，Store 状态为 `dismissed`，更新时间 `2026-08-11T08:06:28.511Z` 附近。
  - 第二张窗口仍存在，重排为 `x=0,y=1308`。
  - 第二张 Store 状态保持 `shown`。
- 点击后场景同时包含本轮验收产生的工具结果卡片；这些是自然 Hana 工具事件，不影响目标两张助手卡片结论。
- 结论：alpha.5 输入时序修复在 alpha.6 正式包中真实生效，一次关闭点击只关闭一张卡片，未发生第二张误关闭。

### Phase 8：批量标记已读真实页面验收证据（2026-08-11 16:26，UTC+8）

- fresh UIA 确认当前为 vNext `Notification Center`，`未读通知` 筛选已激活。
- 用户手动选择两条真实未读通知，页面显示 `已选 2 条`；未点击“全选当前筛选结果”。
- fresh UIA 确认 `batch-mark-read` 已启用后，执行一次受保护 UIA Invoke。
- 页面操作完成后，选中集合清空为 `已选 0 条`，批量按钮恢复禁用。
- Store 持久化 `updatedAt` 更新到 `2026-08-11T08:26:15`；本次两条记录的 `updatedAt` 同为该时间：
  - `hana-tool-result-call_iTjXP8wpVSR47l4CkqDVTH4V` → `read`。
  - `notification-f8da3484-7878-429f-8893-afcb6ac017d3` → `read`。
- 另有一条更早已读记录，不属于本次批量操作；本次没有直接修改文件或伪造通知。
- 点击“未读通知”刷新后，页面重新显示 `已选 0 条`，批量按钮禁用；两条记录在持久化文件中仍保持 `read`。
- 结论：批量标记已读已完成真实页面 → API → Store → persistence → 刷新验收。

### Phase 8：通知详情真实 UI 验收证据（2026-08-11 17:46，UTC+8）

- 通过 fresh UIA 打开真正的 vNext `Notification Center` 标签，并切换到真实的“系统通知”筛选；页面摘要显示 `共 5 条系统通知，按最新时间排列`。
- 选取当前筛选中最上方真实系统记录：
  - `notificationId`: `hana-system-session-unhealthy-warning-C%3A%5CUsers%5CGanlin%5C.hanako%5Cagents%5Cchatgpt%5Csessions%5C2026-08-01T00-23-35-120Z_019fbab4-6fd0-78e7-805d-495854aa1c07.jsonl-9-10`
  - 标题：`会话健康警告`
  - 正文：`会话恢复检查发现 9/10 条近期助手消息异常，建议新建会话。`
- 使用同一 fresh UIA 返回的 `leaseId`、`snapshotId`、`elementId=el-65` 和 signature-match，成功 Invoke 该卡片的“查看详情”按钮；没有复用旧 lease 或旧坐标。
- 详情面板真实显示并经 UIA 读取确认：
  - 完整正文：`会话恢复检查发现 9/10 条近期助手消息异常，建议新建会话。`
  - 来源：`hana.system`
  - 类型：`system_notification`
  - 状态：`dismissed`
  - 标题：`会话健康警告`
- 通过受保护真实点击展开“更多信息”后，UIA 读取到完整元数据 JSON，包含：
  - `busEventType: session_unhealthy_warning`
  - `recentErrors: 9`
  - `totalChecked: 10`
  - `eventClassification.classification: system_notification`
  - `eventClassification.action: notify`
- 查看详情前后重新读取真实 Store：`status` 始终为 `dismissed`，`updatedAt` 始终为 `2026-08-11T08:04:42.172Z`，正文和元数据保持一致；证明查看详情与展开元数据均未自动标记已读，也未修改通知记录。
- 当前右侧宿主书桌栏仍显示独立 Runtime `reconnecting`/错误面板；该状态不影响本次 Notification Center 主页面详情证据，需在后续 Runtime 故障反馈切片中单独处理。
- 结论：通知详情已完成真实页面 → API → Store 只读验收；本轮没有伪造通知、Store 数据或 EventBus 事件，未执行 Git commit。

### Phase 8：Widget 最近通知入口真实 Hana 验收证据（2026-08-11 19:02，UTC+8）

- dev slot `dev_1786445225835_f3f9b2e9c0f9` 已重新从当前工作区插件目录加载，状态为 `loaded / activated / full-access`，并确认 Widget surface `/widget` 与 Notification Center page `/notification-center` 均由 dev 版本提供；community 版本保持 shadowed。
- 右侧 Hana “书桌” Widget 首次显示“加载失败”；通过 fresh 截图定位并执行一次窗口守卫保护的“重试”，随后页面真实恢复并显示：
  - `最近通知` 区块；
  - `未读 43`；
  - 真实摘要：`最近 5 条通知：工具执行失败、工具执行成功、工具执行成功、工具执行成功、工具执行成功`；
  - 多条真实通知卡片，包含标题、摘要、`hana.tool` 来源、类型和重要级别；
  - `打开通知中心` 入口；Runtime 状态为 `running`、`connected`。
- Widget 的 `打开通知中心` 使用当前 fresh 截图定位到坐标 `(1855,1185)`，经窗口命中守卫和受保护真实点击后，右侧书桌栏成功切换到真正的 `Notification Center` 页面；页面显示真实筛选、刷新控件和通知内容，证明 Widget → Notification Center 入口可用。
- Widget 第一条通知的 `打开详情` 链接已进行 fresh 截图定位和受保护点击尝试，但点击后页面仍停留在 Widget/Notification Center 原页面，未获得可靠的 `notificationId` 深链接后自动展开详情证据；因此本项暂不宣称真实深链接闭环通过，也未修改任何 Store 数据。
- 本轮未伪造通知、Store 数据或 EventBus 事件，未执行 Git commit。Runtime 的既有 `reconnecting`、`TRANSPORT_ACK_TIMEOUT` 和 `RUNTIME_NOTIFICATION_SCENE_UNAVAILABLE` 日志继续作为独立故障反馈切片处理，不与 Widget 数据入口混淆。

### 2026-08-15：声音组合音量二次保存与音频删除交互修复

- 已保存的每一个自定义声音组合现在都会显示独立的 0～100% 音量滑块和“保存音量”按钮，可以再次调整并写回同一个 `soundOverrides` 组合，不会创建重复组合。
- 组合列表的“测试”会读取当前行的音量；保存后服务端状态重新渲染，显示已持久化的数值。
- 修复音频库删除不可用的真实前端断点：初始页面有删除确认块，但请求刷新后的动态 `renderAssets()` 曾经遗漏该确认块，导致删除按钮点击后没有可显示的确认目标。
- 动态渲染现在保留引用说明、删除影响提示和“确认删除”按钮，确认后继续调用级联删除 API。
- 新增回归覆盖已有组合再次保存音量、动态删除确认 DOM 契约和级联删除；focused 声音回归已通过，尚未执行本轮最终全量打包。

### 2026-08-15：组合音量生效与声音抑制设置修复

- 顶部“声音配置”组合建立表单移除组合音量控件；新建组合默认 100%，音量只在“已自定义声音”列表中单独调整并保存。
- 修复 Windows 内置声音音量不生效：音量低于 100% 时不再调用忽略音量参数的 `PlaySound`，改用受控 PCM 波形；100% 仍优先使用 Windows 系统声音。
- 修复 WAV 播放路径提前 `return` 导致音量处理被跳过的问题；MCI 播放和 SoundPlayer 回退路径现在都经过正确的音量分支。
- 声音页面新增“抑制重复通知声音”开关，读写 `profile.global.suppressDuplicates`，与全局声音开关和全局音量一起保存。
- vNext resolver 的 `suppressDuplicates` 已继续控制重复通知决策；声音调度器不再无条件合并同 cue 请求，关闭抑制后会分别播放。
- 新增回归覆盖实际 NotificationApi 音量决策传递、vNext 重复声音抑制、调度器关闭合并、系统声音音量脚本和新页面字段。
- 进一步修复已保存组合试听链路：组合列表的试听按钮不再把页面上的四舍五入音量作为临时试听参数发送，服务端现在以已保存的 `soundOverrides[].volume` 为唯一来源；自定义音频 MCI 命令改为 `setaudio ... volume to ...`，避免 Windows 忽略音量设置。
- 已通过固定复现确认：保存 25% 后，省略客户端 volume 进行试听，服务端 decision 和播放器入参仍为 `0.25`。

## 2026-08-19：视觉系统 Phase 0 第一刀启动

- 正式按 `docs/superpowers/plans/2026-08-18-visual-system-master-plan.md` 开始实现，当前阶段为 Phase 0：契约冻结和文档。
- 新增 Behavior Contract：`plugin/domain/visual-behavior-contract.js`，明确行为 ID、生命周期槽位、行为属性边界和已有行为白名单；禁止 Renderer、JavaScript 等可执行字段。
- 新增 Channel Runtime Contract：`plugin/domain/visual-channel-contract.js`，明确 channel owner、visibility、behavior/card/properties/skin/effect 引用，以及 `maxVisible`、`maxActive`、`maxParticles`、`maxAnimationInstances` 和 overflow 资源边界。
- 新增 Card Composition Contract：`plugin/domain/card-composition-contract.js`（后已删除，以 ADR-005 为准），明确 Card Type 内容插槽、文本布局、交互插槽，以及 Properties/Skin/Effects 引用；禁止任意 CSS、Renderer 和执行代码。
- 新增 `tests/node/visual-contracts.test.mjs`，6/6 通过；兼容回归（行为通道、Card Runtime policy、行为管理器、卡片视觉设置）15/15 通过；语法检查和 `git diff --check` 通过。
- 本轮尚未修改旧 `behavior-channel.js` 与 `card-runtime-policy.js` 的现有 API，先以独立契约模块冻结新边界，避免破坏 alpha.16 兼容链路。
- Phase 0 剩余两项已完成：新增 `visual-package-manifest.js`，拒绝路径穿越、可执行扩展名、脚本目录和 shell command；新增 `visual-diagnostic-contract.js`，冻结视觉阶段、稳定错误码、来源、影响、修复建议和 traceId，并拒绝未脱敏路径等字段。
- Phase 0 focused 回归最终为 26/26 通过；新增模块语法检查通过，`git diff --check` 通过。
- Phase 1 第一刀已启动并完成：新增 `plugin/runtime/card-runtime.js`，提供 created → active → exiting → reclaimed 生命周期；新增 `plugin/runtime/channel-runtime.js`，提供同通道卡片集合、队列、容量、布局重算接口和 active/visible/queued/suppressed 指标。
- 新 Runtime 第一刀暂不接入 Native Runtime，也不替换旧 `notification-behavior-manager.js`；布局适配器故障只写入通道诊断，不影响其他通道。
- Phase 1 focused 回归（含 Phase 0 与旧视觉兼容回归）第一刀为 31/31 通过；语法检查和 `git diff --check` 通过。
- Phase 1 第二刀已完成：新增 `runtime-registry.js` 统一管理独立 channel，新增 `runtime-clock.js` 通过显式 `tick(now)` 处理 active 卡片过期，新增 `scene-state-projection.js`（后已删除，SceneState 校验/恢复留在 `scene-state.js` / recovery）将 Runtime 快照投影为严格可校验的 SceneState；过期只作用于 active 卡片，queued 卡片保持队列语义。
- 第二刀 focused 回归覆盖 45 项，全部通过；包含旧 SceneState 验证，未修改 Native Runtime、SceneState schema 或生产通知入口。
- 下一步是接入真实 Stack 布局前的 Runtime 适配边界：补齐生命周期事件/诊断投影和可替换布局策略，然后进入 Phase 2 Stack 行为。
- Stack 前置边界已完成：新增 `plugin/runtime/stack-layout.js`，按实际卡片宽高、anchor、margin、spacing 计算堆叠位置；无法容纳时返回 `VISUAL_BEHAVIOR_LAYOUT_FAILED`，不自动缩小或静默丢弃。
- `channel-runtime.js` 已增加冻结生命周期事件：`card.enqueued`、`card.started`、`card.closing`、`card.reclaimed` 和 `channel.reflow`；事件回调失败只记录诊断，不阻塞卡片生命周期。
- Stack 已正式接入 Channel Runtime：卡片支持 width/height，通道支持 layoutStrategy/workArea，snapshot 暴露当前布局；关闭后卡片立即从布局移除并重排。
- Stack 集成 focused 回归与此前回归合计 50/50 通过；语法检查和 `git diff --check` 通过。当前仍未接入 Native Runtime 或真实通知生产入口，下一步进入 Stack 压力、容量和 overflow 验收。
- Stack 容量验收已完成：`queue` 按插入顺序保留并晋升，`drop-oldest` 明确回收旧卡、发出 reclaimed 事件并增加 `suppressedCardCount`，`allow` 保持不抑制语义；新增双通道 100 卡片混合压力回归。
- Phase 2 Stack focused 回归最终为 53/53 通过；语法检查和 `git diff --check` 通过。Stack 领域行为可以收口，下一步再讨论接入现有通知入口或进入 Visual Profile/Event Binding，而不是开始第二种行为。
- Phase 3 配置模型第一刀已完成：新增 `visual-profile-registry.js` 和 `event-binding-registry.js`。Profile 注册复用 `createVisualProfile()`，绑定只保存 `eventId → visualProfileId / behaviorChannelId` 引用，不携带声音字段；支持单事件、类别应用、预览、共享引用、复制保护和恢复默认。
- 配置模型 focused 回归与此前回归合计 58/58 通过；新模块语法检查和 `git diff --check` 通过。当前 registry 尚未接入持久化 Store 或设置页面，下一步是做持久化适配和“已自定义事件”只读列表。
- 持久化适配第一刀已完成：新增 `visual-registry-persistence.js`，提供带 version/revision/updatedAt 的 registry snapshot、恢复校验和旧 `EventPresentationSettings` 兼容投影；投影只更新视觉 Profile/行为通道引用，保留既有声音字段。
- 新增持久化回归后，配置模型与此前所有 focused 测试合计 61/61 通过；新模块语法检查和 `git diff --check` 通过。当前尚未修改 Store、index.js 或设置页面，下一步是将 snapshot 接入现有 EventPresentationSettingsStore，并提供“已自定义事件”只读 API。
- Store/API 适配第一刀已完成：`event-presentation-settings-store.js` 现在保留 `channelPolicies`、`channels`、`visualRules` 的更新 patch；新增 `visual-event-settings-api.js`，通过现有 Store 提交视觉投影，提供预览、应用、恢复默认和已自定义事件列表。
- 恢复默认保留事件原有 `soundProfileId`、声音及其他非视觉字段；视觉 API 不携带声音字段。
- Store/API focused 回归与此前所有回归合计 66/66 通过；新模块语法检查和 `git diff --check` 通过。下一步是接入 `index.js` 只读/写 API，再接设置页面。
- `plugin/index.js` 已接入视觉 Registry 实例和只读/写 API：`getVisualRegistrySnapshot()`、`listCustomVisualEvents()`、`previewApplyVisualProfile()`、`applyVisualProfileToEvents()`、`restoreVisualEventDefault()`；API 通过现有 EventPresentationSettingsStore 和 NotificationApi 更新表现 Profile。
- 插件 API 回归确认视觉应用/恢复不会破坏事件原有声音字段；Store、Registry、Persistence、Runtime、Stack、SceneState 与插件 API focused 回归共 46/46 通过，`plugin/index.js` 语法检查和 `git diff --check` 通过。当前尚未接入 Registry 独立持久化或设置页面，下一步是接“已自定义事件”只读 UI。
- 设置事件页已接入“已自定义视觉事件”只读区域：显示事件、Profile、Behavior Channel、来源，并提供恢复默认按钮；新增 `/custom-visual-events` 查询和 `/custom-visual-events/restore-default` 操作路由。页面回归与视觉设置、Store、Persistence、Plugin API focused 合计 23/23 通过；两个设置路由语法检查和 `git diff --check` 通过。
- Registry 独立持久化第一刀已完成：新增 `visual-registry-persistence-store.js`（带临时文件、备份和原子替换）与 `visual-registry-persistence-coordinator.js`（debounce、pending、失败诊断、自动重试、恢复）。`plugin/index.js` 已在 onload/onunload 接入恢复和 flush，视觉应用/恢复默认会排队 Registry 快照。
- Registry 恢复先在隔离 Registry 中完整校验，再写入目标 Registry，避免坏快照导致部分恢复；视觉持久化、插件 API、事件设置页和旧事件持久化 focused 合计 21/21 通过，相关模块语法检查和 `git diff --check` 通过。当前仍需补充真实临时目录下的跨重启插件生命周期回归和页面持久化状态展示。
- 已补充真实临时目录下的跨重启插件生命周期回归：第一实例应用 Profile、onunload flush，第二实例 onload 恢复 Profile/Binding，并验证 Registry revision/status；测试通过。
- 事件设置页新增视觉持久化状态徽标；新增 `/visual-registry-persistence-status` 脱敏状态接口，仅暴露 enabled/pending/revision/status，不返回本地绝对路径。Registry 恢复成功后会同步投影到 EventPresentationSettingsStore 和 NotificationApi，避免内存 Registry 与旧 selector 脱节。
- 本轮插件生命周期、设置事件页和 Registry persistence 回归 8/8 通过；相关语法检查和 `git diff --check` 通过。下一步是补坏快照/恢复失败回归，再评估 Profile 编辑与真实通知入口迁移。
- 已补坏快照恢复回归：覆盖 malformed JSON、错误 version、非法 Profile、非法 Binding；隔离校验失败时目标 Registry 保持不变，插件仍能启动，原有 soundProfileId 保留。
- Registry persistence coordinator 新增脱敏状态 `error` 和错误码摘要；设置页仍只显示状态，不暴露本地路径。Registry、Plugin API、页面、旧 EventPresentationSettings persistence 相关回归合计 31/31 通过，相关模块语法检查和 `git diff --check` 通过。视觉 Registry 的持久化安全边界已收口，下一步进入真实通知入口的最小 Stack 接入前勘察。
- 已确认真实通知生产入口为 `NotificationStore.add → enqueueNotificationScene → showNotificationScene`；selector 在 `createNotificationPresentationInput()` 中生成，Native payload 在 `showNotificationScene()` 最终组装。旧 `notificationBehaviorManager` 仍是当前生产行为事实源。
- 新增默认关闭的 Visual Runtime shadow bridge：配置 `visualRuntimeShadowEnabled: true` 时，生产 `showNotificationScene()` 会把同一 selector/通道/策略旁路投影到新 `RuntimeRegistry/ChannelRuntime`，但不改变 Native `scene.create` payload，不接管 dismiss 或布局；shadow 卡片在 Native dismiss 时清理。
- 新增 `getVisualRuntimeShadowStatus()` 诊断摘要和 2 项 shadow focused 测试；`plugin-lifecycle.test.mjs` 与 shadow 回归合计 59/59 通过，相关语法检查和 `git diff --check` 通过。当前 shadow 仅用于对照验证，下一步应补多通道/overflow 对照指标，再决定是否让新 Stack 接管生产行为。
- Shadow parity 已补充：状态新增 observations/comparable/incomparable/legacyAccepted/shadowAccepted/mismatches；多通道真实通知分别进入 `tool.main` 与 `chat.main`，Native payload 不变，shadow channel 隔离。
- 对照规则明确：allow/queue/drop-oldest 且非 aggressive suppression 才计入 comparable；aggregate、replace 或 aggressive suppression 标记 incomparable，不伪装成等价通过。
- `visual-runtime-shadow.test.mjs`、`plugin-lifecycle.test.mjs`、Runtime/Stack、Registry 坏快照及设置页相关回归合计 87/87 通过；语法检查和 `git diff --check` 通过。下一步是补真实 overflow 压力对照，再决定是否开放受控接管开关。
- Shadow overflow 压力对照已完成：新 ChannelRuntime 的 `allow` 保留 3 张 active 卡片，`queue` 保留 2 visible + 1 queued，`drop-oldest` 保留 2 visible 并计数 1 次 suppressed；Native request 数量保持为 0，证明该对照不接触真实渲染链路。
- `visual-runtime-shadow.test.mjs`、`plugin-lifecycle.test.mjs`、Notification test tool、Runtime/Stack focused 回归合计 77/77 通过；语法检查和 `git diff --check` 通过。当前仍不开放生产接管：真实 Native Shelf eviction 与 shadow overflow 仍是两套事实源，下一步应先输出接管前决策报告/开关契约，再决定是否实现 shadow→takeover 的受控路径。
- 已冻结 `visual-runtime-mode-contract.js`：模式为 `legacy`、`shadow`、`takeover`；默认 `legacy`，进入 takeover 必须带显式 declaration，rollback 会回到 legacy 并记录脱敏 code/declaration/time。
- 新增 bounded metrics contract：只允许 legacy/shadow/native 卡片计数、queued/suppressed、生命周期差异、通道隔离、声音链路和通知状态健康字段，拒绝路径等敏感字段。插件新增只读 `getVisualRuntimeModeStatus()`，当前不改变生产模式。
- Contract、Plugin API、Shadow、Plugin lifecycle、Runtime/Stack、Registry 和设置页 focused 回归合计 89/89 通过；相关模块语法检查和 `git diff --check` 通过。下一步仍需定义 takeover 的真实切换/回滚接缝，不能仅凭 contract 宣称已接管。
- 已新增 `visual-runtime-takeover-adapter.js`：第一版只允许 Stack + allow/queue/drop-oldest + 非 aggressive suppression；不支持 ticker/aggregate/replace/aggressive，遇到不支持策略返回 rollback decision。
- `showNotificationScene()` 已接入受控 takeover 分支：mode 为 takeover 时先通过 adapter 创建 Native card，失败自动记录 rollback 并回落到 legacy scene.create；不重播声音、不重新入库、不改变通知状态。默认仍为 legacy，shadow 不受影响。
- Takeover adapter、Contract、Plugin lifecycle、Shadow、Runtime/Stack、Registry 和设置页 focused 回归合计 93/93 通过；相关模块语法检查和 `git diff --check` 通过。当前 takeover 仍是实验性受控路径，尚未开放设置页面或默认配置。
- 已补真实 `showNotificationScene()` 回滚回归：Native takeover 首次失败后自动回到 legacy 并完成一次最终 scene.create，通知状态为 shown；不支持 ticker 策略时不走 takeover Native 请求，legacy 只创建一次。
- 已补声音—视觉解耦回归：takeover 成功、Native failure fallback、不支持策略 fallback 三条路径均只调用一次 sound scheduler；scene fallback 不会重播声音。
- 已新增 `visual-runtime-mode-config.js` 安全配置解析：默认 legacy；shadow 必须显式 `visualRuntimeShadowEnabled`；takeover 必须同时满足 `visualRuntimeTakeoverEnabled=true` 与 `visualRuntimeTakeoverDeclaration=operator-approved`，否则自动解析为 legacy。诊断只暴露 requestedMode/mode/enabled/declarationPresent/reason 等 bounded facts，不暴露声明原文。
- Plugin mode controller 已消费安全解析结果，普通配置无法绕过 takeover 门禁；legacy/shadow selector 行为保持不变。
- 已新增 `docs/superpowers/plans/2026-08-19-visual-runtime-acceptance-matrix.md`，区分 Node/Runtime 已验证项与必须在真实 Native/Hana 环境验证的项；新增 acceptance 回归覆盖 queue promote、drop-oldest、dismiss/reclaim、多通道隔离和 rollback reclaim。
- 配置门禁、Takeover adapter、声音回归、生命周期 acceptance、Plugin lifecycle、Shadow、Runtime/Stack、Registry 和设置页 focused 回归合计 103/103 通过；相关模块语法检查和 `git diff --check` 通过。当前未宣称真实 Native/Hana 视觉验收完成。
- 已找到并运行 Native Runtime：旧 Debug 二进制的 `named-pipe-behavior-channel` 曾因 `LAYOUT_SHELF_OUT_OF_BOUNDS` 失败；静态源码已有 ticker Shelf → vertical Stack fallback，但旧 Debug 构建未包含/未使用该路径。改用现有 Release 二进制后，`--self-test`、`--visual-self-test`、`--desktop-visual-self-test`、`named-pipe-smoke`、`named-pipe-scene-event`、`named-pipe-behavior-channel` 全部通过。旧 Debug 构建不作为验收依据，Native behavior-channel layout 阻塞已解除。
- 已新增 `visual-runtime-takeover-native-e2e.test.mjs`：真实启动 Release Native Runtime，使用完整 takeover 双门禁配置，不通过内部 `setMode()` 绕过；验证缺少 experiment gate 时保持 legacy，显式门禁后 Plugin → Native scene.create 成功，Native card 携带 stack/stack.main 行为身份，通知状态为 shown，Native scene.dismiss 成功。该 E2E 与 acceptance/config focused 回归 8/8 通过。
- 已补真实容量 E2E：takeover queue 在 channel maxVisible=1 时保持 Native 可见数量为 1，第二张进入行为队列，PASS。修正 E2E canonical event 后确认 drop-oldest 确实命中配置 channel，但 Native 仍保留旧卡，随后新卡 scene.create 造成 `RUNTIME_SCENE_CARD_EXISTS`/Native 可见数量超界，FAIL；尚未宣称容量接管完成。
- 已修复 `notification-behavior-manager` 中 overflow 与 suppression 的错误耦合：`suppression=off` 时 queue/drop-oldest 仍执行容量策略；新增两条 manager 回归。
- 已修复 drop-oldest 的 Native 原子淘汰顺序：在 behavior manager enqueue 前先完成旧卡 `scene.dismiss`，Native dismiss 成功后才提交新卡；Native 失败会阻止新卡创建，避免双事实源继续扩大。
- Release Native 真实容量 E2E：queue 与 drop-oldest 均通过，Native 可见数量保持 maxVisible=1；相关 takeover、manager、shadow、Plugin lifecycle 和 fallback focused 回归合计 69/69 通过，语法检查和 `git diff --check` 通过。
- 新增 Native 主动 dismiss + queue promote E2E 后发现：通过 Named Pipe `scene.dismiss` 删除卡片时，Release Runtime 未向 Plugin 转发 `scene.changed`，Plugin 通知仍为 shown，queued card 未自动 promote。该测试当前 FAIL/BLOCKED，不能宣称 Native → Plugin 生命周期闭环完成；需区分程序化 dismiss ACK 与用户/窗口自主 dismiss event，并补请求型 dismiss 后 reconcile 或 Native event 转发。
- 本轮补 Native `scene.dismiss` 协议契约：ACK 结果新增 `removed`、`targetId`、`change`、`sceneStateSnapshot`、`sceneCards` 等事实字段；已通过 VS2022 BuildTools 重新编译 Release Runtime。Named Pipe smoke、scene-event、behavior-channel 三项真实 Native 回归均通过（3/3），dismiss ACK 新字段断言已生效。
- 基于新 ACK 尝试接入 Plugin reconcile 后，真实容量 queue/drop-oldest 回归保持通过，但 Native dismiss 生命周期测试仍失败：程序化 ACK 能删除 Native 卡片，却没有完成 Plugin status 与 queued promotion 的一致闭环。该尝试未宣称完成，下一步应先把 promotion 设计成独立的 Native ACK adapter/行为 manager adapter，而不是在 `showNotificationScene` 内用标志位绕过 enqueue。
- 已先完成领域层最小前置：`notification-behavior-manager` 新增 `removeWithPromotion()`，显式返回 `{ removed, promoted }`，不改变现有 `remove()` 兼容行为；新增回归通过。
- 已新增 `visual-runtime-promotion-adapter`：Native create 成功后才 commit Plugin 状态；Native create 失败不 commit；同一 notificationId commit 后幂等跳过。promotion adapter 三条契约回归通过，尚未接入生产 `index.js`。
- 尝试将 promotion adapter 接入 `performNotificationSceneDismiss` 后，真实 queue/drop-oldest 容量回归仍通过，但 Native dismiss 生命周期测试仍失败；已撤回生产接入，保留 adapter 和领域契约。根因进一步确认：Plugin 的卡片提交必须拆成“构建 payload”和“提交状态”两个阶段，不能让 promotion 通过 `showNotificationScene` 重新进入完整首次展示流程。
- 已新增 `visual-runtime-card-builder` 契约：明确 builder 必须接收 `record + health + layout`，并在构建前校验上下文；新增 builder、promotion、Behavior Manager 组合回归 7/7 通过。
- 已将生产 `showNotificationScene` 的 Native payload 构造迁移到 `buildNotificationScenePayload()`，并抽出 `createNotificationSceneNative()` 与 `commitNotificationSceneShown()` 两个阶段；takeover、queue、drop-oldest、Plugin lifecycle focused 回归 61/61 通过，语法检查和 `git diff --check` 通过。
- 已实现 `promoteNotificationScene()`，复用 builder/create/commit 阶段；但尝试接入真实 dismiss promotion 后，Native dismiss E2E 仍失败，且 adapter 接入会让 promotion 路径重入部分状态逻辑。该接入已撤回，当前保留阶段拆分，未宣称生命周期闭环。
- 已新增 `visual-runtime-promotion-queue`：按 notificationId 去重，Native promotion 失败时保留 pending，支持显式 retry，unload/close 会拒绝并清理 pending；新增 retry、dedup、close 回归通过。尝试接入 Plugin dismiss 路径后，Native dismiss 生命周期仍失败，因此已撤回 Plugin 接线；队列契约保留，当前 63/63 focused 回归通过。
- 之前尝试将 ACK reconcile 和 promotion 直接接入 `performNotificationSceneDismiss`，因真实回归会破坏已通过的 drop-oldest 时序，已撤回；Plugin 生命周期阻塞仍保留，等待 Native 新协议构建后再接入幂等 reconcile。
- 已新增 bounded `notificationLifecycleTrace` 与只读 `getNotificationLifecycleTrace(notificationId?)`，记录 `scene.create.request`、`scene.commit.shown`、`scene.dismiss.request`、`scene.dismiss.reconciled`、`scene.changed.received/reconciled`，不包含原始 payload。真实失败 E2E 的 trace 已确认：直接调用 Native `scene.dismiss` 时 Plugin 只记录 create 两步，未收到 dismiss request/event；这不是 Store 更新问题，而是测试绕过 Plugin 和 Native 自主事件缺失的边界。
- 已新增显式 `reconcileNativeSceneDismissAck()`，Plugin 发起的 dismiss ACK 现在能更新 status、清理 timer/visible state，并记录 `scene.dismiss.reconciled`；Plugin lifecycle 57/57 通过。
- 真实 Native 自主关闭已确认能到达 Plugin：trace 出现 `scene.changed.received(reason=user-close)` 与 `scene.changed.reconciled`。尝试在该事件内直接 `removeWithPromotion → promoteNotificationScene` 仍未闭环，已撤回；当前剩余问题明确为行为卡映射/状态提交与 promotion 的协调，不再是 Native 事件转发缺失。
- 已在 Behavior Manager 增加正式 `removeByNotificationId()`，内部完成 notificationId → cardId 映射并原子复用 `removeWithPromotion()`；补充未知通知幂等测试。
- Plugin `removeNotificationBehaviorCard()` 已改为只消费该领域 API 返回的 `{ removed, promoted }`。
- 修正自主 dismiss E2E 的重复驱动问题：测试同时调用 `notificationApi.ingestEvent()` 与 `showNotificationScene()` 时，Store subscriber 会再次入队同一通知，造成旧卡被第二次 `shown` 提交。测试现显式关闭场景 subscriber，真实自主关闭与 queued promotion 已通过。
- 本轮 focused 回归 67/67 通过；`node --check` 与 `git diff --check` 通过。
- 真实 Native 全链路矩阵重新通过 6/6：Named Pipe smoke、scene-event、behavior-channel、queue、drop-oldest、Native autonomous dismiss + promotion。容量上限与 queued promotion 均已验证。
- 增加 `notificationSceneReconciledIds` 幂等门禁：Native 重复 `scene.changed` 不会重复 reconcile、重复移除或重复 promotion；dismiss ACK 也会共享该门禁，异常时释放标记以允许安全重试。
- 幂等门禁后的 focused Node 回归 63/63、真实 Native 矩阵 6/6 通过；`node --check` 与 `git diff --check` 通过。
- 正式接入 `visual-runtime-promotion-queue`：按 notificationId 去重，Native create 失败保留 pending，支持显式 `retryNotificationPromotions()`，Runtime 启动后自动 retry，unload 时关闭并拒绝未完成任务。
- 接入后的 focused Node 回归 64/64 通过；本轮补充真实 Native promotion failure-injection E2E：首次 promotion 被注入失败时 pending 保留、Native sceneCards 保持为空，显式 `retryNotificationPromotions()` 后成功创建并清空 pending。
- 该 E2E 与自主 dismiss E2E 均通过；完整 Node focused 回归 67/67 通过（Native 测试在未设置 Runtime 环境变量的组合命令中被跳过），真实 Native 基础/容量矩阵 5/5 通过；`node --check` 与 `git diff --check` 通过。
- 增加 unload 边界测试：插件卸载会关闭 promotion queue、拒绝 pending Promise 并清空队列；该生命周期 focused 回归 60/60 通过。
- 重新运行真实 Native promotion/dismiss 与基础容量矩阵 7/7 通过；当前没有让旧 Plugin 实例在 unload 后复用 queue，避免 closed queue 被误用。

## 2026-08-18：视觉系统主计划同步与工作台整理

- 新增当前视觉系统唯一主计划：`docs/superpowers/plans/2026-08-18-visual-system-master-plan.md`。
- 新增工作台计划索引：`docs/superpowers/plans/README.md`；历史计划继续保留用于追溯，但后续视觉实现以主计划为唯一入口。
- 主计划已冻结新的视觉架构：事件 → 事件绑定 → Visual Profile → Behavior Channel → Card Runtime；通道是独立并行的行为舞台，不按工具、回复、错误硬编码。
- 主计划明确先底层、再逐个高质量实现行为；第一种行为为 Stack，后续依次规划 Ticker/Danmaku、Popup、Aggregate、Replace、Pin、Follow、Scene。
- 主计划明确配置包只允许已有运行时能力的声明式配置、组合关系、事件绑定模板和 PNG/WEBP 等视觉素材；禁止导入 JavaScript、Renderer、DLL、EXE 或新的行为算法。
- 主计划明确“导入配置包”与“应用于事件”分离：导入默认只注册本地视觉方案，不自动覆盖事件；用户通过“应用于”选择单个、多个、类别或外部插件事件。
- 主计划加入视觉配置包管理区、Visual Asset Library、已自定义事件、分类/完整配置导入导出、完整恢复和冲突/事务策略。
- 主计划加入诊断基础设施：稳定错误码、错误阶段、来源链、影响范围、修复建议、回退记录、脱敏诊断报告；视觉故障不得阻塞声音、通知记录或插件生命周期。
- `SIDEBAR-PAGE-PRODUCT-PLAN.md` 已同步新的视觉推进顺序，并链接视觉系统主计划；旧“分类→视觉→模式”的路线保留为历史背景，不再作为当前视觉实现入口。
- 当前文档同步验证：计划占位符扫描通过，`git diff --check` 通过；本轮仅修改计划和状态文档，未修改运行时代码。

