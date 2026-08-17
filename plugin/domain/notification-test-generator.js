const TEST_EVENT_DEFINITIONS = Object.freeze({
  chat_message: Object.freeze({
    label: '聊天新消息',
    semantic: '测试聊天新消息展示；不代表助手回复完成。',
    type: 'message_end',
    notificationType: 'chat_message',
    source: 'notification-hub.test.chat',
    channel: Object.freeze({ kind: 'chat', id: 'test-chat' }),
    importance: 'normal'
  }),
  channel_message: Object.freeze({
    label: '频道新消息',
    semantic: '测试外部频道收到新消息。',
    type: 'message_end',
    notificationType: 'channel_message',
    source: 'notification-hub.test.channel',
    channel: Object.freeze({ kind: 'channel', id: 'test-channel' }),
    importance: 'normal'
  }),
  tool_completed: Object.freeze({
    label: '工具执行完成',
    semantic: '测试工具已完成；不代表助手回复完成。',
    type: 'message_end',
    notificationType: 'tool_completed',
    source: 'notification-hub.test.tool',
    importance: 'normal'
  }),
  tool_error: Object.freeze({
    label: '工具执行失败',
    semantic: '测试工具失败声音和错误分类。',
    type: 'message_end',
    notificationType: 'tool_error',
    source: 'notification-hub.test.tool',
    importance: 'high'
  }),
  timeout: Object.freeze({
    label: '操作超时',
    semantic: '测试超时声音和错误分类。',
    type: 'message_end',
    notificationType: 'timeout',
    source: 'notification-hub.test.system',
    importance: 'high'
  }),
  system_warning: Object.freeze({
    label: '系统警告',
    semantic: '测试系统级警告展示和重要声音。',
    type: 'session_unhealthy_warning',
    notificationType: 'system_notification',
    source: 'notification-hub.test.system',
    importance: 'high'
  })
});

export const NOTIFICATION_TEST_EVENTS = Object.freeze(Object.keys(TEST_EVENT_DEFINITIONS));
export const NOTIFICATION_TEST_PREFIX = 'nh-pressure-test-';

function generatorError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function normalizeInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw generatorError('NOTIFICATION_TEST_INPUT_INVALID', 'test input must be an object');
  }
  const count = input.count === undefined ? 5 : Number(input.count);
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw generatorError('NOTIFICATION_TEST_COUNT_INVALID', 'count must be an integer from 1 to 100', { field: 'count' });
  }
  const intervalMs = input.intervalMs === undefined ? 100 : Number(input.intervalMs);
  if (!Number.isInteger(intervalMs) || intervalMs < 0 || intervalMs > 5000) {
    throw generatorError('NOTIFICATION_TEST_INTERVAL_INVALID', 'intervalMs must be an integer from 0 to 5000', { field: 'intervalMs' });
  }
  const events = input.events === undefined ? ['chat_message', 'channel_message', 'tool_completed', 'tool_error', 'timeout', 'system_warning'] : input.events;
  if (!Array.isArray(events) || events.length === 0 || events.some((event) => typeof event !== 'string' || !TEST_EVENT_DEFINITIONS[event])) {
    throw generatorError('NOTIFICATION_TEST_EVENTS_INVALID', 'events must contain supported test event names', { field: 'events', supported: NOTIFICATION_TEST_EVENTS });
  }
  const label = typeof input.label === 'string' && input.label.trim() ? input.label.trim().slice(0, 80) : 'Notification Hub 压力测试';
  return Object.freeze({
    count,
    intervalMs,
    events: Object.freeze([...events]),
    createCards: input.createCards !== false,
    playSound: input.playSound !== false,
    label
  });
}

export function normalizeNotificationTestInput(input = {}) {
  return normalizeInput(input);
}

export function createNotificationTestNotifications(input = {}, { now = () => Date.now(), idFactory } = {}) {
  const normalized = normalizeInput(input);
  if (typeof now !== 'function' || (idFactory !== undefined && typeof idFactory !== 'function')) {
    throw generatorError('NOTIFICATION_TEST_FACTORY_INVALID', 'now and idFactory must be functions');
  }
  const makeId = idFactory ?? ((index) => `${NOTIFICATION_TEST_PREFIX}${now().toString(36)}-${index + 1}`);
  return Object.freeze(Array.from({ length: normalized.count }, (_, index) => {
    const eventName = normalized.events[index % normalized.events.length];
    const definition = TEST_EVENT_DEFINITIONS[eventName];
    const id = String(makeId(index));
    if (!id.trim()) throw generatorError('NOTIFICATION_TEST_ID_INVALID', 'idFactory must return a non-empty string');
    const ordinal = `${index + 1}/${normalized.count}`;
    const content = `[压力测试] ${normalized.label}\n事件：${definition.label}（${eventName}）\n序号：${ordinal}\n语义：${definition.semantic}`;
    return Object.freeze({
      event: Object.freeze({
        eventId: id,
        traceId: `${id}:trace`,
        type: definition.type,
        ...(eventName === 'tool_completed' ? { stopReason: 'tool_result' } : {}),
        ...(eventName === 'tool_error' ? { stopReason: 'tool_error' } : {}),
        ...(eventName === 'timeout' ? { stopReason: 'timeout' } : {}),
        ...(definition.type === 'message_end' && !['tool_completed', 'tool_error', 'timeout'].includes(eventName) ? { stopReason: 'end_turn' } : {}),
        source: definition.source
      }),
      notification: Object.freeze({
        notificationId: id,
        traceId: `${id}:trace`,
        title: `[压力测试 ${ordinal}] ${definition.label}`,
        content,
        type: definition.notificationType,
        source: definition.source,
        importance: definition.importance,
        ...(definition.channel ? { channel: definition.channel } : {}),
        producer: Object.freeze({ kind: 'api', id: 'notification-hub-test', label: 'Notification Hub 测试工具' }),
        metadata: Object.freeze({
          test: true,
          testEvent: eventName,
          testOrdinal: ordinal,
          testSemantic: definition.semantic
        })
      }),
      eventName,
      definition
    });
  }));
}

export function getNotificationTestEventDefinition(eventName) {
  return TEST_EVENT_DEFINITIONS[eventName] ?? null;
}
