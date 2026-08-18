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

test('audio engine backend rejects playback while host is not ready', async () => {
  const backend = createAudioEngineBackend({ client: fixtureClient(), host: { getStatus: () => ({ state: 'starting' }) } });
  await assert.rejects(() => backend.playFile({ path: 'a.wav', soundId: 'a', volume: 1 }), { code: 'AUDIO_ENGINE_NOT_READY' });
});
