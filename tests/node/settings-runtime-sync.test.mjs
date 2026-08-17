import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { SettingsStore } from '../../plugin/domain/settings-store.js';
import { SettingsRuntimeSync } from '../../plugin/domain/settings-runtime-sync.js';

class FakePersistence extends EventEmitter {
  constructor(snapshot = null) {
    super();
    this.snapshot = snapshot;
    this.events = [];
  }

  observe() {
    this.events.push('observe');
    return () => this.events.push('unsubscribe');
  }

  async restore() {
    this.events.push('restore');
    return this.snapshot;
  }

  async flush() {
    this.events.push('flush');
  }
}

class FakeHost extends EventEmitter {
  constructor() {
    super();
    this.state = 'stopped';
    this.client = null;
  }

  getRuntimeStatus() {
    return { state: this.state };
  }
}

test('SettingsRuntimeSync restores settings before Runtime start and applies after started', async () => {
  const store = new SettingsStore();
  const persistence = new FakePersistence();
  const host = new FakeHost();
  const requests = [];
  host.client = {
    async request(type, payload) {
      requests.push({ type, payload });
      return { payload: { result: { applied: true, revision: payload.revision } } };
    }
  };
  const sync = new SettingsRuntimeSync({ store, persistence, host });

  await sync.start();
  assert.deepEqual(persistence.events, ['restore', 'observe']);
  assert.equal(requests.length, 0);

  host.state = 'running';
  host.emit('started');
  await sync.idle();

  assert.equal(requests.length, 1);
  assert.equal(requests[0].type, 'config.update');
  assert.equal(store.getSnapshot().status, 'applied');
});

test('SettingsRuntimeSync applies only the newest changed revision', async () => {
  const store = new SettingsStore();
  const persistence = new FakePersistence();
  const host = new FakeHost();
  const resolvers = [];
  host.client = {
    request: async (type, payload) => new Promise((resolve) => {
      resolvers.push({ type, payload, resolve });
    })
  };
  host.state = 'running';
  const sync = new SettingsRuntimeSync({ store, persistence, host });

  await sync.start();
  const first = sync.applyCurrent();
  store.updateSoundSettings({ globalSoundEnabled: false });
  store.updateSoundSettings({ workModeMuted: true });
  resolvers[0].resolve({ payload: { result: { applied: true, revision: 1 } } });
  await first;

  assert.equal(resolvers.length, 2);
  assert.equal(resolvers[1].payload.revision, 2);
  resolvers[1].resolve({ payload: { result: { applied: true, revision: 2 } } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(resolvers.length, 3);
  assert.equal(resolvers[2].payload.revision, 3);
  resolvers[2].resolve({ payload: { result: { applied: true, revision: 3 } } });
  await sync.idle();
  assert.equal(store.getSnapshot().status, 'applied');
  assert.equal(store.getSnapshot().appliedRevision, 3);
});

test('SettingsRuntimeSync keeps persistence independent when Runtime is unavailable', async () => {
  const store = new SettingsStore();
  const persistence = new FakePersistence();
  const host = new FakeHost();
  const diagnostics = [];
  const sync = new SettingsRuntimeSync({ store, persistence, host });
  sync.on('diagnostic', (diagnostic) => diagnostics.push(diagnostic));

  await sync.start();
  store.updateSoundSettings({ globalSoundEnabled: false });
  await sync.idle();

  assert.equal(store.getSnapshot().status, 'saved');
  assert.equal(diagnostics.length, 0);
  await sync.stop();
  assert.deepEqual(persistence.events, ['restore', 'observe', 'unsubscribe', 'flush']);
});
