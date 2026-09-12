import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { PipeClient } from '../../plugin/runtime/pipe-client.js';

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.ended = false;
  }

  write(frame, callback) {
    callback?.();
    this.lastFrame = frame;
  }

  end(callback) {
    this.ended = true;
    callback?.();
    queueMicrotask(() => this.emit('close'));
  }

  destroy() {
    this.destroyed = true;
    queueMicrotask(() => this.emit('close'));
  }
}

test('PipeClient invalidates a connected socket after ACK timeout so retry can reconnect', async () => {
  const sockets = [];
  const client = new PipeClient({
    pipeName: '\\\\.\\pipe\\pipe-client-timeout-reconnect',
    requestTimeoutMs: 10,
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    }
  });

  const request = client.request('health', {}, { retryable: false });
  sockets[0].emit('connect');
  await assert.rejects(request, (error) => error.code === 'TRANSPORT_ACK_TIMEOUT');
  assert.equal(client.state, 'disconnected');
  assert.equal(client.socket, null);
  assert.equal(sockets[0].destroyed, true);

  const reconnect = client.connect();
  sockets[1].emit('connect');
  await reconnect;
  assert.equal(client.state, 'connected');
  assert.equal(client.socket, sockets[1]);
  await client.close();
});

test('PipeClient serializes health and scene requests so one timeout cannot reject another request', async () => {
  const sockets = [];
  const client = new PipeClient({
    pipeName: '\\\\.\\pipe\\pipe-client-request-isolation',
    requestTimeoutMs: 15,
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    }
  });

  const health = client.request('health', {}, { retryable: false });
  const dismiss = client.request('scene.dismiss', { id: 'card-1' }, { retryable: false, timeoutMs: 100 });
  sockets[0].emit('connect');
  await assert.rejects(health, (error) => error.code === 'TRANSPORT_ACK_TIMEOUT');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sockets.length, 2);
  sockets[1].emit('connect');
  await assert.rejects(dismiss, (error) => error.code === 'TRANSPORT_ACK_TIMEOUT');
  assert.equal(sockets[0].destroyed, true);
  assert.equal(sockets[1].destroyed, true);
});

test('PipeClient rejects a response with a mismatched traceId or requestType', async () => {
  const sockets = [];
  const diagnostics = [];
  const client = new PipeClient({
    pipeName: '\\\\.\\pipe\\pipe-client-response-correlation',
    requestTimeoutMs: 100,
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    }
  });
  client.on('diagnostic', (diagnostic) => diagnostics.push(diagnostic));

  const request = client.request('health', {}, { retryable: false });
  sockets[0].emit('connect');
  await new Promise((resolve) => setImmediate(resolve));
  const response = JSON.stringify({
    protocolVersion: 1,
    requestId: 'req-node-1',
    traceId: 'wrong-trace',
    type: 'ack',
    timestamp: '2026-08-01T00:00:00.000Z',
    payload: { requestType: 'scene.create', accepted: true, result: {} }
  });
  const bytes = Buffer.from(response, 'utf8');
  sockets[0].emit('data', Buffer.concat([Buffer.from([bytes.length, 0, 0, 0]), bytes]));

  await assert.rejects(request, (error) => error.code === 'PROTOCOL_RESPONSE_MISMATCH');
  assert.equal(diagnostics.at(-1)?.code, 'PROTOCOL_RESPONSE_MISMATCH');
  await client.close();
});

test('PipeClient close invalidates an in-flight connection attempt', async () => {
  const socket = new FakeSocket();
  const client = new PipeClient({
    pipeName: '\\\\.\\pipe\\pipe-client-close-race',
    socketFactory: () => socket
  });

  const connectPromise = client.connect();
  await client.close();
  await assert.rejects(connectPromise, (error) => error.code === 'TRANSPORT_CLIENT_CLOSED');

  socket.emit('connect');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(client.state, 'closed');
  assert.equal(client.socket, null);
  assert.equal(socket.destroyed, true);
});
