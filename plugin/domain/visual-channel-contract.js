import { createVisualBehaviorContract } from './visual-behavior-contract.js';

export const CHANNEL_VISIBILITIES = Object.freeze(['private', 'shared', 'public']);
export const CHANNEL_OWNER_KINDS = Object.freeze(['user', 'system', 'plugin']);
export const CHANNEL_OVERFLOW_MODES = Object.freeze(['allow', 'queue', 'drop-oldest', 'aggregate', 'replace']);

const ROOT_FIELDS = Object.freeze([
  'channelId', 'owner', 'visibility', 'behaviorId', 'behaviorProfileId', 'cardTypeId',
  'propertiesId', 'visualProfileId', 'skinId', 'effectConfigId', 'policy'
]);

function error(code, message, field) { return Object.assign(new Error(message), { code, details: field ? { field } : {} }); }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function text(field, value) { if (typeof value !== 'string' || !value.trim()) throw error('VISUAL_CHANNEL_FIELD_INVALID', `${field} must be a non-empty string`, field); return value.trim(); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function integer(field, value, min, max) { if (!Number.isInteger(value) || value < min || value > max) throw error('VISUAL_CHANNEL_POLICY_INVALID', `${field} must be between ${min} and ${max}`, field); return value; }

export function createVisualChannelContract(input = {}) {
  if (!plain(input)) throw error('VISUAL_CHANNEL_INVALID', 'channel must be a plain object', 'channel');
  for (const key of Object.keys(input)) if (!ROOT_FIELDS.includes(key)) throw error('VISUAL_CHANNEL_FIELD_UNKNOWN', `Unknown channel field: ${key}`, key);
  const channelId = text('channelId', input.channelId);
  const behaviorId = input.behaviorId ?? input.behaviorProfileId ?? 'stack';
  const behavior = createVisualBehaviorContract({ behaviorId });
  const owner = input.owner ?? { kind: 'system', id: 'notification-hub' };
  if (!plain(owner) || !CHANNEL_OWNER_KINDS.includes(owner.kind) || typeof owner.id !== 'string' || !owner.id.trim()) throw error('VISUAL_CHANNEL_OWNER_INVALID', 'owner must contain a supported kind and id', 'owner');
  const visibility = input.visibility ?? 'private';
  if (!CHANNEL_VISIBILITIES.includes(visibility)) throw error('VISUAL_CHANNEL_VISIBILITY_INVALID', `Unsupported visibility: ${visibility}`, 'visibility');
  const policyInput = input.policy ?? {};
  if (!plain(policyInput)) throw error('VISUAL_CHANNEL_POLICY_INVALID', 'policy must be a plain object', 'policy');
  const suppression = policyInput.suppression ?? 'off';
  if (!['off', 'soft', 'aggressive'].includes(suppression)) throw error('VISUAL_CHANNEL_POLICY_INVALID', `Unsupported suppression: ${suppression}`, 'policy.suppression');
  const overflow = policyInput.overflow ?? (suppression === 'off' ? 'allow' : 'queue');
  if (!CHANNEL_OVERFLOW_MODES.includes(overflow)) throw error('VISUAL_CHANNEL_POLICY_INVALID', `Unsupported overflow: ${overflow}`, 'policy.overflow');
  const policy = {
    suppression,
    maxVisible: integer('maxVisible', policyInput.maxVisible ?? 1000, 1, 10000),
    maxActive: integer('maxActive', policyInput.maxActive ?? policyInput.maxVisible ?? 1000, 1, 10000),
    maxParticles: integer('maxParticles', policyInput.maxParticles ?? 0, 0, 100000),
    maxAnimationInstances: integer('maxAnimationInstances', policyInput.maxAnimationInstances ?? 1000, 0, 100000),
    overflow
  };
  return freeze({
    channelId,
    owner: { kind: owner.kind, id: owner.id.trim() },
    visibility,
    behaviorId: behavior.behaviorId,
    behaviorProfileId: behavior.behaviorId,
    cardTypeId: text('cardTypeId', input.cardTypeId ?? 'minimal'),
    propertiesId: text('propertiesId', input.propertiesId ?? 'minimal.default'),
    visualProfileId: text('visualProfileId', input.visualProfileId ?? 'visual.default'),
    skinId: text('skinId', input.skinId ?? 'skin.default'),
    effectConfigId: text('effectConfigId', input.effectConfigId ?? 'effect.none'),
    policy
  });
}
