import assert from 'node:assert/strict';
import test from 'node:test';

import { SettingsStore } from '../../plugin/domain/settings-store.js';
import { RuntimeConfigApplier } from '../../plugin/domain/runtime-config-applier.js';

test('RuntimeConfigApplier sends current config and marks the matching revision applied', async () => {
  const store = new SettingsStore({ initialSettings: { globalSoundEnabled: false } });
  const calls = [];
  const diagnostics = [];
  const client = {
    async request(type, payload, options) {
      calls.push({ type, payload, options });
      return { payload: { result: { revision: payload.revision, applied: true } } };
    }
  };
  const applier = new RuntimeConfigApplier({ store, client });
  applier.on('diagnostic', (diagnostic) => diagnostics.push(diagnostic));

  const result = await applier.applyCurrent();

  assert.equal(result.revision, store.getSnapshot().revision);
  assert.equal(store.getSnapshot().status, 'applied');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'config.update');
  assert.equal(calls[0].options.retryable, false);
  assert.equal(diagnostics.length, 0);
});

test('RuntimeConfigApplier marks failed application and emits diagnostic without throwing', async () => {
  const store = new SettingsStore();
  const diagnostics = [];
  const client = {
    async request() {
      const error = new Error('Runtime unavailable');
      error.code = 'TRANSPORT_DISCONNECTED';
      throw error;
    }
  };
  const applier = new RuntimeConfigApplier({ store, client });
  applier.on('diagnostic', (diagnostic) => diagnostics.push(diagnostic));

  const result = await applier.applyCurrent();

  assert.equal(result.applied, false);
  assert.equal(store.getSnapshot().status, 'apply-failed');
  assert.equal(store.getSnapshot().applyError.code, 'TRANSPORT_DISCONNECTED');
  assert.equal(diagnostics[0].code, 'RUNTIME_CONFIG_APPLY_FAILED');
});

test('RuntimeConfigApplier rejects stale ACKs and invalid construction boundaries', async () => {
  const store = new SettingsStore();
  const client = {
    async request() {
      store.updateSoundSettings({ globalSoundEnabled: false });
      return { payload: { result: { revision: 1, applied: true } } };
    }
  };
  const applier = new RuntimeConfigApplier({ store, client });

  await assert.rejects(
    () => applier.applyCurrent(),
    (error) => error.code === 'SETTINGS_STORE_REVISION_STALE'
  );
  assert.throws(
    () => new RuntimeConfigApplier({ store }),
    (error) => error.code === 'RUNTIME_CONFIG_APPLIER_INVALID'
  );
});
