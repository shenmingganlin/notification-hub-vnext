const SUPPRESSION_MODES = Object.freeze(['off', 'soft', 'aggressive']);
const OVERFLOW_MODES = Object.freeze(['allow', 'queue', 'drop-oldest', 'aggregate']);

function policyError(code, message, field) {
  const error = new Error(message);
  error.code = code;
  error.details = field ? { field } : {};
  return error;
}
function text(field, value) {
  if (typeof value !== 'string' || !value.trim()) throw policyError('CARD_RUNTIME_POLICY_FIELD_INVALID', `${field} must be a non-empty string`, field);
  return value.trim();
}
function integer(field, value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw policyError('CARD_RUNTIME_POLICY_FIELD_INVALID', `${field} must be an integer between ${min} and ${max}`, field);
  return value;
}
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

export const CARD_RUNTIME_SUPPRESSION_MODES = SUPPRESSION_MODES;
export const CARD_RUNTIME_OVERFLOW_MODES = OVERFLOW_MODES;

export function createCardChannelPolicy(input = {}) {
  if (!plain(input)) throw policyError('CARD_RUNTIME_POLICY_INVALID', 'card channel policy must be a plain object', 'policy');
  const suppression = input.suppression ?? 'off';
  const overflow = input.overflow ?? (suppression === 'off' ? 'allow' : 'queue');
  if (!SUPPRESSION_MODES.includes(suppression)) throw policyError('CARD_RUNTIME_POLICY_SUPPRESSION_INVALID', `Unsupported suppression mode: ${suppression}`, 'suppression');
  if (!OVERFLOW_MODES.includes(overflow)) throw policyError('CARD_RUNTIME_POLICY_OVERFLOW_INVALID', `Unsupported overflow mode: ${overflow}`, 'overflow');
  return freeze({
    policyId: text('policyId', input.policyId ?? 'default'),
    suppression,
    maxVisible: integer('maxVisible', input.maxVisible ?? 8, 1, 10000),
    overflow,
    durationMs: integer('durationMs', input.durationMs ?? 5000, 0, 86_400_000)
  });
}

export function createCardChannelPolicies(input = {}) {
  if (!plain(input)) throw policyError('CARD_RUNTIME_POLICIES_INVALID', 'channelPolicies must be a plain object', 'channelPolicies');
  const result = {};
  for (const [id, policy] of Object.entries(input)) result[id] = createCardChannelPolicy({ ...policy, policyId: id });
  if (!result.default) result.default = createCardChannelPolicy({ policyId: 'default' });
  return freeze(result);
}

export function resolveCardChannelPolicy({ eventId, categoryId, binding = {}, profile = {} } = {}) {
  const policies = createCardChannelPolicies(profile.channelPolicies ?? {});
  const policyId = binding.channelPolicyId ?? profile.events?.[eventId]?.channelPolicyId ?? profile.categories?.[categoryId]?.channelPolicyId ?? 'default';
  return policies[policyId] ?? policies.default;
}
