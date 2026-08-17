const ALLOWED_REASONS = Object.freeze(['configuration', 'capacity', 'availability', 'transport', 'unknown']);
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 404, 405, 422]);

function bounded(value, max = 96) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function safeStatus(value) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : null;
}

function inferReason(status, input = {}) {
  if (ALLOWED_REASONS.includes(input.reason)) return input.reason;
  if ([401, 403].includes(status)) return 'configuration';
  if ([429, 500, 502].includes(status)) return 'capacity';
  if ([503, 504].includes(status)) return 'availability';
  if (input.transport === true) return 'transport';
  return 'unknown';
}

function inferRetryable(status, input = {}) {
  if (typeof input.retryable === 'boolean') return input.retryable;
  if (RETRYABLE_STATUS.has(status)) return true;
  if (NON_RETRYABLE_STATUS.has(status)) return false;
  return null;
}

export function createModelServiceIncidentKey(input = {}) {
  const normalized = normalizeModelServiceError(input);
  return normalized.incidentKey;
}

export function normalizeModelServiceError(input = {}) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const httpStatus = safeStatus(value.httpStatus ?? value.status ?? value.statusCode);
  const operation = bounded(value.operation, 64) ?? 'unknown';
  const provider = bounded(value.provider, 96);
  const model = bounded(value.model, 128);
  const taskKey = bounded(value.taskKey ?? value.sessionId, 128);
  const retryAfterMs = Number.isFinite(Number(value.retryAfterMs))
    ? Math.max(0, Math.min(86_400_000, Math.round(Number(value.retryAfterMs))))
    : null;
  const normalized = {
    errorDomain: 'model_service',
    httpStatus,
    provider,
    model,
    operation,
    taskKey,
    reason: inferReason(httpStatus, value),
    retryable: inferRetryable(httpStatus, value),
    retryAfterMs,
    incidentKey: null,
    attempt: Number.isInteger(value.attempt) && value.attempt >= 1 ? Math.min(value.attempt, 1_000_000) : null
  };
  normalized.incidentKey = `model_service|${provider ?? 'unknown-provider'}|${model ?? 'unknown-model'}|${operation}|${taskKey ?? 'unknown-scope'}`;
  return Object.freeze(normalized);
}

export function getModelServiceUserCopy(input = {}) {
  const error = normalizeModelServiceError(input);
  const advice = error.reason === 'configuration'
    ? '请检查模型服务配置。'
    : error.retryable === true ? '系统会稍后继续尝试。' : '请稍后重试。';
  return Object.freeze({
    title: '模型服务异常',
    content: `模型服务暂时不可用，${advice}`
  });
}

export { ALLOWED_REASONS };
