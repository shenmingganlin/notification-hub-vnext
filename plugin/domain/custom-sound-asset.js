export const SOUND_ASSET_VERSION = 1;
export const SOUND_ASSET_KINDS = Object.freeze(['builtin', 'custom']);
export const SOUND_ASSET_FORMATS = Object.freeze(['builtin', 'wav', 'mp3', 'm4a', 'aac', 'wma']);

const SOUND_ID_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,127}$/u;
const RELATIVE_PATH_PATTERN = /^(?![\\/])(?!(?:[^/]+\/)*\.\.(?:\/|$))[^\\:*?"<>|]+(?:\/[^\\:*?"<>|]+)*$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const ASSET_FIELDS = Object.freeze([
  'version', 'soundId', 'name', 'kind', 'format', 'builtinCue', 'relativePath',
  'durationMs', 'fileSizeBytes', 'sha256', 'enabled'
]);

function assetError(code, message, field = null) {
  const error = new Error(message);
  error.code = code;
  error.details = field ? { field } : {};
  return error;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
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

function requireString(field, value, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
    throw assetError('SOUND_ASSET_FIELD_INVALID', `${field} must be a${allowEmpty ? ' string' : ' non-empty string'}`, field);
  }
}

function requireBoundedInteger(field, value, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw assetError('SOUND_ASSET_FIELD_INVALID', `${field} must be an integer between ${minimum} and ${maximum}`, field);
  }
}

function validateRelativePath(value, field = 'relativePath') {
  requireString(field, value, { allowEmpty: true });
  if (value === '' || value.includes('\\') || value.startsWith('/') || value.includes(':') || !RELATIVE_PATH_PATTERN.test(value)) {
    throw assetError('SOUND_ASSET_PATH_INVALID', `${field} must be a safe relative path`, field);
  }
  const segments = value.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw assetError('SOUND_ASSET_PATH_INVALID', `${field} must not contain traversal segments`, field);
  }
}

export function normalizeSoundId(value) {
  requireString('soundId', value);
  const trimmed = value.trim();
  if (trimmed.includes('..')) {
    throw assetError('SOUND_ASSET_ID_INVALID', 'soundId must not contain traversal segments', 'soundId');
  }
  const normalized = trimmed.replace(/[\\/]+/gu, '_').replace(/\s+/gu, '_').replace(/_+/gu, '_');
  if (!SOUND_ID_PATTERN.test(normalized)) {
    throw assetError('SOUND_ASSET_ID_INVALID', 'soundId contains unsupported characters or is too long', 'soundId');
  }
  return normalized;
}

function validateInput(input) {
  if (!isPlainObject(input)) throw assetError('SOUND_ASSET_INVALID', 'sound asset must be a plain object');
  for (const key of Object.keys(input)) {
    if (!ASSET_FIELDS.includes(key)) throw assetError('SOUND_ASSET_FIELD_UNKNOWN', `Unknown sound asset field: ${key}`, key);
  }
  const kind = input.kind ?? 'custom';
  const format = input.format;
  requireString('name', input.name);
  if (!SOUND_ASSET_KINDS.includes(kind)) throw assetError('SOUND_ASSET_KIND_INVALID', `Unsupported sound asset kind: ${kind}`, 'kind');
  if (!SOUND_ASSET_FORMATS.includes(format)) throw assetError('SOUND_ASSET_FORMAT_INVALID', `Unsupported sound asset format: ${format}`, 'format');
  if ((kind === 'builtin') !== (format === 'builtin')) throw assetError('SOUND_ASSET_FORMAT_INVALID', 'builtin assets must use builtin format', 'format');
  requireBoundedInteger('durationMs', input.durationMs, 0, 3_600_000);
  requireBoundedInteger('fileSizeBytes', input.fileSizeBytes, 0, 1024 * 1024 * 1024);
  if (typeof input.enabled !== 'boolean') throw assetError('SOUND_ASSET_FIELD_INVALID', 'enabled must be boolean', 'enabled');
  if (kind === 'builtin') {
    requireString('builtinCue', input.builtinCue);
    if (input.relativePath !== '') throw assetError('SOUND_ASSET_PATH_INVALID', 'builtin assets must not have a file path', 'relativePath');
    if (input.sha256 !== null) throw assetError('SOUND_ASSET_HASH_INVALID', 'builtin assets must have a null sha256', 'sha256');
  } else {
    validateRelativePath(input.relativePath);
    if (typeof input.sha256 !== 'string' || !HASH_PATTERN.test(input.sha256)) {
      throw assetError('SOUND_ASSET_HASH_INVALID', 'custom asset sha256 must be a 64-character hexadecimal hash', 'sha256');
    }
    if ('builtinCue' in input && input.builtinCue != null) throw assetError('SOUND_ASSET_FIELD_INVALID', 'custom assets must not define builtinCue', 'builtinCue');
  }
  if ('version' in input && input.version !== SOUND_ASSET_VERSION) {
    throw assetError('SOUND_ASSET_VERSION_INVALID', `Unsupported sound asset version: ${input.version}`, 'version');
  }
}

export function createSoundAsset(input = {}) {
  validateInput(input);
  const kind = input.kind ?? 'custom';
  return freezeDeep({
    version: SOUND_ASSET_VERSION,
    soundId: normalizeSoundId(input.soundId),
    name: input.name.trim(),
    kind,
    format: input.format,
    builtinCue: kind === 'builtin' ? input.builtinCue.trim() : null,
    relativePath: input.relativePath,
    durationMs: input.durationMs,
    fileSizeBytes: input.fileSizeBytes,
    sha256: kind === 'builtin' ? null : input.sha256.toLowerCase(),
    enabled: input.enabled
  });
}

export function validateSoundAsset(asset) {
  createSoundAsset(asset);
  return true;
}

export function isSoundAsset(value) {
  try {
    validateSoundAsset(value);
    return true;
  } catch {
    return false;
  }
}

export function cloneSoundAsset(asset) {
  validateSoundAsset(asset);
  return clone(asset);
}
