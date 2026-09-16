import assert from 'node:assert/strict';
import test from 'node:test';
import { VisualSettingsStore, VISUAL_SETTINGS_STATUSES, createVisualSettingsStoreSnapshot } from '../../plugin/domain/visual-settings-store.js';

test('visual store tracks independent revisions and apply status', () => {
  const store = new VisualSettingsStore();
  assert.equal(store.getSnapshot().status, VISUAL_SETTINGS_STATUSES.SAVED);
  const updated = store.updateVisualSettings({ profile: { global: { preset: 'accent' } } });
  assert.equal(updated.revision, 2);
  assert.equal(updated.settings.profile.global.preset, 'accent');
  assert.equal(store.markApplied(2).status, VISUAL_SETTINGS_STATUSES.APPLIED);
  assert.equal(store.markApplyFailed(2, { code: 'VISUAL_RUNTIME_UNAVAILABLE', message: 'Runtime unavailable' }).status, VISUAL_SETTINGS_STATUSES.APPLY_FAILED);
  assert.equal(store.getSnapshot().applyError.code, 'VISUAL_RUNTIME_UNAVAILABLE');
});

test('visual store snapshot is versioned and frozen', () => {
  const store = new VisualSettingsStore();
  const snapshot = createVisualSettingsStoreSnapshot(store.getSnapshot().settings, 1);
  assert.equal(snapshot.version, 1);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.throws(() => store.restoreSnapshot({ ...snapshot, revision: 0 }), (error) => error.code === 'VISUAL_SETTINGS_SNAPSHOT_INVALID');
});

test('profile-only studio save recopies charter onto machine channels', () => {
  const store = new VisualSettingsStore({
    initialSettings: {
      profile: { behaviorId: 'ticker', ticker: { band: 'top', minGapPx: 64, direction: 'left' } }
    }
  });
  assert.equal(store.getSnapshot().settings.channels.ticker.band, 'top');
  store.updateVisualSettings({
    profile: { behaviorId: 'ticker', ticker: { band: 'bottom', minGapPx: 80, direction: 'right' } }
  });
  const settings = store.getSnapshot().settings;
  assert.equal(settings.channels.ticker.band, 'bottom');
  assert.equal(settings.channels.ticker.minGapPx, 80);
  assert.equal(settings.profile.ticker.direction, 'right');
  assert.equal('direction' in settings.channels.ticker, false);
});
