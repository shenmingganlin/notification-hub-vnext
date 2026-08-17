export const EVENT_CATALOG_VERSION = 'v1';

export const EVENT_CATEGORIES = Object.freeze([
  'chat',
  'channel',
  'tool',
  'model_service',
  'session',
  'runtime',
  'external_integration',
  'delivery'
]);

function definition(categoryId, eventTypeId, label, semantic, options = {}) {
  return Object.freeze({
    eventId: `${categoryId}.${eventTypeId}`,
    categoryId,
    eventTypeId,
    label,
    source: options.source ?? `hana.${categoryId}`,
    semantic: Object.freeze({ ...semantic }),
    presentationEligible: options.presentationEligible ?? true,
    carrier: options.carrier ?? (options.presentationEligible === false ? 'internal' : 'notification'),
    defaultImportance: 'normal',
    defaultPresentation: Object.freeze({
      soundProfileId: options.soundProfileId ?? `sound.${categoryId}.default`,
      visualProfileId: options.visualProfileId ?? `visual.${categoryId}.default`,
      behaviorProfileId: options.behaviorProfileId ?? 'stack',
      behaviorChannelId: options.behaviorChannelId ?? `${categoryId}.main`
    })
  });
}

const DEFINITIONS = [
  definition('chat', 'assistant_reply.completed', '助手回复完成', { action: 'assistant_reply', outcome: 'success' }, { source: 'hana.session' }),
  definition('chat', 'assistant_reply.cancelled', '助手回复取消', { action: 'assistant_reply', outcome: 'cancelled', reason: 'user_cancelled' }, { source: 'hana.session' }),
  definition('chat', 'assistant_reply.interrupted', '助手回复中断', { action: 'assistant_reply', outcome: 'cancelled', reason: 'interrupted' }, { source: 'hana.session' }),
  definition('channel', 'message.received', '频道收到消息', { action: 'message', outcome: 'received' }, { source: 'hana.channel' }),
  definition('channel', 'message.sent', '频道消息发送成功', { action: 'message', outcome: 'success' }, { source: 'hana.channel' }),
  definition('channel', 'message.failed', '频道消息发送失败', { action: 'message', outcome: 'failure', reason: 'transport_error' }, { source: 'hana.channel', soundProfileId: 'sound.channel.failed' }),
  definition('tool', 'execution.started', '工具开始执行', { action: 'execution', outcome: 'pending' }, { source: 'hana.tool', presentationEligible: false, carrier: 'internal' }),
  definition('tool', 'execution.succeeded', '工具执行成功', { action: 'execution', outcome: 'success' }, { source: 'hana.tool' }),
  definition('tool', 'execution.failed', '工具执行失败', { action: 'execution', outcome: 'failure', reason: 'execution_error' }, { source: 'hana.tool', soundProfileId: 'sound.tool.failed' }),
  definition('tool', 'execution.timed_out', '工具执行超时', { action: 'execution', outcome: 'failure', reason: 'timeout' }, { source: 'hana.tool', soundProfileId: 'sound.tool.timed_out' }),
  definition('tool', 'execution.blocked', '工具执行被阻止', { action: 'execution', outcome: 'blocked', reason: 'permission_denied' }, { source: 'hana.tool', soundProfileId: 'sound.tool.blocked' }),
  definition('tool', 'execution.cancelled', '工具执行取消', { action: 'execution', outcome: 'cancelled', reason: 'user_cancelled' }, { source: 'hana.tool', soundProfileId: 'sound.tool.cancelled' }),
  definition('model_service', 'request.started', '模型服务请求开始', { action: 'request', outcome: 'pending' }, { source: 'hana.model', presentationEligible: false, carrier: 'internal' }),
  definition('model_service', 'request.succeeded', '模型服务请求成功', { action: 'request', outcome: 'success' }, { source: 'hana.model', presentationEligible: false, carrier: 'internal' }),
  definition('model_service', 'request.failed', '模型服务请求失败', { action: 'request', outcome: 'failure', reason: 'service_error' }, { source: 'hana.model', soundProfileId: 'sound.model_service.failed' }),
  definition('model_service', 'request.timed_out', '模型服务请求超时', { action: 'request', outcome: 'failure', reason: 'timeout' }, { source: 'hana.model', soundProfileId: 'sound.model_service.timed_out' }),
  definition('model_service', 'incident.recovered', '模型服务故障恢复', { action: 'incident', outcome: 'recovered' }, { source: 'hana.model', presentationEligible: false, carrier: 'diagnostic' }),
  definition('session', 'health.degraded', '会话健康下降', { action: 'health', outcome: 'degraded', reason: 'health_check' }, { source: 'hana.system' }),
  definition('session', 'persistence.failed', '会话持久化失败', { action: 'persistence', outcome: 'failure', reason: 'persistence_error' }, { source: 'hana.system', soundProfileId: 'sound.session.failed' }),
  definition('session', 'recovered', '会话恢复', { action: 'session', outcome: 'recovered' }, { source: 'hana.system', presentationEligible: false, carrier: 'diagnostic' }),
  definition('runtime', 'transport.disconnected', '通知传输断开', { action: 'transport', outcome: 'failure', reason: 'pipe_disconnected' }, { source: 'notification_hub.runtime', presentationEligible: false, carrier: 'diagnostic' }),
  definition('runtime', 'transport.reconnected', '通知传输恢复', { action: 'transport', outcome: 'recovered' }, { source: 'notification_hub.runtime', presentationEligible: false, carrier: 'diagnostic' }),
  definition('runtime', 'scene.failed', '通知场景失败', { action: 'scene', outcome: 'failure', reason: 'scene_error' }, { source: 'notification_hub.runtime', presentationEligible: false, carrier: 'diagnostic' }),
  definition('runtime', 'audio.failed', '声音播放失败', { action: 'audio', outcome: 'failure', reason: 'device_unavailable' }, { source: 'notification_hub.audio', presentationEligible: false, carrier: 'diagnostic' }),
  definition('runtime', 'settings.apply_failed', '设置应用失败', { action: 'settings', outcome: 'failure', reason: 'apply_error' }, { source: 'notification_hub.settings', presentationEligible: false, carrier: 'diagnostic' }),
  definition('external_integration', 'event.received', '外部接入事件', { action: 'event', outcome: 'received' }, { source: 'api.external' }),
  definition('external_integration', 'event.succeeded', '外部接入事件成功', { action: 'event', outcome: 'success' }, { source: 'api.external' }),
  definition('external_integration', 'event.failed', '外部接入事件失败', { action: 'event', outcome: 'failure', reason: 'external_error' }, { source: 'api.external', soundProfileId: 'sound.external_integration.failed' }),
  definition('delivery', 'notification.stored', '通知已保存', { action: 'notification', outcome: 'stored' }, { source: 'notification_hub.delivery', presentationEligible: false, carrier: 'internal' }),
  definition('delivery', 'notification.shown', '通知已显示', { action: 'notification', outcome: 'shown' }, { source: 'notification_hub.delivery', presentationEligible: false, carrier: 'internal' }),
  definition('delivery', 'notification.read', '通知已读', { action: 'notification', outcome: 'read' }, { source: 'notification_hub.delivery', presentationEligible: false, carrier: 'internal' }),
  definition('delivery', 'notification.dismissed', '通知已关闭', { action: 'notification', outcome: 'dismissed' }, { source: 'notification_hub.delivery', presentationEligible: false, carrier: 'internal' }),
  definition('delivery', 'notification.expired', '通知已过期', { action: 'notification', outcome: 'expired' }, { source: 'notification_hub.delivery', presentationEligible: false, carrier: 'internal' }),
  definition('delivery', 'important_sound', '重要声音', { action: 'sound', outcome: 'important' }, { source: 'notification_hub.delivery', soundProfileId: 'sound.important.default' })
];

const byId = new Map(DEFINITIONS.map((item) => [item.eventId, item]));
export const EVENT_DEFINITIONS = Object.freeze(Object.fromEntries(DEFINITIONS.map((item) => [item.eventId, item])));

function catalogError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function requireText(field, value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw catalogError('NOTIFICATION_EVENT_CATALOG_FIELD_INVALID', `${field} must be a non-empty string`, { field });
  }
  return value.trim();
}

export function resolveEventId({ categoryId, eventTypeId } = {}) {
  const category = requireText('categoryId', categoryId);
  const eventType = requireText('eventTypeId', eventTypeId);
  if (!EVENT_CATEGORIES.includes(category)) {
    throw catalogError('NOTIFICATION_EVENT_CATEGORY_UNKNOWN', `Unknown event category: ${category}`, { categoryId: category });
  }
  if (eventType.startsWith(`${category}.`) || eventType.includes(`${categoryId}.`)) {
    throw catalogError('NOTIFICATION_EVENT_TYPE_NOT_RELATIVE', 'eventTypeId must be relative to categoryId', { categoryId: category, eventTypeId: eventType });
  }
  const eventId = `${category}.${eventType}`;
  if (!byId.has(eventId)) {
    throw catalogError('NOTIFICATION_EVENT_UNKNOWN', `Unknown event definition: ${eventId}`, { eventId });
  }
  return eventId;
}

export function getEventDefinition(eventId) {
  const id = requireText('eventId', eventId);
  const value = byId.get(id);
  if (!value) throw catalogError('NOTIFICATION_EVENT_UNKNOWN', `Unknown event definition: ${id}`, { eventId: id });
  return value;
}

export function assertEventDefinition(eventId) {
  getEventDefinition(eventId);
  return true;
}

export function listEventDefinitions({ categoryId, presentationEligible } = {}) {
  return Object.freeze(DEFINITIONS.filter((item) => {
    if (categoryId !== undefined && item.categoryId !== categoryId) return false;
    if (presentationEligible !== undefined && item.presentationEligible !== presentationEligible) return false;
    return true;
  }));
}
