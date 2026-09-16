import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, mkdir, writeFile, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { migrateSoundAssetStorage, resolveSoundAssetStoragePaths } from '../../plugin/domain/sound-asset-storage-path.js';

test('sound assets use a stable user data root instead of the replaceable plugin dataDir', () => {
  const paths = resolveSoundAssetStoragePaths({
    dataDir: 'C:\\Hana\\plugins\\notification-hub-vnext',
    env: { APPDATA: 'C:\\Users\\Ganlin\\AppData\\Roaming' },
    platform: 'win32'
  });

  assert.equal(paths.root, path.resolve('C:\\Users\\Ganlin\\AppData\\Roaming\\HanaAgent\\notification-hub-vnext'));
  assert.equal(paths.assetRoot, path.join(paths.root, 'sound-assets'));
  assert.equal(paths.registryPath, path.join(paths.root, 'sound-assets.json'));
  assert.equal(paths.legacyRoot, path.resolve('C:\\Hana\\plugins\\notification-hub-vnext'));
  assert.equal(paths.migratedFromLegacy, true);
});

test('startup migration copies legacy registry and files into stable storage without deleting the legacy copy', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nh-sound-storage-'));
  try {
    const legacyRoot = path.join(root, 'legacy-data');
    const persistentRoot = path.join(root, 'persistent-data');
    const legacyAsset = path.join(legacyRoot, 'sound-assets', 'custom', 'alert.wav');
    await mkdir(path.dirname(legacyAsset), { recursive: true });
    await writeFile(legacyAsset, Buffer.from('wav-data'));
    await writeFile(path.join(legacyRoot, 'sound-assets.json'), JSON.stringify({ version: 1, assets: [{ soundId: 'alert', relativePath: 'custom/alert.wav' }] }));

    const paths = resolveSoundAssetStoragePaths({ dataDir: legacyRoot, persistentDataDir: persistentRoot, platform: 'win32' });
    const result = await migrateSoundAssetStorage(paths);

    assert.equal(result.migrated, true);
    assert.deepEqual(JSON.parse(await readFile(paths.registryPath, 'utf8')).assets[0].soundId, 'alert');
    assert.deepEqual(await readFile(path.join(paths.assetRoot, 'custom', 'alert.wav')), Buffer.from('wav-data'));
    await access(legacyAsset);
    await access(paths.legacyRegistryPath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('userDataDir does not steal the live sound library from AppData', () => {
  const paths = resolveSoundAssetStoragePaths({
    dataDir: 'C:\\Hana\\plugin-data',
    userDataDir: 'C:\\Hana\\plugin-data',
    env: { APPDATA: 'C:\\Users\\Ganlin\\AppData\\Roaming' },
    platform: 'win32'
  });

  assert.equal(paths.root, path.resolve('C:\\Users\\Ganlin\\AppData\\Roaming\\HanaAgent\\notification-hub-vnext'));
  assert.equal(paths.migratedFromLegacy, true);
});

test('explicit persistentDataDir is preferred for host and test isolation', () => {
  const paths = resolveSoundAssetStoragePaths({
    dataDir: 'C:\\Hana\\plugin-data',
    persistentDataDir: 'C:\\Hana\\user-data\\notification-hub-vnext',
    env: { APPDATA: 'C:\\ignored' },
    platform: 'win32'
  });

  assert.equal(paths.root, path.resolve('C:\\Hana\\user-data\\notification-hub-vnext'));
  assert.equal(paths.migratedFromLegacy, true);
});
