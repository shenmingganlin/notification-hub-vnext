import { createHash } from 'node:crypto';
import { createSoundAsset } from './custom-sound-asset.js';
import { createSoundProfile } from './sound-profile.js';

export const SOUND_PACKAGE_FORMAT = 'notification-hub-sound-package';
export const SOUND_PACKAGE_VERSION = 1;
export const SOUND_PACKAGE_MAX_ASSET_BYTES = 64 * 1024 * 1024;
export const SOUND_PACKAGE_MAX_TOTAL_BYTES = 256 * 1024 * 1024;

const PACKAGE_FIELDS = Object.freeze(['format', 'version', 'name', 'profile', 'assets']);
const ASSET_DATA_FIELDS = Object.freeze([
  'version', 'soundId', 'name', 'kind', 'format', 'builtinCue', 'relativePath',
  'durationMs', 'fileSizeBytes', 'sha256', 'enabled', 'dataBase64'
]);

function packageError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function plain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (plain(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

function decodeBase64(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) {
    throw packageError('SOUND_PACKAGE_DATA_INVALID', 'asset dataBase64 is not valid base64', { field: 'dataBase64' });
  }
  const data = Buffer.from(value, 'base64');
  if (data.length === 0) throw packageError('SOUND_PACKAGE_DATA_INVALID', 'asset dataBase64 must not be empty', { field: 'dataBase64' });
  if (data.toString('base64') !== value) throw packageError('SOUND_PACKAGE_DATA_INVALID', 'asset dataBase64 has invalid padding', { field: 'dataBase64' });
  return data;
}

function normalizePackageAsset(input, index) {
  if (!plain(input)) throw packageError('SOUND_PACKAGE_ASSET_INVALID', `assets.${index} must be an object`, { index });
  for (const key of Object.keys(input)) if (!ASSET_DATA_FIELDS.includes(key)) throw packageError('SOUND_PACKAGE_ASSET_FIELD_UNKNOWN', `Unknown asset field: ${key}`, { index, field: key });
  const assetInput = clone(input);
  delete assetInput.dataBase64;
  if (assetInput.kind !== 'custom' || assetInput.format === 'builtin') {
    throw packageError('SOUND_PACKAGE_BUILTIN_ASSET_FORBIDDEN', 'builtin assets are not embedded in sound packages; packages contain custom assets only', { index, soundId: assetInput.soundId });
  }
  const asset = createSoundAsset(assetInput);
  const data = decodeBase64(input.dataBase64);
  if (data.length !== asset.fileSizeBytes) {
    throw packageError('SOUND_PACKAGE_SIZE_MISMATCH', 'asset fileSizeBytes does not match dataBase64', { index, soundId: asset.soundId });
  }
  const sha256 = createHash('sha256').update(data).digest('hex');
  if (sha256 !== asset.sha256) {
    throw packageError('SOUND_PACKAGE_HASH_MISMATCH', 'asset sha256 does not match dataBase64', { index, soundId: asset.soundId });
  }
  if (data.length > SOUND_PACKAGE_MAX_ASSET_BYTES) {
    throw packageError('SOUND_PACKAGE_ASSET_TOO_LARGE', 'asset exceeds the maximum package asset size', { index, soundId: asset.soundId });
  }
  return { ...asset, dataBase64: input.dataBase64 };
}

function normalizePackage(input) {
  if (!plain(input)) throw packageError('SOUND_PACKAGE_INVALID', 'sound package must be a plain object');
  for (const key of Object.keys(input)) if (!PACKAGE_FIELDS.includes(key)) throw packageError('SOUND_PACKAGE_FIELD_UNKNOWN', `Unknown package field: ${key}`, { field: key });
  if (input.format !== SOUND_PACKAGE_FORMAT) throw packageError('SOUND_PACKAGE_FORMAT_INVALID', 'Unsupported sound package format', { field: 'format' });
  if (input.version !== SOUND_PACKAGE_VERSION) throw packageError('SOUND_PACKAGE_VERSION_UNSUPPORTED', 'Unsupported sound package version', { field: 'version' });
  if (typeof input.name !== 'string' || input.name.trim().length === 0 || input.name.length > 200) throw packageError('SOUND_PACKAGE_NAME_INVALID', 'Package name must be a non-empty string of at most 200 characters', { field: 'name' });
  const profile = createSoundProfile(input.profile ?? {});
  if (!Array.isArray(input.assets)) throw packageError('SOUND_PACKAGE_ASSETS_INVALID', 'assets must be an array', { field: 'assets' });
  const assets = input.assets.map(normalizePackageAsset);
  const ids = new Set();
  let totalBytes = 0;
  for (const asset of assets) {
    if (ids.has(asset.soundId)) throw packageError('SOUND_PACKAGE_DUPLICATE_ID', `Duplicate soundId: ${asset.soundId}`, { soundId: asset.soundId });
    ids.add(asset.soundId);
    totalBytes += asset.fileSizeBytes;
  }
  if (totalBytes > SOUND_PACKAGE_MAX_TOTAL_BYTES) throw packageError('SOUND_PACKAGE_TOO_LARGE', 'Sound package exceeds the maximum total asset size', { totalBytes });
  return freezeDeep({
    format: SOUND_PACKAGE_FORMAT,
    version: SOUND_PACKAGE_VERSION,
    name: input.name.trim(),
    profile,
    assets
  });
}

export function createSoundPackage({ name, profile = {}, assets = [] } = {}) {
  const packageAssets = assets.map((entry) => {
    if (!plain(entry) || !plain(entry.asset)) throw packageError('SOUND_PACKAGE_ASSET_INVALID', 'Each asset entry must contain asset and data');
    const data = Buffer.isBuffer(entry.data) ? entry.data : entry.data instanceof Uint8Array ? Buffer.from(entry.data) : null;
    if (!data) throw packageError('SOUND_PACKAGE_DATA_INVALID', 'Each asset entry data must be a Buffer or Uint8Array');
    if (Number.isInteger(entry.asset?.fileSizeBytes) && entry.asset.fileSizeBytes > SOUND_PACKAGE_MAX_ASSET_BYTES) {
      throw packageError('SOUND_PACKAGE_ASSET_TOO_LARGE', 'asset exceeds the maximum package asset size', { soundId: entry.asset.soundId });
    }
    const asset = createSoundAsset({ ...entry.asset, fileSizeBytes: data.length });
    return { ...asset, dataBase64: data.toString('base64') };
  });
  return normalizePackage({ format: SOUND_PACKAGE_FORMAT, version: SOUND_PACKAGE_VERSION, name, profile, assets: packageAssets });
}

export function validateSoundPackage(value) {
  normalizePackage(value);
  return true;
}

export function parseSoundPackage(text) {
  if (typeof text !== 'string' || text.trim().length === 0) throw packageError('SOUND_PACKAGE_TEXT_INVALID', 'Sound package text must be a non-empty string');
  let value;
  try { value = JSON.parse(text); } catch { throw packageError('SOUND_PACKAGE_PARSE_FAILED', 'Sound package contains invalid JSON'); }
  return normalizePackage(value);
}

export function serializeSoundPackage(value) {
  const normalized = normalizePackage(value);
  return `${JSON.stringify(normalized)}\n`;
}

export function decodeSoundPackageAsset(asset) {
  const normalized = normalizePackageAsset(asset, 0);
  const { dataBase64, ...assetFields } = normalized;
  return { asset: createSoundAsset(assetFields), data: decodeBase64(dataBase64) };
}
