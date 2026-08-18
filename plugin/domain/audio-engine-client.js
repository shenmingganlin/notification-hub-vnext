import { EventEmitter } from 'node:events';

import { PipeClient } from '../runtime/pipe-client.js';

function engineError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function resultOf(response) {
  if (!response || response.type !== 'ack') {
    throw engineError('AUDIO_ENGINE_RESPONSE_INVALID', 'Audio Engine returned an invalid response');
  }
  return response.payload?.result ?? {};
}

export function createAudioEngineClient({
  pipeName,
  requestTimeoutMs = 2000,
  connectTimeoutMs = 2000,
  pipeClient = null,
  pipeClientFactory = (options) => new PipeClient(options),
  clientVersion = 'notification-hub-audio-host'
} = {}) {
  if (typeof pipeName !== 'string' || !pipeName.trim()) {
    throw engineError('AUDIO_ENGINE_PIPE_NAME_INVALID', 'Audio Engine pipeName must be a non-empty string');
  }
  const transport = pipeClient ?? pipeClientFactory({
    pipeName,
    requestTimeoutMs,
    connectTimeoutMs
  });
  if (!transport || typeof transport.request !== 'function' || typeof transport.connect !== 'function') {
    throw engineError('AUDIO_ENGINE_CLIENT_INVALID', 'Audio Engine transport must provide connect and request');
  }
  const events = new EventEmitter();
  const onTransportEvent = (message) => {
    if (message?.payload?.eventType === 'audio.voice_finished') events.emit('voice_finished', message);
    events.emit('event', message);
  };
  transport.on?.('event', onTransportEvent);

  return Object.freeze({
    async connect() {
      await transport.connect();
      return resultOf(await transport.request('hello', { clientVersion }, { retryable: true }));
    },
    async health() {
      return resultOf(await transport.request('audio.health', {}, { retryable: true }));
    },
    async request(type, payload = {}, options = {}) {
      if (typeof type !== 'string' || !type.trim()) {
        throw engineError('AUDIO_ENGINE_REQUEST_INVALID', 'Audio Engine request type is required');
      }
      return resultOf(await transport.request(type, payload, { retryable: false, ...options }));
    },
    on(event, handler) {
      events.on(event, handler);
      return this;
    },
    off(event, handler) {
      events.off(event, handler);
      return this;
    },
    isConnected() {
      return transport.connected === true;
    },
    async close() {
      transport.off?.('event', onTransportEvent);
      events.removeAllListeners();
      await transport.close?.();
    },
    get transport() {
      return transport;
    }
  });
}

export { engineError, resultOf };
