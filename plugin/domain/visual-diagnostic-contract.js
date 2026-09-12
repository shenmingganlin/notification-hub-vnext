export const VISUAL_DIAGNOSTIC_STAGES = Object.freeze([
  'PACKAGE_VALIDATE', 'PACKAGE_IMPORT', 'ASSET_REGISTER', 'CONFIG_RESOLVE', 'EVENT_BIND',
  'CHANNEL_CREATE', 'CARD_CREATE', 'BEHAVIOR_LAYOUT', 'SKIN_RENDER', 'EFFECT_RUN', 'LIFECYCLE_EXIT'
]);

export const VISUAL_DIAGNOSTIC_CODES = Object.freeze([
  'VISUAL_PACKAGE_INVALID_MANIFEST', 'VISUAL_PACKAGE_UNSUPPORTED_VERSION', 'VISUAL_PACKAGE_MISSING_DEPENDENCY',
  'VISUAL_PACKAGE_IMPORT_CONFLICT', 'VISUAL_PACKAGE_INVALID_ENTRY', 'VISUAL_ASSET_FORMAT_UNSUPPORTED',
  'VISUAL_ASSET_TOO_LARGE', 'VISUAL_ASSET_DECODE_FAILED', 'VISUAL_ASSET_NOT_FOUND', 'VISUAL_PROFILE_INVALID',
  'VISUAL_PROFILE_REFERENCE_MISSING', 'VISUAL_PROFILE_CYCLE_DETECTED', 'VISUAL_EVENT_BINDING_INVALID',
  'VISUAL_EVENT_NOT_FOUND', 'VISUAL_CHANNEL_INVALID', 'VISUAL_CHANNEL_CAPACITY_INVALID',
  'VISUAL_BEHAVIOR_UNAVAILABLE', 'VISUAL_BEHAVIOR_LAYOUT_FAILED', 'VISUAL_SKIN_INVALID',
  'VISUAL_EFFECT_INVALID', 'VISUAL_EFFECT_ASSET_MISSING', 'VISUAL_CARD_RENDER_FAILED', 'VISUAL_CARD_LIFECYCLE_FAILED'
]);
export const VISUAL_DIAGNOSTIC_SEVERITIES = Object.freeze(['info', 'warning', 'error']);
const SOURCE_FIELDS = Object.freeze(['packageId', 'profileId', 'channelId', 'eventId', 'behaviorId', 'cardTypeId', 'skinId', 'effectId', 'assetId']);
const IMPACT_FIELDS = Object.freeze(['affected', 'unaffected']);
const DETAIL_FIELDS = Object.freeze(['suggestedActions', 'fallback', 'cause']);

function error(code, message, field) { return Object.assign(new Error(message), { code, details: field ? { field } : {} }); }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function text(field, value) { if (typeof value !== 'string' || !value.trim()) throw error('VISUAL_DIAGNOSTIC_FIELD_INVALID', `${field} must be a non-empty string`, field); return value.trim(); }
function list(field, value = []) { if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) throw error('VISUAL_DIAGNOSTIC_FIELD_INVALID', `${field} must be an array of strings`, field); return [...new Set(value.map((entry) => entry.trim()))]; }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

export function createVisualDiagnostic(input = {}) {
  if (!plain(input)) throw error('VISUAL_DIAGNOSTIC_INVALID', 'diagnostic must be a plain object', 'diagnostic');
  const code = text('code', input.code);
  if (!VISUAL_DIAGNOSTIC_CODES.includes(code)) throw error('VISUAL_DIAGNOSTIC_CODE_INVALID', `Unknown visual diagnostic code: ${code}`, 'code');
  const stage = text('stage', input.stage);
  if (!VISUAL_DIAGNOSTIC_STAGES.includes(stage)) throw error('VISUAL_DIAGNOSTIC_STAGE_INVALID', `Unknown visual diagnostic stage: ${stage}`, 'stage');
  const severity = input.severity ?? 'error';
  if (!VISUAL_DIAGNOSTIC_SEVERITIES.includes(severity)) throw error('VISUAL_DIAGNOSTIC_SEVERITY_INVALID', `Unknown visual diagnostic severity: ${severity}`, 'severity');
  const source = input.source ?? {};
  if (!plain(source)) throw error('VISUAL_DIAGNOSTIC_SOURCE_INVALID', 'source must be a plain object', 'source');
  for (const key of Object.keys(source)) if (!SOURCE_FIELDS.includes(key)) throw error('VISUAL_DIAGNOSTIC_SOURCE_INVALID', `Unsupported source field: ${key}`, `source.${key}`);
  for (const [key, value] of Object.entries(source)) text(`source.${key}`, value);
  const impact = input.impact ?? { affected: [], unaffected: ['notificationRecord', 'sound', 'eventIngestion'] };
  if (!plain(impact)) throw error('VISUAL_DIAGNOSTIC_IMPACT_INVALID', 'impact must be a plain object', 'impact');
  for (const key of Object.keys(impact)) if (!IMPACT_FIELDS.includes(key)) throw error('VISUAL_DIAGNOSTIC_IMPACT_INVALID', `Unsupported impact field: ${key}`, `impact.${key}`);
  const details = input.details ?? {};
  if (!plain(details)) throw error('VISUAL_DIAGNOSTIC_DETAILS_INVALID', 'details must be a plain object', 'details');
  for (const key of Object.keys(details)) if (!DETAIL_FIELDS.includes(key)) throw error('VISUAL_DIAGNOSTIC_DETAILS_INVALID', `Unsupported detail field: ${key}`, `details.${key}`);
  if ('cause' in details && details.cause !== null && typeof details.cause !== 'string') throw error('VISUAL_DIAGNOSTIC_DETAILS_INVALID', 'details.cause must be a string or null', 'details.cause');
  return freeze({
    code,
    message: text('message', input.message),
    userMessage: text('userMessage', input.userMessage ?? input.message),
    stage,
    severity,
    recoverable: Boolean(input.recoverable),
    source: { ...source },
    impact: { affected: list('impact.affected', impact.affected), unaffected: list('impact.unaffected', impact.unaffected) },
    details: { ...(details.suggestedActions === undefined ? {} : { suggestedActions: list('details.suggestedActions', details.suggestedActions) }), ...(details.fallback === undefined ? {} : { fallback: text('details.fallback', details.fallback) }), ...(details.cause === undefined ? { cause: null } : { cause: details.cause }) },
    traceId: text('traceId', input.traceId)
  });
}
