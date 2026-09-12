import test from 'node:test';
import assert from 'node:assert/strict';

import { createAudioEngineBackend } from '../../plugin/domain/audio-engine-backend.js';

function fixtureClient() {
  let sequence = 0;
  const requests = [];
  return {
    requests,
    async request(type, payload) {
      requests.push({ type, payload });
      if (type === 'audio.load') return { loaded: true };
      if (type === 'audio.play') return { accepted: true, voiceId: `voice-${++sequence}` };
      return {};
    }
  };
}

test('audio engine backend loads a file once and returns accepted voice immediately', async () => {
  const client = fixtureClient();
  const backend = createAudioEngineBackend({ client, host: { getStatus: () => ({ state: 'ready' }) } });
  const first = await backend.playFile({ path: 'C:\\sounds\\alert.wav', soundId: 'custom.alert', volume: 0.8 });
  const second = await backend.playFile({ path: 'C:\\sounds\\alert.wav', soundId: 'custom.alert', volume: 0.8 });
  assert.equal(first.played, true);
  assert.equal(second.played, true);
  assert.notEqual(first.voiceId, second.voiceId);
  assert.equal(client.requests.filter((entry) => entry.type === 'audio.load').length, 1);
  assert.equal(client.requests.filter((entry) => entry.type === 'audio.play').length, 2);
});

test('audio engine backend coalesces concurrent loads for the same sound asset', async () => {
  let releaseLoad;
  const loadGate = new Promise((resolve) => { releaseLoad = resolve; });
  let sequence = 0;
  const requests = [];
  const client = {
    requests,
    async request(type, payload) {
      requests.push({ type, payload });
      if (type === 'audio.load') {
        await loadGate;
        return { loaded: true };
      }
      return { accepted: true, voiceId: `voice-${++sequence}` };
    }
  };
  const backend = createAudioEngineBackend({ client, host: { getStatus: () => ({ state: 'ready' }) } });
  const first = backend.playFile({ path: 'C:\\sounds\\alert.wav', soundId: 'custom.alert', volume: 0.8 });
  const second = backend.playFile({ path: 'C:\\sounds\\alert.wav', soundId: 'custom.alert', volume: 0.8 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.filter((entry) => entry.type === 'audio.load').length, 1);
  releaseLoad();
  const results = await Promise.all([first, second]);
  assert.equal(results.every((result) => result.played), true);
  assert.equal(requests.filter((entry) => entry.type === 'audio.play').length, 2);
});

test('audio engine backend serializes replacement loads for one sound id', async () => {
  let releaseFirst;
  let loadCount = 0;
  const firstLoad = new Promise((resolve) => { releaseFirst = resolve; });
  const requests = [];
  const client = {
    requests,
    async request(type, payload) {
      requests.push({ type, payload });
      if (type === 'audio.load') {
        loadCount += 1;
        if (loadCount === 1) await firstLoad;
        return { loaded: true, durationMs: loadCount * 100 };
      }
      return { accepted: true, voiceId: `voice-${requests.length}` };
    }
  };
  const backend = createAudioEngineBackend({ client, host: { getStatus: () => ({ state: 'ready' }) } });
  const first = backend.playFile({ path: 'C:\\sounds\\a.wav', soundId: 'custom.same', volume: 1 });
  const replacement = backend.playFile({ path: 'C:\\sounds\\b.wav', soundId: 'custom.same', volume: 1 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.filter((entry) => entry.type === 'audio.load').length, 1);
  releaseFirst();
  await Promise.all([first, replacement]);
  assert.deepEqual(requests.filter((entry) => entry.type === 'audio.load').map((entry) => entry.payload.path), [
    'C:/sounds/a.wav',
    'C:/sounds/b.wav'
  ]);
});

test('audio engine backend preserves parallel requests without merging', async () => {
  const client = fixtureClient();
  const backend = createAudioEngineBackend({ client, host: { getStatus: () => ({ state: 'ready' }) } });
  const results = await Promise.all([
    backend.playFile({ path: 'a.wav', soundId: 'a', volume: 1 }),
    backend.playFile({ path: 'b.wav', soundId: 'b', volume: 1 }),
    backend.playFile({ path: 'c.wav', soundId: 'c', volume: 1 })
  ]);
  assert.equal(new Set(results.map((result) => result.voiceId)).size, 3);
  assert.equal(client.requests.filter((entry) => entry.type === 'audio.play').length, 3);
});

test('audio engine backend resolves built-in cues to cached Windows media assets', async () => {
  const client = fixtureClient();
  const backend = createAudioEngineBackend({
    client,
    host: { getStatus: () => ({ state: 'ready' }) },
    builtinPathResolver: (cue) => `C:/Windows/Media/${cue}.wav`
  });
  const result = await backend.playCue({ cue: 'default', volume: 1 });
  assert.equal(result.played, true);
  assert.equal(client.requests[0].type, 'audio.load');
  assert.equal(client.requests[0].payload.soundId, 'builtin.default');
  assert.equal(client.requests[1].type, 'audio.play');
});

test('audio engine backend retries a resource after audio.load reports loaded false', async () => {
  let loadCount = 0;
  const client = {
    requests: [],
    async request(type, payload) {
      this.requests.push({ type, payload });
      if (type === 'audio.load') {
        loadCount += 1;
        return { loaded: false };
      }
      return { accepted: true, voiceId: `voice-${this.requests.length}` };
    }
  };
  const backend = createAudioEngineBackend({ client, host: { getStatus: () => ({ state: 'ready' }) } });

  const first = await backend.load('custom.retry', 'C:\\sounds\\retry.wav');
  const second = await backend.load('custom.retry', 'C:\\sounds\\retry.wav');
  await backend.playFile({ path: 'C:\\sounds\\retry.wav', soundId: 'custom.retry', volume: 1 });

  assert.deepEqual(first, { loaded: false, cached: false });
  assert.deepEqual(second, { loaded: false, cached: false });
  assert.equal(loadCount, 3);
});

test('audio engine backend keeps a successful resource cache when a replacement load fails', async () => {
  const loadResults = [{ loaded: true }, { loaded: false }, { loaded: false }];
  const requests = [];
  const client = {
    async request(type, payload) {
      requests.push({ type, payload });
      if (type === 'audio.load') return loadResults.shift();
      return { accepted: true, voiceId: `voice-${requests.length}` };
    }
  };
  const backend = createAudioEngineBackend({ client, host: { getStatus: () => ({ state: 'ready' }) } });

  const first = await backend.load('custom.replace', 'C:\\sounds\\a.wav', 'asset-a');
  const failedReplacement = await backend.load('custom.replace', 'C:\\sounds\\b.wav', 'asset-b');
  const retriedReplacement = await backend.load('custom.replace', 'C:\\sounds\\b.wav', 'asset-b');
  const original = await backend.load('custom.replace', 'C:\\sounds\\a.wav', 'asset-a');

  assert.deepEqual(first, { loaded: true, cached: false });
  assert.deepEqual(failedReplacement, { loaded: false, cached: false });
  assert.deepEqual(retriedReplacement, { loaded: false, cached: false });
  assert.deepEqual(original, { loaded: true, cached: true });
  assert.deepEqual(requests.filter((entry) => entry.type === 'audio.load').map((entry) => entry.payload.path), [
    'C:/sounds/a.wav',
    'C:/sounds/b.wav',
    'C:/sounds/b.wav'
  ]);
});

test('audio engine backend reports a false warmup when a preload is not loaded', async () => {
  const client = {
    async request(type) {
      if (type === 'audio.load') return { loaded: false };
      return {};
    }
  };
  const backend = createAudioEngineBackend({
    client,
    host: { getStatus: () => ({ state: 'ready' }) },
    preload: [{ soundId: 'builtin.error', path: 'C:\\Windows\\Media\\Windows Exclamation.wav', fingerprint: 'error-v1' }]
  });
  assert.equal(await backend.warmup(), false);
});

test('audio engine backend rejects playback while host is not ready', async () => {
  const backend = createAudioEngineBackend({ client: fixtureClient(), host: { getStatus: () => ({ state: 'starting' }) } });
  await assert.rejects(() => backend.playFile({ path: 'a.wav', soundId: 'a', volume: 1 }), { code: 'AUDIO_ENGINE_NOT_READY' });
});
