import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createSoundAssetRegistry } from './sound-asset-registry.js';

function persistenceError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

export async function loadSoundAssetRegistry(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) throw persistenceError('SOUND_ASSET_PATH_INVALID', 'sound asset registry path must be non-empty');
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8'));
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.assets)) throw persistenceError('SOUND_ASSET_SNAPSHOT_INVALID', 'sound asset registry snapshot is invalid');
    return createSoundAssetRegistry({ assets: parsed.assets });
  } catch (cause) {
    if (cause.code === 'ENOENT') return createSoundAssetRegistry();
    if (cause.code?.startsWith('SOUND_ASSET_')) throw cause;
    throw persistenceError('SOUND_ASSET_LOAD_FAILED', 'failed to load sound asset registry', { path: filePath, cause: cause.message });
  }
}

export async function saveSoundAssetRegistry(registry, filePath) {
  if (!registry || typeof registry.list !== 'function') throw persistenceError('SOUND_ASSET_REGISTRY_INVALID', 'registry is required');
  if (typeof filePath !== 'string' || !filePath.trim()) throw persistenceError('SOUND_ASSET_PATH_INVALID', 'sound asset registry path must be non-empty');
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const snapshot = JSON.stringify({ version: 1, assets: registry.list().filter((asset) => asset.kind === 'custom') }) + '\n';
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(temporaryPath, snapshot, { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryPath, filePath);
    return filePath;
  } catch (cause) {
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw persistenceError('SOUND_ASSET_SAVE_FAILED', 'failed to save sound asset registry', { path: filePath, cause: cause.message });
  }
}
