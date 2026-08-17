import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  loadNotificationStoreSnapshot,
  saveNotificationStoreSnapshot
} from '../../plugin/domain/notification-store-store.js';
import {
  createNotificationStoreSnapshot,
  serializeNotificationStoreSnapshot
} from '../../plugin/domain/notification-store-snapshot.js';

const firstSnapshot = createNotificationStoreSnapshot([{
  notificationId: 'notification-first',
  traceId: 'trace-first',
  createdAt: '2026-08-04T08:00:00.000Z',
  updatedAt: '2026-08-04T08:00:00.000Z',
  type: 'message',
  importance: 'normal',
  source: 'test',
  title: '第一条',
  content: '内容一',
  metadata: {},
  contentPolicy: {},
  runtimeHints: {},
  status: 'received'
}], { updatedAt: '2026-08-04T08:00:00.000Z' });

const secondSnapshot = createNotificationStoreSnapshot([{
  notificationId: 'notification-second',
  traceId: 'trace-second',
  createdAt: '2026-08-04T08:01:00.000Z',
  updatedAt: '2026-08-04T08:01:00.000Z',
  type: 'diagnostic',
  importance: 'high',
  source: 'test',
  title: '第二条',
  content: '内容二',
  metadata: { retryable: true },
  contentPolicy: {},
  runtimeHints: {},
  status: 'classified'
}], { updatedAt: '2026-08-04T08:01:00.000Z' });

function tempDirectory() {
  return mkdtemp(path.join(os.tmpdir(), 'notification-hub-store-'));
}

test('Notification Store file persists and reloads a validated snapshot atomically', async () => {
  const directory = await tempDirectory();
  const filePath = path.join(directory, 'nested', 'notifications.json');
  try {
    await saveNotificationStoreSnapshot(firstSnapshot, filePath);
    assert.deepEqual(await loadNotificationStoreSnapshot(filePath), firstSnapshot);
    assert.equal(await readFile(filePath, 'utf8'), serializeNotificationStoreSnapshot(firstSnapshot));
    assert.deepEqual(await readdir(path.dirname(filePath)), ['notifications.json']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Notification Store file replaces existing snapshots without backup artifacts', async () => {
  const directory = await tempDirectory();
  const filePath = path.join(directory, 'notifications.json');
  try {
    await saveNotificationStoreSnapshot(firstSnapshot, filePath);
    await saveNotificationStoreSnapshot(secondSnapshot, filePath);
    assert.deepEqual(await loadNotificationStoreSnapshot(filePath), secondSnapshot);
    assert.deepEqual(await readdir(directory), ['notifications.json']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Notification Store file returns null when target is absent', async () => {
  const directory = await tempDirectory();
  const filePath = path.join(directory, 'missing.json');
  try {
    assert.equal(await loadNotificationStoreSnapshot(filePath), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Notification Store file wraps corrupted and invalid snapshots as load errors', async () => {
  const directory = await tempDirectory();
  const filePath = path.join(directory, 'notifications.json');
  try {
    await writeFile(filePath, '{not-json', 'utf8');
    await assert.rejects(
      loadNotificationStoreSnapshot(filePath),
      (error) => error.code === 'NOTIFICATION_STORE_LOAD_FAILED'
        && error.details.path === filePath
        && error.details.cause === 'NOTIFICATION_STORE_SNAPSHOT_INVALID'
    );

    await writeFile(filePath, JSON.stringify({
      notificationStoreVersion: 99,
      updatedAt: '2026-08-04T08:00:00.000Z',
      records: []
    }), 'utf8');
    await assert.rejects(
      loadNotificationStoreSnapshot(filePath),
      (error) => error.code === 'NOTIFICATION_STORE_LOAD_FAILED'
        && error.details.cause === 'NOTIFICATION_STORE_SNAPSHOT_VERSION_UNSUPPORTED'
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Notification Store file preserves the previous snapshot when replacement fails', async () => {
  const directory = await tempDirectory();
  const filePath = path.join(directory, 'notifications.json');
  let replacementFailed = false;
  const failingFs = {
    renameFile: async (from, to) => {
      if (!replacementFailed && String(from).includes('.tmp-')) {
        replacementFailed = true;
        throw Object.assign(new Error('simulated replacement failure'), { code: 'EIO' });
      }
      return (await import('node:fs/promises')).rename(from, to);
    }
  };
  try {
    await saveNotificationStoreSnapshot(firstSnapshot, filePath);
    await assert.rejects(
      saveNotificationStoreSnapshot(secondSnapshot, filePath, { fsOps: failingFs }),
      (error) => error.code === 'NOTIFICATION_STORE_PERSIST_FAILED'
        && error.details.path === filePath
        && Boolean(error.details.temporaryPath)
        && Boolean(error.details.backupPath)
    );
    assert.deepEqual(await loadNotificationStoreSnapshot(filePath), firstSnapshot);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Notification Store file exposes rollback failure and leaves backup evidence', async () => {
  const directory = await tempDirectory();
  const filePath = path.join(directory, 'notifications.json');
  let temporaryRenameFailed = false;
  const failingFs = {
    renameFile: async (from, to) => {
      if (String(from).includes('.tmp-')) {
        temporaryRenameFailed = true;
        throw Object.assign(new Error('simulated replacement failure'), { code: 'EIO' });
      }
      if (temporaryRenameFailed && String(to) === filePath) {
        throw Object.assign(new Error('simulated rollback failure'), { code: 'EBUSY' });
      }
      return (await import('node:fs/promises')).rename(from, to);
    }
  };
  try {
    await saveNotificationStoreSnapshot(firstSnapshot, filePath);
    await assert.rejects(
      saveNotificationStoreSnapshot(secondSnapshot, filePath, { fsOps: failingFs }),
      (error) => error.code === 'NOTIFICATION_STORE_ROLLBACK_FAILED'
        && error.details.rollbackCode === 'EBUSY'
        && Boolean(error.details.backupPath)
    );
    const names = await readdir(directory);
    assert.equal(names.some((name) => name.includes('.bak-')), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Notification Store file serializes concurrent saves to the same target', async () => {
  const directory = await tempDirectory();
  const filePath = path.join(directory, 'notifications.json');
  const delayedFs = {
    writeFile: async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return (await import('node:fs/promises')).writeFile(...args);
    }
  };
  try {
    await Promise.all([
      saveNotificationStoreSnapshot(firstSnapshot, filePath, { fsOps: delayedFs }),
      saveNotificationStoreSnapshot(secondSnapshot, filePath, { fsOps: delayedFs })
    ]);
    assert.deepEqual(await loadNotificationStoreSnapshot(filePath), secondSnapshot);
    assert.deepEqual(await readdir(directory), ['notifications.json']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
