import { mkdir, rm, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createSoundAsset } from './custom-sound-asset.js';
import { decodeSoundPackageAsset, parseSoundPackage } from './sound-package.js';

const CONFLICT_POLICIES = Object.freeze(['reject', 'replace', 'keep-existing']);

function importerError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function resolveAssetPath(assetRoot, relativePath) {
  const root = path.resolve(assetRoot);
  const target = path.resolve(root, ...relativePath.split('/'));
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw importerError('SOUND_PACKAGE_PATH_INVALID', 'asset path escapes assetRoot', { relativePath });
  return target;
}

export async function importSoundPackage({ packageValue, packageText, assetRoot, registry, conflict = 'reject', conflictBySoundId = {}, commit, rollbackCommit } = {}) {
  if (!CONFLICT_POLICIES.includes(conflict) && (!conflictBySoundId || typeof conflictBySoundId !== 'object' || Array.isArray(conflictBySoundId))) throw importerError('SOUND_PACKAGE_CONFLICT_POLICY_INVALID', `Unsupported conflict policy: ${conflict}`);
  for (const [soundId, policy] of Object.entries(conflictBySoundId || {})) {
    if (!CONFLICT_POLICIES.includes(policy) || policy === 'reject') throw importerError('SOUND_PACKAGE_CONFLICT_POLICY_INVALID', `Unsupported conflict policy for ${soundId}: ${policy}`);
  }
  const policyFor = (soundId) => Object.prototype.hasOwnProperty.call(conflictBySoundId || {}, soundId) ? conflictBySoundId[soundId] : conflict;
  if (!registry || typeof registry.get !== 'function' || typeof registry.add !== 'function') throw importerError('SOUND_PACKAGE_REGISTRY_INVALID', 'registry is required');
  if (typeof assetRoot !== 'string' || !assetRoot.trim()) throw importerError('SOUND_PACKAGE_ASSET_ROOT_INVALID', 'assetRoot must be a non-empty path');
  const normalized = packageValue ? parseSoundPackage(JSON.stringify(packageValue)) : parseSoundPackage(packageText);
  const decoded = normalized.assets.map((entry) => decodeSoundPackageAsset(entry));
  const conflicts = decoded.filter(({ asset }) => registry.get(asset.soundId));
  const conflictDetails = conflicts.map(({ asset }) => ({ soundId: asset.soundId, name: asset.name, relativePath: asset.relativePath, policy: policyFor(asset.soundId) }));
  const previousAssets = new Map(conflicts.map(({ asset }) => [asset.soundId, registry.get(asset.soundId)]));
  const rejected = conflicts.filter(({ asset }) => policyFor(asset.soundId) === 'reject');
  if (rejected.length) throw importerError('SOUND_PACKAGE_CONFLICT', 'sound package contains existing soundId conflicts', { soundIds: rejected.map(({ asset }) => asset.soundId), conflicts: conflictDetails });

  const root = path.resolve(assetRoot);
  const tempRoot = path.join(root, `.nhsound-import-${process.pid}-${Date.now()}`);
  const written = [];
  const added = [];
  const backups = [];
  try {
    await mkdir(tempRoot, { recursive: true });
    for (const { asset, data } of decoded) {
      if (registry.get(asset.soundId) && policyFor(asset.soundId) === 'keep-existing') continue;
      const target = resolveAssetPath(tempRoot, asset.relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, data, { flag: 'wx' });
      written.push({ target, asset, data });
    }

    await mkdir(root, { recursive: true });
    for (const item of written) {
      const target = resolveAssetPath(root, item.asset.relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      if (policyFor(item.asset.soundId) === 'replace' && registry.get(item.asset.soundId)) {
        const backup = path.join(tempRoot, `backup-${backups.length}-${path.basename(target)}`);
        try {
          await rename(target, backup);
          backups.push({ target, backup });
        } catch (cause) {
          if (cause.code !== 'ENOENT') throw cause;
        }
      }
      await rename(item.target, target);
      item.target = target;
      if (registry.get(item.asset.soundId)) {
        if (policyFor(item.asset.soundId) === 'replace') {
          registry.remove(item.asset.soundId);
          registry.add(item.asset);
          added.push({ asset: item.asset, replaced: true });
        }
      } else {
        registry.add(item.asset);
        added.push({ asset: item.asset, replaced: false });
      }
    }

    if (typeof commit === 'function') await commit(normalized.profile);
    await rm(tempRoot, { recursive: true, force: true });
    return Object.freeze({
      name: normalized.name,
      profile: normalized.profile,
      importedAssets: added.filter(({ replaced }) => !replaced).length,
      replacedAssets: added.filter(({ replaced }) => replaced).length,
      skippedAssets: decoded.length - written.length,
      conflicts: conflictDetails
    });
  } catch (cause) {
    if (typeof rollbackCommit === 'function') await rollbackCommit().catch(() => {});
    for (const item of added.reverse()) {
      try {
        registry.remove(item.asset.soundId);
        const previous = previousAssets.get(item.asset.soundId);
        if (item.replaced && previous) registry.add(previous);
      } catch {}
    }
    for (const item of written) await rm(item.target, { force: true }).catch(() => {});
    for (const backup of backups.reverse()) {
      await mkdir(path.dirname(backup.target), { recursive: true }).catch(() => {});
      await rename(backup.backup, backup.target).catch(() => {});
    }
    await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
    if (cause.code?.startsWith('SOUND_PACKAGE_')) throw cause;
    throw importerError('SOUND_PACKAGE_IMPORT_FAILED', 'Sound package import failed and was rolled back', { cause: cause.message });
  }
}

export { CONFLICT_POLICIES };
