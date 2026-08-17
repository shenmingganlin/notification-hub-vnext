import { createHash } from 'node:crypto';
import { createSoundProfile } from './sound-profile.js';
import { createSoundBinding } from './sound-binding.js';
import { SOUND_PACKAGE_MAX_ASSET_BYTES, SOUND_PACKAGE_MAX_TOTAL_BYTES } from './sound-package.js';

export const SOUND_COMBO_PACKAGE_FORMAT = 'notification-hub-sound-combo-package';
export const SOUND_COMBO_PACKAGE_VERSION = 2;
const FIELDS = Object.freeze(['format', 'version', 'name', 'profile', 'assets']);
const ASSET_FIELDS = new Set(['version', 'soundId', 'name', 'kind', 'format', 'builtinCue', 'relativePath', 'durationMs', 'fileSizeBytes', 'sha256', 'enabled', 'dataBase64']);

function comboError(code, message, details = {}) { return Object.assign(new Error(message), { code, details }); }
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function decodeBase64(value) {
  if (typeof value !== 'string' || !value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) throw comboError('SOUND_COMBO_PACKAGE_DATA_INVALID', 'asset dataBase64 is invalid');
  const data = Buffer.from(value, 'base64');
  if (!data.length || data.toString('base64') !== value) throw comboError('SOUND_COMBO_PACKAGE_DATA_INVALID', 'asset dataBase64 is invalid');
  return data;
}
function normalizeProfile(profile) {
  const normalized = createSoundProfile(profile ?? {});
  const bindings = normalized.soundOverrides ?? [];
  const ids = new Set();
  for (const binding of bindings) {
    const valid = createSoundBinding(binding);
    if (ids.has(valid.eventId)) throw comboError('SOUND_COMBO_PACKAGE_DUPLICATE_EVENT', `Duplicate eventId: ${valid.eventId}`, { eventId: valid.eventId });
    ids.add(valid.eventId);
  }
  return normalized;
}
function normalizeAsset(asset, index) {
  if (!plain(asset) || Object.keys(asset).some((key) => !ASSET_FIELDS.has(key))) throw comboError('SOUND_COMBO_PACKAGE_ASSET_INVALID', `Invalid asset at index ${index}`);
  if (asset.kind !== 'custom') throw comboError('SOUND_COMBO_PACKAGE_BUILTIN_ASSET_FORBIDDEN', 'Combo packages only contain custom assets');
  const data = decodeBase64(asset.dataBase64);
  if (!Number.isInteger(asset.fileSizeBytes) || asset.fileSizeBytes !== data.length) throw comboError('SOUND_COMBO_PACKAGE_SIZE_MISMATCH', `Asset size mismatch: ${asset.soundId}`);
  if (data.length > SOUND_PACKAGE_MAX_ASSET_BYTES) throw comboError('SOUND_COMBO_PACKAGE_ASSET_TOO_LARGE', `Asset too large: ${asset.soundId}`);
  const hash = createHash('sha256').update(data).digest('hex');
  if (hash !== asset.sha256) throw comboError('SOUND_COMBO_PACKAGE_HASH_MISMATCH', `Asset hash mismatch: ${asset.soundId}`);
  return structuredClone(asset);
}
export function normalizeSoundComboPackage(input) {
  if (!plain(input)) throw comboError('SOUND_COMBO_PACKAGE_INVALID', 'Combo package must be an object');
  for (const key of Object.keys(input)) if (!FIELDS.includes(key)) throw comboError('SOUND_COMBO_PACKAGE_FIELD_UNKNOWN', `Unknown combo package field: ${key}`);
  if (input.format !== SOUND_COMBO_PACKAGE_FORMAT) throw comboError('SOUND_COMBO_PACKAGE_FORMAT_INVALID', 'Unsupported combo package format');
  if (input.version !== SOUND_COMBO_PACKAGE_VERSION) throw comboError('SOUND_COMBO_PACKAGE_VERSION_UNSUPPORTED', 'Unsupported combo package version');
  if (typeof input.name !== 'string' || !input.name.trim()) throw comboError('SOUND_COMBO_PACKAGE_NAME_INVALID', 'Combo package name is invalid');
  const profile = normalizeProfile(input.profile);
  if (input.assets !== undefined && (!Array.isArray(input.assets) || input.assets.length > 0)) throw comboError('SOUND_COMBO_PACKAGE_ASSETS_FORBIDDEN', 'Custom sound combo packages contain configuration only; import an .nhsound package for audio assets');
  return Object.freeze({ format: SOUND_COMBO_PACKAGE_FORMAT, version: SOUND_COMBO_PACKAGE_VERSION, name: input.name.trim(), profile, assets: Object.freeze([]) });
}
export function createSoundComboPackage({ name, profile = {} } = {}) { return normalizeSoundComboPackage({ format: SOUND_COMBO_PACKAGE_FORMAT, version: SOUND_COMBO_PACKAGE_VERSION, name, profile }); }
export function validateSoundComboPackage(value) { normalizeSoundComboPackage(value); return true; }
export function parseSoundComboPackage(text) { if (typeof text !== 'string' || !text.trim()) throw comboError('SOUND_COMBO_PACKAGE_TEXT_INVALID', 'Combo package text is empty'); try { return normalizeSoundComboPackage(JSON.parse(text)); } catch (error) { if (error.code?.startsWith('SOUND_COMBO_PACKAGE_')) throw error; throw comboError('SOUND_COMBO_PACKAGE_PARSE_FAILED', 'Combo package JSON is invalid'); } }
export function serializeSoundComboPackage(value) { return `${JSON.stringify(normalizeSoundComboPackage(value))}\n`; }
export function toSoundPackageValue(combo) { const normalized = normalizeSoundComboPackage(combo); return { format: 'notification-hub-sound-package', version: 1, name: normalized.name, profile: normalized.profile, assets: normalized.assets }; }
