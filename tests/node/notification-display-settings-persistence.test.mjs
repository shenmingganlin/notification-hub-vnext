import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import test from 'node:test';

import {
  createNotificationDisplaySettingsPersistence,
  resolveNotificationDisplaySettingsPersistenceConfig
} from '../../plugin/domain/notification-display-settings-persistence.js';

 test('display settings persistence resolves below dataDir and restores absent files', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'notification-display-settings-'));
  try {
    const resolved = resolveNotificationDisplaySettingsPersistenceConfig({ dataDir });
    assert.equal(resolved.filePath, path.join(dataDir, 'notification-display-settings.json'));
    const persistence = createNotificationDisplaySettingsPersistence({ dataDir });
    assert.equal(await persistence.restore(), null);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('display settings persistence saves and restores validated settings atomically', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'notification-display-settings-'));
  try {
    const persistence = createNotificationDisplaySettingsPersistence({ dataDir });
    const settings = { mode: 'custom', limit: 321, cardLifetimeSeconds: 120 };
    await persistence.save(settings);
    assert.deepEqual(JSON.parse(await readFile(persistence.filePath, 'utf8')), settings);
    assert.deepEqual(await persistence.restore(), settings);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('display settings persistence rejects malformed settings', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'notification-display-settings-'));
  try {
    const persistence = createNotificationDisplaySettingsPersistence({ dataDir });
    await assert.rejects(
      () => persistence.save({ mode: 'custom', limit: 0 }),
      (error) => error.code === 'NOTIFICATION_DISPLAY_SETTINGS_CUSTOM_INVALID'
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
