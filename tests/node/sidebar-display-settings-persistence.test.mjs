import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createSidebarDisplaySettingsPersistence,
  resolveSidebarDisplaySettingsPersistenceConfig
} from '../../plugin/domain/sidebar-display-settings-persistence.js';

test('sidebar display settings persistence resolves below dataDir and restores absent files', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'sidebar-display-settings-'));
  try {
    const resolved = resolveSidebarDisplaySettingsPersistenceConfig({ dataDir });
    assert.equal(resolved.filePath, path.join(dataDir, 'sidebar-display-settings.json'));
    assert.equal(await createSidebarDisplaySettingsPersistence({ dataDir }).restore(), null);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('sidebar display settings persistence saves and restores validated settings atomically', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'sidebar-display-settings-'));
  try {
    const persistence = createSidebarDisplaySettingsPersistence({ dataDir });
    const settings = { mode: 'custom', limit: 7 };
    await persistence.save(settings);
    assert.deepEqual(JSON.parse(await readFile(persistence.filePath, 'utf8')), settings);
    assert.deepEqual(await persistence.restore(), settings);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('sidebar display settings persistence rejects malformed settings', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'sidebar-display-settings-'));
  try {
    const persistence = createSidebarDisplaySettingsPersistence({ dataDir });
    await assert.rejects(
      () => persistence.save({ mode: 'custom', limit: 21 }),
      (error) => error.code === 'SIDEBAR_DISPLAY_SETTINGS_CUSTOM_INVALID'
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
