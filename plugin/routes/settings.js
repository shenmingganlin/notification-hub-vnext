import { renderSoundSettingsFragment, renderSoundSettingsPage } from './settings-sound.js';
import { renderVisualSettingsFragment, renderVisualSettingsPage } from './settings-visual.js';
import { PAGE_NAVIGATION_SCRIPT, PAGE_NAVIGATION_STYLE, renderPageNavigation } from './page-navigation.js';
import { errorPayload as buildErrorPayload, readJsonBody, unavailablePayload } from './route-errors.js';
import { createSoundSettingsServices } from '../services/sound-settings-services.js';
import { createSoundAssetServices } from '../services/sound-asset-services.js';

const SETTINGS_ERROR_MESSAGES = Object.freeze({
  SOUND_SETTINGS_VOLUME_INVALID: '音量必须介于 0 和 1 之间。',
  SOUND_WORKBENCH_INPUT_INVALID: '声音实验台输入不正确。',
  SOUND_SETTINGS_FIELD_INVALID: '设置字段格式不正确。',
  SOUND_SETTINGS_FIELD_UNKNOWN: '设置包含当前页面不支持的字段。',
  SETTINGS_STORE_PATCH_INVALID: '设置修改内容必须是对象。',
  SETTINGS_RUNTIME_SYNC_FAILED: '设置同步失败。',
  RUNTIME_LAYOUT_INVALID: '布局方向、停靠位置或间距不正确。',
  RUNTIME_LAYOUT_RUNTIME_UNAVAILABLE: 'Runtime 当前不可用，布局没有保存。',
  NOTIFICATION_DISPLAY_LIMIT_INVALID: '通知显示上限必须是 30、100、500、1000、无限或 1 到 10000 的整数。',
  NOTIFICATION_CARD_LIFETIME_INVALID: '卡片持续时间必须是 0 到 3600 秒的整数。',
  SETTINGS_VIEW_INVALID: '当前设置页面暂不支持这个设置分类。',
  SOUND_PACKAGE_CONFLICT: '音频包中有声音与本机重复，请逐项选择覆盖或保留。',
  SOUND_COMBO_PACKAGE_SOUND_ASSET_MISSING: '配置包引用了尚未安装的音频，请先导入对应的 .nhsound 音频包。',
  SOUND_BINDING_VALUE_INVALID: '必须同时选择有效的分类、事件和重要性。',
  SOUND_ASSET_BINDING_INVALID: '三层声音绑定数据格式不正确。',
  SOUND_BINDING_VOLUME_INVALID: '组合音量必须介于 0% 和 100% 之间。',
  SOUND_ASSET_IN_USE: '这个声音仍被通知组合或规则使用，请先解除配置。'
});


function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function readView(currentUrl) {
  return new URL(currentUrl || '/settings', 'http://notification-hub.local').searchParams.get('view') || 'general';
}

function initialDisplayViewModel(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { settings: { mode: 'preset', limit: 100, cardLifetimeSeconds: 120 }, limit: 100, cardLifetimeSeconds: 120 };
  const settings = value.settings && typeof value.settings === 'object' ? value.settings : {};
  return {
    settings: {
      mode: settings.mode === 'custom' || settings.mode === 'unlimited' ? settings.mode : 'preset',
      limit: settings.limit == null ? 100 : settings.limit,
      cardLifetimeSeconds: Number.isInteger(settings.cardLifetimeSeconds) ? settings.cardLifetimeSeconds : (Number.isInteger(value.cardLifetimeSeconds) ? value.cardLifetimeSeconds : 120)
    },
    limit: value.limit == null ? settings.limit ?? 100 : value.limit,
    cardLifetimeSeconds: Number.isInteger(value.cardLifetimeSeconds) ? value.cardLifetimeSeconds : 120,
    persistence: value.persistence && typeof value.persistence === 'object' ? value.persistence : { enabled: false }
  };
}

function errorPayload(error) {
  return buildErrorPayload(error, SETTINGS_ERROR_MESSAGES, 'SETTINGS_ROUTE_FAILED');
}

function settingsRouteStatus(error, clientCodes = [], unavailable = false) {
  const isClientCode = typeof clientCodes?.has === 'function'
    ? clientCodes.has(error?.code)
    : clientCodes.includes(error?.code);
  if (error?.code === 'ROUTE_INVALID_JSON' || isClientCode) return 400;
  if (error?.code === 'SETTINGS_CONFLICT' || error?.code === 'SOUND_ASSET_IN_USE' || error?.code === 'SOUND_PACKAGE_CONFLICT') return 409;
  if (error?.code === 'SOUND_ASSET_NOT_FOUND') return 404;
  if (unavailable || error?.code?.endsWith('_API_UNAVAILABLE')) return 503;
  return 500;
}

function soundAssetUnavailable(code, message) {
  return unavailablePayload(code, message);
}

const SETTINGS_VIEWS = Object.freeze({
  general: { title: '常规', description: '通知中心显示数量与重要性关键词。' },
  sound: { title: '声音', description: '声音配置与音频库。' },
  visual: { title: '通知视觉', description: '桌面通知卡片的受控视觉预设与预览。' },
  history: { title: '历史与隐私', description: '通知历史保存和清理策略。', comingSoon: true }
});

function renderGeneralSettingsFragment(currentUrl = '', initialData = null) {
  const boot = initialDisplayViewModel(initialData);
  const bootJson = JSON.stringify(boot).replaceAll('<', '\\u003c');
  return `<style data-settings-view-style>
.settings-view-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(260px,.72fr); gap:16px; align-items:start; }
.settings-view-panel { border:1px solid var(--line); border-radius:10px; background:var(--surface); padding:20px; }
.settings-view-panel + .settings-view-panel { margin-top:16px; }
.settings-view-panel h2 { margin:0; font-size:18px; line-height:1.3; }
.settings-view-intro { margin:7px 0 18px; color:var(--muted); font-size:13px; }
.settings-view-row { display:flex; align-items:center; justify-content:space-between; gap:20px; min-height:60px; padding:12px 0; border-top:1px solid rgba(48,71,64,.7); }
.settings-view-row:first-of-type { border-top:0; }
.settings-view-name { font-weight:700; }
.settings-view-help { margin-top:4px; color:var(--muted); font-size:12px; }
.settings-view-select, .settings-view-number { min-height:36px; border:1px solid var(--line); border-radius:6px; padding:7px 9px; background:var(--surface-raised); color:var(--text); }
.settings-view-number { width:96px; }
.settings-view-select { min-width:142px; }
.settings-view-unit { color:var(--muted); font-size:12px; }
.settings-view-options { display:flex; flex-wrap:wrap; gap:10px; }
.settings-view-options label { display:inline-flex; align-items:center; gap:6px; min-height:32px; padding:5px 8px; border:1px solid var(--line); border-radius:6px; color:var(--text); }
.settings-view-options label:has(input:checked) { border-color:var(--accent-strong); background:rgba(56,184,141,.12); }
.settings-view-custom { display:flex; align-items:center; gap:8px; margin-top:12px; color:var(--muted); }
.settings-view-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; margin-top:20px; }
.settings-view-actions button { min-height:36px; border:1px solid var(--accent-strong); border-radius:6px; padding:7px 14px; background:var(--accent-strong); color:var(--accent-ink); cursor:pointer; font-weight:700; }
.settings-view-actions button:hover { background:var(--accent); }
.settings-view-actions button:disabled { cursor:wait; opacity:.55; }
.settings-view-feedback { min-height:24px; margin-top:12px; color:var(--muted); }
.settings-view-feedback.success { color:var(--success); }
.settings-view-feedback.error { color:var(--danger); }
.settings-view-note { margin:0; color:var(--muted); font-size:12px; }
@media (max-width:760px) { .settings-view-grid { grid-template-columns:1fr; } .settings-view-panel { padding:16px; } }
</style>
<div class="settings-view-grid" data-settings-view-root="general">
  <section class="settings-view-panel" aria-labelledby="general-display-title">
    <h2 id="general-display-title">通知中心显示</h2>
    <p class="settings-view-intro">只限制当前页面一次加载和渲染的通知数量，不删除历史记录。</p>
    <div class="settings-view-options" role="radiogroup" aria-label="通知显示上限">
      <label><input type="radio" name="settings-display-limit-mode" value="30">30</label>
      <label><input type="radio" name="settings-display-limit-mode" value="100">100</label>
      <label><input type="radio" name="settings-display-limit-mode" value="500">500</label>
      <label><input type="radio" name="settings-display-limit-mode" value="1000">1000</label>
      <label><input type="radio" name="settings-display-limit-mode" value="unlimited">无限</label>
      <label><input type="radio" name="settings-display-limit-mode" value="custom">自定义</label>
    </div>
    <label id="settings-display-custom" class="settings-view-custom" hidden>自定义数量 <input id="settings-display-limit" class="settings-view-number" type="number" min="1" max="10000" step="1" inputmode="numeric"></label>
    <div class="settings-view-actions"><button id="settings-save-display" type="button">保存显示设置</button></div>
    <div id="settings-display-feedback" class="settings-view-feedback" role="status" aria-live="polite"></div>
  </section>
  <aside>
    <section class="settings-view-panel" aria-labelledby="general-keywords-title">
      <h2 id="general-keywords-title">重要性关键词</h2>
      <p class="settings-view-intro">默认是普通。卡片内容命中关键词后标记为重要，不改变事件身份；行为策略可以据此决定是否合并、延长或强调显示。</p>
      <textarea id="general-keywords" rows="8" class="settings-view-keywords" aria-label="重要性关键词"></textarea>
      <p class="settings-view-note">每行一个关键词，也支持英文逗号分隔。</p>
      <div class="settings-view-actions"><button id="settings-save-keywords" type="button">保存关键词</button></div>
      <div id="settings-keywords-feedback" class="settings-view-feedback" role="status" aria-live="polite"></div>
    </section>
  </aside>
</div>
<script>
(function () {
  "use strict";
  var initialData = ${bootJson};
  var displayState = { mode: initialData.settings.mode, limit: initialData.settings.limit, cardLifetimeSeconds: initialData.settings.cardLifetimeSeconds };
  var busy = false;
  var $ = function (id) { return document.getElementById(id); };
  function request(path, options) {
    var api = window.hana && window.hana.api && typeof window.hana.api.fetch === "function" ? window.hana.api : null;
    if (api) return api.fetch(path, options);
    var current = new URL(window.location.href);
    var match = /^(.*\\/api\\/plugins\\/[^/]+)(?:\\/[^/]*)?$/.exec(current.pathname || "");
    if (!match) throw new Error("设置页面缺少插件 API 路径");
    var url = new URL(match[1] + "/" + path, current.origin);
    ["pluginSurfaceSession", "token"].forEach(function (key) { var value = current.searchParams.get(key); if (value) url.searchParams.set(key, value); });
    return fetch(url.toString(), options);
  }
  function jsonRequest(path, options) {
    return request(path, options).then(function (response) { return response.json().then(function (data) { if (!response.ok || data.ok === false) { var error = new Error(data.error && data.error.message || "请求失败"); error.code = data.error && data.error.code; throw error; } return data; }); });
  }
  function setFeedback(id, text, kind) { var el = $(id); el.textContent = text || ""; el.className = "settings-view-feedback" + (kind ? " " + kind : ""); }
  function render(data) {
    var settings = data && data.settings ? data.settings : {};
    var mode = settings.mode || "preset";
    document.querySelectorAll('input[name="settings-display-limit-mode"]').forEach(function (input) { input.checked = mode === "unlimited" ? input.value === "unlimited" : input.value === (mode === "custom" ? "custom" : String(settings.limit == null ? 100 : settings.limit)); });
    $("settings-display-limit").value = settings.mode === "custom" ? settings.limit : (settings.limit == null ? 100 : settings.limit);
    $("settings-display-custom").hidden = mode !== "custom";
    displayState = { mode: mode, limit: settings.limit == null ? null : settings.limit };
  }
  function setBusy(value) { busy = value; $("settings-save-display").disabled = value; $("settings-save-keywords").disabled = value; }
  function collectDisplay() { var mode = document.querySelector('input[name="settings-display-limit-mode"]:checked')?.value || "100"; if (mode === "unlimited") return { mode: "unlimited", limit: null }; if (mode === "custom") return { mode: "custom", limit: Number($("settings-display-limit").value) }; return { mode: "preset", limit: Number(mode) }; }
  function save(patch, feedbackId, label) { if (busy) return; setBusy(true); setFeedback(feedbackId, "正在保存…"); var next = Object.assign({}, displayState, patch); jsonRequest("notification-center-display-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(next) }).then(function (data) { render(data); setFeedback(feedbackId, label, "success"); }).catch(function (error) { setFeedback(feedbackId, (error.code ? error.code + " · " : "") + error.message, "error"); }).finally(function () { setBusy(false); }); }
  function saveKeywords() {
    if (busy) return;
    var textarea = $("general-keywords");
    if (!textarea) return;
    var keywords = textarea.value.split(/\\n|,/).map(function (v) { return v.trim(); }).filter(Boolean);
    setBusy(true);
    setFeedback("settings-keywords-feedback", "正在保存…");
    jsonRequest("event-presentation-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ importanceKeywords: { keywords: keywords } }) }).then(function (data) { setFeedback("settings-keywords-feedback", "重要性关键词已保存", "success"); }).catch(function (error) { setFeedback("settings-keywords-feedback", (error.code ? error.code + " · " : "") + error.message, "error"); }).finally(function () { setBusy(false); });
  }
  document.querySelectorAll('input[name="settings-display-limit-mode"]').forEach(function (input) { input.addEventListener("change", function () { $("settings-display-custom").hidden = input.value !== "custom"; }); });
  $("settings-save-display").addEventListener("click", function () { save(collectDisplay(), "settings-display-feedback", "显示设置已保存。"); });
  $("settings-save-keywords").addEventListener("click", saveKeywords);
  window.addEventListener("notification-hub-view-before-unload", function () { });
  render(initialData);
}());
</script>`;
}

function renderSettingsShell(currentUrl = '', initialContent = '', initialView = 'general') {
  const view = SETTINGS_VIEWS[initialView] ?? SETTINGS_VIEWS.general;
  const nav = Object.entries(SETTINGS_VIEWS).map(([id, item]) => {
    const disabled = item.comingSoon ? ' disabled aria-disabled="true"' : '';
    const active = id === initialView ? ' active' : '';
    return `<button class="settings-shell-nav-item${active}" type="button" data-settings-shell-view="${id}"${disabled}><span class="settings-shell-nav-mark" aria-hidden="true"></span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.description)}</small></span></button>`;
  }).join('');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Notification Hub 设置</title>
<style>
:root { color-scheme: dark; --bg:#0f1614; --surface:#17221f; --surface-raised:#1d2b27; --surface-soft:#14201d; --text:#e7f2ee; --muted:#9bb1a9; --line:#304740; --accent:#62d0a8; --accent-strong:#38b88d; --accent-ink:#092118; --success:#72d49e; --warning:#f3c66d; --danger:#f18c8c; }
* { box-sizing:border-box; }
body { margin:0; min-width:300px; background:var(--bg); color:var(--text); font:14px/1.55 "Segoe UI","Microsoft YaHei",sans-serif; }
button,input,select { font:inherit; }
button { cursor:pointer; }
button:focus-visible,input:focus-visible,select:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.settings-shell { width:100%; max-width:1080px; margin:0 auto; padding:28px 28px 52px; }
.settings-shell-header { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; margin:28px 0 24px; }
.settings-shell-header h1 { margin:0; font-size:28px; line-height:1.2; }
.settings-shell-lead { max-width:700px; margin:8px 0 0; color:var(--muted); }
.settings-shell-status { display:inline-flex; align-items:center; gap:8px; min-height:32px; padding:6px 10px; border:1px solid var(--line); border-radius:999px; color:var(--muted); white-space:nowrap; }
.settings-shell-status::before { width:8px; height:8px; border-radius:50%; background:var(--muted); content:""; }
.settings-shell-status.success::before { background:var(--success); }
.settings-shell-status.error::before { background:var(--danger); }
.settings-shell-body { display:block; min-width:0; }
.settings-shell-sidebar { display:flex; gap:6px; min-width:0; margin:0 0 20px; padding:6px; overflow-x:auto; border:1px solid var(--line); border-radius:10px; background:var(--surface); }
.settings-shell-nav-item { display:flex; align-items:center; gap:8px; flex:1 1 0; min-width:150px; padding:10px 12px; border:1px solid transparent; border-radius:7px; background:transparent; color:var(--muted); text-align:left; font:inherit; font-weight:400; line-height:1.35; }
.settings-shell-content:has([data-settings-view-root="visual"]) .settings-shell-content-header,
.settings-shell-content:has([data-settings-sound-root="true"]) .settings-shell-content-header { display:none; }
.settings-shell-nav-item:hover { background:var(--surface-raised); color:var(--text); }
.settings-shell-nav-item.active { border-color:var(--accent-strong); background:rgba(56,184,141,.13); color:var(--text); }
.settings-shell-nav-item:disabled { cursor:default; opacity:.55; }
.settings-shell-nav-item strong,.settings-shell-nav-item small { display:block; min-width:0; overflow-wrap:anywhere; }
.settings-shell-nav-item strong { font-size:13px; font-weight:700; }
.settings-shell-nav-item small { margin-top:3px; color:var(--muted); font-size:11px; line-height:1.35; }
.settings-shell-nav-mark { width:8px; height:8px; margin-top:5px; border:1px solid currentColor; border-radius:50%; }
.settings-shell-nav-item.active .settings-shell-nav-mark { background:var(--accent); box-shadow:0 0 0 3px rgba(98,208,168,.13); }
.settings-shell-content { min-width:0; }
.settings-shell-content-header { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:16px; }
.settings-shell-content-header h2 { margin:0; font-size:21px; line-height:1.3; }
.settings-shell-content-header p { margin:5px 0 0; color:var(--muted); font-size:13px; }
.settings-shell-error { padding:14px 16px; border:1px solid rgba(241,140,140,.55); border-radius:8px; background:rgba(241,140,140,.08); color:var(--danger); }
@media (max-width:760px) { .settings-shell { padding:22px 16px 40px; } .settings-shell-header { display:grid; gap:14px; margin-top:22px; } .settings-shell-sidebar { margin-bottom:14px; } .settings-shell-nav-item { min-width:132px; padding:9px 10px; } }
@media (max-width:430px) { .settings-shell-nav-item { min-width:118px; } .settings-shell-nav-item small { display:none; } }
${PAGE_NAVIGATION_STYLE}
</style>
</head>
<body>
<main class="settings-shell">
  ${renderPageNavigation({ active: 'settings', currentUrl })}
  <aside class="settings-shell-sidebar" aria-label="设置分类">${nav}</aside>
  <header class="settings-shell-header"><div><h1>设置</h1><p class="settings-shell-lead">管理 Notification Hub 的行为与显示策略。每个设置领域独立保存，页面切换不会离开当前 Hana 窗口。</p></div><div id="settings-shell-status" class="settings-shell-status" role="status" aria-live="polite">已读取</div></header>
  <div class="settings-shell-body">
    <section class="settings-shell-content" aria-live="polite"><header class="settings-shell-content-header"><div><h2 id="settings-shell-view-title">${escapeHtml(view.title)}</h2><p id="settings-shell-view-description">${escapeHtml(view.description)}</p></div></header><div id="settings-view-content">${initialContent}</div></section>
  </div>
</main>
<script>
(function () {
  "use strict";
  var currentView = ${JSON.stringify(initialView)};
  var $ = function (id) { return document.getElementById(id); };
  var viewMeta = ${JSON.stringify(SETTINGS_VIEWS)};
  function requestHtml(path) {
    try {
      var bust = String(path || "") + (String(path || "").indexOf("?") >= 0 ? "&" : "?") + "_ts=" + Date.now();
      var requestOptions = { cache: "no-store", headers: { "Cache-Control": "no-store", Pragma: "no-cache" } };
      if (window.hana && window.hana.api && typeof window.hana.api.fetch === "function") return Promise.resolve(window.hana.api.fetch(bust, requestOptions));
      var current = new URL(window.location.href);
      var match = /^(.*\\/api\\/plugins\\/[^/]+)(?:\\/[^/]*)?$/.exec(current.pathname || "");
      if (!match) return Promise.reject(new Error("设置页面缺少插件 API 路径"));
      var url = new URL(match[1] + "/" + bust, current.origin);
      ["pluginSurfaceSession", "token"].forEach(function (key) { var value = current.searchParams.get(key); if (value) url.searchParams.set(key, value); });
      return Promise.resolve(fetch(url.toString(), requestOptions));
    } catch (error) {
      return Promise.reject(error);
    }
  }
  function readHtmlPayload(response) {
    if (response == null) return Promise.resolve("");
    if (typeof response === "string") return Promise.resolve(response);
    if (typeof response.ok === "boolean" && response.ok === false) {
      var fail = (typeof response.json === "function") ? Promise.resolve(response.json()) : Promise.resolve(response);
      return fail.then(function (data) { throw new Error((data && data.error && data.error.message) || "设置子页面加载失败"); });
    }
    if (typeof response.text === "function") return Promise.resolve(response.text());
    if (typeof response.json === "function") return Promise.resolve(response.json()).then(function (data) { return typeof data === "string" ? data : JSON.stringify(data); });
    return Promise.resolve(String(response));
  }
  function setStatus(text, kind) { $("settings-shell-status").textContent = text; $("settings-shell-status").className = "settings-shell-status" + (kind ? " " + kind : ""); }
  function updateNavigation(view) { document.querySelectorAll("[data-settings-shell-view]").forEach(function (item) { item.classList.toggle("active", item.getAttribute("data-settings-shell-view") === view); }); var meta = viewMeta[view] || viewMeta.general; $("settings-shell-view-title").textContent = meta.title; $("settings-shell-view-description").textContent = meta.description; }
  function mountFragment(html, view) {
    var parsed = new DOMParser().parseFromString(String(html || ""), "text/html");
    if (!parsed || !parsed.body) throw new Error("设置子页面返回内容为空");
    document.querySelectorAll("style[data-settings-view-style]").forEach(function (style) { style.remove(); });
    parsed.querySelectorAll("style[data-settings-view-style]").forEach(function (style) { var copy = document.createElement("style"); copy.setAttribute("data-settings-view-style", "true"); copy.textContent = style.textContent || ""; document.head.appendChild(copy); });
    var scripts = Array.prototype.slice.call(parsed.querySelectorAll("script"));
    var fragment = document.createDocumentFragment();
    Array.prototype.slice.call(parsed.body.childNodes).filter(function (node) { return node.nodeName !== "STYLE" && node.nodeName !== "SCRIPT"; }).forEach(function (node) { fragment.appendChild(document.importNode(node, true)); });
    window.dispatchEvent(new Event("notification-hub-view-before-unload"));
    $("settings-view-content").replaceChildren(fragment);
    updateNavigation(view);
    scripts.forEach(function (source) { try { var script = document.createElement("script"); script.textContent = source.textContent || ""; document.body.appendChild(script); } catch (error) { setStatus("子页面脚本挂载失败 · SETTINGS_VIEW_SCRIPT_MOUNT_FAILED", "error"); throw Object.assign(error, { code: "SETTINGS_VIEW_SCRIPT_MOUNT_FAILED" }); } });
    currentView = view;
    setStatus("已读取", "success");
  }
  function loadView(view, force) {
    if (!viewMeta[view] || viewMeta[view].comingSoon || (view === currentView && !force)) return;
    setStatus("正在读取…", "");
    Promise.resolve(requestHtml("settings-content?view=" + encodeURIComponent(view))).then(readHtmlPayload).then(function (html) { mountFragment(html, view); }).catch(function (error) { setStatus(error.message || "设置子页面加载失败", "error"); });
  }
  window.NotificationHubSettingsShell = { loadView: loadView, mount: mountFragment };
  document.addEventListener("notification-hub-settings-status", function (event) { var detail = event && event.detail || {}; if (detail.text) setStatus(detail.text, detail.kind || "success"); });
  document.querySelectorAll("[data-settings-shell-view]").forEach(function (item) { item.addEventListener("click", function () { loadView(item.getAttribute("data-settings-shell-view")); }); });
  document.addEventListener("wheel", function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    if (target.closest("input, select, textarea")) event.preventDefault();
  }, { capture: true, passive: false });
  window.parent.postMessage({ type: "ready" }, "*");
}());
</script>
${PAGE_NAVIGATION_SCRIPT}
</body>
</html>`;
}

export function renderSettingsPage(currentUrl = '', displayInitialData = null, soundInitialData = null, visualInitialData = null) {
  const view = readView(currentUrl);
  const initialView = SETTINGS_VIEWS[view] && !SETTINGS_VIEWS[view].comingSoon ? view : 'general';
  const content = initialView === 'sound'
    ? renderSoundSettingsFragment(currentUrl, soundInitialData)
    : initialView === 'visual'
      ? renderVisualSettingsFragment(currentUrl, visualInitialData)
      : renderGeneralSettingsFragment(currentUrl, displayInitialData);
  return renderSettingsShell(currentUrl, content, initialView);
}

export function renderSettingsContent(view = 'general', currentUrl = '', plugin = null) {
  if (!SETTINGS_VIEWS[view] || SETTINGS_VIEWS[view].comingSoon) {
    const error = Object.assign(new Error(SETTINGS_ERROR_MESSAGES.SETTINGS_VIEW_INVALID), { code: 'SETTINGS_VIEW_INVALID' });
    throw error;
  }
  if (view === 'sound') return renderSoundSettingsFragment(currentUrl, typeof plugin?.getSoundSettingsStatus === 'function' ? plugin.getSoundSettingsStatus() : null);
  if (view === 'visual') return renderVisualSettingsFragment(currentUrl, typeof plugin?.getVisualSettingsStatus === 'function' ? plugin.getVisualSettingsStatus() : null);
  return renderGeneralSettingsFragment(currentUrl, typeof plugin?.getNotificationDisplaySettings === 'function' ? plugin.getNotificationDisplaySettings() : null);
}

export default function registerSettingsRoute(app, ctx) {
  const getPlugin = () => ctx?._notificationHubVNextSettingsApi ?? ctx?._notificationHubVNextPlugin;
  const getSoundSettingsServices = () => ctx?._notificationHubVNextSoundSettingsServices
    ?? (ctx?._notificationHubVNextSettingsApi ? createSoundSettingsServices({ settingsApi: ctx._notificationHubVNextSettingsApi }) : null);
  const getSoundAssetServices = () => ctx?._notificationHubVNextSoundAssetServices
    ?? (ctx?._notificationHubVNextSettingsApi ? createSoundAssetServices({ settingsApi: ctx._notificationHubVNextSettingsApi }) : null);
  app.get('/settings', (c) => {
    const currentUrl = c?.req?.url ?? c?.req?.raw?.url ?? '';
    const plugin = getPlugin();
    const view = readView(currentUrl);
    const displayInitialData = typeof plugin?.getNotificationDisplaySettings === 'function' ? plugin.getNotificationDisplaySettings() : null;
    const soundServices = getSoundSettingsServices();
    const soundInitialData = typeof soundServices?.getSoundSettingsStatus === 'function' ? soundServices.getSoundSettingsStatus() : null;
    const visualInitialData = typeof plugin?.getVisualSettingsStatus === 'function' ? plugin.getVisualSettingsStatus() : null;
    const eventInitialData = typeof plugin?.getEventPresentationSettings === 'function' ? plugin.getEventPresentationSettings() : null;
    return c.html(renderSettingsPage(currentUrl, displayInitialData, soundInitialData, visualInitialData, eventInitialData));
  });
  app.get('/settings-content', (c) => {
    try {
      const currentUrl = c?.req?.url ?? c?.req?.raw?.url ?? '';
      const view = readView(currentUrl);
      if (typeof c.header === 'function') c.header('Cache-Control', 'no-store');
      return c.html(renderSettingsContent(view, currentUrl, view === 'sound' ? getSoundSettingsServices() : getPlugin()));
    } catch (error) {
      return c.json({ ok: false, error: errorPayload(error) }, error?.code === 'SETTINGS_VIEW_INVALID' ? 400 : 503);
    }
  });
  app.get('/settings-status', async (c) => {
    try { const plugin = getPlugin(); if (!plugin?.getSettingsStatus) return c.json({ ok: false, error: { code: 'SETTINGS_API_UNAVAILABLE', message: 'Settings API unavailable' } }, 503); return c.json(await plugin.getSettingsStatus()); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 500); }
  });
  app.get('/event-presentation-settings', async (c) => {
    try { const plugin = getPlugin(); if (!plugin?.getEventPresentationSettings) return c.json({ ok: false, error: { code: 'EVENT_PRESENTATION_API_UNAVAILABLE', message: 'Event presentation API unavailable' } }, 503); return c.json({ ok: true, ...plugin.getEventPresentationSettings() }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 500); }
  });
  app.post('/event-presentation-settings', async (c) => {
    try { const plugin = getPlugin(); if (!plugin?.updateEventPresentationSettings) return c.json({ ok: false, error: { code: 'EVENT_PRESENTATION_API_UNAVAILABLE', message: 'Event presentation API unavailable' } }, 503); return c.json({ ok: true, ...await plugin.updateEventPresentationSettings(await readJsonBody(c)) }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 400); }
  });
  app.get('/visual-profiles', (c) => {
    try { const plugin = getPlugin(); if (!plugin?.listVisualProfiles) return c.json({ ok: false, error: { code: 'VISUAL_PROFILE_API_UNAVAILABLE', message: '视觉方案 API 暂不可用。' } }, 503); return c.json({ ok: true, profiles: plugin.listVisualProfiles() }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 500); }
  });
  app.post('/visual-profiles/save', async (c) => {
    try { const plugin = getPlugin(); if (!plugin?.saveVisualProfile) return c.json({ ok: false, error: { code: 'VISUAL_PROFILE_API_UNAVAILABLE', message: '视觉方案 API 暂不可用。' } }, 503); return c.json({ ok: true, profile: plugin.saveVisualProfile(await readJsonBody(c)) }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 400); }
  });
  app.delete('/visual-profiles/:profileId', (c) => {
    try { const plugin = getPlugin(); if (!plugin?.removeVisualProfile) return c.json({ ok: false, error: { code: 'VISUAL_PROFILE_API_UNAVAILABLE', message: '视觉方案 API 暂不可用。' } }, 503); return c.json({ ok: true, ...plugin.removeVisualProfile(c.req.param('profileId')) }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, error?.code === 'VISUAL_PROFILE_REGISTRY_IN_USE' ? 409 : error?.code === 'VISUAL_PROFILE_REGISTRY_NOT_FOUND' ? 404 : 400); }
  });
  app.post('/visual-profiles/preview-apply', async (c) => {
    try { const plugin = getPlugin(); if (!plugin?.previewApplyVisualProfile) return c.json({ ok: false, error: { code: 'VISUAL_PROFILE_API_UNAVAILABLE', message: '视觉方案 API 暂不可用。' } }, 503); return c.json({ ok: true, preview: plugin.previewApplyVisualProfile(await readJsonBody(c)) }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 400); }
  });
  app.post('/visual-profiles/apply', async (c) => {
    try { const plugin = getPlugin(); if (!plugin?.applyVisualProfileToEvents) return c.json({ ok: false, error: { code: 'VISUAL_PROFILE_API_UNAVAILABLE', message: '视觉方案 API 暂不可用。' } }, 503); return c.json({ ok: true, result: plugin.applyVisualProfileToEvents(await readJsonBody(c)) }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 400); }
  });
  app.get('/visual-registry-persistence-status', (c) => {
    try { const plugin = getPlugin(); if (!plugin?.getVisualRegistryPersistenceStatus) return c.json({ ok: false, error: { code: 'VISUAL_EVENT_API_UNAVAILABLE', message: 'Visual event API unavailable' } }, 503); return c.json({ ok: true, persistence: plugin.getVisualRegistryPersistenceStatus() }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 500); }
  });
  app.get('/custom-visual-events', (c) => {
    try { const plugin = getPlugin(); if (!plugin?.listCustomVisualEvents) return c.json({ ok: false, error: { code: 'VISUAL_EVENT_API_UNAVAILABLE', message: 'Visual event API unavailable' } }, 503); return c.json({ ok: true, events: plugin.listCustomVisualEvents() }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 500); }
  });
  app.post('/custom-visual-events/restore-default', async (c) => {
    try { const plugin = getPlugin(); if (!plugin?.restoreVisualEventDefault) return c.json({ ok: false, error: { code: 'VISUAL_EVENT_API_UNAVAILABLE', message: 'Visual event API unavailable' } }, 503); const body = await readJsonBody(c); return c.json({ ok: true, ...plugin.restoreVisualEventDefault(body.eventId) }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 400); }
  });
  app.get('/sound-settings-status', async (c) => {
    try { const plugin = getSoundSettingsServices(); if (!plugin?.getSoundSettingsStatus) return c.json({ ok: false, error: { code: 'SOUND_SETTINGS_API_UNAVAILABLE', message: 'Sound settings API unavailable' } }, 503); return c.json({ ok: true, ...plugin.getSoundSettingsStatus() }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 500); }
  });
  app.post('/sound-settings-update', async (c) => {
    try { const plugin = getSoundSettingsServices(); if (!plugin?.updateSoundSettings) return c.json(unavailablePayload('SOUND_SETTINGS_API_UNAVAILABLE', 'Sound settings API unavailable'), 503); return c.json({ ok: true, ...await plugin.updateSoundSettings(await readJsonBody(c)) }); }
    catch (error) { const status = error?.code === 'ROUTE_INVALID_JSON' || error?.code?.startsWith('SOUND_SETTINGS_') || error?.code === 'NOTIFICATION_API_SOUND_PROFILE_INVALID' ? 400 : 500; return c.json({ ok: false, error: errorPayload(error, SETTINGS_ERROR_MESSAGES, 'SOUND_SETTINGS_ROUTE_FAILED') }, status); }
  });
  app.post('/sound-settings-rule-test', async (c) => {
    try { const plugin = getSoundSettingsServices(); if (!plugin?.previewSoundSettings) return c.json(unavailablePayload('SOUND_SETTINGS_API_UNAVAILABLE', 'Sound settings API unavailable'), 503); return c.json({ ok: true, ...plugin.previewSoundSettings(await readJsonBody(c)) }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, settingsRouteStatus(error, ['SOUND_SETTINGS_PREVIEW_INPUT_INVALID'])); }
  });
  app.post('/sound-settings-test', async (c) => {
    try { const plugin = getSoundSettingsServices(); if (!plugin?.testSoundSettings) return c.json(unavailablePayload('SOUND_SETTINGS_API_UNAVAILABLE', 'Sound settings API unavailable'), 503); return c.json({ ok: true, ...await plugin.testSoundSettings(await readJsonBody(c)) }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, settingsRouteStatus(error, ['SOUND_SETTINGS_PREVIEW_INPUT_INVALID'])); }
  });
  app.post('/sound-rule-explain', async (c) => {
    try { const plugin = getSoundSettingsServices(); if (!plugin?.explainSoundSettings) return c.json(unavailablePayload('SOUND_SETTINGS_API_UNAVAILABLE', 'Sound settings API unavailable'), 503); return c.json({ ok: true, ...plugin.explainSoundSettings(await readJsonBody(c)) }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, settingsRouteStatus(error, ['SOUND_SETTINGS_PREVIEW_INPUT_INVALID'])); }
  });
  app.post('/sound-workbench-run', async (c) => {
    try { const plugin = getSoundSettingsServices(); if (!plugin?.runSoundWorkbench) return c.json({ ok: false, error: { code: 'SOUND_SETTINGS_API_UNAVAILABLE', message: 'Sound settings API unavailable' } }, 503); return c.json({ ok: true, ...await plugin.runSoundWorkbench(await readJsonBody(c)) }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, error?.code === 'SOUND_WORKBENCH_INPUT_INVALID' || error?.code === 'SOUND_SETTINGS_PREVIEW_INPUT_INVALID' ? 400 : 503); }
  });
  app.post('/sound-diagnostics-clear', async (c) => {
    try { const plugin = getSoundSettingsServices(); if (!plugin?.clearSoundDiagnostics) return c.json({ ok: false, error: { code: 'SOUND_DIAGNOSTICS_API_UNAVAILABLE', message: 'Sound diagnostics API unavailable' } }, 503); return c.json({ ok: true, ...plugin.clearSoundDiagnostics() }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 503); }
  });
  app.post('/sound-diagnostics-export', async (c) => {
    try { const plugin = getSoundSettingsServices(); if (!plugin?.exportSoundDiagnostics) return c.json({ ok: false, error: { code: 'SOUND_DIAGNOSTICS_API_UNAVAILABLE', message: 'Sound diagnostics API unavailable' } }, 503); return c.json({ ok: true, ...await plugin.exportSoundDiagnostics(await readJsonBody(c)) }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 503); }
  });
  app.get('/sound-assets-status', async (c) => {
    try { const plugin = getSoundAssetServices(); if (!plugin?.getSoundAssetStatus) return c.json({ ok: false, error: { code: 'SOUND_ASSET_API_UNAVAILABLE', message: 'Sound asset API unavailable' } }, 503); return c.json({ ok: true, ...plugin.getSoundAssetStatus() }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 500); }
  });
  app.post('/sound-combo-package-import', async (c) => {
    try { const plugin = getSoundAssetServices(); if (!plugin?.importSoundComboPackage) return c.json({ ok: false, error: { code: 'SOUND_ASSET_API_UNAVAILABLE', message: 'Sound combo package API unavailable' } }, 503); return c.json({ ok: true, ...(await plugin.importSoundComboPackage(await readJsonBody(c))) }); }
    catch (error) { const status = error?.code?.startsWith('SOUND_COMBO_PACKAGE_') || error?.code?.startsWith('SOUND_PACKAGE_') ? 400 : 503; return c.json({ ok: false, error: errorPayload(error) }, status); }
  });
  app.post('/sound-package-import', async (c) => {
    try { const plugin = getSoundAssetServices(); if (!plugin?.importSoundPackage) return c.json({ ok: false, error: { code: 'SOUND_ASSET_API_UNAVAILABLE', message: 'Sound package API unavailable' } }, 503); return c.json({ ok: true, ...(await plugin.importSoundPackage(await readJsonBody(c))) }); }
    catch (error) { const status = error?.code?.startsWith('SOUND_PACKAGE_') ? 400 : 503; return c.json({ ok: false, error: errorPayload(error) }, status); }
  });
  app.post('/sound-asset-configure', async (c) => {
    try {
      const plugin = getSoundAssetServices();
      if (!plugin?.updateSoundAssetConfiguration) return c.json(soundAssetUnavailable('SOUND_ASSET_API_UNAVAILABLE', 'Sound asset API unavailable'), 503);
      return c.json({ ok: true, ...(await plugin.updateSoundAssetConfiguration(await readJsonBody(c))) });
    } catch (error) {
      const clientValidation = new Set(['SOUND_ASSET_ID_INVALID', 'SOUND_ASSET_BUILTIN_IMMUTABLE', 'SOUND_ASSET_CATEGORIES_INVALID', 'SOUND_BINDING_VALUE_INVALID', 'SOUND_BINDING_VOLUME_INVALID']);
      return c.json({ ok: false, error: errorPayload(error) }, settingsRouteStatus(error, clientValidation));
    }
  });
  app.post('/sound-asset-delete', async (c) => {
    try {
      const plugin = getSoundAssetServices();
      if (!plugin?.deleteSoundAsset) return c.json(soundAssetUnavailable('SOUND_ASSET_API_UNAVAILABLE', 'Sound asset API unavailable'), 503);
      return c.json({ ok: true, ...(await plugin.deleteSoundAsset(await readJsonBody(c))) });
    } catch (error) {
      const clientValidation = new Set(['SOUND_ASSET_ID_INVALID', 'SOUND_ASSET_BUILTIN_IMMUTABLE', 'SOUND_ASSET_PATH_INVALID']);
      return c.json({ ok: false, error: errorPayload(error) }, settingsRouteStatus(error, clientValidation));
    }
  });
  app.post('/sound-binding-remove', async (c) => {
    try {
      const plugin = getSoundAssetServices();
      if (!plugin?.removeSoundBindingConfiguration) return c.json({ ok: false, error: { code: 'SOUND_BINDING_API_UNAVAILABLE', message: 'Sound binding API unavailable' } }, 503);
      return c.json({ ok: true, ...(await plugin.removeSoundBindingConfiguration(await readJsonBody(c))) });
    } catch (error) {
      const status = error?.code === 'SOUND_BINDING_VALUE_INVALID' ? 400 : 503;
      return c.json({ ok: false, error: errorPayload(error) }, status);
    }
  });
  app.post('/sound-asset-import', async (c) => {
    try {
      const plugin = getSoundAssetServices();
      if (!plugin?.importSoundAsset) return c.json(soundAssetUnavailable('SOUND_ASSET_API_UNAVAILABLE', 'Sound asset API unavailable'), 503);
      const contentType = c.req.header?.('content-type') || '';
      if (contentType.includes('application/json')) {
        const body = await readJsonBody(c);
        if (!body?.resource || typeof body.resource !== 'object') {
          const error = Object.assign(new Error('resource is required'), { code: 'SOUND_ASSET_FILE_INVALID', details: { field: 'resource' } });
          return c.json({ ok: false, error: errorPayload(error) }, 400);
        }
        return c.json({ ok: true, ...(await plugin.importSoundAsset({ resource: body.resource, name: body.name, soundId: body.soundId, binding: body.binding, volume: body.volume, replaceExisting: body.replaceExisting === true })) });
      }
      const form = await c.req.parseBody();
      const audio = form?.audio;
      if (!audio || typeof audio.arrayBuffer !== 'function') {
        const error = Object.assign(new Error('audio file is required'), { code: 'SOUND_ASSET_FILE_INVALID', details: { field: 'audio' } });
        return c.json({ ok: false, error: errorPayload(error) }, 400);
      }
      let binding;
      if (form.binding) {
        try { binding = JSON.parse(String(form.binding)); } catch { throw Object.assign(new Error('binding must be valid JSON'), { code: 'SOUND_ASSET_BINDING_INVALID' }); }
      }
      return c.json({ ok: true, ...(await plugin.importSoundAsset({ file: audio, name: form.name, soundId: form.soundId, binding, volume: form.volume == null || form.volume === '' ? undefined : Number(form.volume), replaceExisting: String(form.replaceExisting).toLowerCase() === 'true' })) });
    } catch (error) {
      const clientValidation = new Set(['SOUND_ASSET_ID_INVALID', 'SOUND_ASSET_FILE_INVALID', 'SOUND_ASSET_FORMAT_INVALID', 'SOUND_ASSET_NAME_INVALID', 'SOUND_ASSET_BINDING_INVALID', 'SOUND_BINDING_VALUE_INVALID']);
      return c.json({ ok: false, error: errorPayload(error) }, settingsRouteStatus(error, clientValidation));
    }
  });
  app.post('/sound-combo-package-export', async (c) => {
    try { const plugin = getSoundAssetServices(); if (!plugin?.exportSoundComboPackage) return c.json(soundAssetUnavailable('SOUND_ASSET_API_UNAVAILABLE', 'Sound combo package API unavailable'), 503); return c.json({ ok: true, ...(await plugin.exportSoundComboPackage(await readJsonBody(c))) }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, settingsRouteStatus(error, ['SOUND_PACKAGE_DESTINATION_INVALID', 'SOUND_PACKAGE_EXPORT_CANCELLED'])); }
  });
  app.post('/sound-package-export', async (c) => {
    try { const plugin = getSoundAssetServices(); if (!plugin?.exportSoundPackage) return c.json(soundAssetUnavailable('SOUND_ASSET_API_UNAVAILABLE', 'Sound package API unavailable'), 503); return c.json({ ok: true, ...(await plugin.exportSoundPackage(await readJsonBody(c))) }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, settingsRouteStatus(error, ['SOUND_PACKAGE_DESTINATION_INVALID', 'SOUND_PACKAGE_EXPORT_CANCELLED'])); }
  });
  app.post('/sound-asset-test', async (c) => {
    try { const plugin = getSoundAssetServices(); if (!plugin?.testSoundAsset) return c.json(soundAssetUnavailable('SOUND_ASSET_API_UNAVAILABLE', 'Sound asset API unavailable'), 503); return c.json({ ok: true, ...(await plugin.testSoundAsset(await readJsonBody(c))) }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, settingsRouteStatus(error, ['SOUND_ASSET_ID_INVALID'])); }
  });
  app.post('/settings-update', async (c) => {
    try { const plugin = getPlugin(); if (!plugin?.updateSettings) return c.json(unavailablePayload('SETTINGS_API_UNAVAILABLE', 'Settings API unavailable'), 503); return c.json({ ok: true, ...(await plugin.updateSettings(await readJsonBody(c))) }); }
    catch (error) { const status = error?.code === 'ROUTE_INVALID_JSON' || error?.code?.startsWith('SOUND_SETTINGS_') || error?.code === 'SETTINGS_STORE_PATCH_INVALID' ? 400 : 500; return c.json({ ok: false, error: errorPayload(error, SETTINGS_ERROR_MESSAGES, 'SETTINGS_ROUTE_FAILED') }, status); }
  });
  app.get('/notification-display-settings', async (c) => {
    try { const plugin = getPlugin(); if (!plugin?.getNotificationDisplaySettings) return c.json({ ok: false, error: { code: 'SETTINGS_API_UNAVAILABLE', message: 'Settings API unavailable' } }, 503); return c.json({ ok: true, ...plugin.getNotificationDisplaySettings() }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 500); }
  });
  app.post('/notification-display-settings', async (c) => {
    try { const plugin = getPlugin(); if (!plugin?.updateNotificationDisplaySettings) return c.json(unavailablePayload('SETTINGS_API_UNAVAILABLE', 'Settings API unavailable'), 503); return c.json({ ok: true, ...await plugin.updateNotificationDisplaySettings(await readJsonBody(c)) }); }
    catch (error) { const status = error?.code === 'ROUTE_INVALID_JSON' || ['NOTIFICATION_DISPLAY_SETTINGS_CUSTOM_INVALID', 'NOTIFICATION_DISPLAY_SETTINGS_PRESET_INVALID', 'NOTIFICATION_DISPLAY_SETTINGS_MODE_INVALID', 'NOTIFICATION_DISPLAY_SETTINGS_UNLIMITED_INVALID', 'NOTIFICATION_CARD_LIFETIME_INVALID'].includes(error?.code) ? 400 : 500; return c.json({ ok: false, error: errorPayload(error, SETTINGS_ERROR_MESSAGES, 'SETTINGS_ROUTE_FAILED') }, status); }
  });
  app.post('/settings-retry', async (c) => {
    try { const plugin = getPlugin(); if (!plugin?.retrySettingsApply) return c.json({ ok: false, error: { code: 'SETTINGS_API_UNAVAILABLE', message: 'Settings API unavailable' } }, 503); return c.json({ ok: true, ...(await plugin.retrySettingsApply()) }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error) }, 503); }
  });
  app.post('/layout-update', async (c) => {
    try { const plugin = getPlugin(); if (!plugin?.updateLayoutSettings) return c.json(unavailablePayload('LAYOUT_API_UNAVAILABLE', 'Layout API unavailable'), 503); return c.json({ ok: true, ...(await plugin.updateLayoutSettings(await readJsonBody(c))) }); }
    catch (error) { return c.json({ ok: false, error: errorPayload(error, SETTINGS_ERROR_MESSAGES, 'SETTINGS_ROUTE_FAILED') }, error?.code === 'ROUTE_INVALID_JSON' || error?.code === 'RUNTIME_LAYOUT_INVALID' ? 400 : 500); }
  });
}
