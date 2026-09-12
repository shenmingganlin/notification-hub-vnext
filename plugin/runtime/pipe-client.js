import { EventEmitter } from 'node:events';
import net from 'node:net';

import {
  createRequest,
  parseMessage,
  serializeMessage
} from '../protocol/index.js';
import { RequestSessionDispatcher } from './request-session-dispatcher.js';

const HEADER_BYTES = 4;
const MAX_FRAME_PAYLOAD_BYTES = 1024 * 1024;
const RETRYABLE_TYPES = new Set(['hello', 'health', 'capabilities']);
const RETRYABLE_CODES = new Set([
  'TRANSPORT_CONNECT_TIMEOUT',
  'TRANSPORT_PIPE_CONNECT_FAILED',
  'TRANSPORT_PIPE_READ_FAILED',
  'TRANSPORT_PIPE_WRITE_FAILED',
  'TRANSPORT_DISCONNECTED',
  'TRANSPORT_ACK_TIMEOUT'
]);

function transportError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function encodeFrame(payload) {
  const bytes = Buffer.from(payload, 'utf8');
  if (bytes.length === 0) {
    throw transportError('TRANSPORT_FRAME_EMPTY', 'Frame payload must not be empty');
  }
  if (bytes.length > MAX_FRAME_PAYLOAD_BYTES) {
    throw transportError('TRANSPORT_FRAME_TOO_LARGE', 'Frame payload exceeds the configured limit');
  }
  const frame = Buffer.allocUnsafe(HEADER_BYTES + bytes.length);
  frame.writeUInt32LE(bytes.length, 0);
  bytes.copy(frame, HEADER_BYTES);
  return frame;
}

export class PipeClient extends EventEmitter {
  constructor({
    pipeName,
    connectTimeoutMs = 2000,
    requestTimeoutMs = 2000,
    maxReconnectAttempts = 2,
    reconnectDelayMs = 25,
    socketFactory = (name) => net.createConnection(name)
  } = {}) {
    super();
    if (typeof pipeName !== 'string' || pipeName.length === 0) {
      throw transportError('TRANSPORT_PIPE_NAME_INVALID', 'pipeName must be a non-empty string');
    }
    this.pipeName = pipeName;
    this.connectTimeoutMs = connectTimeoutMs;
    this.requestTimeoutMs = requestTimeoutMs;
    this.maxReconnectAttempts = maxReconnectAttempts;
    this.reconnectDelayMs = reconnectDelayMs;
    this.socketFactory = socketFactory;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.session = new RequestSessionDispatcher({
      onTimeout: (error, requestId, pending) => {
        if (pending?.session && this.socket === pending.session) {
          this.handleDisconnect(pending.session, error);
          pending.session.destroy();
          return;
        }
        this.session.reject(requestId, error);
        this.emitDiagnostic(error.code, error.message, error.details);
      }
    });
    this.requestQueue = [];
    this.requestDrainPromise = null;
    this.nextRequestNumber = 1;
    this.state = 'disconnected';
    this.connectPromise = null;
    this.connectingSocket = null;
    this.connectGeneration = 0;
    this.intentionalClose = false;
    this.hasConnected = false;
  }

  get connected() {
    return this.state === 'connected' && this.socket !== null;
  }

  async connect() {
    if (this.state === 'closed') {
      throw transportError('TRANSPORT_CLIENT_CLOSED', 'Named Pipe client is closed');
    }
    if (this.connected) return;
    if (this.connectPromise) return this.connectPromise;

    this.intentionalClose = false;
    this.setState(this.hasConnected ? 'reconnecting' : 'connecting', 'connect-requested');
    const generation = this.connectGeneration;
    this.connectPromise = new Promise((resolve, reject) => {
      const socket = this.socketFactory(this.pipeName);
      this.connectingSocket = socket;
      let settled = false;
      const settle = (action, value) => {
        if (settled) return;
        settled = true;
        action(value);
      };
      const timer = setTimeout(() => {
        socket.destroy();
        settle(reject, transportError('TRANSPORT_CONNECT_TIMEOUT', 'Named Pipe connection timed out'));
      }, this.connectTimeoutMs);

      socket.on('connect', () => {
        clearTimeout(timer);
        if (generation !== this.connectGeneration || this.state === 'closed') {
          socket.destroy();
          settle(reject, transportError('TRANSPORT_CLIENT_CLOSED', 'Named Pipe client closed'));
          return;
        }
        if (this.connectingSocket === socket) this.connectingSocket = null;
        this.socket = socket;
        this.hasConnected = true;
        this.buffer = Buffer.alloc(0);
        this.installSocketHandlers(socket);
        this.setState('connected', 'connected');
        settle(resolve);
      });
      socket.on('error', (error) => {
        clearTimeout(timer);
        if (this.connectingSocket === socket) this.connectingSocket = null;
        const wrapped = transportError(
          generation !== this.connectGeneration || this.state === 'closed'
            ? 'TRANSPORT_CLIENT_CLOSED'
            : settled ? 'TRANSPORT_PIPE_READ_FAILED' : 'TRANSPORT_PIPE_CONNECT_FAILED',
          generation !== this.connectGeneration || this.state === 'closed'
            ? 'Named Pipe client closed'
            : error.message,
          { cause: error.code }
        );
        settle(reject, wrapped);
        if (wrapped.code !== 'TRANSPORT_CLIENT_CLOSED') {
          this.emitDiagnostic(wrapped.code, wrapped.message, { cause: error.code });
        }
        if (this.socket === socket) this.handleDisconnect(socket, wrapped);
      });
      socket.on('close', () => {
        clearTimeout(timer);
        if (this.connectingSocket === socket) this.connectingSocket = null;
        if (!settled) {
          settle(reject, generation !== this.connectGeneration || this.state === 'closed'
            ? transportError('TRANSPORT_CLIENT_CLOSED', 'Named Pipe client closed')
            : transportError('TRANSPORT_DISCONNECTED', 'Named Pipe disconnected'));
        }
        if (this.socket === socket || (!this.socket && generation === this.connectGeneration)) {
          this.handleDisconnect(socket, transportError('TRANSPORT_DISCONNECTED', 'Named Pipe disconnected'));
        }
      });
    }).finally(() => {
      this.connectPromise = null;
      if (this.connectingSocket === undefined) this.connectingSocket = null;
    });

    return this.connectPromise;
  }

  request(type, payload = {}, options = {}) {
    const sequence = this.nextRequestNumber++;
    const request = createRequest({
      type,
      payload,
      requestId: options.requestId ?? `req-node-${sequence}`,
      traceId: options.traceId ?? `trace-node-${sequence}`,
      timestamp: options.timestamp,
      idempotencyKey: options.idempotencyKey
    });
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ type, request, options, resolve, reject });
      void this.drainRequestQueue();
    });
  }

  async drainRequestQueue() {
    if (this.requestDrainPromise) return this.requestDrainPromise;
    this.requestDrainPromise = (async () => {
      while (this.requestQueue.length > 0) {
        const entry = this.requestQueue.shift();
        if (!entry) continue;
        try {
          const retryable = entry.options.retryable ?? RETRYABLE_TYPES.has(entry.type);
          const maxAttempts = retryable
            ? Math.max(1, entry.options.maxAttempts ?? this.maxReconnectAttempts)
            : 1;
          let attempt = 0;
          while (attempt < maxAttempts) {
            attempt += 1;
            try {
              await this.connect();
              entry.resolve(await this.sendRequest(entry.request, entry.options.timeoutMs ?? this.requestTimeoutMs));
              break;
            } catch (error) {
              if (!retryable || attempt >= maxAttempts || !RETRYABLE_CODES.has(error.code)) {
                entry.reject(error);
                break;
              }
              this.emitDiagnostic('TRANSPORT_RECONNECT_RETRY', `Retrying ${entry.type} after transport failure`, {
                attempt,
                maxAttempts,
                requestId: entry.request.requestId,
                cause: error.code
              });
              await this.delay(this.reconnectDelayMs * attempt);
            }
          }
        } catch (error) {
          entry.reject(error);
        }
      }
    })().finally(() => {
      this.requestDrainPromise = null;
      if (this.requestQueue.length > 0 && this.state !== 'closed') void this.drainRequestQueue();
    });
    return this.requestDrainPromise;
  }

  async sendRequest(request, timeoutMs) {
    const serialized = serializeMessage(request);
    const frame = encodeFrame(serialized);
    if (!this.socket || !this.connected) {
      throw transportError('TRANSPORT_DISCONNECTED', 'Named Pipe is not connected');
    }

    return await new Promise((resolve, reject) => {
      const socket = this.socket;
      this.session.track({
        requestId: request.requestId,
        traceId: request.traceId,
        requestType: request.type,
        session: socket,
        resolve,
        reject,
        timeoutMs
      });
      socket.write(frame, (error) => {
        if (!error) return;
        this.session.reject(
          request.requestId,
          transportError('TRANSPORT_PIPE_WRITE_FAILED', error.message)
        );
      });
    });
  }

  async close() {
    this.connectGeneration += 1;
    this.intentionalClose = true;
    this.setState('closed', 'client-close');
    const closedError = transportError('TRANSPORT_CLIENT_CLOSED', 'Named Pipe client closed');
    this.session.rejectAll(closedError);
    while (this.requestQueue.length > 0) this.requestQueue.shift()?.reject(closedError);
    const socket = this.socket ?? this.connectingSocket;
    const pendingConnect = this.connectPromise;
    this.socket = null;
    this.connectingSocket = null;
    if (socket) {
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        socket.once('error', finish);
        socket.once('close', finish);
        socket.end(finish);
        setTimeout(() => {
          socket.destroy();
          finish();
        }, 500).unref();
      });
    }
    if (pendingConnect) await Promise.allSettled([pendingConnect]);
  }

  installSocketHandlers(socket) {
    socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drainFrames();
    });
    socket.on('error', (error) => {
      const wrapped = transportError('TRANSPORT_PIPE_READ_FAILED', error.message, { cause: error.code });
      this.emitDiagnostic(wrapped.code, wrapped.message, wrapped.details);
      this.handleDisconnect(socket, wrapped);
    });
    socket.on('close', () => {
      this.handleDisconnect(socket, transportError('TRANSPORT_DISCONNECTED', 'Named Pipe disconnected'));
    });
  }

  handleDisconnect(socket, error) {
    if (this.socket !== socket) return;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.session.rejectAll(error);
    if (!this.intentionalClose && this.state !== 'closed') {
      this.setState('disconnected', error.code);
      this.emitDiagnostic(error.code, error.message, error.details);
    }
  }

  drainFrames() {
    while (this.buffer.length >= HEADER_BYTES) {
      const length = this.buffer.readUInt32LE(0);
      if (length === 0 || length > MAX_FRAME_PAYLOAD_BYTES) {
        const error = transportError(
          length === 0 ? 'TRANSPORT_FRAME_EMPTY' : 'TRANSPORT_FRAME_TOO_LARGE',
          'Received invalid frame length'
        );
        this.session.rejectAll(error);
        this.emitDiagnostic(error.code, error.message);
        this.socket?.destroy();
        return;
      }
      const frameBytes = HEADER_BYTES + length;
      if (this.buffer.length < frameBytes) return;
      const payload = this.buffer.subarray(HEADER_BYTES, frameBytes).toString('utf8');
      this.buffer = this.buffer.subarray(frameBytes);
      this.handleMessage(payload);
    }
  }

  handleMessage(payload) {
    let message;
    try {
      message = parseMessage(payload);
    } catch (error) {
      const wrapped = transportError('PROTOCOL_INVALID_MESSAGE', error.message, { cause: error.code });
      this.session.rejectAll(wrapped);
      this.emitDiagnostic(wrapped.code, wrapped.message, wrapped.details);
      return;
    }
    if (message.type === 'event') {
      this.emitDiagnostic(
        'RUNTIME_EVENT_RECEIVED',
        'Received unsolicited Runtime event',
        {
          eventType: message.payload?.eventType,
          requestId: message.requestId,
          traceId: message.traceId
        }
      );
      this.emit('event', message);
      return;
    }
    const result = this.session.settleResponse(message);
    if (!result.matched) return;
    if (!result.accepted) {
      this.emitDiagnostic(result.error.code, result.error.message, result.error.details);
      return;
    }
    this.emit('response', message);
  }

  setState(nextState, reason) {
    if (this.state === nextState) return;
    const previous = this.state;
    this.state = nextState;
    this.emit('state', { previous, state: nextState, reason, timestamp: new Date().toISOString() });
  }

  emitDiagnostic(code, message, details = {}) {
    this.emit('diagnostic', { code, message, details, timestamp: new Date().toISOString() });
  }

  delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

}

export { encodeFrame, MAX_FRAME_PAYLOAD_BYTES, RETRYABLE_TYPES };
