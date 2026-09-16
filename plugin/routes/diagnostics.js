import { PAGE_NAVIGATION_SCRIPT, PAGE_NAVIGATION_STYLE, renderPageNavigation } from './page-navigation.js';
import { errorPayload, readJsonBody, unavailablePayload } from './route-errors.js';

const DIAGNOSTICS_ERROR_MESSAGES = Object.freeze({
  DIAGNOSTICS_PAGE_API_UNAVAILABLE: '诊断中心暂时不可用。'
});

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}


function readDiagnosticsApi(ctx) {
  return ctx?._notificationHubVNextRuntimeApi ?? ctx?._notificationHubVNextPlugin;
}

export function renderDiagnosticsPage(currentUrl = '') {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Notification Hub 诊断中心</title>
<style>
:root { color-scheme: dark; --bg:#0c1210; --surface:#141d1a; --surface-raised:#1b2823; --surface-soft:#101a16; --surface-hover:#20332b; --text:#edf7f2; --muted:#a9bdb4; --subtle:#799188; --line:rgba(126,166,149,.2); --line-strong:rgba(98,208,168,.42); --accent:#72d9b1; --accent-strong:#43bd91; --accent-ink:#071a12; --success:#83dca8; --warning:#f4c975; --danger:#f29393; --shadow:0 18px 42px rgba(0,0,0,.18); }
* { box-sizing:border-box; }
body { margin:0; min-width:300px; background:radial-gradient(circle at 50% -20%, rgba(67,189,145,.1), transparent 34%), var(--bg); color:var(--text); font:14px/1.55 "Segoe UI","Microsoft YaHei",sans-serif; }
.shell { width:100%; max-width:1120px; margin:0 auto; padding:24px 28px 56px; }
.topbar { display:flex; align-items:flex-end; justify-content:space-between; gap:24px; margin:0 0 24px; padding:8px 2px 24px; border-bottom:1px solid var(--line); }
.eyebrow { margin:0 0 7px; color:var(--accent); font-size:11px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }.topbar h1 { margin:0; font-size:30px; line-height:1.15; letter-spacing:-.02em; }.lead { max-width:660px; margin:9px 0 0; color:var(--muted); font-size:13px; }.topbar-actions { display:flex; align-items:center; gap:10px; flex:0 0 auto; }
.status-pill { display:inline-flex; align-items:center; gap:8px; min-height:34px; padding:7px 12px; border:1px solid var(--line); border-radius:999px; background:rgba(255,255,255,.025); color:var(--muted); white-space:nowrap; }.status-pill::before { width:8px; height:8px; border-radius:50%; background:var(--subtle); box-shadow:0 0 0 3px rgba(121,145,136,.12); content:""; }.status-pill.running { border-color:rgba(131,220,168,.35); color:var(--success); }.status-pill.running::before { background:var(--success); box-shadow:0 0 0 3px rgba(131,220,168,.14); }.status-pill.reconnecting,.status-pill.starting { border-color:rgba(244,201,117,.35); color:var(--warning); }.status-pill.reconnecting::before,.status-pill.starting::before { background:var(--warning); box-shadow:0 0 0 3px rgba(244,201,117,.14); }.status-pill.failed,.status-pill.crashed,.status-pill.stop-failed { border-color:rgba(242,147,147,.4); color:var(--danger); }.status-pill.failed::before,.status-pill.crashed::before,.status-pill.stop-failed::before { background:var(--danger); box-shadow:0 0 0 3px rgba(242,147,147,.14); }
.grid { display:grid; grid-template-columns:minmax(0,1.12fr) minmax(300px,.88fr); gap:16px; align-items:stretch; }.grid > section,.grid > aside { min-width:0; }.grid > section > .panel { height:100%; }.panel { min-width:0; border:1px solid var(--line); border-radius:14px; background:linear-gradient(145deg, rgba(27,40,35,.94), rgba(20,29,26,.98)); padding:22px; box-shadow:var(--shadow); }.panel + .panel { margin-top:16px; }.panel h2 { display:flex; align-items:center; gap:9px; margin:0; font-size:16px; line-height:1.3; letter-spacing:.01em; }.panel h2::before { width:3px; height:17px; border-radius:3px; background:var(--accent-strong); content:""; }.panel-intro { margin:7px 0 18px; color:var(--muted); font-size:13px; }
.summary-panel { margin-bottom:16px; }.summary-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:18px; }.summary-heading .panel-intro { margin-bottom:0; }.summary-state { color:var(--subtle); font-size:11px; white-space:nowrap; }.metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; }.metric { min-width:0; min-height:88px; padding:14px; border:1px solid var(--line); border-radius:10px; background:rgba(8,18,14,.28); }.metric-label { color:var(--muted); font-size:12px; }.metric-value { margin-top:7px; color:var(--text); font-family:Consolas,monospace; font-size:24px; font-weight:700; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }.metric-value.warning { color:var(--warning); }.metric-value.danger { color:var(--danger); }.metric-value.good { color:var(--success); }
.detail-list { display:grid; gap:0; margin:18px 0 0; }.detail { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; min-height:42px; padding:11px 0; border-bottom:1px solid rgba(126,166,149,.12); }.detail:first-child { padding-top:0; }.detail:last-child { padding-bottom:0; border-bottom:0; }.detail-label { color:var(--muted); }.detail-value { max-width:68%; color:var(--text); overflow-wrap:anywhere; text-align:right; font-family:Consolas,monospace; font-size:12px; font-weight:600; }
.diagnostic-panel { margin-top:16px; }.diagnostic-list { display:grid; gap:9px; }.diagnostic-item { min-width:0; padding:14px 15px; border:1px solid var(--line); border-radius:10px; background:rgba(8,18,14,.25); }.diagnostic-item:hover { border-color:var(--line-strong); background:var(--surface-hover); }.diagnostic-head { display:flex; align-items:center; justify-content:space-between; gap:14px; }.diagnostic-code { color:var(--text); overflow-wrap:anywhere; font-family:Consolas,monospace; font-size:12px; }.diagnostic-time { color:var(--subtle); font-size:11px; white-space:nowrap; }.diagnostic-message { margin:8px 0 0; color:var(--text); overflow-wrap:anywhere; }.diagnostic-meta { display:flex; flex-wrap:wrap; gap:6px 12px; margin-top:10px; color:var(--muted); font-size:11px; }.diagnostic-meta span { overflow-wrap:anywhere; }.severity { font-weight:700; }.severity-warning { color:var(--warning); }.severity-error,.severity-fatal { color:var(--danger); }.severity-info,.severity-trace { color:var(--accent); }.empty { padding:22px 0 6px; color:var(--muted); }.error-box { margin-top:18px; padding:13px 14px; border:1px solid rgba(242,147,147,.28); border-left:3px solid var(--danger); border-radius:8px; background:rgba(242,147,147,.06); color:var(--danger); overflow-wrap:anywhere; }.notice { padding:14px; border:1px solid var(--line); border-left:3px solid var(--accent); border-radius:8px; background:rgba(114,217,177,.05); color:var(--muted); font-size:12px; }.actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; margin-top:16px; } button { min-height:36px; border:1px solid var(--accent-strong); border-radius:8px; padding:7px 14px; background:var(--accent-strong); color:var(--accent-ink); cursor:pointer; font:inherit; font-weight:700; } button:hover { background:var(--accent); } button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
@media (max-width:860px) { .shell { padding-inline:22px; }.metrics { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width:700px) { .shell { max-width:640px; padding:20px 16px 40px; }.topbar { align-items:flex-start; display:grid; gap:15px; margin-bottom:20px; padding-bottom:18px; }.topbar-actions { justify-content:space-between; }.topbar h1 { font-size:26px; }.grid { grid-template-columns:1fr; }.panel { padding:18px; }.summary-heading { display:grid; gap:4px; }.detail { display:grid; gap:4px; }.detail-value { max-width:100%; text-align:left; }.diagnostic-head { display:grid; gap:4px; }.diagnostic-time { white-space:normal; } }
@media (max-width:420px) { .shell { padding-inline:12px; }.metrics { grid-template-columns:1fr 1fr; gap:8px; }.metric { min-height:78px; padding:11px; }.metric-value { font-size:19px; }.panel { padding:15px; } }
${PAGE_NAVIGATION_STYLE}
/* Diagnostics uses a tighter navigation rail than the generic page defaults. */
.page-navigation { gap:10px; margin-bottom:22px; }
.page-navigation-card { min-height:68px; padding:12px; border-radius:11px; background:rgba(20,29,26,.82); }
.page-navigation-card.active { background:rgba(67,189,145,.12); box-shadow:inset 0 -2px 0 var(--accent-strong), 0 8px 20px rgba(0,0,0,.12); }
.page-navigation-icon { flex-basis:28px; width:28px; height:28px; }
.page-navigation-icon svg { width:22px; height:22px; }
@media (max-width:700px) { .page-navigation-card { min-height:62px; padding:10px; } }
</style>
</head>
<body>
<main class="shell">
  ${renderPageNavigation({ active: 'diagnostics', currentUrl })}
  <header class="topbar"><div><p class="eyebrow">NOTIFICATION HUB / OBSERVABILITY</p><h1>诊断中心</h1><p class="lead">查看 Runtime、Named Pipe 和恢复链路的结构化证据，区分当前故障与已经恢复的瞬态事件。</p></div><div class="topbar-actions"><div id="status-pill" class="status-pill" aria-live="polite">读取中</div></div></header>
  <section class="panel summary-panel" aria-labelledby="summary-title"><div class="summary-heading"><div><h2 id="summary-title">诊断摘要</h2><p class="panel-intro">这里只显示可用于排障的状态和错误摘要；页面不会展开内部进程输出或完整场景对象。</p></div><span id="summary-state" class="summary-state">等待状态</span></div><div class="metrics"><div class="metric"><div class="metric-label">错误</div><div id="error-count" class="metric-value">—</div></div><div class="metric"><div class="metric-label">警告</div><div id="warning-count" class="metric-value">—</div></div><div class="metric"><div class="metric-label">可恢复</div><div id="recoverable-count" class="metric-value">—</div></div><div class="metric"><div class="metric-label">记录总数</div><div id="total-count" class="metric-value">—</div></div></div></section>
  <div class="grid">
    <section class="panel runtime-panel" aria-labelledby="runtime-title"><h2 id="runtime-title">Runtime 证据</h2><p id="runtime-message" class="panel-intro">状态读取中</p><div class="detail-list"><div class="detail"><span class="detail-label">Runtime</span><strong id="runtime-state" class="detail-value">—</strong></div><div class="detail"><span class="detail-label">Named Pipe</span><strong id="pipe-state" class="detail-value">—</strong></div><div class="detail"><span class="detail-label">Pipe 名称</span><strong id="pipe-name" class="detail-value">—</strong></div><div class="detail"><span class="detail-label">客户端</span><strong id="client-state" class="detail-value">—</strong></div><div class="detail"><span class="detail-label">当前卡片</span><strong id="card-count" class="detail-value">—</strong></div><div class="detail"><span class="detail-label">SceneState</span><strong id="scene-state" class="detail-value">—</strong></div></div><div id="current-error" class="error-box" hidden></div></section>
    <aside><section class="panel recovery-panel" aria-labelledby="recovery-title"><h2 id="recovery-title">恢复与布局</h2><p class="panel-intro">用于判断连接恢复后，桌面状态是否仍可重建。</p><div class="detail-list"><div class="detail"><span class="detail-label">布局</span><strong id="layout" class="detail-value">—</strong></div><div class="detail"><span class="detail-label">工作区</span><strong id="work-area" class="detail-value">—</strong></div><div class="detail"><span class="detail-label">快照版本</span><strong id="snapshot-version" class="detail-value">—</strong></div><div class="detail"><span class="detail-label">快照卡片</span><strong id="snapshot-cards" class="detail-value">—</strong></div></div></section><section class="panel"><div class="notice">「导出诊断记录」是错误摘要，有数量上限。「导出 Runtime 日志」是管道心跳与 scene.changed 流水；发卡失败会同时写入两份。两份导出都不含原始进程输出或完整场景对象。</div><div class="actions"><button id="refresh" type="button">刷新诊断</button><button id="export" type="button">导出诊断记录</button><button id="export-runtime-log" type="button">导出 Runtime 日志</button><button id="clear-runtime-log" type="button">清空 Runtime 日志</button></div><div id="feedback" class="panel-intro" role="status" aria-live="polite"></div></section></aside>
  </div>
  <section class="panel diagnostic-panel" aria-labelledby="scene-behavior-title"><h2 id="scene-behavior-title">飞法通道与卡片</h2><p class="panel-intro">只显示事件身份、飞法通道和几何位置，不显示通知正文。用于确认同通道堆叠与异通道隔离。</p><div id="scene-behavior-list" class="diagnostic-list"><div class="empty">飞法数据读取中</div></div></section>
  <section class="panel diagnostic-panel" aria-labelledby="recent-title"><h2 id="recent-title">最近诊断</h2><p class="panel-intro">按时间倒序显示错误摘要（含 scene-create ACK 超时）。管道心跳请导出 Runtime 日志。</p><div id="diagnostic-list" class="diagnostic-list"><div class="empty">诊断记录读取中</div></div></section>
</main>
<script>
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var labels = { stopped: "已停止", starting: "启动中", running: "正常运行", reconnecting: "重连中", crashed: "异常退出", failed: "启动失败", "stop-failed": "停止失败", disabled: "未启用" };
  function surfaceLink(path) { var url = new URL(path, window.location.href); var current = new URL(window.location.href); ["token", "pluginSurfaceSession"].forEach(function (name) { var value = current.searchParams.get(name); if (value && !url.searchParams.has(name)) url.searchParams.set(name, value); }); return url.toString(); }
  async function request(path, options) { var api = window.hana && window.hana.api && typeof window.hana.api.fetch === "function" ? window.hana.api : null; var response = api ? await api.fetch(path, options || {}) : await fetch(surfaceLink(path), options || {}); var data; try { data = await response.json(); } catch (_) { var parseError = new Error("诊断接口返回格式不正确"); parseError.code = "DIAGNOSTICS_RESPONSE_INVALID"; throw parseError; } if (!response.ok || data.ok === false) { var error = new Error(data.error && data.error.message || "诊断请求失败"); error.code = data.error && data.error.code || "DIAGNOSTICS_REQUEST_FAILED"; throw error; } return data.status || data; }
  function escape(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
  function text(value, fallback) { return value === null || value === undefined || value === "" ? escape(fallback || "—") : escape(value); }
  function render(status) {
    var runtime = status.runtime || {}; var summary = status.summary || {}; var health = runtime.health || {}; var state = runtime.state || "unknown";
    $("status-pill").className = "status-pill " + state; $("status-pill").textContent = labels[state] || state; $("runtime-state").textContent = labels[state] || state; $("pipe-state").textContent = runtime.connected ? "已连接" : "未连接"; $("pipe-name").textContent = text(runtime.pipeName, "未分配"); $("client-state").textContent = text(runtime.clientState); $("card-count").textContent = text(health.cardCount, "0"); $("scene-state").textContent = runtime.sceneStatePersistence && runtime.sceneStatePersistence.enabled ? (runtime.sceneStatePersistence.pending ? "已启用 · 待保存" : "已启用") : "未启用"; $("runtime-message").textContent = text(runtime.message, "Runtime 状态未知");
    $("summary-state").textContent = summary.currentFailure ? "当前存在故障" : (summary.total ? "最近有诊断记录" : "暂无异常记录");
    $("error-count").textContent = text(summary.errors, "0"); $("warning-count").textContent = text(summary.warnings, "0"); $("recoverable-count").textContent = text(summary.recoverable, "0"); $("total-count").textContent = text(summary.total, "0"); $("error-count").className = "metric-value" + (summary.errors ? " danger" : " good"); $("warning-count").className = "metric-value" + (summary.warnings ? " warning" : " good"); $("recoverable-count").className = "metric-value" + (!summary.recoverable ? " good" : ""); $("total-count").className = "metric-value" + (!summary.total ? " good" : "");
    var layout = health.layout || {}; $("layout").textContent = layout.layout ? [layout.layout, layout.direction, layout.anchor].filter(Boolean).join(" · ") : "未连接"; var area = health.workArea; $("work-area").textContent = area ? [area.width && area.height ? area.width + " × " + area.height : null, area.dpiScale ? "DPI " + area.dpiScale : null].filter(Boolean).join(" · ") : "未连接"; var snapshot = health.sceneStateSnapshot || {}; $("snapshot-version").textContent = text(snapshot.version, "—"); $("snapshot-cards").textContent = Array.isArray(snapshot.cardOrder) ? String(snapshot.cardOrder.length) : "—";
    var currentError = runtime.currentError; $("current-error").hidden = !currentError; $("current-error").textContent = currentError ? (currentError.code || "当前 Runtime 错误") + " · " + (currentError.message || "") : "";
    var sceneBehavior = health.sceneBehavior || {}; var channels = Array.isArray(sceneBehavior.channels) ? sceneBehavior.channels : []; var cards = Array.isArray(sceneBehavior.cards) ? sceneBehavior.cards : []; var cardMap = {}; cards.forEach(function (card) { cardMap[card.id] = card; });
    $("scene-behavior-list").innerHTML = channels.length ? channels.map(function (channel) { var channelCards = (channel.cardOrder || []).map(function (id) { return cardMap[id]; }).filter(Boolean); return '<article class="diagnostic-item"><div class="diagnostic-head"><strong class="diagnostic-code">通道：' + text(channel.channelId) + '</strong><span class="diagnostic-time">profile：' + text(channel.profileId) + '</span></div><div class="diagnostic-meta"><span>卡片顺序：' + text((channel.cardOrder || []).join(' → '), '空') + '</span></div>' + (channelCards.length ? '<div class="diagnostic-meta">' + channelCards.map(function (card) { return '<span>' + text(card.id) + ' · ' + text(card.eventId, 'unknown event') + ' · ' + text(card.behaviorChannelId, 'no channel') + ' · (' + text(card.x, '?') + ',' + text(card.y, '?') + ')</span>'; }).join('') + '</div>' : '') + '</article>'; }).join("") : (cards.length ? cards.map(function (card) { return '<article class="diagnostic-item"><div class="diagnostic-head"><strong class="diagnostic-code">卡片：' + text(card.id) + '</strong><span class="diagnostic-time">(' + text(card.x, '?') + ',' + text(card.y, '?') + ')</span></div><div class="diagnostic-meta"><span>事件：' + text(card.eventId, 'unknown event') + '</span><span>飞法：' + text(card.behaviorProfileId, 'unknown') + '</span><span>通道：' + text(card.behaviorChannelId, 'unknown') + '</span></div></article>'; }).join("") : '<div class="empty">当前没有可见 Scene 卡片</div>');
    var events = Array.isArray(status.diagnostics) ? status.diagnostics : []; $("diagnostic-list").innerHTML = events.length ? events.map(function (event) { var severity = ["trace", "info", "warning", "error", "fatal"].indexOf(event.severity) >= 0 ? event.severity : "info"; return '<article class="diagnostic-item"><div class="diagnostic-head"><strong class="diagnostic-code">' + text(event.code) + '</strong><time class="diagnostic-time">' + text(event.timestamp) + '</time></div><p class="diagnostic-message">' + text(event.message) + '</p><div class="diagnostic-meta"><span class="severity severity-' + severity + '">' + text(severity) + '</span><span>阶段：' + text(event.stage) + '</span><span>来源：' + text(event.source) + '</span>' + (event.traceId ? '<span>traceId：' + text(event.traceId) + '</span>' : '') + (event.recoverable ? '<span>可恢复</span>' : '') + '</div></article>'; }).join("") : '<div class="empty">暂无结构化诊断记录</div>';
  }
  async function refresh() { try { render(await request("diagnostics-status")); $("status-pill").className = $("status-pill").className.replace(/\bfailed\b/g, ""); $("feedback").textContent = "已刷新 · " + new Date().toLocaleTimeString(); } catch (error) { $("status-pill").className = "status-pill failed"; $("status-pill").textContent = "读取失败"; $("summary-state").textContent = "状态暂不可用"; $("feedback").textContent = (error.code || "DIAGNOSTICS_PAGE_FAILED") + " · " + error.message; } }
  async function exportDiagnostics() {
    var button = $("export");
    button.disabled = true;
    $("feedback").textContent = "正在打开 Windows 保存对话框…";
    try {
      var data = await request("diagnostics-export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "notification-hub-diagnostics-" + new Date().toISOString().replace(/[.:]/g, "-") }) });
      $("feedback").textContent = data.cancelled ? "已取消导出。" : "诊断记录已保存到指定位置（.json）。";
    } catch (error) {
      $("feedback").textContent = (error.code || "DIAGNOSTICS_EXPORT_FAILED") + " · " + error.message;
    } finally { button.disabled = false; }
  }
  async function exportRuntimeLog() {
    var button = $("export-runtime-log"); button.disabled = true; $("feedback").textContent = "正在导出 Runtime 日志…";
    try { var data = await request("runtime-log-export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "notification-hub-runtime-log-" + new Date().toISOString().replace(/[.:]/g, "-") }) }); $("feedback").textContent = data.cancelled ? "已取消导出。" : "Runtime 日志已保存到指定位置（.json）。"; }
    catch (error) { $("feedback").textContent = (error.code || "RUNTIME_LOG_EXPORT_FAILED") + " · " + error.message; }
    finally { button.disabled = false; }
  }
  async function clearRuntimeLog() {
    var button = $("clear-runtime-log"); button.disabled = true;
    try { var data = await request("runtime-log-clear", { method: "POST" }); $("feedback").textContent = "Runtime 日志已清空（" + String(data.cleared || 0) + " 条）。"; }
    catch (error) { $("feedback").textContent = (error.code || "RUNTIME_LOG_CLEAR_FAILED") + " · " + error.message; }
    finally { button.disabled = false; }
  }
  var timer = setInterval(refresh, 4000); $("refresh").addEventListener("click", refresh); $("export").addEventListener("click", exportDiagnostics); $("export-runtime-log").addEventListener("click", exportRuntimeLog); $("clear-runtime-log").addEventListener("click", clearRuntimeLog); window.addEventListener("notification-hub-view-before-unload", function () { clearInterval(timer); }, { once: true }); window.parent.postMessage({ type: "ready" }, "*"); refresh();
}());
</script>
${PAGE_NAVIGATION_SCRIPT}
</body>
</html>`;
}

export default function registerDiagnosticsRoute(app, ctx) {
  const getApi = () => readDiagnosticsApi(ctx);
  app.get('/diagnostics', (c) => c.html(renderDiagnosticsPage(c?.req?.url ?? c?.req?.raw?.url ?? '')));
  app.post('/diagnostics-export', async (c) => {
    try {
      const api = getApi();
      if (!api?.exportDiagnostics) return c.json(unavailablePayload('DIAGNOSTICS_PAGE_API_UNAVAILABLE', DIAGNOSTICS_ERROR_MESSAGES.DIAGNOSTICS_PAGE_API_UNAVAILABLE), 503);
      return c.json({ ok: true, ...(await api.exportDiagnostics(await readJsonBody(c))) });
    } catch (error) {
      return c.json({ ok: false, error: errorPayload(error, {}, 'DIAGNOSTICS_PAGE_FAILED') }, error?.code === 'ROUTE_INVALID_JSON' ? 400 : 500);
    }
  });
  app.get('/runtime-log', (c) => {
    try {
      const api = getApi();
      if (!api?.getRuntimeLog) return c.json(unavailablePayload('RUNTIME_LOG_API_UNAVAILABLE', 'Runtime log API unavailable'), 503);
      return c.json({ ok: true, entries: api.getRuntimeLog() });
    } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 500); }
  });
  app.post('/runtime-log-export', async (c) => {
    try {
      const api = getApi();
      if (!api?.exportRuntimeLog) return c.json(unavailablePayload('RUNTIME_LOG_API_UNAVAILABLE', 'Runtime log API unavailable'), 503);
      return c.json({ ok: true, ...(await api.exportRuntimeLog(await readJsonBody(c))) });
    } catch (error) {
      return c.json({ ok: false, error: errorPayload(error, {}, 'RUNTIME_LOG_EXPORT_FAILED') }, error?.code === 'ROUTE_INVALID_JSON' ? 400 : 500);
    }
  });
  app.post('/runtime-log-clear', async (c) => {
    try {
      const api = getApi();
      if (!api?.clearRuntimeLog) return c.json(unavailablePayload('RUNTIME_LOG_API_UNAVAILABLE', 'Runtime log API unavailable'), 503);
      return c.json({ ok: true, ...api.clearRuntimeLog() });
    } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 500); }
  });
  app.get('/diagnostics-status', async (c) => {
    try {
      const api = getApi();
      if (!api?.getDiagnosticsPageStatus) return c.json(unavailablePayload('DIAGNOSTICS_PAGE_API_UNAVAILABLE', DIAGNOSTICS_ERROR_MESSAGES.DIAGNOSTICS_PAGE_API_UNAVAILABLE), 503);
      return c.json({ ok: true, status: await api.getDiagnosticsPageStatus() });
    } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 500); }
  });
}
