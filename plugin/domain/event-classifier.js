const EVENT_TYPE_RULES = Object.freeze({
  model_service_error: 'model_service_error',
  message_end: 'message_end',
  toolUse: 'toolUse',
  aborted: 'aborted',
  cancelled: 'cancelled',
  interrupted: 'interrupted',
  error: 'error',
  session_unhealthy_warning: 'session_unhealthy_warning',
  session_branch_persistence_warning: 'session_branch_persistence_warning'
});

const EVENT_TYPE_RULES_DIRECT = Object.freeze({
  model_service_error: Object.freeze({ classification: 'model_service', action: 'notify', successful: false, abnormal: true, diagnostic: false }),
  model_service_recovered: Object.freeze({ classification: 'model_service_recovered', action: 'diagnostic', successful: true, abnormal: false, diagnostic: true }),
  session_unhealthy_warning: Object.freeze({ classification: 'system_notification', action: 'notify', successful: false, abnormal: true, diagnostic: false }),
  session_branch_persistence_warning: Object.freeze({ classification: 'system_notification', action: 'notify', successful: false, abnormal: true, diagnostic: false })
});

const STOP_REASON_RULES = Object.freeze({
  end_turn: Object.freeze({ classification: 'completed', action: 'notify', successful: true, abnormal: false, diagnostic: false }),
  stop: Object.freeze({ classification: 'completed', action: 'notify', successful: true, abnormal: false, diagnostic: false }),
  tool_use: Object.freeze({ classification: 'tool_use', action: 'notify', successful: false, abnormal: false, diagnostic: false }),
  tool_result: Object.freeze({ classification: 'tool_result', action: 'notify', successful: true, abnormal: false, diagnostic: false }),
  aborted: Object.freeze({ classification: 'aborted', action: 'notify', successful: false, abnormal: true, diagnostic: false }),
  cancelled: Object.freeze({ classification: 'cancelled', action: 'notify', successful: false, abnormal: true, diagnostic: false }),
  interrupted: Object.freeze({ classification: 'interrupted', action: 'notify', successful: false, abnormal: true, diagnostic: false }),
  max_tokens: Object.freeze({ classification: 'limit_reached', action: 'notify', successful: false, abnormal: true, diagnostic: false }),
  content_filter: Object.freeze({ classification: 'content_filtered', action: 'notify', successful: false, abnormal: true, diagnostic: false }),
  timeout: Object.freeze({ classification: 'timeout', action: 'notify', successful: false, abnormal: true, diagnostic: false }),
  rate_limit: Object.freeze({ classification: 'rate_limited', action: 'notify', successful: false, abnormal: true, diagnostic: false }),
  tool_error: Object.freeze({ classification: 'tool_error', action: 'notify', successful: false, abnormal: true, diagnostic: false }),
  provider_error: Object.freeze({ classification: 'provider_error', action: 'diagnostic', successful: false, abnormal: true, diagnostic: true }),
  model_unavailable: Object.freeze({ classification: 'model_unavailable', action: 'diagnostic', successful: false, abnormal: true, diagnostic: true })
});

export const EVENT_CLASSIFICATIONS = Object.freeze([
  'completed',
  'tool_use',
  'tool_result',
  'aborted',
  'cancelled',
  'interrupted',
  'limit_reached',
  'content_filtered',
  'timeout',
  'rate_limited',
  'tool_error',
  'system_notification',
  'provider_error',
  'model_unavailable',
  'model_service',
  'model_service_recovered',
  'unknown',
  'invalid'
]);

export const EVENT_ACTIONS = Object.freeze(['notify', 'ignore', 'diagnostic']);

// 事件是分类内的细粒度语义；未知值保持 unknown，交给上层安全回退。
export const EVENT_NAMES = Object.freeze(['assistant_reply', 'tool_success', 'tool_error', 'timeout', 'error', 'model_service_error', 'unknown']);

function classifierError(code, message, field, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = { ...(field ? { field } : {}), ...details };
  return error;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

function validateEvent(event) {
  if (!isPlainObject(event)) {
    throw classifierError('EVENT_CLASSIFIER_EVENT_INVALID', 'event must be a plain object', 'event');
  }
  if (typeof event.type !== 'string' || event.type.length === 0) {
    throw classifierError('EVENT_CLASSIFIER_TYPE_INVALID', 'event.type must be a non-empty string', 'type');
  }
  if (event.stopReason !== undefined && typeof event.stopReason !== 'string') {
    throw classifierError(
      'EVENT_CLASSIFIER_STOP_REASON_INVALID',
      'event.stopReason must be a string when provided',
      'stopReason'
    );
  }
  if (event.error !== undefined
    && (typeof event.error !== 'string' || event.error.length === 0)
    && !isPlainObject(event.error)) {
    throw classifierError(
      'EVENT_CLASSIFIER_ERROR_INVALID',
      'event.error must be a non-empty string or plain object',
      'error'
    );
  }
}

function getRule(eventType, stopReason) {
  if (EVENT_TYPE_RULES_DIRECT[eventType] !== undefined) return EVENT_TYPE_RULES_DIRECT[eventType];
  if (EVENT_TYPE_RULES[eventType] === undefined) {
    return {
      classification: 'unknown',
      action: 'diagnostic',
      successful: false,
      abnormal: true,
      diagnostic: true
    };
  }
  if (stopReason === null) {
    if (eventType === 'message_end') {
      throw classifierError(
        'EVENT_CLASSIFIER_STOP_REASON_MISSING',
        'message_end requires stopReason',
        'stopReason',
        { eventType }
      );
    }
    const eventRule = {
      aborted: 'aborted',
      error: 'provider_error'
    }[eventType];
    if (eventRule !== undefined) return STOP_REASON_RULES[eventRule];
    return {
      classification: 'unknown',
      action: 'diagnostic',
      successful: false,
      abnormal: true,
      diagnostic: true
    };
  }
  return STOP_REASON_RULES[stopReason] ?? {
    classification: 'unknown',
    action: 'diagnostic',
    successful: false,
    abnormal: true,
    diagnostic: true
  };
}

export function classifyEvent(event = {}) {
  validateEvent(event);
  const stopReason = event.stopReason ?? null;
  const rule = getRule(event.type, stopReason);
  const name = rule.classification === 'tool_result' ? 'tool_success'
    : rule.classification === 'tool_error' ? 'tool_error'
      : rule.classification === 'timeout' ? 'timeout'
        : rule.classification === 'model_service' ? 'model_service_error'
          : rule.classification === 'completed' ? 'assistant_reply' : 'unknown';

  return freezeDeep({
    eventType: event.type,
    stopReason,
    event: EVENT_NAMES.includes(name) ? name : 'unknown',
    classification: rule.classification,
    action: rule.action,
    successful: rule.successful,
    abnormal: rule.abnormal,
    diagnostic: rule.diagnostic,
    source: `${event.type}:${stopReason ?? 'missing'}`
  });
}
