import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EventPresentationSettingsStore,
  createEventPresentationSettingsStoreSnapshot
} from '../../plugin/domain/event-presentation-settings-store.js';

test('event presentation store tracks revisions and apply status', () => {
  const store = new EventPresentationSettingsStore();
  assert.equal(store.getSnapshot().revision, 1);
  const changed = store.updateSettings({ events: { 'tool.execution.failed': { soundProfileId: 'sound.error', visualProfileId: 'visual.error', behaviorProfileId: 'popup', behaviorChannelId: 'popup.alert' } } });
  assert.equal(changed.revision, 2);
  assert.equal(changed.status, 'saved');
  assert.equal(store.markApplied(2).status, 'applied');
  assert.throws(() => store.markApplied(1), (error) => error.code === 'EVENT_PRESENTATION_STORE_REVISION_STALE');
});

test('event presentation store snapshot is versioned and restorable', () => {
  const store = new EventPresentationSettingsStore();
  const snapshot = createEventPresentationSettingsStoreSnapshot(store.getSnapshot().settings, 3, { updatedAt: '2026-08-16T00:00:00.000Z' });
  const restored = new EventPresentationSettingsStore();
  assert.equal(restored.restoreSnapshot(snapshot).revision, 3);
  assert.throws(() => restored.restoreSnapshot({ ...snapshot, revision: 0 }), (error) => error.code === 'EVENT_PRESENTATION_STORE_SNAPSHOT_INVALID');
});
