export const BEHAVIOR_IDS = Object.freeze([
  'stack', 'ticker', 'popup', 'aggregate', 'replace', 'pin', 'follow', 'scene'
]);

const LIFECYCLE_FIELDS = Object.freeze(['enter', 'idle', 'exit', 'enterParticles', 'idleParticles', 'exitParticles']);
const ROOT_FIELDS = Object.freeze(['behaviorId', 'displayName', 'lifecycle', 'properties']);

function error(code, message, field) {
  return Object.assign(new Error(message), { code, details: field ? { field } : {} });
}
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (plain(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function text(field, value) {
  if (typeof value !== 'string' || !value.trim()) throw error('VISUAL_BEHAVIOR_FIELD_INVALID', `${field} must be a non-empty string`, field);
  return value.trim();
}

export function createVisualBehaviorContract(input = {}) {
  if (!plain(input)) throw error('VISUAL_BEHAVIOR_INVALID', 'behavior must be a plain object', 'behavior');
  for (const key of Object.keys(input)) if (!ROOT_FIELDS.includes(key)) throw error('VISUAL_BEHAVIOR_FIELD_UNKNOWN', `Unknown behavior field: ${key}`, key);
  const behaviorId = text('behaviorId', input.behaviorId);
  if (!BEHAVIOR_IDS.includes(behaviorId)) throw error('VISUAL_BEHAVIOR_ID_INVALID', `Unsupported behavior: ${behaviorId}`, 'behaviorId');
  const lifecycleInput = input.lifecycle ?? {};
  if (!plain(lifecycleInput)) throw error('VISUAL_BEHAVIOR_LIFECYCLE_INVALID', 'lifecycle must be a plain object', 'lifecycle');
  for (const key of Object.keys(lifecycleInput)) {
    if (!LIFECYCLE_FIELDS.includes(key)) throw error('VISUAL_BEHAVIOR_FIELD_UNKNOWN', `Unknown lifecycle field: ${key}`, `lifecycle.${key}`);
    if (typeof lifecycleInput[key] !== 'boolean') throw error('VISUAL_BEHAVIOR_LIFECYCLE_INVALID', `${key} must be boolean`, `lifecycle.${key}`);
  }
  const properties = input.properties ?? {};
  if (!plain(properties)) throw error('VISUAL_BEHAVIOR_PROPERTIES_INVALID', 'properties must be a plain object', 'properties');
  return freeze({
    behaviorId,
    displayName: typeof input.displayName === 'string' && input.displayName.trim() ? input.displayName.trim() : behaviorId,
    lifecycle: { enter: true, idle: true, exit: true, enterParticles: false, idleParticles: false, exitParticles: false, ...lifecycleInput },
    properties: clone(properties)
  });
}
