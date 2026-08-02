import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import NotificationHubVNextPlugin, { pluginName, pluginVersion } from '../../plugin/index.js';

class FakeAdapter extends EventEmitter {
  constructor() {
    super();
    this.pipeName = '\\\\.\\pipe\\notification-hub-vnext-test';
    this.started = 0;
    this.stopped = 0;
  }

  async start() {
    this.started += 1;
    this.emit('diagnostic', { code: 'TEST_DIAGNOSTIC' });
  }

  async stop() {
    this.stopped += 1;
  }
}

function context(config = {}) {
  const logs = [];
  return {
    pluginDir: 'C:\\Hana\\plugins\\notification-hub-vnext',
    dataDir: 'C:\\Hana\\data\\notification-hub-vnext',
    config,
    log: {
      info: (...args) => logs.push(['info', ...args]),
      debug: (...args) => logs.push(['debug', ...args]),
      warn: (...args) => logs.push(['warn', ...args]),
      error: (...args) => logs.push(['error', ...args])
    },
    logs
  };
}

test('vNext plugin owns one isolated RuntimeHostAdapter through onload/onunload', async () => {
  const ctx = context();
  let adapter;
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => {
      adapter = new FakeAdapter();
      return adapter;
    }
  });

  await plugin.onload();
  assert.equal(pluginName, 'notification-hub-vnext');
  assert.equal(pluginVersion, '0.1.0-alpha.1');
  assert.equal(adapter.started, 1);
  assert.equal(plugin.runtimeHost, adapter);
  assert.equal(ctx.logs.some(([level, ...args]) => level === 'debug' && args.some((value) => JSON.stringify(value).includes('TEST_DIAGNOSTIC'))), true);

  await plugin.onunload();
  assert.equal(adapter.stopped, 1);
  assert.equal(plugin.runtimeHost, null);
});

test('vNext plugin instance exposes a JSON-safe install response boundary', async () => {
  const ctx = context();
  let timer;
  const adapter = new FakeAdapter();
  adapter.start = async function start() {
    timer = setTimeout(() => {}, 60_000);
    this.timer = timer;
  };
  adapter.stop = async function stop() {
    clearTimeout(timer);
    this.timer = null;
  };
  const plugin = new NotificationHubVNextPlugin(ctx, { adapterFactory: () => adapter });

  await plugin.onload();
  const serialized = JSON.stringify({ id: pluginName, ctx, instance: plugin });

  assert.match(serialized, /"pluginName":"notification-hub-vnext"/);
  assert.match(serialized, /"pluginVersion":"0\.1\.0-alpha\.1"/);
  await plugin.onunload();
});

test('vNext plugin does not start Runtime when disabled', async () => {
  const ctx = context({ runtimeEnabled: false });
  let factoryCalls = 0;
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => {
      factoryCalls += 1;
      return new FakeAdapter();
    }
  });

  await plugin.onload();
  assert.equal(factoryCalls, 0);
  assert.equal(plugin.runtimeHost, null);
});

test('Runtime startup failure is logged and does not escape plugin onload', async () => {
  const ctx = context();
  let stopped = 0;
  const plugin = new NotificationHubVNextPlugin(ctx, {
    adapterFactory: () => ({
      on() {},
      async start() {
        throw Object.assign(new Error('missing bundled runtime'), { code: 'RUNTIME_START_FAILED' });
      },
      async stop() { stopped += 1; }
    })
  });

  await plugin.onload();
  assert.equal(plugin.runtimeHost, null);
  assert.equal(plugin.runtimeError.code, 'RUNTIME_START_FAILED');
  assert.equal(stopped, 1);
  assert.equal(ctx.logs.some(([level, message]) => level === 'error' && message.includes('RUNTIME_START_FAILED')), true);
});
