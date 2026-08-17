import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  addRecoveryEntry,
  createRecoverySnapshot,
  loadRecoverySnapshot,
  parseRecoverySnapshot,
  saveRecoverySnapshot,
  serializeRecoverySnapshot
} from '../../plugin/runtime/recovery-snapshot.js';

test('recovery snapshot persists atomically and validates on load', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'notification-hub-recovery-'));
  const filePath = path.join(directory, 'runtime-recovery.json');
  try {
    const snapshot = createRecoverySnapshot();
    addRecoveryEntry(snapshot, {
      key: 'config',
      type: 'config.update',
      payload: { profile: 'default', durationMs: 4500 }
    });
    addRecoveryEntry(snapshot, {
      key: 'mode',
      type: 'scene.set-mode',
      payload: {
        layout: 'stack',
        direction: 'down',
        anchor: 'top-right',
        spacing: 12,
        workAreaWidth: 800,
        workAreaHeight: 600,
        dpiScale: 1
      }
    });
    addRecoveryEntry(snapshot, {
      key: 'provider-mode',
      type: 'scene.set-mode',
      payload: {
        layout: 'stack',
        direction: 'down',
        anchor: 'top-right',
        spacing: 8
      }
    });
    addRecoveryEntry(snapshot, {
      key: 'shelf-mode',
      type: 'scene.set-mode',
      payload: {
        layout: 'shelf',
        direction: 'right',
        anchor: 'bottom-left',
        spacing: 10
      }
    });
    addRecoveryEntry(snapshot, {
      key: 'window',
      type: 'scene.update',
      payload: { x: 120, y: 80, width: 420, height: 180 }
    });
    addRecoveryEntry(snapshot, {
      key: 'card-a',
      type: 'scene.create',
      payload: { id: 'card-a', title: 'Card A', body: 'First card', x: 140, y: 90, width: 320, height: 160 }
    });
    addRecoveryEntry(snapshot, {
      key: 'card-b',
      type: 'scene.create',
      payload: { id: 'card-b', title: 'Card B', body: 'Second card', x: 500, y: 90, width: 320, height: 160 }
    });
    addRecoveryEntry(snapshot, {
      key: 'card-b-dismiss',
      type: 'scene.dismiss',
      payload: { id: 'card-b' }
    });

    await saveRecoverySnapshot(snapshot, filePath);
    const loaded = await loadRecoverySnapshot(filePath);
    assert.deepEqual(loaded.entries, snapshot.entries);
    assert.deepEqual(parseRecoverySnapshot(serializeRecoverySnapshot(loaded)), loaded);
    assert.match(await readFile(filePath, 'utf8'), /"recoveryVersion":1/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('recovery snapshot replaces entries by key and preserves distinct replay order', () => {
  const snapshot = createRecoverySnapshot();
  addRecoveryEntry(snapshot, {
    key: 'scene-mode',
    type: 'scene.set-mode',
    payload: { layout: 'stack', direction: 'down', anchor: 'top-right', spacing: 8 }
  });
  addRecoveryEntry(snapshot, {
    key: 'provider-mode',
    type: 'scene.set-mode',
    payload: { layout: 'stack', direction: 'down', anchor: 'top-right', spacing: 10 }
  });
  addRecoveryEntry(snapshot, {
    key: 'scene-mode',
    type: 'scene.set-mode',
    payload: { layout: 'shelf', direction: 'right', anchor: 'bottom-left', spacing: 12 }
  });

  assert.deepEqual(snapshot.entries, [
    {
      key: 'scene-mode',
      type: 'scene.set-mode',
      payload: { layout: 'shelf', direction: 'right', anchor: 'bottom-left', spacing: 12 }
    },
    {
      key: 'provider-mode',
      type: 'scene.set-mode',
      payload: { layout: 'stack', direction: 'down', anchor: 'top-right', spacing: 10 }
    }
  ]);
});

test('recovery snapshot rejects unsupported commands and malformed files', async () => {
  const snapshot = createRecoverySnapshot();
  assert.throws(
    () => addRecoveryEntry(snapshot, { key: 'scene', type: 'scene.drag', payload: {} }),
    (error) => error.code === 'RUNTIME_RECOVERY_TYPE_UNSUPPORTED'
  );
  assert.throws(
    () => parseRecoverySnapshot('{"recoveryVersion":99}'),
    (error) => error.code === 'RUNTIME_RECOVERY_VERSION_UNSUPPORTED'
  );
  assert.throws(
    () => addRecoveryEntry(snapshot, {
      key: 'invalid-window',
      type: 'scene.update',
      payload: { x: 0, y: 0, width: 0, height: 180 }
    }),
    (error) => error.code === 'RUNTIME_RECOVERY_INVALID_PAYLOAD'
  );
  assert.throws(
    () => addRecoveryEntry(snapshot, {
      key: 'invalid-card',
      type: 'scene.create',
      payload: { id: 'card', title: '', x: 0, y: 0, width: 320, height: 160 }
    }),
    (error) => error.code === 'RUNTIME_RECOVERY_INVALID_PAYLOAD'
  );
  assert.throws(
    () => addRecoveryEntry(snapshot, {
      key: 'invalid-mode',
      type: 'scene.set-mode',
      payload: { layout: 'stack', direction: 'down', anchor: 'top-right', spacing: -1, workAreaWidth: 800, workAreaHeight: 600, dpiScale: 1 }
    }),
    (error) => error.code === 'RUNTIME_RECOVERY_INVALID_PAYLOAD'
  );
  assert.throws(
    () => addRecoveryEntry(snapshot, {
      key: 'partial-mode',
      type: 'scene.set-mode',
      payload: { layout: 'stack', direction: 'down', anchor: 'top-right', spacing: 8, workAreaWidth: 800 }
    }),
    (error) => error.code === 'RUNTIME_RECOVERY_INVALID_PAYLOAD'
  );
  const validSerialized = serializeRecoverySnapshot(createRecoverySnapshot({ entries: [{
    key: 'valid',
    type: 'config.update',
    payload: { profile: 'default' }
  }] }));
  const blankKey = validSerialized.replace('"key":"valid"', '"key":"  "');
  const duplicateKey = validSerialized.replace('"entries":[{', '"entries":[{"key":"valid","type":"config.update","payload":{"profile":"duplicate"}},{');
  assert.throws(
    () => parseRecoverySnapshot(blankKey),
    (error) => error.code === 'RUNTIME_RECOVERY_INVALID_SNAPSHOT'
  );
  assert.throws(
    () => parseRecoverySnapshot(duplicateKey),
    (error) => error.code === 'RUNTIME_RECOVERY_INVALID_SNAPSHOT'
  );
});
