import { randomUUID } from 'node:crypto';
import { stripInternalReflectionBlocks } from '../domain/internal-message-filter.js';

function normalizeDiagnostic(error, stage) {
  return {
    code: error?.code ?? 'NOTIFICATION_EVENT_ADAPTER_FAILED',
    message: error?.message ?? String(error),
    stage,
    details: error?.details ?? {},
    timestamp: new Date().toISOString()
  };
}

function readMessage(event) {
  if (event?.message && typeof event.message === 'object' && !Array.isArray(event.message)) {
    return event.message;
  }
  return event;
}

function nestedObjects(value, maxDepth = 8, depth = 0, seen = new Set()) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > maxDepth || seen.has(value)) return [];
  seen.add(value);
  const result = [value];
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      result.push(...nestedObjects(child, maxDepth, depth + 1, seen));
    }
  }
  return result;
}

function nestedField(event, key) {
  return nestedObjects(event).find((candidate) => candidate[key] !== undefined && candidate[key] !== null)?.[key];
}

function extractNestedText(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  for (const candidate of nestedObjects(value)) {
    for (const key of ['message', 'text', 'error', 'body']) {
      if (typeof candidate[key] === 'string' && candidate[key].trim()) return candidate[key].trim();
    }
    if (Array.isArray(candidate.content)) {
      const content = candidate.content
        .filter((part) => part?.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('')
        .trim();
      if (content) return content;
    }
  }
  return '';
}

function extractMessageContent(message) {
  const candidates = [message?.content, message?.body, message?.text];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return stripInternalReflectionBlocks(candidate);
    }
    if (!Array.isArray(candidate)) continue;
    const content = stripInternalReflectionBlocks(candidate
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join(''));
    if (content.trim()) return content;
  }
  return '';
}

function extractChannelMessageContent(event) {
  const message = event?.message;
  const candidates = [
    typeof message === 'string' ? message : null,
    message?.body,
    message?.content,
    message?.text,
    event?.body,
    event?.content,
    event?.text,
    event?.payload?.body,
    event?.payload?.content,
    event?.payload?.text
  ];
  for (const candidate of candidates) {
    const content = typeof candidate === 'string'
      ? candidate
      : extractMessageContent({ content: candidate });
    if (content.trim()) return content.trim();
  }
  return '';
}

function isPhoneSession(sessionPath) {
  return typeof sessionPath === 'string' && /[\\/]phone[\\/]sessions[\\/]/i.test(sessionPath);
}

function readVisibility(event, message) {
  const candidates = [
    event?.visibility,
    event?.metadata?.visibility,
    event?.message?.visibility,
    message?.visibility,
    message?.metadata?.visibility
  ];
  return candidates.find((value) => typeof value === 'string' && value.trim())?.trim().toLowerCase() ?? null;
}

function isInternalMessage(event, message) {
  if (readVisibility(event, message) === 'internal') return true;
  const candidates = [event, event?.message, event?.payload, event?.message?.payload];
  return candidates.some((candidate) => candidate && typeof candidate === 'object' && (
    candidate.internal === true
    || candidate.isInternal === true
    || candidate.messageType === 'internal'
    || candidate.kind === 'internal'
    || candidate.type === 'internal_message'
  ));
}

function resolveEventId(event) {
  const message = readMessage(event);
  return event.eventId
    || event.messageId
    || event.id
    || event.message?.eventId
    || event.message?.messageId
    || event.message?.id
    || event.payload?.eventId
    || event.payload?.messageId
    || event.payload?.id
    || message.eventId
    || message.messageId
    || message.id
    || null;
}

function resolveTimestamp(event) {
  const message = readMessage(event);
  const value = event.timestamp
    ?? event.createdAt
    ?? event.message?.timestamp
    ?? event.message?.createdAt
    ?? event.payload?.timestamp
    ?? event.payload?.createdAt
    ?? message.timestamp
    ?? message.createdAt;
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value === 'string') return value;
  return undefined;
}

function normalizeChannel(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const kind = typeof value.kind === 'string' ? value.kind.trim() : '';
    if (kind) {
      return {
        kind,
        ...(typeof value.id === 'string' && value.id.trim() ? { id: value.id.trim() } : {})
      };
    }
    for (const nestedKey of ['channel', 'bridge', 'transport', 'source']) {
      const nested = normalizeChannel(value[nestedKey]);
      if (nested) return nested;
    }
  }
  if (typeof value === 'string' && value.trim()) return { kind: value.trim() };
  return null;
}

function resolveChannel(event, sessionPath, fallbackChannel = null) {
  const message = readMessage(event);
  const toolDetails = event?.result?.details;
  const channelName = event?.channelName
    || event?.metadata?.channelName
    || event?.payload?.channelName
    || event?.args?.channelName
    || event?.tool?.channelName
    || event?.tool?.target?.channelName
    || toolDetails?.channelName;
  const channelId = event?.channelId
    || event?.metadata?.channelId
    || event?.payload?.channelId
    || event?.args?.channelId
    || event?.tool?.channelId
    || event?.tool?.target?.channelId
    || toolDetails?.channelId;
  const toolChannel = toolDetails?.channel;
  const channelEvent = (event?.type === 'channel_new_message' || channelName || channelId)
    && (channelName || channelId)
    ? {
      kind: 'channel',
      id: String(channelId || channelName).trim()
    }
    : (toolChannel && typeof toolChannel === 'object' && !Array.isArray(toolChannel)
      ? normalizeChannel(toolChannel)
      : (typeof toolChannel === 'string' && toolChannel.trim()
        ? { kind: 'channel', id: toolChannel.trim() }
        : null));
  const candidates = [
    channelEvent,
    event?.channel,
    message?.channel,
    event?.metadata?.channel,
    message?.metadata?.channel,
    event?.payload?.channel,
    message?.payload?.channel,
    event?.args?.channel,
    event?.tool?.channel,
    event?.tool?.target?.channel,
    event?.bridge,
    message?.bridge,
    event?.metadata?.bridge,
    message?.metadata?.bridge,
    event?.channelKind,
    message?.channelKind,
    event?.metadata?.channelKind,
    message?.metadata?.channelKind,
    event?.channelId,
    message?.channelId,
    event?.metadata?.channelId,
    message?.metadata?.channelId,
    event?.args?.channelId,
    event?.tool?.channelId,
    event?.tool?.target?.channelId
  ];
  for (const candidate of candidates) {
    const channel = normalizeChannel(candidate);
    if (channel) return channel;
  }

  // 工具结束事件可能没有重复携带频道字段，允许调用方传入工具开始阶段缓存的结构化上下文。
  const cachedChannel = normalizeChannel(fallbackChannel);
  if (cachedChannel) return cachedChannel;

  // 事件类型本身已经给出比默认值更强的语义，即使旧载荷没有频道 ID 也不能降级成聊天。
  if (event?.type === 'channel_new_message') return { kind: 'channel' };
  if (event?.type === 'dm_new_message') return { kind: 'dm' };

  // Hana 桌面 Session Bus 没有显式频道时，才落到桌面聊天渠道。
  // sessionPath 只作为上下文，不猜测其中的文件名或正文含义。
  void sessionPath;
  return { kind: 'chat', id: 'desktop' };
}

function extractToolResultContent(event) {
  if (typeof event?.result === 'string' && event.result.trim()) return event.result.trim();
  if (event?.result && typeof event.result === 'object') {
    for (const value of [event.result.text, event.result.message]) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    if (Array.isArray(event.result.content)) {
      const content = event.result.content
        .filter((part) => part?.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('')
        .trim();
      if (content) return content;
    }
  }
  return '';
}

function extractToolErrorContent(event) {
  return extractNestedText(event?.error)
    || extractNestedText(event?.message)
    || extractNestedText(event?.result)
    || extractNestedText(event?.payload)
    || '';
}

function resolveToolEventId(event) {
  return event?.eventId || event?.messageId || event?.id || event?.toolCallId || null;
}

function isSystemWarningEventType(type) {
  return type === 'session_unhealthy_warning' || type === 'session_branch_persistence_warning';
}

function isModelServiceErrorEventType(type) {
  return type === 'model_service_error';
}

function isModelServiceRecoveredEventType(type) {
  return type === 'model_service_recovered';
}

function readField(value, ...keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null) return value[key];
  }
  return undefined;
}

const FAILURE_STATUS_FIELDS = Object.freeze(['status', 'httpStatus', 'statusCode', 'http_status', 'status_code', 'errorCode', 'error_code', 'code']);

function parseFailureStatus(value) {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric >= 400 && numeric <= 599) return numeric;
  if (typeof value !== 'string') return null;
  const match = value.match(/(?:^|[^0-9])(4(?:00|01|03|04|05|08|09|25|29|22)|5(?:00|02|03|04))(?:$|[^0-9])/);
  return match ? Number(match[1]) : null;
}

function readFailureStatus(value, depth = 0) {
  if (typeof value === 'string') return parseFailureStatus(value);
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 3) return null;
  for (const field of FAILURE_STATUS_FIELDS) {
    const status = parseFailureStatus(value[field]);
    if (status !== null) return status;
  }
  for (const nestedKey of ['response', 'error', 'failure', 'details', 'payload', 'result']) {
    const status = readFailureStatus(value[nestedKey], depth + 1);
    if (status !== null) return status;
  }
  return null;
}

function isHttpFailureStatus(value) {
  return parseFailureStatus(value) !== null;
}

function modelServiceErrorCandidates(event) {
  return nestedObjects(event)
    .filter((candidate) => candidate && ((typeof candidate === 'object' && !Array.isArray(candidate)) || typeof candidate === 'string'));
}

function isExplicitModelServiceFailure(candidate) {
  return candidate?.errorDomain === 'model_service'
    || candidate?.modelService === true
    || candidate?.kind === 'model_service'
    || (typeof candidate?.code === 'string' && /model[_-]?service|provider[_-]?error/i.test(candidate.code));
}

function hasKnownModelServiceFailureText(event = {}) {
  const texts = [
    event?.message,
    event?.error,
    event?.error?.message,
    event?.failure,
    event?.failure?.message,
    event?.result?.error,
    event?.result?.message
  ].filter((value) => typeof value === 'string').join(' ');
  return /service temporarily unavailable|llm returned invalid json|too many requests|rate limit|操作未能完成/i.test(texts);
}

function hasModelServiceContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (isExplicitModelServiceFailure(value)) return true;
  const source = readField(value, 'source', 'domain', 'subsystem');
  if (typeof source === 'string' && /model|llm|provider/i.test(source)) return true;
  const provider = readField(value, 'provider', 'providerId', 'provider_id');
  const model = readField(value, 'model', 'modelId', 'model_id');
  const operation = readField(value, 'operation', 'operationName', 'operation_name');
  return (typeof provider === 'string' && provider.trim() && typeof model === 'string' && model.trim())
    || ((typeof provider === 'string' && provider.trim()) || (typeof model === 'string' && model.trim()))
      && typeof operation === 'string' && operation.trim();
}

function resolveModelServiceFailure(event = {}, stopReason = null) {
  const candidates = modelServiceErrorCandidates(event);
  const contextualCandidate = candidates.find((entry) => hasModelServiceContext(entry));
  const explicitCandidate = candidates.find((entry) => isExplicitModelServiceFailure(entry));
  const statusCandidate = candidates.find((entry) => isHttpFailureStatus(readFailureStatus(entry))
    && (hasModelServiceContext(entry) || hasModelServiceContext(event)));
  const messageEndFailure = event.type === 'message_end'
    && ['error', 'provider_error', 'model_unavailable', 'rate_limit', 'rate_limited'].includes(stopReason);
  const genericErrorFailure = event.type === 'error' && hasKnownModelServiceFailureText(event);
  const candidate = explicitCandidate
    ?? statusCandidate
    ?? ((messageEndFailure || genericErrorFailure) && contextualCandidate ? contextualCandidate : null)
    ?? (messageEndFailure && contextualCandidate ? contextualCandidate : null);
  if (!candidate) return null;

  const explicitModelDomain = isExplicitModelServiceFailure(candidate) || Boolean(explicitCandidate);
  const hasProviderContext = Boolean(contextualCandidate) || hasModelServiceContext(event);
  // HTTP status and generic error text are only supporting evidence. A failed
  // event must still carry an explicit model-service/provider boundary.
  if (!explicitModelDomain && !hasProviderContext) return null;
  return contextualCandidate && contextualCandidate !== candidate
    ? { ...contextualCandidate, ...candidate }
    : candidate;
}

function resolveModelServiceEventId(event, source) {
  const candidates = [...nestedObjects(event), ...nestedObjects(source)]
    .flatMap((candidate) => [candidate.eventId, candidate.messageId, candidate.id, candidate.requestId]);
  return candidates.find((value) => typeof value === 'string' && value.trim()) ?? null;
}

function normalizeModelServiceEvent(event = {}, failure = null) {
  const source = failure && typeof failure === 'object' ? failure : event;
  return {
    status: readFailureStatus(source) ?? readFailureStatus(event),
    provider: readField(source, 'provider', 'providerId', 'provider_id') ?? readField(event, 'provider', 'providerId', 'provider_id'),
    model: readField(source, 'model', 'modelId', 'model_id') ?? readField(event, 'model', 'modelId', 'model_id'),
    operation: readField(source, 'operation', 'operationName', 'operation_name') ?? readField(event, 'operation', 'operationName', 'operation_name'),
    taskKey: readField(source, 'taskKey', 'task_key', 'sessionId', 'session_id') ?? readField(event, 'taskKey', 'task_key', 'sessionId', 'session_id'),
    reason: readField(source, 'reason') ?? readField(event, 'reason'),
    retryable: readField(source, 'retryable') ?? readField(event, 'retryable'),
    retryAfterMs: readField(source, 'retryAfterMs', 'retry_after_ms') ?? readField(event, 'retryAfterMs', 'retry_after_ms'),
    attempt: readField(source, 'attempt') ?? readField(event, 'attempt'),
    eventId: resolveModelServiceEventId(event, source)
  };
}

function resolveSystemEventId(event, sessionPath) {
  const explicitId = event?.eventId || event?.messageId || event?.id;
  if (explicitId) return explicitId;
  const eventType = String(event?.type ?? 'system_warning').replaceAll('_', '-');
  const fields = event?.type === 'session_unhealthy_warning'
    ? `${event.recentErrors ?? ''}-${event.totalChecked ?? ''}`
    : `${event.reason ?? ''}-${event.message ?? ''}`;
  return `${eventType}-${sessionPath ?? 'global'}-${fields}`;
}

function extractSystemWarning(event) {
  if (event?.type === 'session_unhealthy_warning') {
    const recentErrors = Number.isFinite(event.recentErrors) ? event.recentErrors : 0;
    const totalChecked = Number.isFinite(event.totalChecked) ? event.totalChecked : 0;
    return {
      title: '会话健康警告',
      content: `会话恢复检查发现 ${recentErrors}/${totalChecked} 条近期助手消息异常，建议新建会话。`,
      metadata: { recentErrors, totalChecked }
    };
  }
  const reason = typeof event?.reason === 'string' && event.reason.trim() ? event.reason.trim() : 'unknown';
  const message = typeof event?.message === 'string' && event.message.trim() ? event.message.trim() : '未知保存错误';
  return {
    title: '会话分支保存警告',
    content: `会话分支保存失败（${reason}）：${message}`,
    metadata: { reason, message }
  };
}

export function createNotificationEventAdapter({ notificationApi, log = {} } = {}) {
  const seenEventIds = new Set();
  const toolChannelContexts = new Map();
  const diagnostics = [];
  let anonymousEventSequence = 0;

  return {
    handle(event, sessionPath) {
      const message = readMessage(event);
      const eventType = typeof event?.type === 'string' ? event.type : '';
      const channelMessage = eventType === 'channel_new_message';
      const directMessage = eventType === 'dm_new_message';
      const toolExecution = eventType === 'tool_execution_end' || eventType === 'tool_execution_start';
      const toolError = eventType === 'tool_execution_end' && event?.isError === true;
      const toolResult = eventType === 'tool_execution_end' && event?.isError === false;
      const toolCallId = event?.toolCallId || event?.callId || event?.tool?.callId || null;
      const directToolChannel = toolExecution
        ? resolveChannel(event, sessionPath)
        : null;
      if (eventType === 'tool_execution_start' && toolCallId && directToolChannel?.kind !== 'chat') {
        toolChannelContexts.set(String(toolCallId), directToolChannel);
      }
      const cachedToolChannel = toolExecution && toolCallId
        ? toolChannelContexts.get(String(toolCallId)) ?? null
        : null;
      const content = channelMessage
        ? extractChannelMessageContent(event)
        : extractMessageContent(message);
      if (eventType === 'message_end' && isPhoneSession(sessionPath)) {
        return { handled: false, reason: 'phone-session-message' };
      }
      const internalMessage = isInternalMessage(event, message);
      const systemWarning = isSystemWarningEventType(eventType);
      const explicitModelServiceError = isModelServiceErrorEventType(eventType);
      const modelServiceRecovered = isModelServiceRecoveredEventType(eventType);
      const toolErrorContent = toolError ? extractToolErrorContent(event) : '';
      const toolResultContent = toolResult ? extractToolResultContent(event) : '';
      const stopReason = message?.stopReason ?? nestedField(event, 'stopReason') ?? null;
      const modelServiceFailure = modelServiceRecovered
        ? null
        : (explicitModelServiceError ? event : resolveModelServiceFailure(event, stopReason));
      const modelServiceError = Boolean(modelServiceFailure);
      const implicitModelServiceFailure = modelServiceError && !explicitModelServiceError && !modelServiceRecovered;
      const supported = eventType === 'session:message' || eventType === 'message_end' || channelMessage || directMessage || toolError || toolResult || systemWarning || modelServiceError || modelServiceRecovered;
      const assistant = message?.role === 'assistant';
      const systemWarningContent = systemWarning ? extractSystemWarning(event) : null;
      const modelServiceInput = (modelServiceError || modelServiceRecovered)
        ? normalizeModelServiceEvent(event, modelServiceFailure)
        : null;
      const completed = eventType !== 'message_end'
        || !['toolUse', 'error', 'aborted'].includes(stopReason)
        || modelServiceError;
      if (toolError && !toolErrorContent && !modelServiceError) return { handled: false, reason: 'ignored-event' };
      if (toolResult && !toolResultContent) return { handled: false, reason: 'ignored-event' };
      if (internalMessage && !toolError && !toolResult && !systemWarning && !modelServiceError && !modelServiceRecovered) return { handled: false, reason: 'internal-message' };
      if (!supported || ((!toolError && !toolResult && !systemWarning && !modelServiceError && !modelServiceRecovered && !channelMessage && !directMessage) && !assistant) || ((!toolError && !toolResult && !systemWarning && !modelServiceError && !modelServiceRecovered) && (!completed || !content))) {
        return { handled: false, reason: 'ignored-event' };
      }

      // eventId has two separate identities here: the stable event definition used
      // by canonical semantics, and the unique carrier id used for deduplication.
      // Never put the carrier id into event.eventId: unknown ids fall back from
      // tool completion to message_end and become assistant_reply.completed.
      const carrierEventId = modelServiceError
        ? modelServiceInput.eventId
        : (toolError || toolResult
          ? resolveToolEventId(event)
          : (systemWarning ? resolveSystemEventId(event, sessionPath) : resolveEventId(event)));
      const canonicalEventId = modelServiceError
        ? null
        : (toolError
          ? 'tool.execution.failed'
          : (toolResult
            ? 'tool.execution.succeeded'
            : (systemWarning
              ? (eventType === 'session_unhealthy_warning' ? 'session.health.degraded' : 'session.persistence.failed')
              : (channelMessage
                ? 'channel.message.received'
                : (directMessage ? 'chat.assistant_reply.completed' : 'chat.assistant_reply.completed')))));
      const deduplicationEventId = carrierEventId
        ?? `anonymous-${eventType || 'event'}-${++anonymousEventSequence}-${randomUUID()}`;
      if ((modelServiceError || modelServiceRecovered)
        && !modelServiceInput.operation
        && !modelServiceInput.status
        && !implicitModelServiceFailure) {
        return { handled: false, reason: 'ignored-event' };
      }
      if (seenEventIds.has(deduplicationEventId)) {
        return { handled: false, reason: 'duplicate-event' };
      }

      try {
        let result;
        if (modelServiceError) {
          result = notificationApi.ingestModelServiceError(modelServiceInput);
        } else if (modelServiceRecovered) {
          result = typeof notificationApi.ingestModelServiceRecovered === 'function'
            ? notificationApi.ingestModelServiceRecovered(modelServiceInput)
            : { handled: true, recovered: false, record: null };
        } else {
          const notificationMetadata = { busEventType: event.type };
          if (toolError || toolResult) {
            Object.assign(notificationMetadata, {
              toolName: event.toolName || event.name || null,
              toolCallId: event.toolCallId || null,
              isError: toolError
            });
          } else if (systemWarning) {
            Object.assign(notificationMetadata, systemWarningContent.metadata);
          } else if (channelMessage) {
            Object.assign(notificationMetadata, {
              role: message.role ?? null,
              sender: event.sender ?? event.metadata?.sender ?? event.payload?.sender ?? null,
              channelName: event.channelName ?? event.metadata?.channelName ?? event.payload?.channelName ?? null
            });
          } else {
            notificationMetadata.role = message.role;
          }
          result = notificationApi.ingestEvent({
            event: {
              eventId: canonicalEventId,
              traceId: event.traceId || deduplicationEventId || undefined,
              type: systemWarning ? eventType : (channelMessage ? 'channel_new_message' : (directMessage ? 'dm_new_message' : 'message_end')),
              ...(systemWarning || channelMessage || directMessage ? {} : { stopReason: toolError ? 'tool_error' : (toolResult ? 'tool_result' : 'end_turn') }),
              source: toolError || toolResult ? 'hana.tool' : (systemWarning ? 'hana.system' : (channelMessage ? 'hana.channel' : (directMessage ? 'hana.dm' : 'hana.session')))
            },
            notification: {
              notificationId: `${toolError ? 'hana-tool-error' : (toolResult ? 'hana-tool-result' : (systemWarning ? 'hana-system' : (channelMessage ? 'hana-channel' : 'hana-message')))}-${systemWarning ? encodeURIComponent(deduplicationEventId) : deduplicationEventId}`,
              traceId: event.traceId || deduplicationEventId || undefined,
              source: toolError || toolResult ? 'hana.tool' : (systemWarning ? 'hana.system' : (channelMessage ? 'hana.channel' : (directMessage ? 'hana.dm' : 'hana.session'))),
              type: toolError ? 'tool_error' : (toolResult ? 'tool_result' : (systemWarning ? 'system_notification' : (channelMessage ? 'channel_message' : 'assistant_message'))),
              title: toolError ? '工具执行失败' : (toolResult ? '工具执行完成' : (systemWarning ? systemWarningContent.title : (channelMessage ? (event.channelName || event.metadata?.channelName || event.payload?.channelName || '频道消息') : '助手回复完成'))),
              content: toolError ? toolErrorContent : (toolResult ? toolResultContent : (systemWarning ? systemWarningContent.content : content)),
              ...(systemWarning ? { importance: 'high' } : {}),
              ...(resolveTimestamp(event) ? { createdAt: resolveTimestamp(event) } : {}),
              session: sessionPath || null,
              channel: resolveChannel(event, sessionPath, cachedToolChannel),
              metadata: notificationMetadata
            }
          });
        }

        seenEventIds.add(deduplicationEventId);
        if (toolResult || toolError) toolChannelContexts.delete(String(toolCallId ?? ''));
        return {
          handled: true,
          ...(result.record ? { notificationId: result.record.notificationId, record: result.record } : {}),
          ...(modelServiceRecovered ? { recovered: Boolean(result.recovered), incidentKey: result.incidentKey } : {})
        };
      } catch (error) {
        const diagnostic = normalizeDiagnostic(error, 'ingest');
        diagnostics.push(diagnostic);
        if (diagnostics.length > 20) diagnostics.shift();
        log.warn?.('[notification-hub-vnext] Notification event ingestion failed', diagnostic);
        return { handled: false, reason: 'ingestion-failed', diagnostic };
      }
    },

    diagnostics,

    dispose() {
      seenEventIds.clear();
      toolChannelContexts.clear();
      anonymousEventSequence = 0;
    }
  };
}
