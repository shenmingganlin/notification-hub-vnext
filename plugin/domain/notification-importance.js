export const NOTIFICATION_IMPORTANCE_CLASS_VALUES = Object.freeze(['normal', 'important']);

function importanceError(code, message, field, details = {}) {
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

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

function normalizeKeyword(value, field = 'keywords') {
  if (typeof value !== 'string' || !value.trim()) {
    throw importanceError('NOTIFICATION_IMPORTANCE_KEYWORD_INVALID', `${field} must contain non-empty strings`, field);
  }
  return value.trim().toLocaleLowerCase();
}

export function createImportanceSettings(input = {}) {
  if (!isPlainObject(input)) {
    throw importanceError('NOTIFICATION_IMPORTANCE_SETTINGS_INVALID', 'importance settings must be a plain object', 'settings');
  }
  const unknown = Object.keys(input).filter((key) => key !== 'keywords');
  if (unknown.length) throw importanceError('NOTIFICATION_IMPORTANCE_SETTINGS_FIELD_UNKNOWN', `Unknown importance setting: ${unknown[0]}`, unknown[0]);
  const keywords = input.keywords ?? [];
  if (!Array.isArray(keywords)) throw importanceError('NOTIFICATION_IMPORTANCE_KEYWORDS_INVALID', 'keywords must be an array', 'keywords');
  const normalized = [...new Set(keywords.map((value) => normalizeKeyword(value)))];
  return freezeDeep({ keywords: normalized });
}

function searchableText({ title = '', content = '', summary = '' } = {}) {
  return [title, content, summary]
    .filter((value) => typeof value === 'string')
    .join('\n')
    .toLocaleLowerCase();
}

export function classifyNotificationImportance({ title = '', content = '', summary = '', keywords = [] } = {}) {
  const settings = createImportanceSettings({ keywords });
  const text = searchableText({ title, content, summary });
  const matchedKeywords = settings.keywords.filter((keyword) => text.includes(keyword));
  return freezeDeep({
    value: matchedKeywords.length > 0 ? 'important' : 'normal',
    matchedKeywords: [...matchedKeywords]
  });
}

export function legacyImportanceToClass(value) {
  return value === 'high' || value === 'critical' ? 'important' : 'normal';
}

export function resolveNotificationImportance({ content, title, summary, settings = {}, explicitImportance } = {}) {
  const configured = createImportanceSettings(settings);
  const classified = classifyNotificationImportance({ title, content, summary, keywords: configured.keywords });
  if (classified.value === 'important') return classified.value;
  if (explicitImportance === 'important' || explicitImportance === true) return 'important';
  if (typeof explicitImportance === 'string' && ['low', 'normal', 'high', 'critical'].includes(explicitImportance)) {
    return legacyImportanceToClass(explicitImportance);
  }
  return 'normal';
}

export function importanceDetails({ title, content, summary, settings = {}, explicitImportance } = {}) {
  const configured = createImportanceSettings(settings);
  const classified = classifyNotificationImportance({ title, content, summary, keywords: configured.keywords });
  const value = resolveNotificationImportance({ title, content, summary, settings: configured, explicitImportance });
  return freezeDeep({
    value,
    matchedKeywords: classified.matchedKeywords,
    ...(explicitImportance === undefined ? {} : { legacyValue: clone(explicitImportance) })
  });
}
