import assert from 'node:assert/strict';
import test from 'node:test';

import { NotificationApi } from '../../plugin/api/notification-api.js';
import { createNotificationEventAdapter } from '../../plugin/events/notification-event-adapter.js';

const silentLog = {
  warn() {}
};

test('tool execution start is not a notification until a tool result arrives', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'tool_execution_start',
    toolCallId: 'tool-1',
    toolName: 'download'
  }, 'session-tool');
  assert.equal(result.handled, false);
  assert.equal(result.reason, 'ignored-event');
  assert.equal(api.store.size, 0);
});

test('explicit model_service_error event enters the model service category', () => {
  const api = new NotificationApi({ soundProfile: { global: { enabled: true } } });
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'model_service_error',
    eventId: 'model-event-1',
    status: 503,
    provider: 'provider-x',
    model: 'model-y',
    operation: 'memory_summary',
    taskKey: 'memory-ticker'
  }, 'session-memory');
  assert.equal(result.handled, true);
  assert.equal(result.record.type, 'model_service_error');
  assert.equal(result.record.source, 'hana.model');
  assert.equal(result.record.metadata.modelService.httpStatus, 503);
  assert.equal(result.record.metadata.modelService.taskKey, 'memory-ticker');
});

test('model service errors use nested provider event ids for duplicate suppression', () => {
  const api = new NotificationApi({ soundProfile: { global: { enabled: true } } });
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const event = {
    type: 'model_service_error',
    payload: {
      eventId: 'nested-provider-event-1',
      status: 503,
      provider: 'provider-x',
      model: 'model-y',
      operation: 'chat'
    }
  };
  const first = adapter.handle(event, 'session-memory');
  const second = adapter.handle(structuredClone(event), 'session-memory');
  assert.equal(first.handled, true);
  assert.match(first.record.notificationId, /nested-provider-event-1/);
  assert.equal(second.handled, false);
  assert.equal(second.reason, 'duplicate-event');
  assert.equal(api.store.size, 1);
});

test('model_service_recovered closes an active incident without creating a notification', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const first = adapter.handle({
    type: 'model_service_error',
    eventId: 'model-event-recover-1',
    status: 503,
    provider: 'provider-x',
    model: 'model-y',
    operation: 'memory_summary',
    taskKey: 'memory-ticker'
  }, 'session-memory');
  const recovered = adapter.handle({
    type: 'model_service_recovered',
    eventId: 'model-event-recover-2',
    status: 503,
    provider: 'provider-x',
    model: 'model-y',
    operation: 'memory_summary',
    taskKey: 'memory-ticker'
  }, 'session-memory');
  assert.equal(first.handled, true);
  assert.equal(recovered.handled, true);
  assert.equal(recovered.recovered, true);
  assert.equal(api.store.size, 1);
  assert.equal(recovered.record.metadata.incidentLifecycle.status, 'recovered');
  assert.equal(api.store.get(first.record.notificationId).metadata.incidentLifecycle.status, 'recovered');
});

test('structured provider failure inside message_end enters the model service sound path', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'message_end',
    eventId: 'message-provider-failure-1',
    stopReason: 'error',
    message: {
      role: 'assistant',
      stopReason: 'error',
      content: '操作未能完成',
      error: {
        statusCode: 503,
        provider: 'provider-x',
        model: 'model-y',
        operation: 'chat'
      }
    }
  }, 'session-memory');
  assert.equal(result.handled, true);
  assert.equal(result.record.type, 'model_service_error');
  assert.equal(result.record.source, 'hana.model');
  assert.equal(result.record.metadata.modelService.httpStatus, 503);
  assert.equal(result.record.metadata.modelService.operation, 'chat');
  assert.equal(api.store.size, 1);
});

test('deeply nested provider payloads enter model service warning scheduler and preserve event ids', async () => {
  const scheduled = [];
  const api = new NotificationApi({
    soundProfile: { global: { enabled: true } },
    soundScheduler: {
      schedule(decision, context) {
        scheduled.push({ decision, context });
        return Promise.resolve({ status: 'played', playback: { played: true } });
      }
    }
  });
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'message_end',
    payload: {
      message_end: {
        eventId: 'deep-model-failure-1',
        stopReason: 'error',
        result: {
          response: {
            failure: {
              error: {
                statusCode: 503,
                provider: 'provider-deep',
                model: 'model-deep',
                operation: 'chat'
              }
            }
          }
        }
      }
    }
  }, 'session-memory');

  assert.equal(result.handled, true);
  assert.equal(result.record.type, 'model_service_error');
  assert.equal(result.record.metadata.modelService.httpStatus, 503);
  assert.equal(result.record.metadata.modelService.provider, 'provider-deep');
  assert.equal(result.record.metadata.modelService.operation, 'chat');
  assert.match(result.record.notificationId, /deep-model-failure-1/);
  assert.equal(result.record.metadata.eventClassification.classification, 'model_service');
  assert.equal(result.record.metadata.eventClassification.action, 'notify');
  assert.equal(result.record.metadata.eventClassification.abnormal, true);
  assert.equal(result.record.metadata.eventClassification.successful, false);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].decision.play, true);
  assert.equal(scheduled[0].decision.cue, 'warning');
  assert.equal((await result.record && result.record.notificationId).includes('deep-model-failure-1'), true);
});

test('deeply nested ordinary text error and tool error remain outside model service category', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const ordinary = adapter.handle({
    type: 'error',
    payload: { result: { failure: { message: '操作未能完成' } } }
  }, 'session-memory');
  const tool = adapter.handle({
    type: 'tool_execution_end',
    eventId: 'deep-tool-error-1',
    toolCallId: 'deep-tool-call-1',
    isError: true,
    result: { payload: { failure: { message: 'Path not found' } } }
  }, 'session-memory');

  assert.equal(ordinary.handled, false);
  assert.equal(ordinary.reason, 'ignored-event');
  assert.equal(tool.handled, true);
  assert.equal(tool.record.type, 'tool_error');
  assert.equal(tool.record.metadata.eventClassification.classification, 'tool_error');
  assert.equal(api.listNotifications().filter((record) => record.type === 'model_service_error').length, 0);
});

test('structured response status inside a generic error enters the model service sound path', async () => {
  const calls = [];
  const api = new NotificationApi({
    soundProfile: { global: { enabled: true } },
    soundPlayer: async ({ decision }) => { calls.push(decision); return { played: true }; }
  });
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'error',
    eventId: 'provider-error-1',
    error: {
      code: 'PROVIDER_ERROR',
      response: { status: 502 },
      provider: 'provider-x',
      model: 'model-y',
      operation: 'chat'
    },
    message: '操作未能完成'
  }, 'session-memory');
  assert.equal(result.handled, true);
  assert.equal(result.record.type, 'model_service_error');
  assert.equal(result.record.metadata.modelService.httpStatus, 502);
  assert.equal(result.record.metadata.modelService.provider, 'provider-x');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].play, true);
  assert.equal(calls[0].cue, 'warning');
});

test('status-bearing provider error text enters the model service path', () => {
  const api = new NotificationApi({ soundProfile: { global: { enabled: true } }, soundPlayer: async () => ({ played: true }) });
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'error',
    eventId: 'provider-error-text-status',
    error: 'LLM returned invalid JSON (status=502)',
    provider: 'provider-x',
    operation: 'memory_summary'
  }, 'session-memory');
  assert.equal(result.handled, true);
  assert.equal(result.record.type, 'model_service_error');
  assert.equal(result.record.metadata.modelService.httpStatus, 502);
});

test('root response status inside a provider error enters the model service path', () => {
  const api = new NotificationApi({ soundProfile: { global: { enabled: true } }, soundPlayer: async () => ({ played: true }) });
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'error',
    eventId: 'provider-error-root-response',
    response: { statusCode: 503 },
    provider: 'provider-x',
    operation: 'chat',
    message: '操作未能完成'
  }, 'session-memory');
  assert.equal(result.handled, true);
  assert.equal(result.record.type, 'model_service_error');
  assert.equal(result.record.metadata.modelService.httpStatus, 503);
});

test('bare service-unavailable text remains ignored without model-service context', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'error',
    eventId: 'unrelated-error-unavailable',
    error: 'Service temporarily unavailable'
  }, 'session-memory');
  assert.equal(result.handled, false);
  assert.equal(result.reason, 'ignored-event');
  assert.equal(api.store.size, 0);
});

test('generic model error text is accepted when provider context is structured', () => {
  const api = new NotificationApi({ soundProfile: { global: { enabled: true } }, soundPlayer: async () => ({ played: true }) });
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'error',
    eventId: 'provider-error-unavailable-context',
    error: 'Service temporarily unavailable',
    provider: 'provider-x',
    operation: 'memory_summary'
  }, 'session-memory');
  assert.equal(result.handled, true);
  assert.equal(result.record.type, 'model_service_error');
});

test('unrelated HTTP error is not guessed as a model service error', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'error',
    status: 503,
    source: 'unrelated-subsystem',
    message: 'An unrelated application error'
  }, 'session-memory');
  assert.equal(result.handled, false);
  assert.equal(result.reason, 'ignored-event');
  assert.equal(api.store.size, 0);
});

test('message_end failure without provider evidence is not guessed as a model service error', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'message_end',
    eventId: 'cancelled-message-error',
    message: { role: 'assistant', stopReason: 'error', content: '用户取消了本轮操作' }
  }, 'session-memory');
  assert.equal(result.handled, false);
  assert.equal(result.reason, 'ignored-event');
  assert.equal(api.store.size, 0);
});

test('generic error text is not guessed as a model service error', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({ type: 'error', message: '操作未能完成' }, 'session-memory');
  assert.equal(result.handled, false);
  assert.equal(result.reason, 'ignored-event');
  assert.equal(api.store.size, 0);
});

test('channel_new_message becomes a channel notification instead of a desktop chat notification', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'channel_new_message',
    channelName: 'ch_1c5623',
    channelId: 'ch_1c5623',
    sender: 'chatgpt',
    message: { body: '频道中的回复。', timestamp: '2026-08-12T08:02:32.000Z' }
  }, 'C:/session/phone/channel.jsonl');

  assert.equal(result.handled, true);
  assert.equal(result.record.type, 'channel_message');
  assert.equal(result.record.source, 'hana.channel');
  assert.deepEqual(result.record.channel, { kind: 'channel', id: 'ch_1c5623' });
  assert.deepEqual(result.record.channel.kind === 'chat', false);
  assert.equal(result.record.title, 'ch_1c5623');
  assert.equal(result.record.content, '频道中的回复。');
});

test('channel_new_message remains a channel when the legacy payload has no channel id', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'channel_new_message',
    sender: 'hanako',
    message: { body: '没有频道 ID 也不能误判成聊天。' }
  }, 'C:/session/phone/channel.jsonl');

  assert.equal(result.handled, true);
  assert.deepEqual(result.record.channel, { kind: 'channel' });
});

test('channel_new_message accepts legacy nested channel fields and message text', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'channel_new_message',
    metadata: { channelName: 'ch_1c5623', channelId: 'ch_1c5623' },
    sender: 'hanako',
    message: { text: '旧版事件格式的频道消息。', timestamp: '2026-08-12T08:02:55.000Z' }
  }, 'C:/session/phone/channel.jsonl');

  assert.equal(result.handled, true);
  assert.deepEqual(result.record.channel, { kind: 'channel', id: 'ch_1c5623' });
  assert.equal(result.record.title, 'ch_1c5623');
  assert.equal(result.record.content, '旧版事件格式的频道消息。');
  assert.equal(result.record.metadata.sender, 'hanako');
  assert.equal(result.record.metadata.channelName, 'ch_1c5623');
});

test('phone session message_end is not duplicated as a desktop chat notification', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'message_end',
    message: { role: 'assistant', id: 'phone-message-1', stopReason: 'end_turn', content: '频道投递回执' }
  }, 'C:/session/phone/sessions/channel.jsonl');

  assert.equal(result.handled, false);
  assert.equal(result.reason, 'phone-session-message');
  assert.equal(api.store.size, 0);
});

test('dm_new_message is accepted as a direct-message notification without chat fallback assumptions', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'dm_new_message',
    channel: { kind: 'dm', id: 'dm-1' },
    message: { body: '私信消息。', id: 'dm-message-1' }
  }, 'C:/session/phone/dm.jsonl');

  assert.equal(result.handled, true);
  assert.equal(result.record.type, 'assistant_message');
  assert.equal(result.record.source, 'hana.dm');
  assert.deepEqual(result.record.channel, { kind: 'dm', id: 'dm-1' });
  assert.equal(result.record.content, '私信消息。');
});

test('assistant session message becomes a stored notification', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'session:message',
    role: 'assistant',
    messageId: 'message-1',
    traceId: 'trace-1',
    content: '任务已经完成。',
    timestamp: '2026-08-05T10:00:00.000Z'
  }, 'C:/session/chat.jsonl');

  assert.equal(result.handled, true);
  assert.equal(result.record.notificationId, 'hana-message-message-1');
  assert.equal(result.record.type, 'assistant_message');
  assert.equal(result.record.source, 'hana.session');
  assert.equal(result.record.title, '助手回复完成');
  assert.equal(result.record.content, '任务已经完成。');
  assert.deepEqual(result.record.channel, { kind: 'chat', id: 'desktop' });
  assert.equal(result.record.session, 'C:/session/chat.jsonl');
  assert.equal(api.listNotifications().length, 1);
});

test('internal assistant messages are filtered before Store ingestion', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });

  for (const event of [
    { type: 'session:message', role: 'assistant', content: '内部思考', visibility: 'internal' },
    { type: 'message_end', visibility: 'internal', message: { role: 'assistant', content: '内部思考' } },
    { type: 'session:message', role: 'assistant', internal: true, content: '内部思考' },
    { type: 'message_end', message: { role: 'assistant', metadata: { visibility: 'internal' }, content: '内部思考' } }
  ]) {
    const result = adapter.handle(event, 'session-internal');
    assert.equal(result.handled, false);
    assert.equal(result.reason, 'internal-message');
  }
  assert.equal(api.store.size, 0);
});

test('assistant thinking blocks are removed while visible text is preserved', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'session:message',
    role: 'assistant',
    content: '<thinking>隐藏的内部思考</thinking>最终给用户的答案。'
  }, 'session-thinking');

  assert.equal(result.handled, true);
  assert.equal(result.record.content, '最终给用户的答案。');
  assert.equal(api.store.size, 1);
  assert.equal(adapter.handle({ type: 'session:message', role: 'assistant', content: '<thinking>只有内部思考</thinking>' }, 'session-thinking').handled, false);
  assert.equal(api.store.size, 1);
});

test('ordinary assistant text mentioning internal remains visible', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'session:message',
    role: 'assistant',
    content: '我会解释 internal 标记的含义，但这段正文对用户可见。'
  }, 'session-visible');

  assert.equal(result.handled, true);
  assert.equal(api.store.size, 1);
});

test('explicit Bridge channel metadata is preserved on the notification', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'message_end',
    channel: { kind: 'telegram', id: 'chat-1' },
    message: {
      role: 'assistant',
      id: 'bridge-message-1',
      stopReason: 'end_turn',
      content: [{ type: 'text', text: '来自 Telegram 的回复。' }]
    }
  }, 'C:/session/telegram.jsonl');

  assert.equal(result.handled, true);
  assert.deepEqual(result.record.channel, { kind: 'telegram', id: 'chat-1' });
});

test('nested Bridge channel metadata is preserved instead of falling back to desktop chat', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'message_end',
    metadata: { channel: { kind: 'feishu', id: 'group-2' } },
    message: {
      role: 'assistant',
      id: 'nested-bridge-message-1',
      stopReason: 'end_turn',
      content: [{ type: 'text', text: '来自飞书频道的回复。' }]
    }
  }, 'C:/session/feishu.jsonl');

  assert.equal(result.handled, true);
  assert.deepEqual(result.record.channel, { kind: 'feishu', id: 'group-2' });
});

test('Hana message_end assistant event becomes a stored notification', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'message_end',
    message: {
      role: 'assistant',
      id: 'message-end-1',
      stopReason: 'end_turn',
      content: [
        { type: 'text', text: '来自真实 Hana message_end 事件。' }
      ]
    }
  }, 'C:/session/real-chat.jsonl');

  assert.equal(result.handled, true);
  assert.equal(result.record.notificationId, 'hana-message-message-end-1');
  assert.equal(result.record.content, '来自真实 Hana message_end 事件。');
  assert.equal(api.listNotifications().length, 1);
});

test('channel tool execution carries channel context from tool start to tool result', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });

  const start = adapter.handle({
    type: 'tool_execution_start',
    toolCallId: 'call-channel-tool-1',
    toolName: 'channel_reply',
    args: { channel: { kind: 'channel', id: 'ch_1c5623' } }
  }, 'C:/session/channel.jsonl');
  const result = adapter.handle({
    type: 'tool_execution_end',
    toolCallId: 'call-channel-tool-1',
    toolName: 'channel_reply',
    isError: false,
    result: { content: [{ type: 'text', text: '已发送到频道。' }], details: {} }
  }, 'C:/session/channel.jsonl');

  assert.equal(start.handled, false);
  assert.equal(result.handled, true);
  assert.deepEqual(result.record.channel, { kind: 'channel', id: 'ch_1c5623' });
});

test('channel_reply result details identify the actual channel without relying on result text', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'tool_execution_end',
    toolCallId: 'call-channel-reply-details-1',
    toolName: 'channel_reply',
    isError: false,
    result: {
      content: [{ type: 'text', text: '已发送到 #ch_1c5623' }],
      details: { action: 'reply', channel: 'ch_1c5623' }
    }
  }, 'C:/session/channel.jsonl');

  assert.equal(result.handled, true);
  assert.deepEqual(result.record.channel, { kind: 'channel', id: 'ch_1c5623' });
});

test('failed channel tool execution keeps channel context and classifies as channel tool error', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });

  adapter.handle({
    type: 'tool_execution_start',
    toolCallId: 'call-channel-tool-error-1',
    toolName: 'channel_reply',
    args: { channelId: 'ch_1c5623' }
  }, 'C:/session/channel.jsonl');
  const result = adapter.handle({
    type: 'tool_execution_end',
    toolCallId: 'call-channel-tool-error-1',
    toolName: 'channel_reply',
    isError: true,
    error: '频道投递失败'
  }, 'C:/session/channel.jsonl');

  assert.equal(result.handled, true);
  assert.deepEqual(result.record.channel, { kind: 'channel', id: 'ch_1c5623' });
  assert.deepEqual(result.record.metadata.eventClassification.classification, 'tool_error');
});

test('tool text mentioning a channel does not create channel context without structured metadata', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'tool_execution_end',
    toolCallId: 'call-tool-text-channel-1',
    toolName: 'read',
    isError: false,
    result: { content: [{ type: 'text', text: '已读取 #ch_1c5623 的配置。' }] }
  }, 'C:/session/chat.jsonl');

  assert.equal(result.handled, true);
  assert.deepEqual(result.record.channel, { kind: 'chat', id: 'desktop' });
});

test('tool execution errors become stored tool_error notifications', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'tool_execution_end',
    eventId: 'tool-event-1',
    toolCallId: 'call-1',
    toolName: 'exec_command',
    isError: true,
    error: '命令执行失败',
    timestamp: '2026-08-09T10:00:00.000Z'
  }, 'C:/session/tool.jsonl');

  assert.equal(result.handled, true);
  assert.equal(result.record.notificationId, 'hana-tool-error-tool-event-1');
  assert.equal(result.record.type, 'tool_error');
  assert.equal(result.record.source, 'hana.tool');
  assert.equal(result.record.title, '工具执行失败');
  assert.equal(result.record.content, '命令执行失败');
  assert.equal(result.record.metadata.eventClassification.classification, 'tool_error');
  assert.equal(api.listNotifications().length, 1);
});

test('Pi tool execution errors read the error text from result.content', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'tool_execution_end',
    toolCallId: 'call-pi-1',
    toolName: 'read',
    isError: true,
    result: {
      content: [{ type: 'text', text: 'Path not found' }],
      details: {}
    }
  }, 'C:/session/pi-tool.jsonl');

  assert.equal(result.handled, true);
  assert.equal(result.record.content, 'Path not found');
  assert.equal(result.record.metadata.toolName, 'read');
  assert.equal(api.listNotifications().length, 1);
});

test('Pi successful tool execution keeps the formal tool event for sound routing', async () => {
  const diagnostics = [];
  const api = new NotificationApi({
    soundProfile: {
      global: { enabled: true },
      soundOverrides: [{ eventId: 'tool.execution.succeeded', soundId: 'custom.tool-success' }]
    },
    soundPlayer: () => ({ played: true }),
    onSoundDiagnostic: (payload) => diagnostics.push(payload)
  });
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'tool_execution_end',
    toolCallId: 'call-pi-success-1',
    toolName: 'read',
    isError: false,
    result: {
      content: [{ type: 'text', text: '文件内容已读取' }],
      details: {}
    }
  }, 'C:/session/pi-tool.jsonl');

  assert.equal(result.handled, true);
  assert.equal(result.record.notificationId, 'hana-tool-result-call-pi-success-1');
  assert.equal(result.record.type, 'tool_result');
  assert.equal(result.record.source, 'hana.tool');
  assert.equal(result.record.title, '工具执行完成');
  assert.equal(result.record.content, '文件内容已读取');
  assert.equal(result.record.metadata.toolName, 'read');
  assert.equal(result.record.metadata.isError, false);
  assert.equal(api.listNotifications().length, 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(diagnostics[0].input.eventId, 'tool.execution.succeeded');
  assert.equal(diagnostics[0].decision.soundId, 'custom.tool-success');
  assert.equal(diagnostics[0].decision.matchedRuleId, 'override:tool.execution.succeeded');
});

test('adapter routes all notification sound events by formal eventId', async () => {
  const diagnostics = [];
  const api = new NotificationApi({
    soundProfile: {
      global: { enabled: true },
      soundOverrides: [
        { eventId: 'chat.assistant_reply.completed', soundId: 'custom.chat' },
        { eventId: 'tool.execution.succeeded', soundId: 'custom.tool-success' },
        { eventId: 'tool.execution.failed', soundId: 'custom.tool-failure' }
      ]
    },
    soundPlayer: () => ({ played: true }),
    onSoundDiagnostic: (payload) => diagnostics.push(payload)
  });
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });

  adapter.handle({ type: 'message_end', eventId: 'assistant-1', message: { role: 'assistant', stopReason: 'end_turn', content: '答复' } }, 'session-a');
  adapter.handle({ type: 'tool_execution_end', eventId: 'tool-success-1', toolCallId: 'call-success-1', toolName: 'read', isError: false, result: { content: [{ type: 'text', text: '成功' }] } }, 'session-a');
  adapter.handle({ type: 'tool_execution_end', eventId: 'tool-failure-1', toolCallId: 'call-failure-1', toolName: 'read', isError: true, error: '失败' }, 'session-a');

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(diagnostics.map((entry) => ({ eventId: entry.input.eventId, soundId: entry.decision.soundId })), [
    { eventId: 'chat.assistant_reply.completed', soundId: 'custom.chat' },
    { eventId: 'tool.execution.succeeded', soundId: 'custom.tool-success' },
    { eventId: 'tool.execution.failed', soundId: 'custom.tool-failure' }
  ]);
});

test('session health warnings become system_notification records', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'session_unhealthy_warning',
    recentErrors: 3,
    totalChecked: 5
  }, 'C:/session/unhealthy.jsonl');

  assert.equal(result.handled, true);
  assert.equal(result.record.notificationId, 'hana-system-session-unhealthy-warning-C%3A%2Fsession%2Funhealthy.jsonl-3-5');
  assert.equal(result.record.type, 'system_notification');
  assert.equal(result.record.source, 'hana.system');
  assert.equal(result.record.title, '会话健康警告');
  assert.equal(result.record.content, '会话恢复检查发现 3/5 条近期助手消息异常，建议新建会话。');
  assert.equal(result.record.importance, 'high');
  assert.equal(result.record.metadata.busEventType, 'session_unhealthy_warning');
  assert.equal(result.record.metadata.recentErrors, 3);
  assert.equal(result.record.metadata.totalChecked, 5);
});

test('session branch persistence warnings preserve reason and message', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const result = adapter.handle({
    type: 'session_branch_persistence_warning',
    reason: 'append_sync',
    message: 'manifest write failed'
  }, 'C:/session/branch.jsonl');

  assert.equal(result.handled, true);
  assert.equal(result.record.type, 'system_notification');
  assert.equal(result.record.source, 'hana.system');
  assert.equal(result.record.title, '会话分支保存警告');
  assert.equal(result.record.content, '会话分支保存失败（append_sync）：manifest write failed');
  assert.equal(result.record.importance, 'high');
  assert.equal(result.record.metadata.busEventType, 'session_branch_persistence_warning');
  assert.equal(result.record.metadata.reason, 'append_sync');
  assert.equal(result.record.metadata.message, 'manifest write failed');
});

test('session status events remain lifecycle-only and do not write notifications', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });

  assert.equal(adapter.handle({ type: 'session_status', isStreaming: true }, 'session-a').handled, false);
  assert.equal(api.store.size, 0);
});

test('non-assistant, tool-use, or empty messages are ignored without a Store write', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });

  assert.equal(adapter.handle({ type: 'session:message', role: 'user', content: '用户消息' }, 'session-a').handled, false);
  assert.equal(adapter.handle({ type: 'session:message', role: 'assistant', content: '  ' }, 'session-a').handled, false);
  assert.equal(adapter.handle({
    type: 'message_end',
    message: {
      role: 'assistant',
      stopReason: 'toolUse',
      content: [{ type: 'text', text: '工具调用前的中间文本' }, { type: 'toolCall', id: 'tool-1' }]
    }
  }, 'session-a').handled, false);
  assert.equal(api.store.size, 0);
});

test('message_end events without an event id remain distinct within one session', async () => {
  const calls = [];
  const api = new NotificationApi({
    soundProfile: { global: { enabled: true } },
    soundPlayer: () => { calls.push('play'); return { played: true }; }
  });
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const first = adapter.handle({
    type: 'message_end',
    message: { role: 'assistant', stopReason: 'end_turn', content: '第一轮助手回复' }
  }, 'session-chat');
  const second = adapter.handle({
    type: 'message_end',
    message: { role: 'assistant', stopReason: 'end_turn', content: '第二轮助手回复' }
  }, 'session-chat');

  assert.equal(first.handled, true);
  assert.equal(second.handled, true);
  assert.equal(api.store.size, 2);
  assert.notEqual(first.record.notificationId, second.record.notificationId);
  assert.match(first.record.notificationId, /^hana-message-anonymous-message_end-1-/);
  assert.match(second.record.notificationId, /^hana-message-anonymous-message_end-2-/);
  assert.equal(first.record.content, '第一轮助手回复');
  assert.equal(second.record.content, '第二轮助手回复');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 2);
});

test('same event id is ignored on repeated bus delivery', () => {
  const api = new NotificationApi();
  const adapter = createNotificationEventAdapter({ notificationApi: api, log: silentLog });
  const event = { type: 'session:message', role: 'assistant', eventId: 'event-1', content: '只存一次' };

  assert.equal(adapter.handle(event, 'session-a').handled, true);
  const repeat = adapter.handle(event, 'session-a');
  assert.equal(repeat.handled, false);
  assert.equal(repeat.reason, 'duplicate-event');
  assert.equal(api.store.size, 1);
});

test('ingestion failure becomes a diagnostic result and does not escape handle', () => {
  const diagnostics = [];
  const adapter = createNotificationEventAdapter({
    notificationApi: { ingestEvent() { throw Object.assign(new Error('store failed'), { code: 'TEST_STORE_FAILED' }); } },
    log: { warn(message, details) { diagnostics.push({ message, details }); } }
  });

  const result = adapter.handle({ type: 'session:message', role: 'assistant', content: '不会抛出' }, 'session-a');

  assert.equal(result.handled, false);
  assert.equal(result.reason, 'ingestion-failed');
  assert.equal(adapter.diagnostics.at(-1).code, 'TEST_STORE_FAILED');
  assert.equal(diagnostics.length, 1);
});
