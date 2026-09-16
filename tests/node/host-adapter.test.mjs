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

test('RuntimeHostAdapter cancels an in-flight start when stop begins', async () => {
  const events = [];
  let releasePlan;
  const planReady = new Promise((resolve) => { releasePlan = resolve; });
  const adapter = new RuntimeHostAdapter({
    context: { dataDir: 'C:\\Hana\\data', config: { sceneStatePersistenceEnabled: false } },
    runtimePath: 'runtime.exe',
    pipeName: '\\\\.\\pipe\\host-adapter-cancel',
    loadPlan: async () => planReady,
    managerFactory: () => {
      events.push('manager:create');
      return new FakeManager({}, events);
    },
    clientFactory: () => {
      events.push('client:create');
      return new FakeClient({}, events);
    }
  });

  const startPromise = adapter.start();
  const stopPromise = adapter.stop();
  releasePlan({ source: 'empty', snapshot: createRecoverySnapshot(), diagnostics: [] });

  await assert.rejects(startPromise, (error) => error.code === 'RUNTIME_HOST_START_CANCELLED');
  await stopPromise;
  assert.equal(adapter.state, 'stopped');
  assert.equal(adapter.manager, null);
  assert.equal(adapter.client, null);
  assert.deepEqual(events, []);
});

test('RuntimeHostAdapter exposes abnormal exit, reconnecting, and normal stop lifecycle states', async () => {
  const events = [];
  let manager;
  let client;
  const adapter = new RuntimeHostAdapter({
    context: { dataDir: 'C:\\Hana\\data', config: { sceneStatePersistenceEnabled: false } },
    runtimePath: 'runtime.exe',
    pipeName: '\\\\.\\pipe\\host-adapter-lifecycle',
    loadPlan: async () => ({ source: 'empty', snapshot: createRecoverySnapshot(), diagnostics: [] }),
    managerFactory: (options) => {
      manager = new FakeManager(options, events);
      return manager;
    },
    clientFactory: (options) => {
      client = new FakeClient(options, events);
      return client;
    }
  });

  await adapter.start();
  assert.equal(adapter.getRuntimeStatus().state, 'running');

  manager.emit('exit', { code: 17, signal: null, intentional: false });
  let status = adapter.getRuntimeStatus();
  assert.equal(status.state, 'crashed');
  assert.equal(status.message, 'Runtime 异常退出');
  assert.equal(status.lastError.code, 'RUNTIME_EXITED');
  assert.equal(status.lastError.stage, 'runtime-process');
  assert.equal(status.lastError.category, 'runtime-crash');
  assert.equal(status.lastError.reason, 'runtime-exited');
  assert.equal(status.lastError.recoverable, true);
  assert.equal(status.lastError.userAction, 'retry');
  assert.equal(status.lastError.notifyUser, true);
  assert.deepEqual(status.lastError.details, { exitCode: 17, signal: null, intentional: false });

  manager.emit('diagnostic', { code: 'RUNTIME_RESTART_SCHEDULED', message: 'restart', details: {} });
  assert.equal(adapter.getRuntimeStatus().state, 'reconnecting');
  client = adapter.client;
  client.emit('state', { state: 'connected' });
  assert.equal(adapter.getRuntimeStatus().state, 'reconnecting');

  manager.emit('restarted', { attempt: 1 });
  status = adapter.getRuntimeStatus();
  assert.equal(status.state, 'running');
  assert.equal(status.lastError.code, 'RUNTIME_EXITED');

  await adapter.stop();
  status = adapter.getRuntimeStatus();
  assert.equal(status.state, 'stopped');
  assert.equal(status.message, 'Runtime 已停止');
  assert.equal(status.lastError.code, 'RUNTIME_EXITED');
});

test('RuntimeHostAdapter returns to running when the current PipeClient reconnects', async () => {
  const events = [];
  let client;
  const adapter = new RuntimeHostAdapter({
    context: { dataDir: 'C:\\Hana\\data', config: { sceneStatePersistenceEnabled: false } },
    runtimePath: 'runtime.exe',
    pipeName: '\\\\.\\pipe\\host-adapter-reconnect',
    loadPlan: async () => ({ source: 'empty', snapshot: createRecoverySnapshot(), diagnostics: [] }),
    managerFactory: (options) => new FakeManager(options, events),
    clientFactory: (options) => {
      client = new FakeClient(options, events);
      return client;
    }
  });

  await adapter.start();
  client.emit('diagnostic', { code: 'TRANSPORT_DISCONNECTED', message: 'Named Pipe disconnected' });
  assert.equal(adapter.getRuntimeStatus().state, 'reconnecting');
  client.emit('state', { state: 'connected' });
  assert.equal(adapter.getRuntimeStatus().state, 'running');
  assert.equal(adapter.getRuntimeStatus().connected, false);
  await adapter.stop();
});

test('RuntimeHostAdapter ignores events from an old lifecycle after stop and a new start', async () => {
  const events = [];
  const managers = [];
  const clients = [];
  const adapter = new RuntimeHostAdapter({
    context: { dataDir: 'C:\\Hana\\data', config: { sceneStatePersistenceEnabled: false } },
    runtimePath: 'runtime.exe',
    pipeName: '\\\\.\\pipe\\host-adapter-stale-listener',
    loadPlan: async () => ({ source: 'empty', snapshot: createRecoverySnapshot(), diagnostics: [] }),
    managerFactory: (options) => {
      const manager = new FakeManager(options, events);
      managers.push(manager);
      return manager;
    },
    clientFactory: (options) => {
      const client = new FakeClient(options, events);
      clients.push(client);
      return client;
    }
  });

  await adapter.start();
  const oldManager = managers[0];
  const oldClient = clients[0];
  await adapter.stop();
  await adapter.start();
  assert.equal(adapter.state, 'running');

  oldManager.emit('exit', { code: 9, signal: null, intentional: false });
  oldManager.emit('diagnostic', { code: 'RUNTIME_RESTART_EXHAUSTED', message: 'old', details: {} });
  oldClient.emit('state', { state: 'connected' });
  oldClient.emit('diagnostic', { code: 'TRANSPORT_DISCONNECTED', message: 'old', details: {} });

  assert.equal(adapter.state, 'running');
  assert.equal(adapter.lastError, null);
  await adapter.stop();
});

test('RuntimeHostAdapter clean stop does not create a stop error', async () => {
  const events = [];
  const adapter = new RuntimeHostAdapter({
    context: { dataDir: 'C:\\Hana\\data', config: { sceneStatePersistenceEnabled: false } },
    runtimePath: 'runtime.exe',
    pipeName: '\\\\.\\pipe\\host-adapter-clean-stop',
    loadPlan: async () => ({ source: 'empty', snapshot: createRecoverySnapshot(), diagnostics: [] }),
    managerFactory: (options) => new FakeManager(options, events),
    clientFactory: (options) => new FakeClient(options, events)
  });

  await adapter.start();
  await adapter.stop();
  const status = adapter.getRuntimeStatus();
  assert.equal(status.state, 'stopped');
  assert.equal(status.lastError, null);
});

test('RuntimeHostAdapter classifies transport disconnects as recoverable retry diagnostics', async () => {
  const events = [];
  let manager;
  const adapter = new RuntimeHostAdapter({
    context: { dataDir: 'C:\\Hana\\data', config: { sceneStatePersistenceEnabled: false } },
    runtimePath: 'runtime.exe',
    pipeName: '\\\\.\\pipe\\host-adapter-transport',
    loadPlan: async () => ({ source: 'empty', snapshot: createRecoverySnapshot(), diagnostics: [] }),
    managerFactory: (options) => {
      manager = new FakeManager(options, events);
      return manager;
    },
    clientFactory: (options) => new FakeClient(options, events)
  });

  await adapter.start();
  manager.emit('diagnostic', {
    code: 'TRANSPORT_DISCONNECTED',
    message: 'Named Pipe disconnected',
    details: { source: 'client' },
    timestamp: '2026-08-10T10:00:00.000Z'
  });

  const status = adapter.getRuntimeStatus();
  assert.equal(status.state, 'reconnecting');
  assert.equal(status.lastError.category, 'transport');
  assert.equal(status.lastError.reason, 'transport-disconnected');
  assert.equal(status.lastError.recoverable, true);
  assert.equal(status.lastError.userAction, 'retry');
  assert.equal(status.lastError.notifyUser, true);
  assert.deepEqual(status.lastError.details, { source: 'client' });
  await adapter.stop();
});

test('RuntimeHostAdapter does not mark TRANSPORT_ACK_TIMEOUT as reconnecting', async () => {
  const events = [];
  let client;
  const adapter = new RuntimeHostAdapter({
    context: { dataDir: 'C:\\Hana\\data', config: { sceneStatePersistenceEnabled: false } },
    runtimePath: 'runtime.exe',
    pipeName: '\\\\.\\pipe\\host-adapter-ack-timeout',
    loadPlan: async () => ({ source: 'empty', snapshot: createRecoverySnapshot(), diagnostics: [] }),
    managerFactory: (options) => new FakeManager(options, events),
    clientFactory: (options) => {
      client = new FakeClient(options, events);
      return client;
    }
  });

  await adapter.start();
  client.emit('diagnostic', {
    code: 'TRANSPORT_ACK_TIMEOUT',
    message: 'ACK timed out for req-node-914',
    details: { requestId: 'req-node-914', requestType: 'scene.create' }
  });
  assert.equal(adapter.getRuntimeStatus().state, 'running');
  await adapter.stop();
});

test('RuntimeHostAdapter reports stop-failed without masking the stop error', async () => {
  const events = [];
  let manager;
  const adapter = new RuntimeHostAdapter({
    context: { dataDir: 'C:\\Hana\\data', config: { sceneStatePersistenceEnabled: false } },
    runtimePath: 'runtime.exe',
    pipeName: '\\\\.\\pipe\\host-adapter-stop-failed',
    loadPlan: async () => ({ source: 'empty', snapshot: createRecoverySnapshot(), diagnostics: [] }),
    managerFactory: (options) => {
      manager = new FakeManager(options, events);
      manager.stop = async () => {
        events.push('manager:stop-failed');
        throw Object.assign(new Error('stop refused'), { code: 'RUNTIME_STOP_FAILED' });
      };
      return manager;
    },
    clientFactory: (options) => new FakeClient(options, events)
  });

  await adapter.start();
  await assert.rejects(adapter.stop(), (error) => error.code === 'RUNTIME_STOP_FAILED');
  const status = adapter.getRuntimeStatus();
  assert.equal(status.state, 'stop-failed');
  assert.equal(status.message, 'Runtime 停止失败');
  assert.equal(status.lastError.code, 'RUNTIME_STOP_FAILED');
  assert.equal(status.lastError.stage, 'host-stop');
  assert.equal(status.lastError.category, 'runtime');
  assert.equal(status.lastError.recoverable, true);
  assert.equal(status.lastError.userAction, 'inspect');
  assert.equal(status.lastError.notifyUser, true);
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
