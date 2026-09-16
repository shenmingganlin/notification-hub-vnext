import path from 'node:path';
import { access, cp, mkdir, readFile } from 'node:fs/promises';
import { replaceFileAtomically } from '../persistence/atomic-file-replace.js';

const PRODUCT_DATA_FOLDER = 'HanaAgent';
const PLUGIN_DATA_FOLDER = 'notification-hub-vnext';

function firstNonEmpty(...values) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim() ?? '';
}

async function exists(filePath) {
  try { await access(filePath); return true; } catch { return false; }
}

export async function migrateSoundAssetStorage(paths) {
  if (!paths?.migratedFromLegacy || !paths.legacyRegistryPath || !paths.registryPath) return { migrated: false, reason: 'same-root' };
  if (!(await exists(paths.legacyRegistryPath))) return { migrated: false, reason: 'source-missing' };

  const legacy = JSON.parse(await readFile(paths.legacyRegistryPath, 'utf8'));
  if (!legacy || legacy.version !== 1 || !Array.isArray(legacy.assets)) return { migrated: false, reason: 'source-invalid' };
  let current = { version: 1, assets: [] };
  if (await exists(paths.registryPath)) {
    const parsed = JSON.parse(await readFile(paths.registryPath, 'utf8'));
    if (parsed?.version === 1 && Array.isArray(parsed.assets)) current = parsed;
  }

  await mkdir(paths.root, { recursive: true });
  if (await exists(paths.legacyAssetRoot)) {
    await cp(paths.legacyAssetRoot, paths.assetRoot, { recursive: true, force: false, errorOnExist: false });
  }
  const known = new Set(current.assets.map((asset) => asset?.soundId).filter(Boolean));
  const additions = legacy.assets.filter((asset) => asset?.soundId && !known.has(asset.soundId));
  if (additions.length === 0 && await exists(paths.registryPath)) return { migrated: false, reason: 'already-merged' };
  const merged = `${JSON.stringify({ version: 1, assets: [...current.assets, ...additions] })}\n`;
  await replaceFileAtomically(paths.registryPath, merged);
  return { migrated: true, from: paths.legacyRoot, to: paths.root, importedAssets: additions.length };
}

export function resolveSoundAssetStoragePaths({
  dataDir,
  persistentDataDir,
  userDataDir,
  env = process.env,
  platform = process.platform
} = {}) {
  const explicitRoot = firstNonEmpty(persistentDataDir, userDataDir);
  const appDataRoot = firstNonEmpty(env?.APPDATA, env?.XDG_DATA_HOME);
  const stableRoot = explicitRoot
    || (appDataRoot ? path.join(appDataRoot, PRODUCT_DATA_FOLDER, PLUGIN_DATA_FOLDER) : '');
  const root = path.resolve(stableRoot || dataDir || process.cwd());
  const legacyRoot = path.resolve(dataDir || root);
  return Object.freeze({
    platform,
    root,
    assetRoot: path.join(root, 'sound-assets'),
    registryPath: path.join(root, 'sound-assets.json'),
    legacyRoot,
    legacyAssetRoot: path.join(legacyRoot, 'sound-assets'),
    legacyRegistryPath: path.join(legacyRoot, 'sound-assets.json'),
    migratedFromLegacy: root !== legacyRoot
  });
}
