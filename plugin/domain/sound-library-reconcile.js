import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { createSoundAsset, normalizeSoundId } from './custom-sound-asset.js';
import { createSoundAssetRegistry } from './sound-asset-registry.js';
import { saveSoundAssetRegistry } from './sound-asset-persistence.js';

export const SOUND_LIBRARY_MIN_BYTES = 64;
export const SOUND_LIBRARY_EXTENSIONS = Object.freeze({
  '.wav': 'wav',
  '.mp3': 'mp3',
  '.m4a': 'm4a',
  '.aac': 'aac',
  '.wma': 'wma'
});

function fail(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function posixRelative(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

async function walkAudioFiles(root) {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && SOUND_LIBRARY_EXTENSIONS[path.extname(entry.name).toLowerCase()]) out.push(full);
    }
  }
  await walk(root);
  return out.sort((left, right) => left.localeCompare(right));
}

function allocateSoundId(preferred, usedIds) {
  if (!usedIds.has(preferred)) return preferred;
  let index = 2;
  while (usedIds.has(`${preferred}-${index}`)) index += 1;
  return `${preferred}-${index}`;
}

export async function reconcileSoundLibrary({
  assetRoot,
  registryPath,
  previousAssets = []
} = {}) {
  if (typeof assetRoot !== 'string' || !assetRoot.trim()) {
    throw fail('SOUND_ASSET_PATH_INVALID', 'assetRoot must be a non-empty path');
  }
  const previous = Array.isArray(previousAssets)
    ? previousAssets.filter((asset) => asset?.kind === 'custom')
    : [];
  const byPath = new Map(previous.map((asset) => [asset.relativePath, asset]));
  const byHash = new Map(previous.filter((asset) => asset.sha256).map((asset) => [asset.sha256, asset]));
  const usedIds = new Set();
  const assets = [];
  const skipped = [];

  for (const filePath of await walkAudioFiles(assetRoot)) {
    const relativePath = posixRelative(assetRoot, filePath);
    const info = await stat(filePath);
    if (info.size < SOUND_LIBRARY_MIN_BYTES) {
      skipped.push({ relativePath, reason: 'too-small', fileSizeBytes: info.size });
      continue;
    }
    const data = await readFile(filePath);
    const sha256 = createHash('sha256').update(data).digest('hex');
    const format = SOUND_LIBRARY_EXTENSIONS[path.extname(filePath).toLowerCase()];
    const baseName = path.basename(filePath, path.extname(filePath));
    const matched = byPath.get(relativePath) || byHash.get(sha256);
    let preferredId;
    try {
      preferredId = matched?.soundId || normalizeSoundId(baseName);
    } catch (error) {
      skipped.push({ relativePath, reason: 'id-invalid', message: error.message });
      continue;
    }
    const soundId = allocateSoundId(preferredId, usedIds);
    usedIds.add(soundId);
    assets.push(createSoundAsset({
      soundId,
      name: matched?.name && matched.relativePath === relativePath ? matched.name : baseName,
      kind: 'custom',
      format,
      relativePath,
      durationMs: Number.isInteger(matched?.durationMs) ? matched.durationMs : 0,
      fileSizeBytes: info.size,
      sha256,
      enabled: matched?.enabled !== false
    }));
  }

  const registry = createSoundAssetRegistry({ assets });
  if (typeof registryPath === 'string' && registryPath.trim()) {
    await saveSoundAssetRegistry(registry, registryPath);
  }
  return Object.freeze({
    registry,
    imported: assets.length,
    skipped: Object.freeze(skipped)
  });
}
