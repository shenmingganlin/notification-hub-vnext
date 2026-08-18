import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import path from 'node:path';

import { RuntimeProcessManager } from '../runtime/process-manager.js';
import { PipeClient } from '../runtime/pipe-client.js';
import { createAudioEngineClient, engineError } from './audio-engine-client.js';

function pipeNameFor(pluginDir, instanceId = crypto.randomUUID()) {
  const safe = crypto.createHash('sha256').update(`${pluginDir}:${instanceId}`).digest('hex').slice(0, 24);
  return `\\\\.\\pipe\\notification-hub-audio-${safe}`;
}

export function createAudioEngineHost({
  executablePath,
  pluginDir = path.dirname(executablePath ?? ''),
  instanceId,
  pipeName = pipeNameFor(pluginDir, instanceId),
  readyTimeoutMs = 3000,
  requestTimeoutMs = 2000,
  connectTimeoutMs = 2000,
  processManager = null,
  processManagerFactory = (options) => new RuntimeProcessManager(options),
  client = null,
  clientFactory = (options) => createAudioEngineClient(options),
  pipeClientFactory = (options) => new PipeClient(options),
  maxRestartAttempts = 2
} = {}) {
  if (typeof executablePath !== 'string' || !executablePath.trim()) {
    throw engineError('AUDIO_ENGINE_PATH_INVALID', 'Audio Engine executablePath must be a non-empty string');
  }
  const events = new EventEmitter();
  const audioClient = client ?? clientFactory({
    pipeName,
    requestTimeoutMs,
    connectTimeoutMs,
    pipeClientFactory
  });
  const manager = processManager ?? processManagerFactory({
    runtimePath: executablePath,
    pipeName,
    readyTimeoutMs,
    maxRestartAttempts,
    autoRestart: false,
    clientVersion: 'notification-hub-audio-host'
  });
  let state = 'stopped';
  let startPromise = null;
  let intentionalStop = false;
  let healthSnapshot = null;

  const setState = (next, reason) => {
    if (state === next) return;
    const previous = state;
    state = next;
    events.emit('state', { previous, state: next, reason, timestamp: new Date().toISOString() });
  };
  const onDiagnostic = (diagnostic) => events.emit('diagnostic', diagnostic);
  const onExit = (info) => {
    if (!intentionalStop) setState('failed', 'process-exit');
    events.emit('exit', info);
  };
  manager.on?.('diagnostic', onDiagnostic);
  manager.on?.('exit', onExit);
  audioClient.on?.('event', (message) => events.emit('event', message));
  audioClient.on?.('voice_finished', (message) => events.emit('voice_finished', message));
  audioClient.on?.('diagnostic', (diagnostic) => {
    if (!intentionalStop && ['TRANSPORT_DISCONNECTED', 'TRANSPORT_PIPE_READ_FAILED', 'TRANSPORT_PIPE_WRITE_FAILED'].includes(diagnostic?.code)) {
      setState('failed', diagnostic.code);
    }
    events.emit('diagnostic', diagnostic);
  });

  async function start() {
    if (state === 'ready' && audioClient.isConnected()) return healthSnapshot;
    if (startPromise) return startPromise;
    intentionalStop = false;
    startPromise = (async () => {
      setState('starting', 'start-requested');
      try {
        await manager.start();
        await audioClient.connect();
        healthSnapshot = await audioClient.health();
        if (healthSnapshot?.ready === false || healthSnapshot?.deviceAvailable === false) {
          throw engineError('AUDIO_ENGINE_NOT_READY', 'Audio Engine did not report a ready device', { health: healthSnapshot });
        }
        setState('ready', 'health-ok');
        return healthSnapshot;
      } catch (cause) {
        setState('failed', 'start-failed');
        await audioClient.close().catch(() => {});
        await manager.stop().catch(() => {});
        throw engineError(cause?.code ?? 'AUDIO_ENGINE_START_FAILED', cause?.message ?? String(cause), {
          executablePath,
          pipeName,
          cause: cause?.code ?? null,
          causeDetails: cause?.details ?? {}
        });
      }
    })().finally(() => { startPromise = null; });
    return startPromise;
  }

  async function health() {
    if (state !== 'ready') throw engineError('AUDIO_ENGINE_NOT_READY', 'Audio Engine is not ready');
    healthSnapshot = await audioClient.health();
    return healthSnapshot;
  }

  async function restart() {
    await dispose();
    return start();
  }

  async function dispose() {
    intentionalStop = true;
    setState('stopping', 'dispose-requested');
    await Promise.allSettled([
      audioClient.request('audio.stop_all', {}, { retryable: false }),
      audioClient.request('audio.shutdown', {}, { retryable: false })
    ]);
    await audioClient.close().catch(() => {});
    await manager.stop().catch(() => {});
    healthSnapshot = null;
    setState('stopped', 'disposed');
  }

  const api = {
    start,
    health,
    restart,
    dispose,
    on(event, handler) { events.on(event, handler); return api; },
    off(event, handler) { events.off(event, handler); return api; },
    getStatus: () => Object.freeze({ state, pipeName, executablePath, health: healthSnapshot }),
    get client() { return audioClient; },
    get processManager() { return manager; }
  };
  return Object.freeze(api);
}

export { pipeNameFor };
