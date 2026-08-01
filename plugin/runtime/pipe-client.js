import net from 'node:net';

import {
  createRequest,
  parseMessage,
  serializeMessage
} from '../protocol/index.js';

const HEADER_BYTES = 4;
const MAX_FRAME_PAYLOAD_BYTES = 1024 * 1024;

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

export class PipeClient {
  constructor({
    pipeName,
    connectTimeoutMs = 2000,
    requestTimeoutMs = 2000
  } = {}) {
    if (typeof pipeName !== 'string' || pipeName.length === 0) {
      throw transportError('TRANSPORT_PIPE_NAME_INVALID', 'pipeName must be a non-empty string');
    }
    this.pipeName = pipeName;
    this.connectTimeoutMs = connectTimeoutMs;
    this.requestTimeoutMs = requestTimeoutMs;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pending = new Map();
    this.nextRequestNumber = 1;
    this.closed = false;
  }

  async connect() {
    if (this.socket && !this.closed) return;
    this.closed = false;
    this.buffer = Buffer.alloc(0);

    await new Promise((resolve, reject) => {
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
        this.installSocketHandlers(socket);
        settle(resolve);
      });
      socket.on('error', (error) => {
        clearTimeout(timer);
        settle(reject, transportError('TRANSPORT_PIPE_CONNECT_FAILED', error.message, { cause: error.code }));
        this.rejectPending(transportError('TRANSPORT_PIPE_CONNECT_FAILED', error.message, { cause: error.code }));
      });
      socket.on('close', () => {
        this.closed = true;
        this.rejectPending(transportError('TRANSPORT_DISCONNECTED', 'Named Pipe disconnected'));
      });
    });
  }

  async request(type, payload = {}, options = {}) {
    const sequence = this.nextRequestNumber++;
    const request = createRequest({
      type,
      payload,
      requestId: options.requestId ?? `req-node-${sequence}`,
      traceId: options.traceId ?? `trace-node-${sequence}`,
      timestamp: options.timestamp
    });
    await this.connect();
    const timeoutMs = options.timeoutMs ?? this.requestTimeoutMs;
    const serialized = serializeMessage(request);
    const frame = encodeFrame(serialized);

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.requestId);
        reject(transportError('TRANSPORT_ACK_TIMEOUT', `ACK timed out for ${request.requestId}`, {
          requestId: request.requestId,
          traceId: request.traceId,
          type
        }));
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
    if (!this.socket) return;
    const socket = this.socket;
    this.socket = null;
    this.closed = true;
    await new Promise((resolve) => {
      socket.end(resolve);
      socket.once('error', resolve);
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
      this.rejectPending(transportError('TRANSPORT_PIPE_READ_FAILED', error.message, { cause: error.code }));
    });
  }

  drainFrames() {
    while (this.buffer.length >= HEADER_BYTES) {
      const length = this.buffer.readUInt32LE(0);
      if (length === 0 || length > MAX_FRAME_PAYLOAD_BYTES) {
        this.rejectPending(transportError(
          length === 0 ? 'TRANSPORT_FRAME_EMPTY' : 'TRANSPORT_FRAME_TOO_LARGE',
          'Received invalid frame length'
        ));
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
      this.rejectPending(transportError('PROTOCOL_INVALID_MESSAGE', error.message, { cause: error.code }));
      return;
    }
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

  rejectPending(error) {
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(requestId);
    }
  }
}

export { encodeFrame, MAX_FRAME_PAYLOAD_BYTES };
