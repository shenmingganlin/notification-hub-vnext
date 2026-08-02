import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { RuntimeHostAdapter } from '../../plugin/runtime/host-adapter.js';
import { createRecoverySnapshot } from '../../plugin/runtime/recovery-snapshot.js';

class FakeClient extends EventEmitter {
  constructor(options, events) {
    super();
    this.options = options;
    this.events = events;
    events.push('client:create');
  }

  async request(type) {
    this.events.push(`client:${type}`);
    return {
      type: 'ack',
      payload: {
        requestType: type,
        result: { sceneStateSnapshot: null }
      }
    };
  }

  async close() {
    this.events.push('client:close');
  }
}

class FakeManager extends EventEmitter {
  constructor(options, events) {
    super();
    this.options = options;
    this.events = events;
    events.push('manager:create');
  }

  async start() {
    this.events.push('manager:start');
  }

  async restoreRecoverySnapshot() {
    this.events.push('manager:restore');
  }

  async stop() {
    this.events.push('manager:stop');
  }
}

test('RuntimeHostAdapter loads recovery, starts Runtime, handshakes, restores, and health-checks in order', async () => {
  const events = [];
  const plan = {
    source: 'scene-state',
    snapshot: createRecoverySnapshot({ entries: [{
      key: 'scene-window',
      type: 'scene.update',
      payload: { x: 1, y: 2, width: 300, height: 200 }
    }] }),
    diagnostics: []
  };
  let manager;
  let client;
  const adapter = new RuntimeHostAdapter({
    context: { dataDir: 'C:\\Hana\\data', config: { sceneStatePersistenceEnabled: false } },
    runtimePath: 'runtime.exe',
    pipeName: '\\\\.\\pipe\\host-adapter',
    loadPlan: async (options) => {
      events.push(`load:${options.allowEmpty}`);
      assert.equal(options.sceneStatePath, undefined);
      assert.equal(options.recoverySnapshotPath, 'C:\\Hana\\data\\recovery.json');
      return plan;
    },
    managerFactory: (options) => {
      manager = new FakeManager(options, events);
      return manager;
    },
    clientFactory: (options) => {
      client = new FakeClient(options, events);
      return client;
    }
  });

  const started = await adapter.start();
  assert.equal(started, adapter);
  assert.equal(adapter.state, 'running');
  assert.equal(manager.options.recoverySnapshot, plan.snapshot);
  assert.equal(manager.options.recoveryClient, client);
  assert.deepEqual(events, [
    'load:true',
    'client:create',
    'manager:create',
    'manager:start',
    'client:hello',
    'manager:restore',
    'client:health'
  ]);

  await adapter.stop();
  assert.equal(adapter.state, 'stopped');
  assert.deepEqual(events.slice(-2), ['manager:stop', 'client:close']);
});

test('RuntimeHostAdapter allows a fresh install with no persisted recovery source', async () => {
  const events = [];
  const emptyPlan = {
    source: 'empty',
    snapshot: createRecoverySnapshot(),
    diagnostics: []
  };
  const adapter = new RuntimeHostAdapter({
    context: { dataDir: 'C:\\Hana\\data', config: { sceneStatePersistenceEnabled: false } },
    runtimePath: 'runtime.exe',
    pipeName: '\\\\.\\pipe\\host-adapter-empty',
    loadPlan: async ({ allowEmpty }) => {
      assert.equal(allowEmpty, true);
      return emptyPlan;
    },
    managerFactory: (options) => new FakeManager(options, events),
    clientFactory: (options) => new FakeClient(options, events)
  });

  await adapter.start();
  assert.equal(adapter.manager.options.recoverySnapshot.entries.length, 0);
  await adapter.stop();
});

test('RuntimeHostAdapter cleans up client and manager when startup fails', async () => {
  const events = [];
  let manager;
  let client;
  const adapter = new RuntimeHostAdapter({
    context: { dataDir: 'C:\\Hana\\data', config: { sceneStatePersistenceEnabled: false } },
    runtimePath: 'runtime.exe',
    pipeName: '\\\\.\\pipe\\host-adapter-failure',
    loadPlan: async () => ({ source: 'empty', snapshot: createRecoverySnapshot(), diagnostics: [] }),
    managerFactory: (options) => {
      manager = new FakeManager(options, events);
      manager.restoreRecoverySnapshot = async () => {
        events.push('manager:restore');
        throw Object.assign(new Error('replay failed'), { code: 'RUNTIME_RECOVERY_FAILED' });
      };
      return manager;
    },
    clientFactory: (options) => {
      client = new FakeClient(options, events);
      return client;
    }
  });

  await assert.rejects(adapter.start(), (error) => error.code === 'RUNTIME_RECOVERY_FAILED');
  assert.equal(adapter.state, 'failed');
  assert.equal(adapter.manager, null);
  assert.equal(adapter.client, null);
  assert.deepEqual(events.slice(-2), ['manager:stop', 'client:close']);
});
