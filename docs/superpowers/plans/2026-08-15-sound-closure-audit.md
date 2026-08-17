# 声音系统收尾审查记录

日期：2026-08-15

## 审查方式

并行审查四条边界：

1. 声音调度与 Windows 音频 backend。
2. 声音 profile、resolver、旧配置迁移和设置持久化。
3. 通知事件到声音决策、诊断和生命周期链路。
4. 声音设置页、试听、实验台和测试覆盖。

## 本轮确认并修复

- scheduler 同步抛错不再穿透 `NotificationApi.ingestEvent()`。
- scheduler rejected Promise 统一转换为稳定的 `failed` 播放结果，并进入声音诊断。
- 模型服务错误从嵌套 payload、response、error、failure 和 result 中提取稳定事件 ID，避免重复事件重复声音。
- `workModeMuted` 现在同步进入 NotificationApi、预览和音频资产试听的有效静音边界。
- 旧 `updateSettings()` 入口与 `globalSoundEnabled`、`profile.global.enabled` 同步。
- 未知事件不再错误继承 `arrived` 组合绑定。
- 旧 type policy 与 importance policy 迁移时增加更具体的交叉规则，保留组合语义，避免同 specificity 冲突。
- 非持久 Windows 音频 backend 现在跟踪活动 PowerShell 子进程，dispose 时主动终止，避免插件卸载后残留播放进程。
- persistent PowerShell backend 增加进程代际校验，旧进程延迟 close 不会污染新进程；自定义音频 volume=0 直接返回 muted，不启动媒体播放；诊断保留显式 `attempted:false` 与 `muted` 语义。
- 自定义音频播放增加真实路径边界校验，受控 asset root 外的文件会被拒绝，避免符号链接或 junction 造成目录逃逸。
- 声音设置页面请求增加统一超时、稳定错误码和 revision 仲裁；旧响应不会覆盖更新状态，音频导入也复用统一 JSON 响应解析。
- 声音设置状态不再把持久化绝对路径发送到页面；试听 UI 明确提示局部策略被绕过，动态测试工具返回 `historyWritten` 明确其当前仍会写入测试历史。

## 暂不修改的风险

- 正在播放的声音是否应在用户切换全局静音时立即取消，仍需产品语义确认；当前全局静音保证新决策不播放，卸载路径会清理调度器和 backend。
- `soundId` 与 `cue` 同时配置的回退语义尚未改变，保持现有兼容行为。
- 受控音频目录的真实路径边界已在播放入口校验；导入流程仍会复制文件内容到受控目录，Windows junction/symlink 的真实设备矩阵仍需现场补测。
- 规则 target specificity 的多值细化和 store restore 事件广播暂不纳入声音收尾最小修复。
- 工具事件失败字段是否允许缺失 `isError`，需要真实 Hana 契约证据后再扩展，避免误报。
- 真实 Windows 设备听感、PowerShell 子进程、扬声器并发仍需要现场验收，自动化 fake backend 不等价于真实设备。

## 验证

- 声音与生命周期 focused：94 项通过。
- 全量 Node：617 项，605 通过、12 跳过、0 失败。
- `npm run check`：通过。
- 声音压力测试 `all --count 1000`：四场景通过，无失败、无 dropped、全部 settled。
- `git diff --check`：通过。
- 未执行 Git commit。
