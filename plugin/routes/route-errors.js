export const INVALID_JSON_ERROR = Object.freeze({
  code: 'ROUTE_INVALID_JSON',
  message: '请求体必须是合法 JSON。',
  details: { field: 'body' }
});

export async function readJsonBody(c) {
  try {
    return await c?.req?.json();
  } catch {
    const error = new Error(INVALID_JSON_ERROR.message);
    error.code = INVALID_JSON_ERROR.code;
    error.details = INVALID_JSON_ERROR.details;
    throw error;
  }
}

export function errorPayload(error, messages = {}, fallbackCode = 'ROUTE_FAILED') {
  const code = error?.code ?? fallbackCode;
  return {
    code,
    message: messages[code] ?? error?.message ?? String(error),
    details: error?.details ?? {}
  };
}

export function unavailablePayload(code, message) {
  return { ok: false, error: { code, message, details: {} } };
}

export function routeErrorResponse(c, error, status, messages = {}, fallbackCode) {
  return c.json({ ok: false, error: errorPayload(error, messages, fallbackCode) }, status);
}
