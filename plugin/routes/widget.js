const MAX_TEXT_LENGTH = 2000;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const RUNTIME_ERROR_MESSAGES = Object.freeze({
  LAYOUT_SHELF_OUT_OF_BOUNDS: '当前工作区横向空间不足，无法容纳更多卡片。请减少卡片数量或调整卡片间距。',
  LAYOUT_SHELF_DIRECTION_INVALID: 'Shelf 只能使用横向排列方向。',
  RUNTIME_TEST_LAYOUT_INVALID: '请先选择停靠位置，并使用该位置对应的正常排列方向；卡片间距必须是 0 到 200 的整数。'
});

function errorMessage(error) {
  const code = error?.code ?? 'RUNTIME_TEST_API_FAILED';
  return {
    code,
    message: RUNTIME_ERROR_MESSAGES[code] ?? error?.message ?? String(error)
  };
}

function readJsonBody(c) {
  return c.req.json().catch(() => ({}));
}

function renderWidget() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Notification Hub</title>
<style>
:root {
  color-scheme: light dark;
  --bg: #101817;
  --panel: #172321;
  --panel-2: #1d2b28;
  --text: #e7f2ee;
  --muted: #9db2ab;
  --line: #38504a;
  --mint: #8fe0c0;
  --mint-strong: #45c39b;
  --danger: #f18c8c;
  --warning: #f3c66d;
  --shadow: rgba(0, 0, 0, .22);
}
* { box-sizing: border-box; }
html, body { min-width: 0; max-width: 100%; }
body { margin: 0; padding: 12px; background: var(--bg); color: var(--text); font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; }
.shell { display: grid; gap: 12px; width: min(100%, 560px); max-width: 100%; margin: 0 auto; }
header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; min-width: 0; }
h1 { min-width: 0; margin: 0; font-size: 17px; line-height: 1.2; letter-spacing: 0; }
.subtitle { margin-top: 4px; color: var(--muted); font-size: 11px; }
.header-links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.header-links a, .panel-link { color: var(--mint); font-size: 11px; text-decoration: none; }
.header-links a:hover, .panel-link:hover { text-decoration: underline; }
.status-dot { flex: 0 0 auto; width: 9px; height: 9px; margin-top: 5px; border-radius: 50%; background: var(--muted); box-shadow: 0 0 0 3px rgba(157,178,171,.12); }
.status-dot.running { background: var(--mint-strong); box-shadow: 0 0 0 3px rgba(69,195,155,.14); }
.status-dot.failed, .status-dot.crashed, .status-dot.stop-failed { background: var(--danger); box-shadow: 0 0 0 3px rgba(241,140,140,.14); }
.status-dot.reconnecting, .status-dot.starting, .status-dot.stopping { background: var(--mint); box-shadow: 0 0 0 3px rgba(143,224,192,.14); }
.panel { min-width: 0; border: 1px solid var(--line); border-radius: 7px; background: var(--panel); box-shadow: 0 5px 18px var(--shadow); padding: 12px; }
.panel-title { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; min-width: 0; margin-bottom: 9px; font-weight: 650; }
.panel-title > span { min-width: 0; color: var(--muted); font-size: 11px; font-weight: 400; overflow-wrap: anywhere; }
.runtime-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
.metric { min-width: 0; padding: 8px; border: 1px solid var(--line); border-radius: 5px; background: var(--panel-2); }
.metric-label { color: var(--muted); font-size: 10px; }
.metric-value { min-width: 0; margin-top: 2px; font-weight: 650; overflow-wrap: anywhere; }
.notification-widget-summary { margin: 0 0 9px; color: var(--muted); white-space: pre-wrap; overflow-wrap: anywhere; }
.sidebar-display-control { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin-top: 9px; color: var(--muted); font-size: 11px; }
.sidebar-display-control select, .sidebar-display-control input { min-width: 0; max-width: 100%; padding: 5px 7px; border: 1px solid var(--line); border-radius: 5px; background: var(--panel-2); color: var(--text); font: inherit; }
.sidebar-display-control input { width: 72px; }
.sidebar-display-control [hidden] { display: none; }
.notification-widget-recent { display: grid; gap: 7px; min-width: 0; }
.notification-widget-item { min-width: 0; border: 1px solid var(--line); border-left: 3px solid var(--mint-strong); border-radius: 5px; padding: 8px 9px; background: var(--panel-2); }
.notification-widget-item.unread { border-left-color: var(--mint); }
.notification-widget-item-title { display: flex; align-items: baseline; flex-wrap: wrap; justify-content: space-between; gap: 4px 8px; min-width: 0; }
.notification-widget-item-title strong { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
.notification-widget-item-title span { flex: 0 0 auto; color: var(--muted); font-size: 10px; }
.notification-widget-item p { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; min-width: 0; max-height: 2.9em; margin: 3px 0 0; color: var(--muted); overflow: hidden; white-space: pre-wrap; overflow-wrap: anywhere; }
.notification-widget-item-meta { margin-top: 4px; color: var(--muted); font-size: 10px; overflow-wrap: anywhere; }
.notification-widget-item-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; margin-top: 6px; }
.notification-widget-item-actions a, .sidebar-action { display: inline-flex; align-items: center; justify-content: center; min-width: 0; min-height: 30px; padding: 5px 9px; border: 1px solid var(--line); border-radius: 5px; background: transparent; color: var(--mint); cursor: pointer; font: inherit; font-size: 11px; text-decoration: none; }
.notification-widget-item-actions a:hover, .notification-widget-item-actions a:focus-visible, .sidebar-action:hover, .sidebar-action:focus-visible { border-color: var(--mint); background: var(--panel); outline: none; }
.notification-widget-empty, .notification-widget-error { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.notification-widget-error { color: var(--danger); }
.runtime-message { min-width: 0; margin: 9px 0 0; color: var(--muted); overflow-wrap: anywhere; }
.runtime-error { margin: 9px 0 0; color: var(--danger); font-size: 11px; overflow-wrap: anywhere; }
.runtime-recovery { margin: 9px 0 0; color: var(--warning); font-size: 11px; overflow-wrap: anywhere; }
.quick-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 2px; }
.sidebar-action.primary { border-color: var(--mint-strong); background: var(--mint-strong); color: #0d211b; font-weight: 700; }
.sidebar-action:disabled { cursor: wait; opacity: .55; }
.feedback { min-height: 18px; margin-top: 9px; color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
.feedback.error { color: var(--danger); }
@media (max-width: 360px) {
  body { padding: 8px; }
  .runtime-summary { grid-template-columns: minmax(0, 1fr); }
  .quick-actions > * { flex: 1 1 100%; }
}
</style>
</head>
<body>
<main class="shell">
  <header><div><h1>Notification Hub</h1><div class="subtitle">轻量通知入口与 Runtime 状态</div></div><span id="status-dot" class="status-dot" aria-label="Runtime 状态"></span></header>
  <section class="panel" aria-labelledby="notification-widget-title"><div class="panel-title"><span id="notification-widget-title">最近通知</span><span id="notification-widget-unread-count" class="notification-widget-count">未读 读取中</span></div>
    <div id="notification-widget-summary" class="notification-widget-summary">通知摘要读取中</div>
    <div id="notification-widget-recent" class="notification-widget-recent"><div class="notification-widget-empty">通知读取中</div></div>
    <label class="sidebar-display-control">侧边栏卡片数
      <select id="sidebar-display-limit-select" aria-label="侧边栏卡片显示数量">
        <option value="1">1 条</option><option value="3">3 条</option><option value="5">5 条</option><option value="10">10 条</option><option value="custom">自定义</option>
      </select>
      <input id="sidebar-display-limit-custom" type="number" min="1" max="20" step="1" inputmode="numeric" value="3" aria-label="自定义侧边栏卡片数量" hidden>
      <button id="sidebar-display-limit-save" class="sidebar-action" type="button">保存</button>
    </label>
    <div class="quick-actions" style="margin-top:10px"><a id="notification-widget-open-center" class="sidebar-action primary" href="notification-center">打开通知中心</a></div>
  </section>
  <section class="panel" aria-labelledby="runtime-title"><div class="panel-title"><span id="runtime-title">Runtime</span><span id="last-refresh">未刷新</span></div>
    <div class="runtime-summary">
      <div class="metric"><div class="metric-label">运行状态</div><div id="host-state" class="metric-value">读取中</div></div>
      <div class="metric"><div class="metric-label">连接</div><div id="client-state" class="metric-value">读取中</div></div>
      <div class="metric"><div class="metric-label">当前卡片</div><div id="card-count" class="metric-value">—</div></div>
      <div class="metric"><div class="metric-label">布局</div><div id="layout-state" class="metric-value">读取中</div></div>
    </div>
    <p id="runtime-message" class="runtime-message">Runtime 状态读取中</p>
    <div id="runtime-error" class="runtime-error" hidden></div>
    <div id="runtime-recovery" class="runtime-recovery" hidden></div>
  </section>
  <div id="feedback" class="feedback" role="status" aria-live="polite"></div>
</main>
<script>
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (value) { return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); };
  function surfaceLink(path) {
    var url = new URL(path, window.location.href);
    var current = new URL(window.location.href);
    ["token", "pluginSurfaceSession"].forEach(function (name) {
      var value = current.searchParams.get(name);
      if (value && !url.searchParams.has(name)) url.searchParams.set(name, value);
    });
    return url.toString();
  }
  function setFeedback(text, isError) { $("feedback").textContent = text || ""; $("feedback").className = "feedback" + (isError ? " error" : ""); }
  var pendingDetailStorageKey = "notification-hub-vnext.pending-detail";
  function setPendingDetail(notificationId) {
    try {
      if (notificationId) window.localStorage.setItem(pendingDetailStorageKey, JSON.stringify({ notificationId: notificationId, nonce: Date.now() }));
      else window.localStorage.removeItem(pendingDetailStorageKey);
    } catch (error) {}
  }
  function navigateToPluginPage(notificationId) {
    setPendingDetail(notificationId);
    window.parent.postMessage({ type: "navigate-tab", payload: { tab: "plugin:notification-hub-vnext", notificationId: notificationId || null } }, "*");
  }
  async function request(path, options) {
    var response = await fetch(surfaceLink(path), options);
    var data = await response.json();
    if (!response.ok || data.ok === false) { var error = new Error(data.error && data.error.message || data.error || "请求失败"); error.code = data.error && data.error.code; throw error; }
    return data;
  }
  function renderWidget(data) {
    var widget = data || {};
    $("notification-widget-unread-count").textContent = "未读 " + String(widget.unreadCount || 0);
    var recent = Array.isArray(widget.recent) ? widget.recent : [];
    $("notification-widget-summary").textContent = widget.totalCount
      ? "共 " + String(widget.totalCount) + " 条通知 · 显示最近 " + String(recent.length) + " 条"
      : "暂无通知";
    $("notification-widget-open-center").href = surfaceLink("notification-center");
    $("notification-widget-recent").innerHTML = recent.length ? recent.map(function (item) {
      var detail = surfaceLink("notification-center?notificationId=" + encodeURIComponent(item.notificationId));
      return '<article class="notification-widget-item' + (item.unread ? ' unread' : '') + '"><div class="notification-widget-item-title"><strong>' + esc(item.title || "无标题通知") + '</strong><span>' + esc(item.status || "") + '</span></div><p>' + esc(item.summary || "暂无内容") + '</p><div class="notification-widget-item-meta">' + esc(item.source || "未知来源") + " · " + esc(item.importance || "normal") + '</div><div class="notification-widget-item-actions"><a class="notification-widget-detail" data-notification-id="' + esc(item.notificationId) + '" href="' + esc(detail) + '">打开详情</a></div></article>';
    }).join("") : '<div class="notification-widget-empty">暂无通知</div>';
  }
  function renderRuntime(data) {
    var runtime = data || {};
    var hostState = runtime.state || "unknown";
    var runtimeStatus = runtime.runtimeStatus || {};
    var health = runtime.health || {};
    var layout = health.layout || {};
    $("host-state").textContent = hostState === "running" ? "正常运行" : hostState;
    $("client-state").textContent = runtime.connected || runtimeStatus.connected ? "Pipe 已连接" : "连接未建立";
    $("card-count").textContent = String(health.cardCount == null ? (Array.isArray(health.sceneCards) ? health.sceneCards.length : 0) : health.cardCount);
    $("layout-state").textContent = layout.layout ? layout.layout + (layout.anchor ? " · " + layout.anchor : "") : "未设置";
    $("runtime-message").textContent = runtimeStatus.message || runtime.message || "Runtime 状态未知";
    $("status-dot").className = "status-dot " + hostState;
    var lastError = runtimeStatus.lastError || runtime.requestError || runtime.runtimeError;
    var connected = runtime.connected || runtimeStatus.connected;
    var isHealthy = hostState === "running" && connected === true;
    var isTransportRecovery = lastError && typeof lastError.code === "string"
      && (lastError.code === "TRANSPORT_RECONNECT_RETRY" || lastError.code === "TRANSPORT_DISCONNECTED" || lastError.code === "RUNTIME_RESTART_SCHEDULED");
    var currentError = isHealthy ? null : lastError;
    var recoveryNotice = isHealthy && isTransportRecovery ? lastError : null;
    $("runtime-error").hidden = !currentError;
    $("runtime-error").textContent = currentError ? "需要注意：" + (currentError.code || "未知错误") + " · " + (currentError.message || "") : "";
    $("runtime-recovery").hidden = !recoveryNotice;
    $("runtime-recovery").textContent = recoveryNotice ? "连接曾短暂重试，当前已恢复：" + (recoveryNotice.code || "") : "";
    $("last-refresh").textContent = new Date().toLocaleTimeString();
  }
  function renderWidgetError(error) {
    $("notification-widget-unread-count").textContent = "未读 —";
    $("notification-widget-summary").textContent = "通知入口暂时不可用";
    $("notification-widget-recent").innerHTML = '<div class="notification-widget-error">' + esc((error.code || "WIDGET_STATUS_FAILED") + " · " + error.message) + '</div>';
  }
  function renderSidebarDisplaySettings(data) {
    var settings = data && data.settings ? data.settings : { mode: "preset", limit: 3 };
    var select = $("sidebar-display-limit-select");
    select.value = settings.mode === "custom" ? "custom" : String(settings.limit || 3);
    $("sidebar-display-limit-custom").value = settings.limit || 3;
    $("sidebar-display-limit-custom").hidden = select.value !== "custom";
  }
  async function refreshSidebarDisplaySettings() {
    try { renderSidebarDisplaySettings(await request("./sidebar-display-settings")); } catch (error) { setFeedback(error.message || "侧边栏显示设置读取失败", true); }
  }
  $("sidebar-display-limit-select").addEventListener("change", function () {
    $("sidebar-display-limit-custom").hidden = this.value !== "custom";
  });
  $("sidebar-display-limit-save").addEventListener("click", async function () {
    var select = $("sidebar-display-limit-select");
    var payload = select.value === "custom"
      ? { mode: "custom", limit: Number($("sidebar-display-limit-custom").value) }
      : { mode: "preset", limit: Number(select.value) };
    try {
      this.disabled = true;
      setFeedback("正在保存侧边栏显示数量…");
      renderSidebarDisplaySettings(await request("./sidebar-display-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }));
      setFeedback("侧边栏显示数量已保存。");
      await refresh();
    } catch (error) { setFeedback(error.message || "侧边栏显示数量保存失败", true); }
    finally { this.disabled = false; }
  });
  $("notification-widget-open-center").addEventListener("click", function (event) { event.preventDefault(); navigateToPluginPage(null); });
  $("notification-widget-recent").addEventListener("click", function (event) {
    var link = event.target.closest(".notification-widget-detail");
    if (!link) return;
    event.preventDefault();
    navigateToPluginPage(link.getAttribute("data-notification-id"));
  });
  async function refresh() {
    var results = await Promise.allSettled([request("./runtime-test-status"), request("./notification-widget-status")]);
    if (results[0].status === "fulfilled") renderRuntime(results[0].value.status || results[0].value);
    else renderRuntime({ state: "failed", runtimeError: { code: "WIDGET_STATUS_FAILED", message: results[0].reason?.message || "Runtime 状态读取失败" } });
    if (results[1].status === "fulfilled") renderWidget(results[1].value.widget || results[1].value);
    else renderWidgetError(results[1].reason || new Error("通知入口读取失败"));
  }
  refreshSidebarDisplaySettings();
  window.parent.postMessage({ type: "ready" }, "*");
  refresh();
  setInterval(refresh, 2500);
}());
</script>
</body>
</html>`;
}

export default function (app, ctx) {
  const getPlugin = () => ctx?._notificationHubVNextPlugin;

  app.get('/widget', (c) => c.html(renderWidget()));

  app.get('/sidebar-display-settings', async (c) => {
    try {
      const plugin = getPlugin();
      if (!plugin?.getSidebarDisplaySettings) return c.json({ ok: false, error: { code: 'SIDEBAR_DISPLAY_SETTINGS_API_UNAVAILABLE', message: 'Sidebar display settings API unavailable' } }, 503);
      return c.json({ ok: true, ...plugin.getSidebarDisplaySettings() });
    } catch (error) { return c.json({ ok: false, error: { code: error?.code ?? 'SIDEBAR_DISPLAY_SETTINGS_READ_FAILED', message: error?.message ?? String(error) } }, 500); }
  });

  app.post('/sidebar-display-settings', async (c) => {
    try {
      const plugin = getPlugin();
      if (!plugin?.updateSidebarDisplaySettings) return c.json({ ok: false, error: { code: 'SIDEBAR_DISPLAY_SETTINGS_API_UNAVAILABLE', message: 'Sidebar display settings API unavailable' } }, 503);
      return c.json({ ok: true, ...await plugin.updateSidebarDisplaySettings(await readJsonBody(c)) });
    } catch (error) {
      const status = String(error?.code ?? '').startsWith('SIDEBAR_DISPLAY_SETTINGS_') ? 400 : 503;
      return c.json({ ok: false, error: { code: error?.code ?? 'SIDEBAR_DISPLAY_SETTINGS_UPDATE_FAILED', message: error?.message ?? String(error) } }, status);
    }
  });

  app.get('/notification-widget-status', async (c) => {
    try {
      const plugin = getPlugin();
      if (!plugin?.getNotificationWidgetStatus) {
        return c.json({
          ok: false,
          error: {
            code: 'NOTIFICATION_WIDGET_API_UNAVAILABLE',
            message: 'Notification Widget API unavailable'
          }
        }, 503);
      }
      return c.json({ ok: true, widget: await plugin.getNotificationWidgetStatus() });
    } catch (error) {
      return c.json({
        ok: false,
        error: {
          code: 'NOTIFICATION_WIDGET_STATUS_FAILED',
          message: error?.message ?? String(error)
        }
      }, 500);
    }
  });

  app.get('/runtime-test-status', async (c) => {
    try {
      const plugin = getPlugin();
      if (!plugin?.getRuntimeTestStatus) return c.json({ ok: false, error: 'vNext plugin API unavailable' }, 503);
      return c.json(await plugin.getRuntimeTestStatus());
    } catch (error) {
      return c.json({ ok: false, error: errorMessage(error) }, 500);
    }
  });

  app.post('/runtime-test-card', async (c) => {
    try {
      const plugin = getPlugin();
      if (!plugin?.createRuntimeTestCard) return c.json({ ok: false, error: 'vNext plugin API unavailable' }, 503);
      const body = await readJsonBody(c);
      const result = await plugin.createRuntimeTestCard({
        title: typeof body?.title === 'string' ? body.title.slice(0, 120) : '',
        body: typeof body?.body === 'string' ? body.body.slice(0, MAX_TEXT_LENGTH) : ''
      });
      return c.json({ ok: true, ...result, status: await plugin.getRuntimeTestStatus() });
    } catch (error) {
      return c.json({ ok: false, error: errorMessage(error) }, 503);
    }
  });

  app.post('/runtime-test-cards/clear', async (c) => {
    try {
      const plugin = getPlugin();
      if (!plugin?.clearRuntimeTestCards) return c.json({ ok: false, error: 'vNext plugin API unavailable' }, 503);
      const result = await plugin.clearRuntimeTestCards();
      return c.json({ ok: true, ...result });
    } catch (error) {
      return c.json({ ok: false, error: errorMessage(error) }, 503);
    }
  });

  app.post('/runtime-test-layout', async (c) => {
    try {
      const plugin = getPlugin();
      if (!plugin?.applyRuntimeTestLayout) return c.json({ ok: false, error: 'vNext plugin API unavailable' }, 503);
      const body = await readJsonBody(c);
      const result = await plugin.applyRuntimeTestLayout({
        direction: body?.direction,
        anchor: body?.anchor,
        spacing: body?.spacing
      });
      return c.json({ ok: true, ...result });
    } catch (error) {
      return c.json({ ok: false, error: errorMessage(error) }, 503);
    }
  });
}

export { renderWidget };
