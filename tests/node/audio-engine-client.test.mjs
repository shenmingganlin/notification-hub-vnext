import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { createAudioEngineClient } from '../../plugin/domain/audio-engine-client.js';

class FakeTransport extends EventEmitter {
  constructor() { super(); this.connected = false; this.requests = []; this.closed = false; }
  async connect() { this.connected = true; }
  async request(type, payload) {
    this.requests.push({ type, payload });
    if (type === 'audio.play') return { type: 'ack', payload: { result: { accepted: true, voiceId: 'voice-1' } } };
    return { type: 'ack', payload: { result: { ready: true, deviceAvailable: true } } };
  }
  async close() { this.closed = true; this.connected = false; }
}

test('audio engine client connects and unwraps async play acknowledgement', async () => {
  const transport = new FakeTransport();
  const client = createAudioEngineClient({ pipeName: '\\\\.\\pipe\\audio-test', pipeClient: transport });
  await client.connect();
  const result = await client.request('audio.play', { soundId: 'builtin.default', volume: 0.8 });
  assert.deepEqual(result, { accepted: true, voiceId: 'voice-1' });
  assert.equal(transport.requests[0].type, 'hello');
  assert.equal(client.isConnected(), true);
  await client.close();
  assert.equal(transport.closed, true);
});

test('audio engine client forwards voice finished events', async () => {
  const transport = new FakeTransport();
  const client = createAudioEngineClient({ pipeName: '\\\\.\\pipe\\audio-test', pipeClient: transport });
  const received = new Promise((resolve) => client.on('voice_finished', resolve));
  const message = { type: 'event', payload: { eventType: 'audio.voice_finished', result: { voiceId: 'voice-1' } } };
  transport.emit('event', message);
  assert.equal((await received).payload.result.voiceId, 'voice-1');
  await client.close();
});
