import { PAGE_NAVIGATION_SCRIPT, PAGE_NAVIGATION_STYLE, renderPageNavigation } from './page-navigation.js';

const RUNTIME_ERROR_MESSAGES = Object.freeze({
  RUNTIME_PAGE_API_UNAVAILABLE: 'Runtime 页面暂时不可用。',
  RUNTIME_RETRY_FAILED: 'Runtime 重试失败。'
});

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function errorPayload(error) {
  const code = error?.code ?? 'RUNTIME_PAGE_FAILED';
  return {
    code,
    message: RUNTIME_ERROR_MESSAGES[code] ?? error?.message ?? String(error),
    details: error?.details ?? {}
  };
}

function readStatusApi(ctx) {
  return ctx?._notificationHubVNextRuntimeApi ?? ctx?._notificationHubVNextPlugin;
}

export function renderRuntimePage(currentUrl = '') {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Notification Hub Runtime</title>
<style>
:root { color-scheme: dark; --bg:#0f1614; --surface:#17221f; --surface-raised:#1d2b27; --surface-soft:#14201d; --text:#e7f2ee; --muted:#9bb1a9; --line:#304740; --accent:#62d0a8; --accent-strong:#38b88d; --accent-ink:#092118; --success:#72d49e; --warning:#f3c66d; --danger:#f18c8c; }
* { box-sizing:border-box; }
body { margin:0; min-width:300px; background:var(--bg); color:var(--text); font:14px/1.55 "Segoe UI","Microsoft YaHei",sans-serif; }
button { min-height:36px; border:1px solid var(--accent-strong); border-radius:6px; padding:7px 14px; background:var(--accent-strong); color:var(--accent-ink); cursor:pointer; font:inherit; font-weight:700; }
button:hover { background:var(--accent); }
button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
button:disabled { cursor:wait; opacity:.55; }
.shell { width:100%; max-width:1040px; margin:0 auto; padding:28px 28px 52px; }
.topbar { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; margin-bottom:28px; }
h1 { margin:0; font-size:28px; line-height:1.2; }
.lead { max-width:650px; margin:8px 0 0; color:var(--muted); }
.status-pill { display:inline-flex; align-items:center; gap:8px; min-height:32px; padding:6px 10px; border:1px solid var(--line); border-radius:999px; color:var(--muted); white-space:nowrap; }
.status-pill::before { width:8px; height:8px; border-radius:50%; background:var(--muted); content:""; }
.status-pill.running::before { background:var(--success); }.status-pill.reconnecting::before,.status-pill.starting::before { background:var(--warning); }.status-pill.failed::before,.status-pill.crashed::before,.status-pill.stop-failed::before { background:var(--danger); }
.grid { display:grid; grid-template-columns:minmax(0,1.25fr) minmax(280px,.75fr); gap:16px; align-items:start; }
.panel { min-width:0; border:1px solid var(--line); border-radius:8px; background:var(--surface); padding:20px; }
.panel + .panel { margin-top:16px; }.panel h2 { margin:0; font-size:17px; line-height:1.3; }.panel-intro { margin:6px 0 18px; color:var(--muted); font-size:13px; }
.metrics { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }.metric { min-width:0; padding:12px; border:1px solid var(--line); border-radius:6px; background:var(--surface-raised); }.metric-label { color:var(--muted); font-size:12px; }.metric-value { margin-top:3px; font-weight:700; overflow-wrap:anywhere; }
.detail-list { display:grid; gap:12px; margin:16px 0 0; }.detail { display:flex; justify-content:space-between; gap:16px; padding-bottom:12px; border-bottom:1px solid rgba(48,71,64,.7); }.detail:last-child { padding-bottom:0; border-bottom:0; }.detail-label { color:var(--muted); }.detail-value { max-width:64%; overflow-wrap:anywhere; text-align:right; font-family:Consolas,monospace; font-size:12px; }
.actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; margin-top:20px; }.feedback { min-height:22px; margin-top:12px; color:var(--muted); }.feedback.success { color:var(--success); }.feedback.error { color:var(--danger); }.error-box, .recovery-box { margin-top:16px; padding:12px; background:var(--surface-soft); font-size:12px; overflow-wrap:anywhere; }.error-box { border-left:3px solid var(--danger); color:var(--danger); }.recovery-box { border-left:3px solid var(--warning); color:var(--warning); }.error-box strong, .recovery-box strong { display:block; margin-bottom:3px; }.muted { color:var(--muted); }
@media (max-width:700px) { .shell { max-width:640px; padding:22px 16px 40px; }.topbar { display:grid; gap:14px; margin-bottom:24px; }.grid { grid-template-columns:1fr; }.panel { padding:16px; } }
@media (max-width:420px) { .metrics { grid-template-columns:1fr; }.detail { display:grid; gap:4px; }.detail-value { max-width:100%; text-align:left; } }
${PAGE_NAVIGATION_STYLE}
</style>
</head>
<body>
<main class="shell">
  ${renderPageNavigation({ active: 'runtime', currentUrl })}
  <header class="topbar"><div><h1>桌面 Runtime</h1><p class="lead">查看 Native Runtime 是否正常运行、桌面场景是否连通，以及卡片位置是否可以恢复。</p></div><div id="status-pill" class="status-pill" aria-live="polite">读取中</div></header>
  <div class="grid">
    <section class="panel" aria-labelledby="runtime-status-title"><h2 id="runtime-status-title">运行状态</h2><p class="panel-intro">这里显示用户需要知道的运行事实。原始日志和详细诊断会放在诊断中心。</p>
      <div class="metrics"><div class="metric"><div class="metric-label">Runtime</div><div id="runtime-state" class="metric-value">读取中</div></div><div class="metric"><div class="metric-label">Named Pipe</div><div id="pipe-state" class="metric-value">读取中</div></div><div class="metric"><div class="metric-label">版本</div><div id="runtime-version" class="metric-value">读取中</div></div><div class="metric"><div class="metric-label">当前卡片</div><div id="card-count" class="metric-value">—</div></div></div>
      <p id="runtime-message" class="muted">状态读取中</p>
      <div class="actions"><button id="runtime-retry" type="button">重试启动</button></div>
      <div id="feedback" class="feedback" role="status" aria-live="polite"></div>
      <div id="runtime-error" class="error-box" hidden><strong id="runtime-error-code">最近错误</strong><span id="runtime-error-message"></span></div>
      <div id="runtime-recovery" class="recovery-box" hidden><strong>连接已恢复</strong><span id="runtime-recovery-message"></span></div>
    </section>
    <aside>
      <section class="panel" aria-labelledby="scene-title"><h2 id="scene-title">桌面场景</h2><p class="panel-intro">Runtime 连接后，这里反映当前 Shelf 和工作区摘要。</p><div class="detail-list"><div class="detail"><span class="detail-label">布局</span><strong id="layout" class="detail-value">—</strong></div><div class="detail"><span class="detail-label">工作区</span><strong id="work-area" class="detail-value">—</strong></div><div class="detail"><span class="detail-label">SceneState</span><strong id="scene-state" class="detail-value">—</strong></div><div class="detail"><span class="detail-label">最后刷新</span><strong id="last-refresh" class="detail-value">—</strong></div></div></section>
      <section class="panel" aria-labelledby="recovery-title"><h2 id="recovery-title">恢复提示</h2><p id="recovery-message" class="panel-intro">Runtime 正常时，卡片位置会按 SceneState 自动恢复。</p><div class="detail-list"><div class="detail"><span class="detail-label">Pipe 名称</span><strong id="pipe-name" class="detail-value">—</strong></div><div class="detail"><span class="detail-label">客户端</span><strong id="client-state" class="detail-value">—</strong></div></div></section>
    </aside>
  </div>
</main>
<script>
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var labels = { stopped: "已停止", starting: "启动中", running: "正常运行", reconnecting: "重连中", crashed: "异常退出", failed: "启动失败", "stop-failed": "停止失败", disabled: "未启用" };
  function surfaceLink(path) {
    var url = new URL(path, window.location.href); var current = new URL(window.location.href);
    ["token", "pluginSurfaceSession"].forEach(function (name) { var value = current.searchParams.get(name); if (value && !url.searchParams.has(name)) url.searchParams.set(name, value); });
    return url.toString();
  }
  async function request(path, options) {
    var apiFetch = window.hana && window.hana.api && typeof window.hana.api.fetch === "function" ? function (p, o) { return window.hana.api.fetch(p, o); } : function (p, o) { return fetch(surfaceLink(p), o); };
    var response = await apiFetch(path, options); var data = await response.json();
    if (!response.ok || data.ok === false) { var error = new Error(data.error && data.error.message || "请求失败"); error.code = data.error && data.error.code; throw error; }
    return data;
  }
  function formatLayout(layout) { return layout && layout.layout ? layout.layout + " · " + (layout.direction || "") + " · " + (layout.anchor || "") + (Number.isInteger(layout.spacing) ? " · " + layout.spacing + "px" : "") : "未连接"; }
  function formatWorkArea(area) { return area ? String(area.width || "—") + " × " + String(area.height || "—") + " · DPI " + String(area.dpiScale || "—") : "未连接"; }
  function render(data) {
    var status = data.status || data; var state = status.state || "unknown"; var health = status.health || {}; var error = status.lastError || status.requestError || status.runtimeError; var recovery = status.recoveryNotice;
    $("status-pill").className = "status-pill " + state; $("status-pill").textContent = labels[state] || state;
    $("runtime-state").textContent = labels[state] || state; $("pipe-state").textContent = status.connected ? "已连接" : "未连接"; $("runtime-version").textContent = status.runtimeVersion || status.pluginVersion || "—"; $("card-count").textContent = String(health.cardCount == null ? 0 : health.cardCount); $("runtime-message").textContent = status.message || "Runtime 状态未知";
    $("layout").textContent = formatLayout(health.layout); $("work-area").textContent = formatWorkArea(health.workArea); $("scene-state").textContent = status.sceneStatePersistence && status.sceneStatePersistence.enabled ? (status.sceneStatePersistence.pending ? "已启用 · 待保存" : "已启用") : "未启用"; $("pipe-name").textContent = status.pipeName || "未分配"; $("client-state").textContent = status.clientState || "—"; $("last-refresh").textContent = new Date().toLocaleTimeString();
    $("runtime-error").hidden = !error; if (error) { $("runtime-error-code").textContent = error.code || "最近错误"; $("runtime-error-message").textContent = (error.message || "Runtime 发生错误") + (error.recoverable ? " · 可以重试" : ""); }
    $("runtime-recovery").hidden = !recovery; if (recovery) { $("runtime-recovery-message").textContent = (recovery.message || "传输连接曾短暂重试") + " · 当前已恢复"; }
  }
  function feedback(message, kind) { $("feedback").textContent = message || ""; $("feedback").className = "feedback" + (kind ? " " + kind : ""); }
  async function refresh() { try { render(await request("runtime-status")); } catch (error) { render({ state: "failed", message: error.message, runtimeError: { code: error.code || "RUNTIME_STATUS_FAILED", message: error.message } }); feedback(error.message, "error"); } }
  $("runtime-retry").addEventListener("click", async function () { this.disabled = true; feedback("正在重试启动 Runtime…"); try { render(await request("runtime-retry", { method: "POST" })); feedback("Runtime 重试请求已完成。", "success"); } catch (error) { feedback((error.code || "RUNTIME_RETRY_FAILED") + " · " + error.message, "error"); await refresh(); } finally { this.disabled = false; } });
  var refreshTimer = setInterval(refresh, 3000);
  window.addEventListener("notification-hub-view-before-unload", function () { clearInterval(refreshTimer); }, { once: true });
  window.parent.postMessage({ type: "ready" }, "*"); refresh();
}());
</script>
${PAGE_NAVIGATION_SCRIPT}
</body>
</html>`;
}

export default function registerRuntimeRoute(app, ctx) {
  const getApi = () => readStatusApi(ctx);
  app.get('/runtime', (c) => c.html(renderRuntimePage(c?.req?.url ?? c?.req?.raw?.url ?? '')));
  app.get('/runtime-status', async (c) => {
    try {
      const api = getApi();
      if (!api?.getRuntimePageStatus) return c.json({ ok: false, error: { code: 'RUNTIME_PAGE_API_UNAVAILABLE', message: RUNTIME_ERROR_MESSAGES.RUNTIME_PAGE_API_UNAVAILABLE, details: {} } }, 503);
      return c.json({ ok: true, status: await api.getRuntimePageStatus() });
    } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 500); }
  });
  app.post('/runtime-retry', async (c) => {
    try {
      const api = getApi();
      if (!api?.retryRuntime) return c.json({ ok: false, error: { code: 'RUNTIME_PAGE_API_UNAVAILABLE', message: RUNTIME_ERROR_MESSAGES.RUNTIME_PAGE_API_UNAVAILABLE, details: {} } }, 503);
      return c.json({ ok: true, status: await api.retryRuntime() });
    } catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 503); }
  });
}
