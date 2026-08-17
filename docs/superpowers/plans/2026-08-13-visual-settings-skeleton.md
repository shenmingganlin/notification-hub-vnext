# 分类视觉策略页面骨架实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 建立独立持久化的视觉 profile、设置页面骨架和结构化最终预览，为后续分类视觉策略提供真实 Hana 可验收的页面接缝。

**Architecture:** 视觉配置独立于声音配置保存，消费阶段二冻结的分类/PresentationPlan 输入，不携带 CSS、窗口坐标或 Runtime 参数。设置中心继续只保留一个 Page surface，在当前 iframe 内切换视觉页面；首屏由服务端注入有限初始状态，前端只负责刷新和保存。

**Tech Stack:** Node.js ESM、原生 JavaScript、Node test runner、Hono 风格插件 routes、现有 Hana iframe API。

## Global Constraints

- 保护 alpha.8 Native Runtime、阶段一页面稳定、阶段二分类和阶段三声音真实 Hana 验收结果。
- 首批分类固定为 `chat`、`channel`、`tool`、`error`、`plugin`，分类输入来自现有 PresentationPlan，不重新从正文猜测。
- 视觉配置与声音配置独立持久化；第一刀只实现受控内置视觉 preset，不开放任意 CSS、HTML、路径或 Runtime 坐标。
- 页面内部切换复用当前 iframe，不新增 Page surface，不拼接跨 surface 普通链接。
- 首屏必须有服务端初始状态或受控错误，不能永久停留在“读取中”。
- 修改源码使用结构化文件工具；不执行 Git commit。
- 完成前运行 focused、全量 `npm test`、`npm run check`、`git diff --check` 和打包验证，并进行真实 Hana 页面验收。

### Task 1: 视觉 profile schema

- [ ] 为 `visual-profile.js` 写失败测试。
- [ ] 实现版本化 profile、受控 preset 白名单、全局与分类默认、规则字段校验、深冻结。
- [ ] 覆盖未知字段、非法 preset、音量式任意值拒绝和输入不变。

### Task 2: 独立视觉 Store

- [ ] 为 `visual-settings-store.js` 写失败测试。
- [ ] 实现 revision、saved/applied/apply-failed 状态和独立快照。
- [ ] 保持 Store 不依赖声音 Store 或 Runtime Store。

### Task 3: 视觉设置页面与路由

- [ ] 为视觉页面结构和 route 注册写失败测试。
- [ ] 实现 `/settings-visual` 普通 HTML route、状态/更新/预览 API。
- [ ] 页面展示全局视觉、分类 preset、最终生效预览和“即将开放”的复杂能力。
- [ ] 使用 `window.hana.api.fetch()`，服务端注入有限初始状态，并实现超时与错误态。

### Task 4: 设置中心 iframe 切换

- [ ] 为设置中心视觉入口和定时器清理写失败测试。
- [ ] 将“视觉 · 即将开放”替换为可用入口，使用当前 iframe `document.open/write` 切换。
- [ ] 保留声音页面和既有布局/显示数量行为。

### Task 5: 验证与真实 Hana

- [ ] 运行 focused、全量、check、diff check。
- [ ] 打包并核对 SHA256。
- [ ] 在真实 Hana 验证设置 → 视觉、状态读取、保存应用、预览和返回声音无 404。
- [ ] 记录证据到 `CURRENT-STATUS.md`，不提前宣称复杂视觉完成。
