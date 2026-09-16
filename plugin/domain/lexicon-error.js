function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

export function lexiconError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  const payload = plain(details) ? { ...details } : { actual: details };
  if (payload.field === undefined && typeof details === 'string') payload.field = details;
  error.details = payload;
  return error;
}

export function lexiconThrow(code, message, details) {
  throw lexiconError(code, message, details);
}
