import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { createAudioEngineHost, pipeNameFor } from '../../plugin/domain/audio-engine-host.js';

class FakeClient extends EventEmitter {
  constructor({ health = { ready: true, deviceAvailable: true } } = {}) {
    super();
    this.healthResult = health;
    this.connected = false;
    this.requests = [];
  }
  async connect() { this.connected = true; return { hello: true }; }
  async health() { return this.healthResult; }
  async request(type) {
    this.requests.push(type);
    if (type === 'audio.health') return this.healthResult;
    return { accepted: true };
  }
  isConnected() { return this.connected; }
  async close() { this.connected = false; }
}

class FakeManager extends EventEmitter {
  constructor({ fail = false } = {}) { super(); this.fail = fail; this.started = 0; this.stopped = 0; }
  async start() { this.started += 1; if (this.fail) throw Object.assign(new Error('spawn failed'), { code: 'RUNTIME_START_FAILED' }); }
  async stop() { this.stopped += 1; }
}

test('audio engine host creates an isolated pipe and reaches ready', async () => {
  const client = new FakeClient();
  const manager = new FakeManager();
  const host = createAudioEngineHost({ executablePath: 'C:/audio.exe', pluginDir: 'C:/plugin', instanceId: 'one', client, processManager: manager });
  const health = await host.start();
  assert.equal(health.ready, true);
  assert.match(host.getStatus().pipeName, /^\\\\\.\\pipe\\notification-hub-audio-/);
  assert.equal(manager.started, 1);
  await host.dispose();
  assert.equal(host.getStatus().state, 'stopped');
  assert.equal(manager.stopped, 1);
});

test('audio engine host preserves startup cause and does not remain ready', async () => {
  const client = new FakeClient();
  const manager = new FakeManager({ fail: true });
  const host = createAudioEngineHost({ executablePath: 'C:/missing.exe', client, processManager: manager });
  await assert.rejects(host.start(), (error) => error.code === 'RUNTIME_START_FAILED' && error.details.executablePath === 'C:/missing.exe');
  assert.equal(host.getStatus().state, 'failed');
});

test('audio engine host rejects a non-ready device', async () => {
  const client = new FakeClient({ health: { ready: false, deviceAvailable: false } });
  const manager = new FakeManager();
  const host = createAudioEngineHost({ executablePath: 'C:/audio.exe', client, processManager: manager });
  await assert.rejects(host.start(), (error) => error.code === 'AUDIO_ENGINE_NOT_READY');
  assert.equal(host.getStatus().state, 'failed');
});

test('pipeNameFor is deterministic per plugin instance but isolated across instances', () => {
  assert.equal(pipeNameFor('C:/plugin', 'one'), pipeNameFor('C:/plugin', 'one'));
  assert.notEqual(pipeNameFor('C:/plugin', 'one'), pipeNameFor('C:/plugin', 'two'));
});
