import { spawn } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import { PipeClient } from '../runtime/pipe-client.js';

function audioClientError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function pipeNameFor(processId = process.pid, randomBytes = crypto.randomBytes) {
  return `\\\\.\\pipe\\notification-hub-audio-${processId}-${randomBytes(6).toString('hex')}`;
}

function parseAck(response) {
  if (!response || response.type === 'error') {
    throw audioClientError(response?.payload?.code ?? 'AUDIO_SERVICE_REQUEST_FAILED', response?.payload?.message ?? 'Audio service request failed', response?.payload ?? {});
  }
  return response.payload ?? {};
}

export class NativeAudioClient {
  constructor({
    context = {},
    executablePath,
    pipeName = pipeNameFor(),
    spawnImpl = spawn,
    clientFactory = (options) => new PipeClient(options),
    readyTimeoutMs = 3000,
    requestTimeoutMs = 15000
  } = {}) {
    if (typeof executablePath !== 'string' || !executablePath.trim()) throw audioClientError('AUDIO_SERVICE_PATH_INVALID', 'Audio service executablePath is required');
    this.context = context;
    this.executablePath = path.normalize(executablePath);
    this.pipeName = pipeName;
    this.spawnImpl = spawnImpl;
    this.clientFactory = clientFactory;
    this.readyTimeoutMs = readyTimeoutMs;
    this.requestTimeoutMs = requestTimeoutMs;
    this.child = null;
    this.client = null;
    this.startPromise = null;
    this.loaded = new Set();
  }

  async start() {
    if (this.client?.connected && this.child && this.child.exitCode === null) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = (async () => {
      let child;
      try {
        child = this.spawnImpl(this.executablePath, ['--pipe-server', this.pipeName], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (cause) {
        throw audioClientError('AUDIO_SERVICE_START_FAILED', cause.message);
      }
      this.child = child;
      let childError = null;
      child.once?.('error', (error) => { childError = error; });
      const client = this.clientFactory({ pipeName: this.pipeName, requestTimeoutMs: this.requestTimeoutMs });
      this.client = client;
      const timer = setTimeout(() => child.kill?.(), this.readyTimeoutMs);
      try {
        let lastError;
        for (let attempt = 0; attempt < 20; attempt += 1) {
          try {
            await client.connect();
            lastError = null;
            break;
          } catch (cause) {
            lastError = cause;
            if (cause?.code !== 'TRANSPORT_PIPE_CONNECT_FAILED' && !String(cause?.message || '').includes('ENOENT')) throw cause;
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
        }
        if (lastError) throw lastError;
        if (childError) throw childError;
        clearTimeout(timer);
        parseAck(await client.request('audio.health', {}, { retryable: false }));
      } catch (cause) {
        clearTimeout(timer);
        await client.close().catch(() => {});
        child.kill?.();
        this.client = null;
        this.child = null;
        // Do not hide a precise service/device/protocol error behind the
        // generic startup code. The UI needs the real boundary that failed.
        if (cause?.code && cause.code !== 'TRANSPORT_PIPE_CONNECT_FAILED' && cause.code !== 'TRANSPORT_DISCONNECTED') {
          throw audioClientError(cause.code, cause.message ?? String(cause), cause.details ?? {});
        }
        throw audioClientError('AUDIO_SERVICE_START_FAILED', cause?.message ?? String(cause), {
          cause: cause?.code ?? null,
          causeDetails: cause?.details ?? {}
        });
      }
    })().finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  async cue({ cue, volume = 1 }) {
    if (!cue) throw audioClientError('AUDIO_CUE_INPUT_INVALID', 'cue is required');
    await this.start();
    return parseAck(await this.client.request('audio.cue', { cue, volume }, { retryable: false }));
  }

  async load({ soundId, filePath }) {
    if (!soundId || !filePath) throw audioClientError('AUDIO_LOAD_INPUT_INVALID', 'soundId and filePath are required');
    await this.start();
    // The first native service parser accepts JSON string fields without a full
    // unescape pass; forward slashes are valid Windows paths and avoid doubled
    // backslash ambiguity across the pipe boundary.
    const wirePath = filePath.replaceAll('\\\\', '/');
    parseAck(await this.client.request('audio.load', { soundId, path: wirePath }, { retryable: false }));
    this.loaded.add(soundId);
    return { loaded: true };
  }

  async play({ soundId, volume = 1 }) {
    if (!soundId) throw audioClientError('AUDIO_PLAY_INPUT_INVALID', 'soundId is required');
    await this.start();
    if (!this.loaded.has(soundId)) throw audioClientError('AUDIO_NOT_LOADED', `Audio asset is not loaded: ${soundId}`);
    return parseAck(await this.client.request('audio.play', { soundId, volume }, { retryable: false }));
  }

  async unload(soundId) {
    if (!soundId || !this.client) return { unloaded: false };
    parseAck(await this.client.request('audio.unload', { soundId }, { retryable: false }));
    this.loaded.delete(soundId);
    return { unloaded: true };
  }

  async dispose() {
    const client = this.client;
    const child = this.child;
    this.client = null;
    this.child = null;
    this.loaded.clear();
    await client?.close?.().catch(() => {});
    child?.kill?.();
  }
}

export { pipeNameFor };
