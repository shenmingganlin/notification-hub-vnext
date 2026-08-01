import { EventEmitter } from 'node:events';
import net from 'node:net';

import {
  createRequest,
  parseMessage,
  serializeMessage
} from '../protocol/index.js';

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
    reconnectDelayMs = 25
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
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pending = new Map();
    this.nextRequestNumber = 1;
    this.state = 'disconnected';
    this.connectPromise = null;
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
    this.connectPromise = new Promise((resolve, reject) => {
      const socket = net.createConnection(this.pipeName);
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
        this.socket = socket;
        this.hasConnected = true;
        this.buffer = Buffer.alloc(0);
        this.installSocketHandlers(socket);
        this.setState('connected', 'connected');
        settle(resolve);
      });
      socket.on('error', (error) => {
        clearTimeout(timer);
        const wrapped = transportError(
          settled ? 'TRANSPORT_PIPE_READ_FAILED' : 'TRANSPORT_PIPE_CONNECT_FAILED',
          error.message,
          { cause: error.code }
        );
        settle(reject, wrapped);
        this.emitDiagnostic(wrapped.code, wrapped.message, { cause: error.code });
        if (this.socket === socket) this.handleDisconnect(socket, wrapped);
      });
      socket.on('close', () => {
        clearTimeout(timer);
        if (!settled) settle(reject, transportError('TRANSPORT_DISCONNECTED', 'Named Pipe disconnected'));
        if (this.socket === socket || !this.socket) {
          this.handleDisconnect(socket, transportError('TRANSPORT_DISCONNECTED', 'Named Pipe disconnected'));
        }
      });
    }).finally(() => {
      this.connectPromise = null;
    });

    return this.connectPromise;
  }

  async request(type, payload = {}, options = {}) {
    const sequence = this.nextRequestNumber++;
    const request = createRequest({
      type,
      payload,
      requestId: options.requestId ?? `req-node-${sequence}`,
      traceId: options.traceId ?? `trace-node-${sequence}`,
      timestamp: options.timestamp,
      idempotencyKey: options.idempotencyKey
    });
    const retryable = options.retryable ?? RETRYABLE_TYPES.has(type);
    const maxAttempts = retryable
      ? Math.max(1, options.maxAttempts ?? this.maxReconnectAttempts)
      : 1;
    let attempt = 0;

    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        await this.connect();
        return await this.sendRequest(request, options.timeoutMs ?? this.requestTimeoutMs);
      } catch (error) {
        if (!retryable || attempt >= maxAttempts || !RETRYABLE_CODES.has(error.code)) throw error;
        this.emitDiagnostic('TRANSPORT_RECONNECT_RETRY', `Retrying ${type} after transport failure`, {
          attempt,
          maxAttempts,
          requestId: request.requestId,
          cause: error.code
        });
        await this.delay(this.reconnectDelayMs * attempt);
      }
    }

    throw transportError('TRANSPORT_RECONNECT_EXHAUSTED', `Reconnect attempts exhausted for ${request.requestId}`);
  }

  async sendRequest(request, timeoutMs) {
    const serialized = serializeMessage(request);
    const frame = encodeFrame(serialized);
    if (!this.socket || !this.connected) {
      throw transportError('TRANSPORT_DISCONNECTED', 'Named Pipe is not connected');
    }

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.requestId);
        const error = transportError('TRANSPORT_ACK_TIMEOUT', `ACK timed out for ${request.requestId}`, {
          requestId: request.requestId,
          traceId: request.traceId,
          type: request.type
        });
        this.emitDiagnostic(error.code, error.message, error.details);
        reject(error);
      }, timeoutMs);
      this.pending.set(request.requestId, { resolve, reject, timer });
      this.socket.write(frame, (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(request.requestId);
        reject(transportError('TRANSPORT_PIPE_WRITE_FAILED', error.message));
      });
    });
  }

  async close() {
    this.intentionalClose = true;
    this.setState('closed', 'client-close');
    this.rejectPending(transportError('TRANSPORT_CLIENT_CLOSED', 'Named Pipe client closed'));
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    await new Promise((resolve) => {
      const finish = () => resolve();
      socket.once('error', finish);
      socket.end(finish);
      setTimeout(() => {
        socket.destroy();
        resolve();
      }, 500).unref();
    });
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
    if (this.socket !== socket && this.socket !== null) return;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.rejectPending(error);
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
        this.rejectPending(error);
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
      this.rejectPending(wrapped);
      this.emitDiagnostic(wrapped.code, wrapped.message, wrapped.details);
      return;
    }
    this.emit('response', message);
    const pending = this.pending.get(message.requestId);
    if (!pending) return;
    this.pending.delete(message.requestId);
    clearTimeout(pending.timer);
    if (message.type === 'error') {
      pending.reject(transportError(message.payload.code, message.payload.message, message.payload.details));
      return;
    }
    pending.resolve(message);
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

  rejectPending(error) {
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(requestId);
    }
  }
}

export { encodeFrame, MAX_FRAME_PAYLOAD_BYTES, RETRYABLE_TYPES };
