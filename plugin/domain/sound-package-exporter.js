import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createSoundPackage, serializeSoundPackage } from './sound-package.js';

function exporterError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function resolveAssetPath(assetRoot, relativePath) {
  if (typeof assetRoot !== 'string' || !assetRoot.trim()) throw exporterError('SOUND_PACKAGE_ASSET_ROOT_INVALID', 'assetRoot must be a non-empty path');
  const root = path.resolve(assetRoot);
  const filePath = path.resolve(root, ...relativePath.split('/'));
  const relative = path.relative(root, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw exporterError('SOUND_PACKAGE_PATH_INVALID', 'asset path escapes assetRoot', { relativePath });
  return filePath;
}

export async function exportSoundPackage({ name, profile = {}, registry, assetRoot } = {}) {
  if (!registry || typeof registry.list !== 'function') throw exporterError('SOUND_PACKAGE_REGISTRY_INVALID', 'registry is required');
  const referencedIds = new Set();
  function collect(value) {
    if (Array.isArray(value)) return value.forEach(collect);
    if (!value || typeof value !== 'object') return;
    if (typeof value.soundId === 'string') referencedIds.add(value.soundId);
    Object.values(value).forEach(collect);
  }
  collect(profile);
  const assets = [];
  for (const asset of registry.list()) {
    if (asset.kind !== 'custom') continue;
    if (referencedIds.size > 0 && !referencedIds.has(asset.soundId)) continue;
    const filePath = resolveAssetPath(assetRoot, asset.relativePath);
    let info;
    try { info = await stat(filePath); } catch { throw exporterError('SOUND_PACKAGE_ASSET_MISSING', `Sound asset file is missing: ${asset.soundId}`, { soundId: asset.soundId, path: filePath }); }
    if (!info.isFile()) throw exporterError('SOUND_PACKAGE_ASSET_INVALID', `Sound asset path is not a file: ${asset.soundId}`, { soundId: asset.soundId });
    const data = await readFile(filePath);
    assets.push({ asset, data });
  }
  const packageValue = createSoundPackage({ name, profile, assets });
  return Object.freeze({
    extension: '.nhsound',
    name: packageValue.name,
    packageText: serializeSoundPackage(packageValue),
    assetCount: packageValue.assets.length,
    profileBindingCount: packageValue.profile.soundOverrides.length
  });
}
