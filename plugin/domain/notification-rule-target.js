export const RULE_TARGET_FIELDS = Object.freeze([
  'categories', 'producerIds', 'producerKinds', 'events', 'importance', 'sources', 'channels'
]);

const CATEGORY_ORDER = Object.freeze(['chat', 'channel', 'tool', 'error', 'external_call', 'model_service']);
const PRODUCER_KIND_ORDER = Object.freeze(['hana', 'api']);
const IMPORTANCE_ORDER = Object.freeze(['low', 'normal', 'high', 'critical']);
const ORDER_BY_FIELD = Object.freeze({
  categories: CATEGORY_ORDER,
  producerKinds: PRODUCER_KIND_ORDER,
  importance: IMPORTANCE_ORDER
});

function ruleTargetError(code, message, field, details = {}) {
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

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

function normalizeField(field, value) {
  if (!Array.isArray(value)) {
    throw ruleTargetError('NOTIFICATION_RULE_TARGET_FIELD_INVALID', `${field} must be an array`, field);
  }
  const normalizedValues = field === 'categories'
    ? value.map((entry) => entry === 'plugin' ? 'external_call' : entry)
    : value;
  const unique = [...new Set(normalizedValues)];
  if (unique.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    throw ruleTargetError('NOTIFICATION_RULE_TARGET_VALUE_INVALID', `${field} must contain non-empty strings`, field);
  }
  const order = ORDER_BY_FIELD[field];
  if (order) {
    const rank = new Map(order.map((entry, index) => [entry, index]));
    if (unique.some((entry) => !rank.has(entry))) {
      throw ruleTargetError('NOTIFICATION_RULE_TARGET_VALUE_INVALID', `${field} contains an unsupported value`, field, { supported: order });
    }
    return unique.sort((left, right) => rank.get(left) - rank.get(right));
  }
  return unique.sort((left, right) => left.localeCompare(right));
}

function normalizeTarget(input) {
  if (!isPlainObject(input)) {
    throw ruleTargetError('NOTIFICATION_RULE_TARGET_INVALID', 'target must be a plain object');
  }
  const unknownFields = Object.keys(input).filter((field) => !RULE_TARGET_FIELDS.includes(field));
  if (unknownFields.length > 0) {
    throw ruleTargetError('NOTIFICATION_RULE_TARGET_UNKNOWN_FIELD', 'target contains unknown fields', undefined, { fields: unknownFields });
  }
  return Object.fromEntries(RULE_TARGET_FIELDS.map((field) => [
    field,
    normalizeField(field, input[field] ?? [])
  ]));
}

export function createNotificationRuleTarget(input = {}) {
  return freezeDeep(normalizeTarget(input));
}

function inputValue(soundInput, field) {
  if (field === 'categories') return soundInput.labels;
  if (field === 'producerIds') return soundInput.producer?.id;
  if (field === 'producerKinds') return soundInput.producer?.kind;
  if (field === 'importance') return soundInput.importance;
  if (field === 'events') return soundInput.event;
  if (field === 'sources') return soundInput.source;
  if (field === 'channels') return soundInput.channel;
  return undefined;
}

export function matchesNotificationRuleTarget(target, soundInput) {
  const normalizedTarget = createNotificationRuleTarget(target);
  if (!isPlainObject(soundInput)) return false;
  return RULE_TARGET_FIELDS.every((field) => {
    const requested = normalizedTarget[field];
    if (requested.length === 0) return true;
    const actual = inputValue(soundInput, field);
    return Array.isArray(actual)
      ? actual.some((value) => requested.includes(value))
      : requested.includes(actual);
  });
}

export function getNotificationRuleSpecificity(target) {
  const normalizedTarget = createNotificationRuleTarget(target);
  return RULE_TARGET_FIELDS.reduce((count, field) => count + (normalizedTarget[field].length > 0 ? 1 : 0), 0);
}
