const DEFAULT_POLICY = Object.freeze({ mode: 'full', maxLength: 4000 });
export const CONTENT_FORMAT_MODES = Object.freeze(['full', 'summary', 'redacted']);

function formatterError(code, message, field, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = field ? { field, ...details } : { ...details };
  return error;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneDeep(value) {
  if (Array.isArray(value)) return value.map(cloneDeep);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneDeep(entry)]));
  }
  return value;
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

function readPolicy({ profile, contentPolicy }) {
  if (contentPolicy !== undefined && !isPlainObject(contentPolicy)) {
    throw formatterError(
      'CONTENT_FORMATTER_POLICY_INVALID',
      'contentPolicy must be a plain object',
      'contentPolicy'
    );
  }
  const profilePolicy = profile?.profile?.contentPolicy;
  if (profile !== undefined && profile !== null
    && profilePolicy !== undefined && !isPlainObject(profilePolicy)) {
    throw formatterError(
      'CONTENT_FORMATTER_PROFILE_INVALID',
      'profile.contentPolicy must be a plain object',
      'profile.contentPolicy'
    );
  }
  return {
    ...DEFAULT_POLICY,
    ...(isPlainObject(profilePolicy) ? cloneDeep(profilePolicy) : {}),
    ...(contentPolicy !== undefined ? cloneDeep(contentPolicy) : {})
  };
}

function validatePolicy(policy) {
  if (!CONTENT_FORMAT_MODES.includes(policy.mode)) {
    throw formatterError(
      'CONTENT_FORMATTER_MODE_INVALID',
      `Unsupported content mode: ${policy.mode}`,
      'contentPolicy.mode',
      { policy: cloneDeep(policy) }
    );
  }
  if (!Number.isInteger(policy.maxLength) || policy.maxLength <= 0) {
    throw formatterError(
      'CONTENT_FORMATTER_MAX_LENGTH_INVALID',
      'contentPolicy.maxLength must be a positive integer',
      'contentPolicy.maxLength',
      { policy: cloneDeep(policy) }
    );
  }
}

function redactText(text) {
  let redacted = text;
  let changed = false;
  const replacements = [
    { pattern: /(password|passwd|secret|token|api[_-]?key)(\s*[:=]\s*)[^\s,;]+/gi, replacement: '$1$2[REDACTED]' },
    { pattern: /\bBearer\s+[^\s,;]+/gi, replacement: 'Bearer [REDACTED]' },
    { pattern: /([A-Za-z]:\\Users\\)[^\\]+(\\)/g, replacement: '$1[REDACTED]$2' }
  ];
  for (const { pattern, replacement } of replacements) {
    const next = redacted.replace(pattern, replacement);
    if (next !== redacted) changed = true;
    redacted = next;
  }
  return { text: redacted, redacted: changed };
}

function splitSentences(text) {
  return text.match(/[^。！？.!?\\n]+[。！？.!?]?/g)?.map((part) => part.trim()).filter(Boolean) ?? [text];
}

function summarizeText(text, maxLength) {
  const sentences = splitSentences(text);
  let summary = '';
  for (const sentence of sentences) {
    const candidate = summary ? `${summary}${sentence}` : sentence;
    if (candidate.length > maxLength) break;
    summary = candidate;
  }
  return truncateText(summary || sentences[0] || text, maxLength);
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) return { text, truncated: false };
  if (maxLength === 1) return { text: '…', truncated: true };

  const limit = maxLength - 1;
  const prefix = text.slice(0, limit);
  const boundaryMatches = [...prefix.matchAll(/[。！？.!?\n]|\s(?=\S)/g)];
  const lastBoundary = boundaryMatches.at(-1)?.index;
  if (lastBoundary !== undefined && lastBoundary > 0) {
    const candidate = prefix.slice(0, lastBoundary + 1).trimEnd();
    if (candidate.length > 0) return { text: `${candidate}…`, truncated: true };
  }
  return { text: `${prefix}…`, truncated: true };
}

export function formatNotificationContent({ record, profile, contentPolicy } = {}) {
  if (!isPlainObject(record) || typeof record.content !== 'string' || record.content.length === 0) {
    throw formatterError(
      'CONTENT_FORMATTER_RECORD_INVALID',
      'record.content must be a non-empty string',
      'record.content'
    );
  }
  const policy = readPolicy({ profile, contentPolicy });
  validatePolicy(policy);
  const redaction = policy.mode === 'redacted'
    ? redactText(record.content)
    : { text: record.content, redacted: false };
  const formatted = policy.mode === 'summary'
    ? summarizeText(redaction.text, policy.maxLength)
    : truncateText(redaction.text, policy.maxLength);
  const truncated = policy.mode === 'summary'
    ? formatted.truncated || formatted.text.length < redaction.text.length
    : formatted.truncated;

  return freezeDeep({
    mode: policy.mode,
    content: formatted.text,
    summary: formatted.text,
    truncated,
    redacted: redaction.redacted,
    originalLength: record.content.length,
    finalLength: formatted.text.length,
    policy: cloneDeep(policy)
  });
}
