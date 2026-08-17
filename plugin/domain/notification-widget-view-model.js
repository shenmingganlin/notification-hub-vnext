const DEFAULT_LIMIT = 5;
const DEFAULT_SUMMARY_LENGTH = 160;
const DEFAULT_TEXT = '暂无内容';

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function text(value, fallback) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function summaryText(record) {
  return text(record?.summary, text(record?.content, DEFAULT_TEXT));
}

function truncate(value, limit) {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1))}…`;
}

function timestamp(value) {
  const parsed = Date.parse(value ?? '');
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function widgetRecord(record, summaryLength) {
  const summary = truncate(summaryText(record), summaryLength);
  const status = text(record?.status, 'unknown');
  return {
    notificationId: text(record?.notificationId, ''),
    title: text(record?.title, '无标题通知'),
    summary,
    type: text(record?.type, 'unknown'),
    source: text(record?.source, 'unknown'),
    importance: text(record?.importance, 'normal'),
    status,
    createdAt: text(record?.createdAt, ''),
    unread: status !== 'read'
  };
}

export function createNotificationWidgetViewModel(records = [], options = {}) {
  const source = Array.isArray(records) ? records : [];
  const limit = positiveInteger(options.limit, DEFAULT_LIMIT);
  const summaryLength = positiveInteger(options.summaryLength, DEFAULT_SUMMARY_LENGTH);
  const ordered = source
    .map((record, index) => ({ record, index }))
    .sort((left, right) => timestamp(right.record?.createdAt) - timestamp(left.record?.createdAt) || right.index - left.index);
  const recent = ordered.slice(0, limit).map(({ record }) => widgetRecord(record, summaryLength));
  const latest = ordered[0]?.record;
  const unreadCount = source.reduce((count, record) => count + (record?.status !== 'read' ? 1 : 0), 0);

  return Object.freeze({
    recent: Object.freeze(recent.map((record) => Object.freeze(record))),
    unreadCount,
    totalCount: source.length,
    summary: latest ? truncate(summaryText(latest), summaryLength) : '暂无通知'
  });
}

export { DEFAULT_LIMIT, DEFAULT_SUMMARY_LENGTH };
