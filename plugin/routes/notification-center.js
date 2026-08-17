import {
  isApiProducedNotification,
  projectNotificationCategories
} from '../domain/notification-classification.js';
import { filterNotificationsByCategories } from '../domain/notification-category-filter.js';
import { filterNotificationsByEvents } from '../domain/notification-event-filter.js';
import { renderSettingsPage } from './settings.js';
import { PAGE_NAVIGATION_SCRIPT, PAGE_NAVIGATION_STYLE, renderPageNavigation } from './page-navigation.js';

const DISPLAY_LIMIT_MAX = 10000;

const ERROR_MESSAGES = Object.freeze({
  NOTIFICATION_DISPLAY_LIMIT_INVALID: '通知显示上限必须是 30、100、500、1000、无限或 1 到 10000 的整数。',
  NOTIFICATION_CENTER_API_UNAVAILABLE: '通知中心暂时不可用。',
  NOTIFICATION_STORE_LOAD_FAILED: '通知列表读取失败。',
  NOTIFICATION_STORE_NOT_FOUND: '通知不存在。',
  NOTIFICATION_CENTER_QUERY_INVALID: '筛选条件不正确。',
  NOTIFICATION_CATEGORY_FILTER_INVALID: '通知分类筛选条件不正确。',
  NOTIFICATION_CATEGORY_FILTER_MATCH_INVALID: '通知分类匹配方式不正确。',
  NOTIFICATION_CATEGORY_FILTER_RECORDS_INVALID: '通知分类筛选数据不正确。',
  NOTIFICATION_EVENT_FILTER_INVALID: '通知事件筛选条件不正确。',
  NOTIFICATION_EVENT_FILTER_MATCH_INVALID: '通知事件匹配方式不正确。',
  NOTIFICATION_EVENT_FILTER_RECORDS_INVALID: '通知事件筛选数据不正确。',
  NOTIFICATION_CENTER_BATCH_INVALID: '批量操作参数不正确。',
  NOTIFICATION_STORE_BATCH_IDS_INVALID: '批量通知 ID 不正确。',
  NOTIFICATION_STORE_BATCH_STATUS_INVALID: '批量状态不受支持。',
  NOTIFICATION_STORE_BATCH_REMOVE_UNAVAILABLE: '批量删除暂不可用。'
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
  const code = error?.code ?? 'NOTIFICATION_CENTER_READ_FAILED';
  return {
    code,
    message: ERROR_MESSAGES[code] ?? error?.message ?? String(error),
    details: error?.details ?? {}
  };
}

function readQueryValue(c, name) {
  if (typeof c?.req?.query === 'function') {
    const value = c.req.query(name);
    if (value !== undefined && value !== '') return value;
  }

  const requestUrl = c?.req?.url ?? c?.req?.raw?.url;
  if (!requestUrl) return undefined;
  try {
    return new URL(requestUrl, 'http://notification-hub.local').searchParams.get(name) ?? undefined;
  } catch {
    return undefined;
  }
}

function readBooleanQuery(c, name) {
  const value = readQueryValue(c, name);
  if (value === undefined || value === '') return undefined;
  return parseBooleanFilterValue(value, name);
}

function readStringQuery(c, name) {
  let value;
  if (typeof c?.req?.query === 'function') value = c.req.query(name);
  if (value === undefined) {
    const requestUrl = c?.req?.url ?? c?.req?.raw?.url;
    if (!requestUrl) return undefined;
    try {
      value = new URL(requestUrl, 'http://notification-hub.local').searchParams.get(name);
    } catch {
      return undefined;
    }
  }
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    const error = new Error(`${name} must be a non-empty string`);
    error.code = 'NOTIFICATION_CENTER_QUERY_INVALID';
    error.details = { field: name };
    throw error;
  }
  return value.trim();
}

function readSourceQuery(c) {
  return readStringQuery(c, 'source');
}

function readChannelKindQuery(c) {
  return readStringQuery(c, 'channelKind');
}

function readProducerKindQuery(c) {
  return readStringQuery(c, 'producerKind');
}

function readSearchQuery(c) {
  return readStringQuery(c, 'search');
}

function readCategoryQuery(c) {
  const value = readStringQuery(c, 'category');
  if (value === undefined) return undefined;
  return value.split(',').map((category) => category.trim()).filter(Boolean);
}

function readEventQuery(c) {
  const value = readStringQuery(c, 'event');
  if (value === undefined) return undefined;
  return value.split(',').map((event) => event.trim()).filter(Boolean);
}

function parseBooleanFilterValue(value, name) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const error = new Error(`${name} must be true or false`);
  error.code = 'NOTIFICATION_CENTER_QUERY_INVALID';
  error.details = { field: name };
  throw error;
}

function readDisplayLimitQuery(c) {
  const value = readQueryValue(c, 'limit');
  if (value === undefined || value === '') return undefined;
  if (value === 'unlimited') return null;
  if (!/^\d+$/.test(value)) {
    const error = new Error('limit must be unlimited or a positive integer');
    error.code = 'NOTIFICATION_DISPLAY_LIMIT_INVALID';
    error.details = { field: 'limit', max: DISPLAY_LIMIT_MAX };
    throw error;
  }
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > DISPLAY_LIMIT_MAX) {
    const error = new Error('limit is outside the supported range');
    error.code = 'NOTIFICATION_DISPLAY_LIMIT_INVALID';
    error.details = { field: 'limit', min: 1, max: DISPLAY_LIMIT_MAX };
    throw error;
  }
  return limit;
}

function readBooleanHeader(c, name) {
  if (typeof c?.req?.header !== 'function') return undefined;
  const value = c.req.header(name);
  if (value === undefined || value === '') return undefined;
  return parseBooleanFilterValue(value, name);
}

function mutationStatus(error) {
  if (error?.code === 'NOTIFICATION_STORE_NOT_FOUND') return 404;
  if (error?.code === 'NOTIFICATION_CENTER_BATCH_INVALID'
    || error?.code === 'NOTIFICATION_STORE_BATCH_IDS_INVALID'
    || error?.code === 'NOTIFICATION_STORE_BATCH_STATUS_INVALID') return 400;
  return 500;
}

async function readJsonBody(c) {
  try {
    return await c?.req?.json();
  } catch {
    const error = new Error('Request body must be valid JSON');
    error.code = 'NOTIFICATION_CENTER_BATCH_INVALID';
    error.details = { field: 'body' };
    throw error;
  }
}

function validateBatchBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || !Array.isArray(body.notificationIds)
    || body.notificationIds.some((notificationId) => typeof notificationId !== 'string' || notificationId.trim().length === 0)
    || body.status !== 'read') {
    const error = new Error('notificationIds must be an array of non-empty strings and status must be read');
    error.code = 'NOTIFICATION_CENTER_BATCH_INVALID';
    error.details = { fields: ['notificationIds', 'status'] };
    throw error;
  }
  return {
    notificationIds: [...new Set(body.notificationIds)],
    status: body.status
  };
}

function validateNotificationIdsBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || !Array.isArray(body.notificationIds)
    || body.notificationIds.some((notificationId) => typeof notificationId !== 'string' || notificationId.trim().length === 0)) {
    const error = new Error('notificationIds must be an array of non-empty strings');
    error.code = 'NOTIFICATION_CENTER_BATCH_INVALID';
    error.details = { fields: ['notificationIds'] };
    throw error;
  }
  return [...new Set(body.notificationIds)];
}

function isToolNotification(record) {
  return ['tool_use', 'tool_result', 'tool_error'].includes(record?.type)
    || record?.source === 'hana.tool';
}

function isSystemNotification(record) {
  return record?.type === 'system_notification'
    || record?.type === 'model_service_error'
    || record?.source === 'hana.system'
    || record?.source === 'hana.model'
    || record?.metadata?.eventClassification?.classification === 'model_service';
}

function isExternalChannelNotification(record) {
  return Boolean(record?.channel?.kind && record.channel.kind !== 'chat');
}

function applyResponseFilters(records, { tool, system, channel, channelKind, producerKind, search } = {}) {
  let filtered = Array.isArray(records) ? records : [];
  if (tool !== undefined) {
    filtered = filtered.filter((record) => tool ? isToolNotification(record) : !isToolNotification(record));
  }
  if (system !== undefined) {
    filtered = filtered.filter((record) => system ? isSystemNotification(record) : !isSystemNotification(record));
  }
  if (channel !== undefined) {
    filtered = filtered.filter((record) => channel ? isExternalChannelNotification(record) : !isExternalChannelNotification(record));
  }
  if (channelKind !== undefined) {
    filtered = filtered.filter((record) => record?.channel?.kind === channelKind);
  }
  if (producerKind !== undefined) {
    filtered = filtered.filter((record) => producerKind === 'api'
      ? isApiProducedNotification(record)
      : record?.producer?.kind === producerKind);
  }
  if (search !== undefined) {
    const needle = search.toLocaleLowerCase();
    filtered = filtered.filter((record) => [record?.notificationId, record?.title, record?.summary, record?.content, record?.source, record?.type]
      .filter((value) => typeof value === 'string')
      .some((value) => value.toLocaleLowerCase().includes(needle)));
  }
  return filtered;
}

function importanceLabel(value) {
  return ({
    critical: '紧急',
    high: '重要',
    normal: '普通',
    low: '低'
  })[value] ?? value ?? '未知';
}

function statusLabel(value) {
  return ({
    received: '未处理',
    shown: '已展示',
    acknowledged: '已确认',
    dismissed: '已忽略',
    archived: '已归档'
  })[value] ?? value ?? '未知';
}

function formatTime(value) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? '时间未知' : new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

export function renderNotificationCenterPage(currentUrl = '') {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Notification Center</title>
<style>
:root {
  color-scheme: dark;
  --bg: #0f1614;
  --surface: #17221f;
  --surface-raised: #1d2b27;
  --surface-soft: #14201d;
  --text: #e7f2ee;
  --muted: #9bb1a9;
  --line: #304740;
  --accent: #62d0a8;
  --accent-strong: #38b88d;
  --success: #72d49e;
  --warning: #f3c66d;
  --danger: #f18c8c;
}
* { box-sizing: border-box; }
body { margin: 0; min-width: 300px; background: var(--bg); color: var(--text); font: 14px/1.55 "Segoe UI", "Microsoft YaHei", sans-serif; }
button { min-height: 36px; border: 1px solid var(--line); border-radius: 6px; padding: 7px 14px; background: transparent; color: var(--text); cursor: pointer; font: inherit; font-weight: 650; }
button:hover { border-color: var(--accent); background: var(--surface-raised); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button:disabled { cursor: wait; opacity: .55; }
.shell { width: 100%; max-width: 1120px; margin: 0 auto; padding: 32px 32px 64px; }
.topbar { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 380px); align-items: start; gap: 24px; margin: 0 0 24px; padding: 4px 0 24px; border-bottom: 1px solid var(--line); }
.topbar-actions { display: grid; gap: 10px; justify-items: stretch; }
.notification-search { display: grid; gap: 5px; min-width: 0; color: var(--muted); font-size: 12px; }
.notification-search input { width: 100%; min-height: 38px; padding: 8px 11px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); color: var(--text); }
h1 { margin: 0; font-size: 30px; line-height: 1.15; letter-spacing: -.02em; }
.lead { max-width: 650px; margin: 10px 0 0; color: var(--muted); }
.surface-nav { display: flex; gap: 12px; margin-top: 12px; font-size: 12px; }
.surface-nav a { color: var(--accent); text-decoration: none; }
.surface-nav a:hover { text-decoration: underline; }
.status { display: inline-flex; align-items: center; gap: 8px; min-height: 34px; padding: 7px 11px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); white-space: nowrap; }
.status::before { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); content: ""; }
.status.ready { border-color: rgba(114,212,158,.4); color: var(--success); }
.status.ready::before { background: var(--success); }
.status.error { border-color: rgba(241,140,140,.45); color: var(--danger); }
.status.error::before { background: var(--danger); }
.control-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(300px, .8fr); gap: 14px; margin-bottom: 18px; }
.control-panel { min-width: 0; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); padding: 16px; }
.control-panel h2 { margin: 0; font-size: 14px; line-height: 1.3; }
.control-panel-intro { margin: 5px 0 14px; color: var(--muted); font-size: 12px; }
.filter-panel-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; } .filter-clear { min-height: 30px; padding: 4px 10px; color: var(--muted); font-size: 12px; white-space: nowrap; } .filter-group { display: grid; gap: 7px; margin-top: 16px; } .filter-group:first-of-type { margin-top: 0; } .filter-group > strong { color: var(--text); font-size: 12px; } .filter-control { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; } .advanced-filters { margin-top: 16px; border-top: 1px solid rgba(48,71,64,.7); padding-top: 12px; } .advanced-filters summary { color: var(--muted); cursor: pointer; font-size: 12px; font-weight: 650; } .advanced-filter-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 10px; } .advanced-filter-grid label { display: grid; gap: 5px; color: var(--muted); font-size: 12px; } .advanced-filter-grid select { min-height: 32px; border: 1px solid var(--line); border-radius: 6px; padding: 5px 8px; background: var(--surface-raised); color: var(--text); font: inherit; }
.filter-control button { min-height: 32px; padding: 5px 10px; color: var(--muted); font-size: 12px; }
.filter-control button.active { border-color: var(--accent-strong); background: rgba(56,184,141,.16); color: var(--text); box-shadow: inset 0 -2px 0 var(--accent-strong); }
.summary { flex: 1 0 100%; margin-top: 5px; color: var(--muted); font-size: 12px; }
.display-settings { display: grid; gap: 10px; }
.display-setting-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; padding-top: 10px; border-top: 1px solid rgba(48,71,64,.7); }
.display-setting-row:first-child { padding-top: 0; border-top: 0; }
.display-setting-label strong { display: block; font-size: 13px; }
.display-setting-label small { display: block; margin-top: 2px; color: var(--muted); font-size: 11px; }
.display-limit-control { display: inline-flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: 6px; color: var(--muted); font-size: 12px; }
.display-limit-control select, .display-limit-control input, .lifetime-control select, .lifetime-control input { min-width: 76px; border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; background: var(--surface-raised); color: var(--text); font: inherit; }
.display-limit-custom[hidden] { display: none; }
.lifetime-custom[hidden] { display: none; }
.settings-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.settings-actions button { min-height: 32px; padding: 5px 11px; font-size: 12px; }
.notifications { display: grid; gap: 12px; }
.notification-card { contain: content; content-visibility: auto; contain-intrinsic-size: 180px; border: 1px solid var(--line); border-left: 3px solid var(--accent-strong); border-radius: 12px; background: linear-gradient(135deg, rgba(23,34,31,.98), rgba(20,32,29,.98)); padding: 17px 19px; box-shadow: 0 8px 22px rgba(0,0,0,.12); }
.notification-card:hover { border-color: rgba(98,208,168,.55); }
.notification-card.unread { background: linear-gradient(135deg, rgba(29,48,42,.98), rgba(23,34,31,.98)); }
.notification-card.importance-critical { border-left-color: var(--danger); }
.notification-card.importance-high { border-left-color: var(--warning); }
.notification-card-topline, .notification-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; color: var(--muted); font-size: 12px; }
.notification-card-topline { justify-content: space-between; gap: 14px; }
.importance-badge { color: var(--text); font-weight: 700; }
.notification-card h2 { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1; min-width: 0; margin: 10px 0 4px; overflow: hidden; font-size: 16px; line-height: 1.35; overflow-wrap: anywhere; }
.notification-content { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; min-width: 0; margin: 0 0 12px; overflow: hidden; color: var(--text); white-space: pre-wrap; overflow-wrap: anywhere; }
.notification-meta span + span { padding-left: 10px; border-left: 1px solid var(--line); }
.category-badges { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
.category-badge { display: inline-flex; align-items: center; min-height: 20px; padding: 2px 7px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); font-size: 11px; }
.category-badge[data-category="error"] { border-color: rgba(241,140,140,.6); color: var(--danger); }
.empty, .error-panel { padding: 48px 20px; border: 1px dashed var(--line); border-radius: 7px; background: var(--surface); color: var(--muted); text-align: center; }
.error-panel { border-style: solid; border-color: rgba(241,140,140,.45); color: var(--danger); }
.feedback { min-height: 20px; margin-top: 12px; color: var(--muted); font-size: 12px; }
.notification-detail { margin-top: 14px; border-top: 1px solid var(--line); padding-top: 14px; }
.notification-detail[hidden] { display: none; }
.notification-detail h3 { margin: 0; font-size: 16px; }
.notification-detail-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.notification-detail-header button { min-height: 30px; padding: 4px 10px; font-size: 12px; }
.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 18px; margin: 0; }
.detail-grid div { min-width: 0; }
.detail-grid dt { color: var(--muted); font-size: 12px; }
.detail-grid dd { margin: 2px 0 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.detail-content { margin: 16px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.card-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 7px; margin-top: 14px; }
.card-actions button { min-height: 30px; padding: 4px 10px; font-size: 12px; }
.card-actions .danger-action { border-color: rgba(241,140,140,.4); color: var(--danger); }
.card-actions .danger-action:hover { border-color: var(--danger); background: rgba(241,140,140,.1); }
.card-actions .mark-read { width: 30px; padding: 4px; color: var(--muted); font-size: 14px; line-height: 1; }
.card-actions .mark-read:hover { color: var(--accent); }
.notification-select-control, .batch-toolbar { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; }
.notification-select-control input, .batch-toolbar input { accent-color: var(--accent-strong); }
.batch-toolbar { justify-content: flex-end; min-height: 42px; margin: 0 0 14px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-soft); }
.batch-toolbar button { min-height: 30px; padding: 4px 10px; font-size: 12px; }
.batch-toolbar .selected-count { margin-right: auto; }
@media (max-width: 820px) { .control-grid { grid-template-columns: 1fr; } }
@media (max-width: 700px) { .shell { max-width: 680px; padding: 22px 16px 44px; } .topbar { grid-template-columns: 1fr; gap: 12px; margin-bottom: 20px; padding-bottom: 18px; } .filter-panel-header { align-items: flex-start; } .advanced-filter-grid { grid-template-columns: 1fr; } .display-setting-row { grid-template-columns: 1fr; align-items: start; } .display-limit-control { justify-content: flex-start; } .settings-actions { justify-content: flex-start; } .batch-toolbar { align-items: flex-start; flex-wrap: wrap; } .batch-toolbar .selected-count { margin-right: 0; } .notification-card { padding: 14px 15px; } .detail-grid { grid-template-columns: 1fr; } }
${PAGE_NAVIGATION_STYLE}
</style>
</head>
<body>
<main class="shell">
  ${renderPageNavigation({ active: 'notification-center', currentUrl })}
  <header class="topbar">
    <div><h1>通知中心</h1><p class="lead">查看、筛选和管理通知历史。桌面卡片的显示时间只影响新通知，不会删除历史记录。</p></div>
    <div class="topbar-actions"><label class="notification-search"><span>搜索通知</span><input id="notification-search" type="search" placeholder="搜索标题、摘要、正文或通知 ID" autocomplete="off"></label><div id="status" class="status" aria-live="polite">读取中</div></div>
  </header>
  <section class="control-grid" aria-label="通知中心控制区">
    <article class="control-panel filter-panel"><div class="filter-panel-header"><div><h2>筛选通知</h2><p class="control-panel-intro">按事件语义筛选；同组多选取并集，不同条件同时生效。</p></div><button id="clear-filters" class="filter-clear" type="button">清除筛选</button></div><div class="filter-group"><strong>快速视图</strong><div class="filter-control"><button id="all-filter" class="active" type="button">全部</button><button id="unread-filter" type="button">未读</button><button id="important-filter" type="button">重要</button></div></div><div class="filter-group"><strong>事件类型</strong><div class="filter-control"><button id="all-event-filter" class="active" type="button">全部事件</button><button id="assistant-reply-event-filter" type="button" data-event-filter="assistant_reply">助手回复</button><button id="tool-success-event-filter" type="button" data-event-filter="tool_success">工具成功</button><button id="tool-error-event-filter" type="button" data-event-filter="tool_error">工具失败</button><button id="timeout-event-filter" type="button" data-event-filter="timeout">超时</button><button id="model-service-error-event-filter" type="button" data-event-filter="model_service_error">模型服务异常</button><button id="error-event-filter" type="button" data-event-filter="error">其他错误</button></div></div><details class="advanced-filters"><summary>更多筛选</summary><div class="advanced-filter-grid"><label>来源<select id="producer-filter" aria-label="通知来源"><option value="">全部来源</option><option value="hana">Hana</option><option value="api">外部 API</option></select></label><label>通道<select id="channel-filter" aria-label="通知通道"><option value="">全部通道</option><option value="chat">当前对话</option></select></label></div></details><span id="summary" class="summary">正在读取通知…</span></article>
    <article class="control-panel display-panel"><h2>显示设置</h2><p class="control-panel-intro">只影响页面和新桌面卡片，不影响历史数据。</p><div class="display-settings">
      <div class="display-setting-row"><div class="display-setting-label"><strong>页面显示数量</strong><small>通知历史仍然完整保留</small></div><div class="display-limit-control"><select id="display-limit-select" aria-label="通知显示上限"><option value="30">30</option><option value="100">100</option><option value="500">500</option><option value="1000">1000</option><option value="unlimited">无限</option><option value="custom">自定义</option></select><input id="display-limit-custom" class="display-limit-custom" type="number" min="1" max="10000" step="1" value="100" aria-label="自定义通知显示上限" hidden></div></div>
      <div class="display-setting-row"><div class="display-setting-label"><strong>桌面卡片持续时间</strong><small>0 秒表示立即自动消失，范围 0～3600 秒</small></div><div class="display-limit-control lifetime-control"><select id="lifetime-select" aria-label="桌面卡片持续时间"><option value="30">30 秒</option><option value="60">60 秒</option><option value="120">2 分钟</option><option value="300">5 分钟</option><option value="custom">自定义</option></select><input id="lifetime-custom" class="lifetime-custom" type="number" min="0" max="3600" step="1" value="120" aria-label="自定义卡片持续时间（秒）" hidden><span>秒</span></div></div>
      <div class="settings-actions"><button id="refresh" class="secondary" type="button">刷新列表</button><button id="save-display-settings" type="button">保存显示设置</button></div>
    </div></article>
  </section>
  <div class="batch-toolbar"><label><input id="select-all" type="checkbox"> 全选当前筛选结果</label><span id="selected-count" class="selected-count">已选 0 条</span><button id="batch-mark-read" type="button" disabled>标记已读</button><button id="batch-remove" class="danger-action" type="button" disabled>删除所选</button></div>
  <section id="notifications" class="notifications" aria-live="polite"><div class="empty">正在读取通知…</div></section>
  <div id="feedback" class="feedback" role="status" aria-live="polite"></div>
</main>
<script>
(function () {
  "use strict";
  var busy = false;
  var refreshQueued = false;
  var displayLimit = 100;
  var cardLifetimeSeconds = 120;
  var displayLimitMode = "preset";
  var filterState = { view: "all", events: [], producerKind: null, channelKind: null, search: "" };
  var searchParams = new URLSearchParams(window.location.search);
  var pendingDetailStorageKey = "notification-hub-vnext.pending-detail";
  var requestedNotificationId = searchParams.get("notificationId");
  function readPendingDetail() {
    try {
      var raw = window.localStorage.getItem(pendingDetailStorageKey);
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed.notificationId === "string" ? parsed.notificationId : null;
    } catch (error) { return null; }
  }
  if (!requestedNotificationId) requestedNotificationId = readPendingDetail();
  var detailOpen = false;
  var activeDetailId = null;
  var detailRequestToken = 0;
  var currentNotifications = [];
  var selectedIds = new Set();
  var lastRenderSignature = "";
  var renderGeneration = 0;
  var pendingDetailAfterRender = null;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (value) { return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); };
  function surfaceLink(path) {
    var current = new URL(window.location.href);
    var currentPath = current.pathname.replace(/\\/$/, "");
    var routeRoot = currentPath.slice(0, currentPath.lastIndexOf("/") + 1);
    var url = new URL(routeRoot + String(path).replace(/^\\/+/, ""), current.origin);
    var query = new URLSearchParams(current.search);
    var surfaceSession = query.get("pluginSurfaceSession");
    var token = query.get("token");
    if (surfaceSession && !url.searchParams.has("pluginSurfaceSession")) url.searchParams.set("pluginSurfaceSession", surfaceSession);
    if (token && !url.searchParams.has("token")) url.searchParams.set("token", token);
    return url.toString();
  }
  function pluginApiUrl(path) { return surfaceLink(path); }
  function request(path, options) {
    var requestOptions = options || {};
    var headers = new Headers(requestOptions.headers || {});
    var query = new URLSearchParams(window.location.search);
    var surfaceSession = query.get("pluginSurfaceSession");
    var token = query.get("token");
    if (surfaceSession) headers.set("X-Hana-Plugin-Surface-Session", surfaceSession);
    var directOptions = Object.assign({}, requestOptions, { headers: headers });
    function fallbackRequest() {
      var url = pluginApiUrl(path);
      if (!surfaceSession && token && url.indexOf("token=") < 0) url += (url.indexOf("?") >= 0 ? "&" : "?") + "token=" + encodeURIComponent(token);
      return fetch(url, directOptions);
    }
    var api = window.hana && window.hana.api && typeof window.hana.api.fetch === "function" ? window.hana.api : null;
    var operation = api
      ? Promise.resolve().then(function () { return api.fetch(path, directOptions); }).then(function (response) {
        if (!response || typeof response.text !== "function") throw new Error("Notification Hub API returned no response");
        return response;
      }).catch(function () { return fallbackRequest(); })
      : fallbackRequest();
    return operation.then(function (response) {
      return response.text().then(function (raw) {
        var data;
        try { data = JSON.parse(raw); } catch (parseError) {
          var responseError = new Error("通知中心请求返回格式无效（HTTP " + response.status + "）");
          responseError.code = "NOTIFICATION_CENTER_RESPONSE_INVALID";
          throw responseError;
        }
        if (!response.ok || data.ok === false) {
          var error = new Error(data.error && data.error.message || "通知中心请求失败（HTTP " + response.status + "）");
          error.code = data.error && data.error.code;
          throw error;
        }
        return data;
      });
    });
  }
  function label(value) { return { critical: "紧急", high: "重要", normal: "普通", low: "低" }[value] || value || "未知"; }
  function syncDisplayLimitControls(data) {
    var settings = data && data.settings || {};
    displayLimit = data && data.displayLimit !== undefined
      ? data.displayLimit
      : (data && data.limit !== undefined ? data.limit : (settings.limit !== undefined ? settings.limit : 100));
    cardLifetimeSeconds = data && data.cardLifetimeSeconds !== undefined
      ? data.cardLifetimeSeconds
      : (settings.cardLifetimeSeconds !== undefined ? settings.cardLifetimeSeconds : 120);
    var select = $("display-limit-select");
    select.value = displayLimit === null ? "unlimited" : String(displayLimit);
    if (!["30", "100", "500", "1000", "unlimited"].includes(select.value)) select.value = "custom";
    $("display-limit-custom").value = displayLimit === null || displayLimit === undefined ? 100 : displayLimit;
    $("display-limit-custom").hidden = select.value !== "custom";
    var lifetimeSelect = $("lifetime-select");
    lifetimeSelect.value = ["30", "60", "120", "300"].includes(String(cardLifetimeSeconds)) ? String(cardLifetimeSeconds) : "custom";
    $("lifetime-custom").value = cardLifetimeSeconds;
    $("lifetime-custom").hidden = lifetimeSelect.value !== "custom";
  }
  function selectedDisplayLimit() {
    var value = $("display-limit-select").value;
    if (value === "unlimited") return "unlimited";
    if (value === "custom") return String($("display-limit-custom").value);
    return value;
  }
  function selectedLifetimeSeconds() {
    var value = $("lifetime-select").value === "custom" ? $("lifetime-custom").value : $("lifetime-select").value;
    return Number(value);
  }
  function statusLabel(value) { return { read: "已读", received: "未读", shown: "未读", unread: "未读" }[value] || value || "未知"; }
  function isToolNotification(record) { return ["tool_use", "tool_result", "tool_error"].indexOf(record && record.type) >= 0 || (record && record.source) === "hana.tool"; }
  function isSystemNotification(record) { return (record && record.type) === "system_notification" || (record && record.source) === "hana.system"; }
  function isChatNotification(record) { return record && record.channel && record.channel.kind === "chat"; }
  function categoryLabel(value) { return { chat: "聊天", channel: "频道", tool: "工具", error: "错误", external_call: "外部调用", plugin: "外部调用", system: "系统", model_service: "模型服务异常" }[value] || value; }
  function categoryMarkup(record, classifications) {
    var classification = classifications && classifications[record.notificationId];
    var labels = classification && Array.isArray(classification.labels) ? classification.labels : [];
    return labels.length ? '<div class="category-badges" aria-label="通知分类">' + labels.map(function (category) { return '<span class="category-badge" data-category="' + esc(category) + '">' + esc(categoryLabel(category)) + '</span>'; }).join("") + '</div>' : '';
  }
  function formatTime(value) { var timestamp = Date.parse(value); return Number.isNaN(timestamp) ? "时间未知" : new Date(timestamp).toLocaleString("zh-CN", { hour12: false }); }
  function detailMarkup(record, notificationId) {
    var metadata = record && record.metadata ? JSON.stringify(record.metadata, null, 2) : "暂无";
    var channel = record && record.channel ? record.channel.kind + (record.channel.id ? " / " + record.channel.id : "") : "未指定";
    var producer = record && record.producer ? (record.producer.label || record.producer.id || record.producer.kind) : "Hana 核心";
    return '<section class="notification-detail" data-detail-for="' + esc(notificationId) + '" aria-live="polite">'
      + '<div class="notification-detail-header"><h3>' + esc(record.title || "无标题通知") + '</h3><button type="button" class="close-detail">关闭详情</button></div>'
      + '<dl class="detail-grid"><div><dt>时间</dt><dd>' + esc(formatTime(record.createdAt)) + '</dd></div>'
      + '<div><dt>状态</dt><dd>' + esc(statusLabel(record.status)) + '</dd></div>'
      + '<div><dt>来源</dt><dd>' + esc(record.source || "未知来源") + '</dd></div>'
      + '<div><dt>类型</dt><dd>' + esc(record.type || "未知类型") + '</dd></div>'
      + '<div><dt>渠道</dt><dd>' + esc(channel) + '</dd></div>'
      + '<div><dt>生产者</dt><dd>' + esc(producer) + '</dd></div></dl>'
      + '<p class="detail-content">' + esc(record.content || record.summary || "暂无正文") + '</p>'
      + '<details><summary>更多信息</summary><pre class="detail-content">' + esc(metadata) + '</pre></details></section>';
  }
  function findCard(notificationId) {
    return Array.from($("notifications").querySelectorAll(".notification-card")).find(function (card) {
      return card.dataset.notificationId === notificationId;
    });
  }
  function closeDetail(notificationId) {
    detailRequestToken += 1;
    if (notificationId) {
      var card = findCard(notificationId);
      var detail = card && card.querySelector(".notification-detail");
      if (detail) detail.remove();
    } else {
      $("notifications").querySelectorAll(".notification-detail").forEach(function (detail) { detail.remove(); });
    }
    detailOpen = false;
    activeDetailId = null;
    $("feedback").textContent = "";
  }
  function scrollToCard(card) {
    if (!card || !card.isConnected || typeof card.scrollIntoView !== "function") return;
    var align = function () {
      if (!card.isConnected) return;
      card.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
    };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(align);
    else setTimeout(align, 0);
  }
  function showDetail(notificationId) {
    var card = findCard(notificationId);
    if (!card) return;
    closeDetail();
    scrollToCard(card);
    var token = ++detailRequestToken;
    activeDetailId = notificationId;
    detailOpen = true;
    card.querySelector(".notification-detail")?.remove();
    card.querySelector(".notification-detail-placeholder")?.remove();
    $("feedback").textContent = "正在读取通知详情…";
    request("notification-detail/" + encodeURIComponent(notificationId)).then(function (data) {
      if (token !== detailRequestToken || !card.isConnected) return;
      card.insertAdjacentHTML("beforeend", detailMarkup(data.notification, notificationId));
      detailOpen = true;
      scrollToCard(card);
      $("feedback").textContent = "已打开通知详情。";
    }).catch(function (error) {
      if (token !== detailRequestToken) return;
      detailOpen = false;
      activeDetailId = null;
      $("feedback").textContent = error.message || "通知详情读取失败。";
    });
  }
  function selectableNotifications() {
    return currentNotifications.filter(function (record) { return record && typeof record.notificationId === "string"; });
  }
  function selectedNotifications() {
    return selectableNotifications().filter(function (record) { return selectedIds.has(record.notificationId); });
  }
  function updateBatchControls() {
    var selectable = selectableNotifications();
    var selected = selectedNotifications();
    var unreadSelected = selected.filter(function (record) { return record.status !== "read"; });
    $("selected-count").textContent = "已选 " + selected.length + " 条";
    $("select-all").disabled = busy || selectable.length === 0;
    $("select-all").checked = selectable.length > 0 && selected.length === selectable.length;
    $("select-all").indeterminate = selected.length > 0 && selected.length < selectable.length;
    $("batch-mark-read").disabled = busy || unreadSelected.length === 0;
    $("batch-remove").disabled = busy || selected.length === 0;
  }
  function syncCheckboxes() {
    $("notifications").querySelectorAll(".notification-select").forEach(function (input) {
      input.checked = selectedIds.has(input.dataset.notificationId);
    });
    updateBatchControls();
  }
  function render(data) {
    var openDetailId = activeDetailId;
    var notifications = Array.isArray(data.notifications) ? data.notifications : [];
    var classifications = data && data.classifications ? data.classifications : {};
    if (filterState.events.length) notifications = notifications.filter(function (record) { var facetEvents = classifications[record.notificationId] && classifications[record.notificationId].facets && classifications[record.notificationId].facets.event; return Array.isArray(facetEvents) && filterState.events.some(function (eventName) { return facetEvents.indexOf(eventName) >= 0 && !(eventName === "error" && facetEvents.indexOf("tool_error") >= 0); }); });
    if (filterState.producerKind) notifications = notifications.filter(function (record) { return filterState.producerKind === "api" ? record.producer && record.producer.kind === "api" : record.producer && record.producer.kind === filterState.producerKind; });
    if (filterState.channelKind) notifications = notifications.filter(function (record) { return record.channel && record.channel.kind === filterState.channelKind; });
    currentNotifications = notifications;
    var renderSignature = notifications.map(function (record) { return [record.notificationId, record.status, record.title, record.summary, record.content, record.importance].join("\u001f"); }).join("\u001e") + "|" + Object.keys(classifications).length + "|" + String(openDetailId || "");
    var visibleIds = new Set(notifications.map(function (record) { return record.notificationId; }));
    selectedIds.forEach(function (notificationId) { if (!visibleIds.has(notificationId)) selectedIds.delete(notificationId); });
    var viewLabel = { all: "全部通知", unread: "未读通知", important: "重要通知" }[filterState.view] || "通知";
    var activeLabels = filterState.events.map(function (eventName) { return { assistant_reply: "助手回复", tool_success: "工具成功", tool_error: "工具失败", timeout: "超时", model_service_error: "模型服务异常", error: "其他错误" }[eventName] || eventName; });
    if (filterState.producerKind) activeLabels.push(filterState.producerKind === "api" ? "外部 API" : "Hana");
    if (filterState.channelKind) activeLabels.push(filterState.channelKind === "chat" ? "当前对话" : filterState.channelKind);
    var filterLabel = activeLabels.length ? " · 条件：" + activeLabels.join("、") : " · " + viewLabel;
    $("summary").textContent = "当前显示 " + notifications.length + " 条" + filterLabel + (data.hasMore ? "，还有更多" : "，按最新时间排列");
    $("status").textContent = "已连接";
    if (renderSignature === lastRenderSignature && !openDetailId) { updateBatchControls(); return; }
    lastRenderSignature = renderSignature;
    $("status").className = "status ready";
    var generation = ++renderGeneration;
    $("notifications").innerHTML = "";
    if (!notifications.length) { $("notifications").innerHTML = '<div class="empty">暂无通知</div>'; updateBatchControls(); return; }
    function cardMarkup(record) {
      var importance = record.importance || "normal";
      var readAction = record.status === "read" ? "" : '<button id="mark-read-' + esc(record.notificationId) + '" type="button" class="mark-read" aria-label="标记已读" title="标记已读" data-notification-id="' + esc(record.notificationId) + '">✓</button>';
      var selectAction = '<label class="notification-select-control"><input class="notification-select" type="checkbox" data-notification-id="' + esc(record.notificationId) + '"' + (selectedIds.has(record.notificationId) ? ' checked' : '') + '>选择</label>';
      var detailAction = '<button type="button" class="view-detail" data-notification-id="' + esc(record.notificationId) + '">查看详情</button>';
      var removeAction = '<button type="button" class="danger-action remove-notification" data-notification-id="' + esc(record.notificationId) + '">删除</button>';
      return '<article class="notification-card importance-' + esc(importance) + (record.status !== "read" ? ' unread' : '') + '" data-notification-id="' + esc(record.notificationId) + '"><div class="notification-card-topline"><span class="importance-badge">' + esc(label(importance)) + '</span><time>' + esc(formatTime(record.createdAt)) + '</time></div><h2>' + esc(record.title || "无标题通知") + '</h2><p class="notification-content">' + esc(record.summary || record.content || "暂无正文") + '</p>' + categoryMarkup(record, classifications) + '<div class="notification-meta"><span>' + esc(record.source || "未知来源") + '</span><span>' + esc(statusLabel(record.status)) + '</span></div><div class="card-actions">' + selectAction + detailAction + readAction + removeAction + '</div>' + (openDetailId === record.notificationId ? '<div class="notification-detail-placeholder" data-restore-detail="true"></div>' : '') + '</article>';
    }
    var chunkSize = 40;
    function appendChunk(start) {
      if (generation !== renderGeneration) return;
      var end = Math.min(start + chunkSize, notifications.length);
      $("notifications").insertAdjacentHTML("beforeend", notifications.slice(start, end).map(cardMarkup).join(""));
      if (end < notifications.length) {
        (window.requestAnimationFrame || function (callback) { setTimeout(callback, 0); })(function () { appendChunk(end); });
      } else {
        updateBatchControls();
        var deferredDetailId = pendingDetailAfterRender;
        pendingDetailAfterRender = null;
        if (deferredDetailId && findCard(deferredDetailId)) showDetail(deferredDetailId);
        else if (openDetailId && findCard(openDetailId)) showDetail(openDetailId);
      }
    }
    appendChunk(0);
  }
  function setError(error) { $("summary").textContent = "通知列表暂时不可用"; $("status").textContent = "读取失败"; $("status").className = "status error"; $("notifications").innerHTML = '<div class="error-panel">' + esc(error.message || "通知列表读取失败") + '</div>'; $("feedback").textContent = error.code ? "错误码：" + error.code : ""; }
  function refreshNotifications(manual) { if (detailOpen && !manual) return; if (busy) { refreshQueued = true; return; } busy = true; $("refresh").disabled = true; updateBatchControls(); var limitQuery = displayLimit === null ? "limit=unlimited" : "limit=" + encodeURIComponent(displayLimit); var filterQuery = ""; if (filterState.events.length) filterQuery += "&event=" + encodeURIComponent(filterState.events.join(",")); if (filterState.producerKind) filterQuery += "&producerKind=" + encodeURIComponent(filterState.producerKind); if (filterState.channelKind) filterQuery += "&channelKind=" + encodeURIComponent(filterState.channelKind); if (filterState.search) filterQuery += "&search=" + encodeURIComponent(filterState.search); if (filterState.view === "important") filterQuery += "&important=true"; if (filterState.view === "unread") filterQuery += "&unread=true"; var query = "?" + limitQuery + filterQuery + "&includeClassification=true";
    var requestPath = "notification-status";
    var requestOptions = undefined;
    request(requestPath + query, requestOptions).then(function (data) {
      render(data);
      var notificationId = requestedNotificationId;
      requestedNotificationId = null;
      try { window.localStorage.removeItem(pendingDetailStorageKey); } catch (error) {}
      if (notificationId && findCard(notificationId)) showDetail(notificationId);
      else if (notificationId) pendingDetailAfterRender = notificationId;
    }).catch(setError).finally(function () { busy = false; $("refresh").disabled = false; updateBatchControls(); if (refreshQueued) { refreshQueued = false; refreshNotifications(false); } }); }
  function refresh() { refreshNotifications(true); }
  function loadDisplaySettings() { return request("notification-center-display-settings").then(function (data) { syncDisplayLimitControls(data); return data; }); }
  $("refresh").addEventListener("click", refresh);
  $("display-limit-select").addEventListener("change", function () { $("display-limit-custom").hidden = $("display-limit-select").value !== "custom"; });
  $("lifetime-select").addEventListener("change", function () { $("lifetime-custom").hidden = $("lifetime-select").value !== "custom"; });
  function saveDisplaySettings() {
    if (busy) return;
    var selected = selectedDisplayLimit();
    var lifetime = selectedLifetimeSeconds();
    if (!Number.isInteger(lifetime) || lifetime < 0 || lifetime > 3600) {
      $("feedback").textContent = "卡片持续时间必须是 0 到 3600 秒的整数。";
      return;
    }
    var body = selected === "unlimited"
      ? { mode: "unlimited", limit: null, cardLifetimeSeconds: lifetime }
      : { mode: ["30", "100", "500", "1000"].indexOf(selected) >= 0 ? "preset" : "custom", limit: Number(selected), cardLifetimeSeconds: lifetime };
    busy = true;
    $("save-display-settings").disabled = true;
    $("feedback").textContent = "正在保存显示设置…";
    request("notification-center-display-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(function (data) {
        return loadDisplaySettings().then(function (verified) {
          var verifiedSettings = verified && verified.settings || {};
          var verifiedLimit = verifiedSettings.mode === "unlimited" ? null : verifiedSettings.limit;
          var verifiedLifetime = verifiedSettings.cardLifetimeSeconds;
          if (verifiedLimit !== (selected === "unlimited" ? null : Number(selected)) || verifiedLifetime !== lifetime) throw new Error("服务端返回的显示设置与刚才保存的值不一致。");
          $("feedback").textContent = "显示数量和卡片持续时间已确认保存。";
          refreshQueued = true;
        });
      })
      .catch(function (error) { $("feedback").textContent = error.message || "显示设置保存失败。"; })
      .finally(function () {
        busy = false;
        $("save-display-settings").disabled = false;
        updateBatchControls();
        if (refreshQueued) { refreshQueued = false; refresh(); }
      });
  }
  $("save-display-settings").addEventListener("click", saveDisplaySettings);
  $("select-all").addEventListener("change", function () {
    if (busy) return;
    selectableNotifications().forEach(function (record) {
      if ($("select-all").checked) selectedIds.add(record.notificationId);
      else selectedIds.delete(record.notificationId);
    });
    syncCheckboxes();
  });
  $("batch-remove").addEventListener("click", function () {
    if (busy) return;
    var ids = selectedNotifications().map(function (record) { return record.notificationId; });
    if (!ids.length) return;
    busy = true;
    updateBatchControls();
    $("feedback").textContent = "正在删除通知…";
    request("notification-remove/batch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ notificationIds: ids }) })
      .then(function (data) { ids.forEach(function (id) { selectedIds.delete(id); }); $("feedback").textContent = "已删除 " + (data.removed || ids).length + " 条通知。"; refreshQueued = true; })
      .catch(function (error) { $("feedback").textContent = error.message || "删除通知失败。"; })
      .finally(function () { busy = false; updateBatchControls(); if (refreshQueued) { refreshQueued = false; refreshNotifications(true); } });
  });
  $("batch-mark-read").addEventListener("click", function () {
    if (busy) return;
    var ids = selectedNotifications().filter(function (record) { return record.status !== "read"; }).map(function (record) { return record.notificationId; });
    if (ids.length === 0) return;
    busy = true;
    updateBatchControls();
    $("feedback").textContent = "正在批量标记已读…";
    request("notification-status/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notificationIds: ids, status: "read" })
    }).then(function (data) {
      ids.forEach(function (notificationId) { selectedIds.delete(notificationId); });
      $("feedback").textContent = "已将 " + data.updated.length + " 条通知标记为已读。";
      busy = false;
      refresh();
    }).catch(function (error) {
      busy = false;
      setError(error);
      updateBatchControls();
    });
  });
  function syncFilterButtons() {
    ["all", "unread", "important"].forEach(function (value) { $(value === "all" ? "all-filter" : value + "-filter").className = filterState.view === value ? "active" : ""; });
    $("all-event-filter").className = filterState.events.length ? "" : "active";
    document.querySelectorAll("[data-event-filter]").forEach(function (button) { button.className = filterState.events.indexOf(button.dataset.eventFilter) >= 0 ? "active" : ""; });
    $("producer-filter").value = filterState.producerKind || "";
    $("channel-filter").value = filterState.channelKind || "";
  }
  function setFilter(value) { closeDetail(); filterState.view = value; syncFilterButtons(); refresh(); }
  function toggleEventFilter(value) { closeDetail(); var index = filterState.events.indexOf(value); if (index >= 0) filterState.events.splice(index, 1); else filterState.events.push(value); syncFilterButtons(); refresh(); }
  function clearFilters() { closeDetail(); filterState = { view: "all", events: [], producerKind: null, channelKind: null, search: "" }; $("notification-search").value = ""; syncFilterButtons(); refresh(); }
  $("all-filter").addEventListener("click", function () { setFilter("all"); });
  $("unread-filter").addEventListener("click", function () { setFilter("unread"); });
  $("important-filter").addEventListener("click", function () { setFilter("important"); });
  $("clear-filters").addEventListener("click", clearFilters);
  $("all-event-filter").addEventListener("click", function () { filterState.events = []; syncFilterButtons(); refresh(); });
  document.querySelectorAll("[data-event-filter]").forEach(function (button) { button.addEventListener("click", function () { toggleEventFilter(button.dataset.eventFilter); }); });
  $("producer-filter").addEventListener("change", function () { filterState.producerKind = this.value || null; refresh(); });
  $("channel-filter").addEventListener("change", function () { filterState.channelKind = this.value || null; refresh(); }); $("notification-search").addEventListener("input", function () { filterState.search = this.value.trim(); refresh(); });
  $("notifications").addEventListener("change", function (event) {
    var checkbox = event.target.closest(".notification-select");
    if (!checkbox || busy) return;
    if (checkbox.checked) selectedIds.add(checkbox.dataset.notificationId);
    else selectedIds.delete(checkbox.dataset.notificationId);
    updateBatchControls();
  });
  $("notifications").addEventListener("click", function (event) {
    var closeButton = event.target.closest(".close-detail");
    if (closeButton) {
      var detailCard = closeButton.closest(".notification-card");
      closeDetail(detailCard && detailCard.dataset.notificationId);
      return;
    }
    var detailButton = event.target.closest(".view-detail");
    if (detailButton && !busy) {
      showDetail(detailButton.dataset.notificationId);
      return;
    }
    var removeButton = event.target.closest(".remove-notification");
    if (removeButton && !busy) {
      busy = true;
      removeButton.disabled = true;
      request("notification-remove/" + encodeURIComponent(removeButton.dataset.notificationId), { method: "POST" })
        .then(function () { selectedIds.delete(removeButton.dataset.notificationId); $("feedback").textContent = "通知已删除。"; refreshQueued = true; })
        .catch(function (error) { $("feedback").textContent = error.message || "删除通知失败。"; })
        .finally(function () { busy = false; if (refreshQueued) { refreshQueued = false; refreshNotifications(true); } else { updateBatchControls(); } });
      return;
    }
    var button = event.target.closest(".mark-read");
    if (!button || busy) return;
    busy = true;
    button.disabled = true;
    request("notification-status/" + encodeURIComponent(button.dataset.notificationId) + "/read", { method: "POST" }).then(function () { $("feedback").textContent = "通知已标记为已读。"; button.disabled = false; busy = false; refresh(); }).catch(function (error) { busy = false; button.disabled = false; setError(error); });
  });
  window.addEventListener("storage", function (event) {
    if (event.key !== pendingDetailStorageKey || !event.newValue) return;
    var notificationId = readPendingDetail();
    if (!notificationId) return;
    requestedNotificationId = notificationId;
    if (findCard(notificationId)) {
      requestedNotificationId = null;
      try { window.localStorage.removeItem(pendingDetailStorageKey); } catch (error) {}
      showDetail(notificationId);
    }
  });
  var refreshTimer = setInterval(function () { refreshNotifications(false); }, 5000);
  window.addEventListener("notification-hub-view-before-unload", function () { clearInterval(refreshTimer); }, { once: true });
  window.parent.postMessage({ type: "ready" }, "*");
  loadDisplaySettings().then(function () { refreshNotifications(true); }).catch(setError);
}());
</script>
${PAGE_NAVIGATION_SCRIPT}
</body>
</html>`;
}

export default function registerNotificationCenterRoute(app, ctx) {
  const getApi = () => ctx?._notificationHubVNextNotificationApi;
  const getDisplaySettingsApi = () => ctx?._notificationHubVNextSettingsApi ?? ctx?._notificationHubVNextPlugin;
  const listResponse = (c, fixedOptions = {}) => {
    try {
      const api = getApi();
      if (!api?.listNotifications) {
        return c.json({
          ok: false,
          error: {
            code: 'NOTIFICATION_CENTER_API_UNAVAILABLE',
            message: 'Notification API unavailable'
          }
        }, 503);
      }
      const unread = fixedOptions.unread ?? readBooleanQuery(c, 'unread');
      const important = fixedOptions.important ?? readBooleanQuery(c, 'important');
      const conversation = fixedOptions.conversation ?? readBooleanQuery(c, 'conversation');
      const source = fixedOptions.source ?? readSourceQuery(c);
      const channel = fixedOptions.channel ?? readBooleanQuery(c, 'channel');
      const channelKind = fixedOptions.channelKind ?? readChannelKindQuery(c);
      const producerKind = fixedOptions.producerKind ?? readProducerKindQuery(c);
      const search = fixedOptions.search ?? readSearchQuery(c);
      const categories = fixedOptions.categories ?? readCategoryQuery(c);
      const events = fixedOptions.events ?? readEventQuery(c);
      const includeClassification = readBooleanQuery(c, 'includeClassification') === true;
      const tool = fixedOptions.tool ?? readBooleanQuery(c, 'tool') ?? readBooleanHeader(c, 'x-notification-tool');
      const system = fixedOptions.system ?? readBooleanQuery(c, 'system') ?? readBooleanHeader(c, 'x-notification-system');
      const error = fixedOptions.error ?? readBooleanQuery(c, 'error') ?? readBooleanHeader(c, 'x-notification-error');
      const requestedLimit = readDisplayLimitQuery(c);
      if (categories !== undefined) filterNotificationsByCategories([], categories);
      if (events !== undefined) filterNotificationsByEvents([], events);
      const displaySettings = getDisplaySettingsApi()?.getNotificationDisplaySettings?.() ?? {};
      const configuredLimit = requestedLimit === undefined
        ? displaySettings.limit ?? displaySettings.settings?.limit ?? 100
        : requestedLimit;
      const options = {};
      // 分类过滤必须在完整候选集上进行，避免 Store 的 limit 先截断匹配项。
      if (configuredLimit !== null && categories === undefined && events === undefined && search === undefined) options.limit = configuredLimit;
      if (search !== undefined && categories === undefined && events === undefined) options.limit = DISPLAY_LIMIT_MAX;
      if (unread !== undefined) options.unread = unread;
      if (important !== undefined) options.important = important;
      if (conversation !== undefined) options.conversation = conversation;
      if (source !== undefined) options.source = source;
      if (channel !== undefined) options.channel = channel;
      if (channelKind !== undefined) options.channelKind = channelKind;
      if (producerKind !== undefined) options.producerKind = producerKind;
      if (tool !== undefined) options.tool = tool;
      if (system !== undefined) options.system = system;
      if (error !== undefined) options.error = error;
      let notifications = applyResponseFilters(api.listNotifications(options), { tool, system, channel, channelKind, producerKind, search });
      if (categories !== undefined) notifications = filterNotificationsByCategories(notifications, categories);
      if (events !== undefined) notifications = filterNotificationsByEvents(notifications, events);
      const totalCount = notifications.length;
      if ((categories !== undefined || events !== undefined) && configuredLimit !== null) notifications = notifications.slice(0, configuredLimit);
      const classifications = includeClassification
        ? Object.fromEntries(notifications.map((record) => [record.notificationId, projectNotificationCategories(record)]))
        : undefined;
      const result = {
        ok: true,
        notifications,
        totalCount,
        displayedCount: notifications.length,
        displayLimit: configuredLimit,
        cardLifetimeSeconds: displaySettings.cardLifetimeSeconds
          ?? displaySettings.settings?.cardLifetimeSeconds
          ?? 120,
        hasMore: configuredLimit !== null && (categories !== undefined || events !== undefined
          ? totalCount > configuredLimit
          : notifications.length >= configuredLimit),
        ...(classifications ? { classifications } : {})
      };
      if (unread === true) result.unreadCount = result.totalCount;
      return c.json(result);
    } catch (error) {
      return c.json({ ok: false, error: errorPayload(error) }, [
        'NOTIFICATION_CENTER_QUERY_INVALID',
        'NOTIFICATION_DISPLAY_LIMIT_INVALID',
        'NOTIFICATION_CATEGORY_FILTER_INVALID',
        'NOTIFICATION_CATEGORY_FILTER_MATCH_INVALID',
        'NOTIFICATION_CATEGORY_FILTER_RECORDS_INVALID',
        'NOTIFICATION_EVENT_FILTER_INVALID',
        'NOTIFICATION_EVENT_FILTER_MATCH_INVALID',
        'NOTIFICATION_EVENT_FILTER_RECORDS_INVALID'
      ].includes(error?.code) ? 400 : 500);
    }
  };
  app.get('/notification-center', (c) => {
    const currentUrl = c?.req?.url ?? c?.req?.raw?.url ?? '';
    const view = readStringQuery(c, 'view');
    if (view !== 'settings') return c.html(renderNotificationCenterPage(currentUrl));
    const settingsApi = getDisplaySettingsApi();
    const soundInitialData = typeof settingsApi?.getSoundSettingsStatus === 'function'
      ? settingsApi.getSoundSettingsStatus()
      : null;
    const visualInitialData = typeof settingsApi?.getVisualSettingsStatus === 'function'
      ? settingsApi.getVisualSettingsStatus()
      : null;
    const eventInitialData = typeof settingsApi?.getEventPresentationSettings === 'function'
      ? settingsApi.getEventPresentationSettings()
      : null;
    const displayInitialData = typeof settingsApi?.getNotificationDisplaySettings === 'function'
      ? settingsApi.getNotificationDisplaySettings()
      : null;
    return c.html(renderSettingsPage(currentUrl, displayInitialData, soundInitialData, visualInitialData, eventInitialData));
  });
  app.get('/notification-tools', (c) => listResponse(c, { tool: true }));
  app.get('/notification-system', (c) => listResponse(c, { system: true }));
  app.get('/notification-channel', (c) => listResponse(c, { channel: true }));
  app.get('/notification-errors', (c) => listResponse(c, { error: true }));
  app.get('/notification-status/error', (c) => listResponse(c, { error: true }));
  app.get('/notification-status', (c) => listResponse(c));
  app.get('/notification-center-display-settings', (c) => {
    try {
      const settingsApi = getDisplaySettingsApi();
      if (!settingsApi?.getNotificationDisplaySettings) {
        return c.json({ ok: false, error: { code: 'NOTIFICATION_CENTER_SETTINGS_UNAVAILABLE', message: '通知中心显示设置暂不可用。' } }, 503);
      }
      return c.json({ ok: true, ...settingsApi.getNotificationDisplaySettings() });
    } catch (error) {
      return c.json({ ok: false, error: errorPayload(error) }, 500);
    }
  });
  app.post('/notification-center-display-settings', async (c) => {
    try {
      const settingsApi = getDisplaySettingsApi();
      if (!settingsApi?.updateNotificationDisplaySettings) {
        return c.json({ ok: false, error: { code: 'NOTIFICATION_CENTER_SETTINGS_UNAVAILABLE', message: '通知中心显示设置暂不可用。' } }, 503);
      }
      const result = await settingsApi.updateNotificationDisplaySettings(await readJsonBody(c));
      return c.json({ ok: true, ...result, saved: true });
    } catch (error) {
      const badRequest = ['NOTIFICATION_DISPLAY_SETTINGS_CUSTOM_INVALID', 'NOTIFICATION_DISPLAY_SETTINGS_PRESET_INVALID', 'NOTIFICATION_DISPLAY_SETTINGS_MODE_INVALID', 'NOTIFICATION_DISPLAY_SETTINGS_UNLIMITED_INVALID', 'NOTIFICATION_CARD_LIFETIME_INVALID'].includes(error?.code);
      return c.json({ ok: false, error: errorPayload(error) }, badRequest ? 400 : 503);
    }
  });
  app.get('/notification-detail/:notificationId', (c) => {
    try {
      const api = getApi();
      if (!api?.getNotification) {
        return c.json({ ok: false, error: { code: 'NOTIFICATION_CENTER_API_UNAVAILABLE', message: 'Notification API unavailable' } }, 503);
      }
      const notificationId = typeof c?.req?.param === 'function' ? c.req.param('notificationId') : undefined;
      const notification = api.getNotification(notificationId);
      if (!notification) {
        const error = new Error('Notification not found');
        error.code = 'NOTIFICATION_STORE_NOT_FOUND';
        error.details = { field: 'notificationId' };
        throw error;
      }
      return c.json({ ok: true, notification });
    } catch (error) {
      return c.json({ ok: false, error: errorPayload(error) }, mutationStatus(error));
    }
  });
  app.post('/notification-status/batch', async (c) => {
    try {
      const api = getApi();
      if (!api?.setNotificationsStatus) {
        return c.json({ ok: false, error: { code: 'NOTIFICATION_CENTER_API_UNAVAILABLE', message: 'Notification API unavailable' } }, 503);
      }
      const { notificationIds, status } = validateBatchBody(await readJsonBody(c));
      const result = api.setNotificationsStatus(notificationIds, status);
      return c.json({ ok: true, ...result });
    } catch (error) {
      return c.json({ ok: false, error: errorPayload(error) }, mutationStatus(error));
    }
  });
  app.post('/notification-status/:notificationId/read', (c) => {
    try {
      const api = getApi();
      if (!api?.setNotificationStatus) {
        return c.json({ ok: false, error: { code: 'NOTIFICATION_CENTER_API_UNAVAILABLE', message: 'Notification API unavailable' } }, 503);
      }
      const notificationId = typeof c?.req?.param === 'function' ? c.req.param('notificationId') : undefined;
      const notification = api.setNotificationStatus(notificationId, 'read');
      return c.json({ ok: true, notification });
    } catch (error) {
      return c.json({ ok: false, error: errorPayload(error) }, mutationStatus(error));
    }
  });
  app.post('/notification-remove/batch', async (c) => {
    try {
      const api = getApi();
      const settingsApi = getDisplaySettingsApi();
      const ids = validateNotificationIdsBody(await readJsonBody(c));
      if (!api?.removeNotifications && !settingsApi?.removeNotifications) {
        return c.json({ ok: false, error: { code: 'NOTIFICATION_CENTER_API_UNAVAILABLE', message: 'Notification API unavailable' } }, 503);
      }
      const result = settingsApi?.removeNotifications
        ? await settingsApi.removeNotifications(ids)
        : api.removeNotifications(ids);
      return c.json({ ok: true, ...result });
    } catch (error) {
      return c.json({ ok: false, error: errorPayload(error) }, mutationStatus(error));
    }
  });
  app.post('/notification-remove/:notificationId', async (c) => {
    try {
      const api = getApi();
      const settingsApi = getDisplaySettingsApi();
      if (!api?.removeNotification && !settingsApi?.removeNotification) {
        return c.json({ ok: false, error: { code: 'NOTIFICATION_CENTER_API_UNAVAILABLE', message: 'Notification API unavailable' } }, 503);
      }
      const notificationId = typeof c?.req?.param === 'function' ? c.req.param('notificationId') : undefined;
      const removed = settingsApi?.removeNotification
        ? await settingsApi.removeNotification(notificationId)
        : api.removeNotification(notificationId);
      if (!removed) {
        const error = new Error('Notification not found');
        error.code = 'NOTIFICATION_STORE_NOT_FOUND';
        throw error;
      }
      return c.json({ ok: true, notificationId, removed: true });
    } catch (error) {
      return c.json({ ok: false, error: errorPayload(error) }, mutationStatus(error));
    }
  });
}
