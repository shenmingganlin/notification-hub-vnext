const NAVIGATION_ITEMS = Object.freeze([
  {
    id: 'notification-center',
    title: '通知中心',
    description: '查看历史通知与详情',
    path: '#notification-center',
    icon: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>'
  },
  {
    id: 'settings',
    title: '设置',
    description: '声音、布局与显示策略',
    path: '#settings',
    icon: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'
  },
  {
    id: 'runtime',
    title: 'Runtime',
    description: '桌面场景与运行状态',
    path: '#runtime',
    icon: '<rect x="4" y="5" width="16" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>'
  },
  {
    id: 'diagnostics',
    title: '诊断',
    description: '错误、恢复与运行证据',
    path: '#diagnostics',
    icon: '<path d="M12 3 3.8 6v5.8c0 4.5 3.4 7.5 8.2 9.2 4.8-1.7 8.2-4.7 8.2-9.2V6L12 3z"/><path d="m9 12 2 2 4-4"/>'
  }
]);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function navigationSurfaceLink(path, currentUrl) {
  const rawCurrentUrl = typeof currentUrl === 'string' ? currentUrl.trim() : '';
  const isAbsoluteUrl = /^[a-z][a-z\d+.-]*:/i.test(rawCurrentUrl);
  const base = new URL(rawCurrentUrl || '/', 'http://notification-hub.local/');
  const rawTarget = String(path);
  if (rawTarget.startsWith('#')) return rawTarget;
  const target = rawTarget.replace(/^\/+/, '');
  const currentPath = base.pathname.replace(/\/+$/, '');
  const pluginPrefixMatch = currentPath.match(/^(.*\/api\/plugins\/[^/]+)(?:\/[^/]*)?$/);
  const currentRouteRoot = currentPath.slice(0, currentPath.lastIndexOf('/') + 1);
  const targetPath = pluginPrefixMatch
    ? `${pluginPrefixMatch[1]}/${target}`
    : `${currentRouteRoot}${target}`;
  const url = new URL(targetPath || `/${target}`, base.origin);
  // 页面文档重新导航需要保留 iframe ticket；它只用于加载页面文档，不能用于页面内 API 请求。
  for (const key of ['pluginIframeTicket', 'token', 'pluginSurfaceSession']) {
    const value = base.searchParams.get(key);
    if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  if (isAbsoluteUrl) return url.toString();
  if (!pluginPrefixMatch && !currentPath.includes('/')) return `${target}${url.search}${url.hash}`;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function renderPageNavigation({ active = '', currentUrl = '', includeDiagnostics = true } = {}) {
  const items = includeDiagnostics ? NAVIGATION_ITEMS : NAVIGATION_ITEMS.filter((item) => item.id !== 'diagnostics');
  return `<nav class="page-navigation" aria-label="Notification Hub 主导航">${items.map((item) => {
    const selected = active === item.id;
    const label = item.comingSoon ? `${item.title}（即将开放）` : item.title;
    const classes = `page-navigation-card${selected ? ' active' : ''}${item.comingSoon ? ' coming-soon' : ''}`;
    const body = `<span class="page-navigation-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg></span><span class="page-navigation-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.description)}</small></span>${item.comingSoon ? '<span class="page-navigation-badge">即将开放</span>' : ''}`;
    return item.comingSoon
      ? `<span class="${classes}" aria-label="${escapeHtml(label)}" aria-disabled="true">${body}</span>`
      : `<a class="${classes}" id="page-nav-${item.id}" href="${escapeHtml(navigationSurfaceLink(item.path, currentUrl))}" data-page-navigation-path="${escapeHtml(item.path)}" aria-current="${selected ? 'page' : 'false'}" aria-label="${escapeHtml(label)}">${body}</a>`;
  }).join('')}</nav>`;
}

export const PAGE_NAVIGATION_SCRIPT = `<script>
(function () {
  "use strict";
  var authKeys = ["pluginIframeTicket", "pluginSurfaceSession", "token", "hana-theme", "hana-css"];
  function routeUrl(path) {
    if (window.hana && window.hana.api && typeof window.hana.api.url === "function") return window.hana.api.url(path);
    var current = new URL(window.location.href);
    var root = current.pathname.slice(0, current.pathname.lastIndexOf("/") + 1);
    var target = new URL(path.replace(/^\\/+/, ""), current.origin + root);
    authKeys.slice(1).forEach(function (key) {
      var value = current.searchParams.get(key);
      if (value) target.searchParams.set(key, value);
    });
    return target.toString();
  }
  function requestHtml(path) {
    if (window.hana && window.hana.api && typeof window.hana.api.fetch === "function") return window.hana.api.fetch(path);
    return fetch(routeUrl(path));
  }
  function mountHtml(html) {
    var parsed = new DOMParser().parseFromString(String(html || ""), "text/html");
    if (!parsed || !parsed.body || !parsed.body.children.length) throw new Error("页面加载失败：返回内容为空");
    document.querySelectorAll("style[data-hana-page-style]").forEach(function (style) { style.remove(); });
    parsed.head.querySelectorAll("style").forEach(function (style) {
      var copy = document.createElement("style");
      copy.setAttribute("data-hana-page-style", "true");
      copy.textContent = style.textContent || "";
      document.head.appendChild(copy);
    });
    if (parsed.title) document.title = parsed.title;
    window.dispatchEvent(new Event("notification-hub-view-before-unload"));
    var scripts = Array.prototype.slice.call(parsed.body.querySelectorAll("script"));
    var bodyNodes = Array.prototype.slice.call(parsed.body.childNodes).filter(function (node) { return node.nodeName !== "SCRIPT"; });
    var fragment = document.createDocumentFragment();
    bodyNodes.forEach(function (node) { fragment.appendChild(document.importNode(node, true)); });
    document.body.replaceChildren(fragment);
    scripts.forEach(function (source) {
      var script = document.createElement("script");
      Array.prototype.slice.call(source.attributes || []).forEach(function (attribute) { script.setAttribute(attribute.name, attribute.value); });
      script.textContent = source.textContent || "";
      document.body.appendChild(script);
    });
  }
  function loadRoute(path) {
    requestHtml(path).then(function (response) {
      if (!response.ok) throw new Error("页面加载失败（HTTP " + response.status + "）");
      return response.text();
    }).then(mountHtml).catch(function (error) {
      var message = document.createElement("p");
      message.textContent = error.message || "页面加载失败";
      message.style.cssText = "margin:32px;color:#f18c8c;font:14px Segoe UI,sans-serif";
      document.body.replaceChildren(message);
    });
  }
  document.head.querySelectorAll("style").forEach(function (style) { style.setAttribute("data-hana-page-style", "true"); });
  window.NotificationHubPageRouter = { load: loadRoute, mount: mountHtml };
  function loadView(view) { loadRoute(view === "settings" ? "settings" : (view === "runtime" ? "runtime" : (view === "diagnostics" ? "diagnostics" : "notification-center"))); }
  document.querySelectorAll("[data-page-navigation-path]").forEach(function (link) {
    var path = link.getAttribute("data-page-navigation-path") || "";
    if (path.startsWith("#")) {
      link.addEventListener("click", function (event) {
        event.preventDefault();
        loadView(path.slice(1));
      });
      return;
    }
    try {
      var current = new URL(window.location.href);
      var target = new URL(path, current.href);
      var auth = new URLSearchParams();
      authKeys.forEach(function (key) {
        var value = current.searchParams.get(key);
        if (value) auth.set(key, value);
      });
      target.search = auth.toString();
      link.href = target.toString();
    } catch (_) {
      // Keep the server-rendered fallback href when the host URL is unavailable.
    }
  });
}());
</script>`;

export const PAGE_NAVIGATION_STYLE = `
.page-navigation { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 0 0 26px; }
.page-navigation-card { position: relative; display: flex; min-width: 0; min-height: 68px; align-items: center; gap: 10px; padding: 12px 13px; border: 1px solid var(--line); border-radius: 11px; background: var(--surface); color: var(--text); text-decoration: none; transition: border-color .15s, background .15s, transform .15s; }
.page-navigation-card:hover { border-color: var(--accent); background: var(--surface-raised); transform: translateY(-1px); }
.page-navigation-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.page-navigation-card.active { border-color: var(--accent-strong); background: rgba(56,184,141,.12); box-shadow: inset 0 -2px 0 var(--accent-strong); }
.page-navigation-card.coming-soon { cursor: default; opacity: .58; }
.page-navigation-icon { display: inline-grid; flex: 0 0 28px; place-items: center; width: 28px; height: 28px; color: var(--accent); }
.page-navigation-icon svg { width: 22px; height: 22px; }
.page-navigation-copy { display: grid; min-width: 0; gap: 2px; }
.page-navigation-copy strong, .page-navigation-copy small { min-width: 0; overflow-wrap:anywhere; }
.page-navigation-copy strong { font-size: 13px; font-weight: 700; }
.page-navigation-copy small { color: var(--muted); font-size: 11px; line-height: 1.3; }
.page-navigation-badge { position: absolute; right: 8px; bottom: 7px; color: var(--muted); font-size: 10px; }
@media (max-width: 840px) { .page-navigation { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 480px) { .page-navigation { grid-template-columns: 1fr; } }
`;
