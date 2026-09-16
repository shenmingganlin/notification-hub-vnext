const FORMAT_EXTENSIONS = Object.freeze({ ttf: 'ttf', otf: 'otf' });
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const HASH_PATTERN = /^[a-f0-9]{64}$/i;
function fail(code, message, details = {}) { return Object.assign(new Error(message), { code, details }); }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function clone(value) { if (Array.isArray(value)) return value.map(clone); if (plain(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])); return value; }
function safeId(value, field) { if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw fail('FONT_ASSET_MANIFEST_INVALID', `${field} is invalid`, { field }); return value; }
function validateRecord(record, index) {
  const field = `assets[${index}]`;
  if (!plain(record)) throw fail('FONT_ASSET_MANIFEST_INVALID', `${field} must be an object`, { field });
  const assetId = safeId(record.assetId, `${field}.assetId`);
  if (!Object.hasOwn(FORMAT_EXTENSIONS, record.format)) throw fail('FONT_ASSET_MANIFEST_INVALID', `${field}.format is unsupported`, { field: `${field}.format` });
  if (typeof record.relativePath !== 'string' || !record.relativePath || record.relativePath.startsWith('/') || record.relativePath.includes('\\') || record.relativePath.split('/').includes('..')) {
    throw fail('FONT_ASSET_MANIFEST_PATH_INVALID', `${field}.relativePath must be a safe relative path`, { field: `${field}.relativePath` });
  }
  if (record.relativePath.split('/').at(-1) !== `${assetId}.${FORMAT_EXTENSIONS[record.format]}`) {
    throw fail('FONT_ASSET_MANIFEST_PATH_INVALID', `${field}.relativePath does not match assetId and format`, { field: `${field}.relativePath` });
  }
  if (typeof record.sha256 !== 'string' || !HASH_PATTERN.test(record.sha256)) throw fail('FONT_ASSET_MANIFEST_INVALID', `${field}.sha256 is invalid`, { field: `${field}.sha256` });
  if (record.enabled !== true && record.enabled !== false) throw fail('FONT_ASSET_MANIFEST_INVALID', `${field}.enabled must be boolean`, { field: `${field}.enabled` });
  return Object.freeze({ assetId, format: record.format, relativePath: record.relativePath, sha256: record.sha256.toLowerCase(), enabled: record.enabled });
}
export const FONT_ASSET_MANIFEST_VERSION = 1;
export function createFontAssetManifest(assets = [], { root = 'font-assets' } = {}) {
  if (!Array.isArray(assets)) throw fail('FONT_ASSET_MANIFEST_INVALID', 'assets must be an array');
  const records = assets.map((asset, index) => validateRecord({
    assetId: asset.assetId,
    format: asset.format,
    relativePath: `${root ? `${root}/` : ''}${asset.assetId}.${asset.format}`,
    sha256: asset.sha256,
    enabled: asset.enabled !== false
  }, index));
  const ids = new Set();
  const hashes = new Set();
  for (const record of records) {
    if (ids.has(record.assetId) || hashes.has(record.sha256)) throw fail('FONT_ASSET_MANIFEST_DUPLICATE', 'manifest contains duplicate assetId or sha256');
    ids.add(record.assetId);
    hashes.add(record.sha256);
  }
  return Object.freeze({ version: FONT_ASSET_MANIFEST_VERSION, assets: Object.freeze(records) });
}
export function validateFontAssetManifest(manifest) {
  if (!plain(manifest) || manifest.version !== FONT_ASSET_MANIFEST_VERSION || !Array.isArray(manifest.assets)) {
    throw fail('FONT_ASSET_MANIFEST_INVALID', 'manifest version or assets is invalid');
  }
  const records = manifest.assets.map(validateRecord);
  const ids = new Set();
  const hashes = new Set();
  for (const record of records) {
    if (ids.has(record.assetId) || hashes.has(record.sha256)) throw fail('FONT_ASSET_MANIFEST_DUPLICATE', 'manifest contains duplicate assetId or sha256');
    ids.add(record.assetId);
    hashes.add(record.sha256);
  }
  return Object.freeze({ version: FONT_ASSET_MANIFEST_VERSION, assets: Object.freeze(records) });
}
