import { normalizeSoundId } from './custom-sound-asset.js';
import { createSoundBinding } from './sound-binding.js';

export const SOUND_PROFILE_VERSION = 1;
export const SOUND_CUES = Object.freeze([
  'chat-incoming', 'channel-incoming', 'tool-complete', 'tool-failed',
  'plugin-notice', 'warning', 'critical-error'
]);

const POLICY_FIELDS = Object.freeze([
  'enabled', 'volume', 'cue', 'soundId', 'suppressDuplicates', 'quietMode',
  'criticalBypass', 'criticalInterrupts', 'criticalCooldownMs', 'minImportance'
]);
const PROFILE_FIELDS = Object.freeze(['version', 'global', 'soundProfiles', 'soundOverrides']);
const IMPORTANCES = Object.freeze(['low', 'normal', 'high', 'critical']);
const DEFAULT_POLICY = Object.freeze({
  enabled: false, volume: 1, cue: 'chat-incoming', suppressDuplicates: true,
  quietMode: false, criticalBypass: true, criticalInterrupts: true, criticalCooldownMs: 1000
});

function error(code, message, field) {
  const result = new Error(message);
  result.code = code;
  result.details = field ? { field } : {};
  return result;
}
function plain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (plain(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
  return value;
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function object(field, value) {
  if (!plain(value)) throw error('SOUND_PROFILE_FIELD_INVALID', `${field} must be a plain object`, field);
}
function string(field, value) {
  if (typeof value !== 'string' || !value.trim()) throw error('SOUND_PROFILE_FIELD_INVALID', `${field} must be a non-empty string`, field);
}
function policy(value, field) {
  object(field, value);
  for (const key of Object.keys(value)) if (!POLICY_FIELDS.includes(key)) throw error('SOUND_PROFILE_FIELD_UNKNOWN', `Unknown policy field: ${key}`, `${field}.${key}`);
  if ('enabled' in value && typeof value.enabled !== 'boolean') throw error('SOUND_PROFILE_FIELD_INVALID', `${field}.enabled must be boolean`, `${field}.enabled`);
  if ('volume' in value && (!Number.isFinite(value.volume) || value.volume < 0 || value.volume > 1)) throw error('SOUND_PROFILE_VOLUME_INVALID', `${field}.volume must be between 0 and 1`, `${field}.volume`);
  if ('cue' in value && !SOUND_CUES.includes(value.cue)) throw error('SOUND_PROFILE_CUE_INVALID', `${field}.cue has an unsupported cue`, `${field}.cue`);
  if ('soundId' in value) { try { normalizeSoundId(value.soundId); } catch { throw error('SOUND_PROFILE_SOUND_ID_INVALID', `${field}.soundId is invalid`, `${field}.soundId`); } }
  if ('minImportance' in value && !IMPORTANCES.includes(value.minImportance)) throw error('SOUND_PROFILE_FIELD_INVALID', `${field}.minImportance is unsupported`, `${field}.minImportance`);
  for (const key of ['suppressDuplicates', 'quietMode', 'criticalBypass', 'criticalInterrupts']) if (key in value && typeof value[key] !== 'boolean') throw error('SOUND_PROFILE_FIELD_INVALID', `${field}.${key} must be boolean`, `${field}.${key}`);
  if ('criticalCooldownMs' in value && (!Number.isInteger(value.criticalCooldownMs) || value.criticalCooldownMs < 0 || value.criticalCooldownMs > 86_400_000)) throw error('SOUND_PROFILE_COOLDOWN_INVALID', `${field}.criticalCooldownMs is invalid`, `${field}.criticalCooldownMs`);
}
function soundOverride(value, field) {
  object(field, value);
  for (const key of Object.keys(value)) if (!['eventId', 'soundId', 'volume'].includes(key)) throw error('SOUND_PROFILE_FIELD_UNKNOWN', `Unknown sound override field: ${key}`, `${field}.${key}`);
  try { return createSoundBinding(value); } catch (cause) { throw error(cause.code ?? 'SOUND_PROFILE_SOUND_OVERRIDE_INVALID', cause.message, field); }
}

export function createSoundProfile(input = {}) {
  object('profile', input);
  for (const key of Object.keys(input)) if (!PROFILE_FIELDS.includes(key)) throw error('SOUND_PROFILE_FIELD_UNKNOWN', `Unknown profile field: ${key}`, key);
  if (input.version !== undefined && input.version !== SOUND_PROFILE_VERSION) throw error('SOUND_PROFILE_VERSION_INVALID', 'Unsupported sound profile version', 'version');
  policy(input.global ?? {}, 'global');
  const soundProfiles = input.soundProfiles ?? {};
  object('soundProfiles', soundProfiles);
  const normalizedSoundProfiles = {};
  for (const [id, value] of Object.entries(soundProfiles)) {
    string(`soundProfiles.${id}.id`, id);
    policy(value, `soundProfiles.${id}`);
    normalizedSoundProfiles[normalizeSoundId(id)] = clone(value);
  }
  const overrides = input.soundOverrides ?? [];
  if (!Array.isArray(overrides)) throw error('SOUND_PROFILE_FIELD_INVALID', 'soundOverrides must be an array', 'soundOverrides');
  const ids = new Set();
  const normalizedOverrides = overrides.map((value, index) => {
    const normalized = soundOverride(value, `soundOverrides.${index}`);
    if (ids.has(normalized.eventId)) throw error('SOUND_PROFILE_OVERRIDE_DUPLICATE', `duplicate sound override: ${normalized.eventId}`, `soundOverrides.${index}`);
    ids.add(normalized.eventId);
    return normalized;
  });
  return freeze({
    version: SOUND_PROFILE_VERSION,
    global: { ...DEFAULT_POLICY, ...clone(input.global ?? {}) },
    soundProfiles: normalizedSoundProfiles,
    soundOverrides: normalizedOverrides
  });
}
