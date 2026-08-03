import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMMAND_TYPES,
  EVENT_TYPES,
  PROTOCOL_ERROR_CODES,
  createAck,
  createEvent,
  createErrorResponse,
  createHello,
  createHealthRequest,
  createCapabilitiesRequest,
  createRequest,
  PipeClient,
  parseMessage,
  serializeMessage,
  validateMessage,
  createDiagnosticEvent,
  deduplicateDiagnostics,
  diagnosticFingerprint,
  serializeDiagnosticEvent,
  ERROR_CODES,
  ERROR_CODE_SET
} from '../../plugin/index.js';

const fixedTime = '2026-08-01T00:00:00.000Z';

function expectProtocolError(action, code) {
  assert.throws(action, (error) => error.code === code);
}

test('protocol exports the planned command set', () => {
  assert.deepEqual(COMMAND_TYPES, [
    'hello',
    'health',
    'capabilities',
    'scene.create',
    'scene.update',
    'scene.dismiss',
    'scene.drag',
    'scene.set-mode',
    'config.update',
    'diagnostic.subscribe',
    'shutdown'
  ]);
});

test('hello request is a valid versioned message', () => {
  const message = createHello({
    clientVersion: 'test-client',
    requestId: 'req-test',
    traceId: 'trace-test',
    timestamp: fixedTime
  });

  assert.deepEqual(message, {
    protocolVersion: 1,
    requestId: 'req-test',
    traceId: 'trace-test',
    type: 'hello',
    timestamp: fixedTime,
    payload: {
      clientVersion: 'test-client',
      supportedProtocolVersions: [1]
    }
  });
  assert.deepEqual(parseMessage(serializeMessage(message)), message);
});

test('health and capabilities requests use the common envelope', () => {
  const health = createHealthRequest({ requestId: 'req-health', traceId: 'trace-health', timestamp: fixedTime });
  const capabilities = createCapabilitiesRequest({ requestId: 'req-capabilities', traceId: 'trace-capabilities', timestamp: fixedTime });

  assert.equal(health.type, 'health');
  assert.equal(capabilities.type, 'capabilities');
  validateMessage(health);
  validateMessage(capabilities);
});

test('ack and error responses correlate to the request', () => {
  const request = createHealthRequest({
    requestId: 'req-health',
    traceId: 'trace-health',
    timestamp: fixedTime
  });
  const ack = createAck(request, { status: 'healthy' });
  const error = createErrorResponse(request, {
    code: 'TRANSPORT_DISCONNECTED',
    message: 'Runtime disconnected',
    retryable: true,
    details: { attempt: 1 }
  });

  assert.equal(ack.type, 'ack');
  assert.equal(ack.requestId, request.requestId);
  assert.equal(ack.traceId, request.traceId);
  assert.equal(ack.payload.accepted, true);
  assert.equal(error.type, 'error');
  assert.equal(error.requestId, request.requestId);
  assert.equal(error.payload.code, 'TRANSPORT_DISCONNECTED');
  assert.equal(error.payload.retryable, true);
});

test('scene changed events use the versioned event envelope', () => {
  assert.deepEqual(EVENT_TYPES, ['scene.changed']);
  const event = createEvent({
    eventType: 'scene.changed',
    requestId: 'evt-scene',
    traceId: 'trace-scene',
    timestamp: fixedTime,
    result: { sceneStateSnapshot: { cardOrder: [] } }
  });

  assert.equal(event.type, 'event');
  assert.equal(event.payload.eventType, 'scene.changed');
  assert.deepEqual(parseMessage(serializeMessage(event)), event);
  expectProtocolError(
    () => validateMessage({
      ...event,
      payload: { eventType: 'unknown', result: {} }
    }),
    PROTOCOL_ERROR_CODES.UNKNOWN_TYPE
  );
});

test('PipeClient routes unsolicited scene changed frames to the event channel', () => {
  const client = new PipeClient({ pipeName: '\\\\.\\pipe\\notification-hub-event-channel-test' });
  const events = [];
  const responses = [];
  client.on('event', (message) => events.push(message));
  client.on('response', (message) => responses.push(message));

  client.handleMessage(serializeMessage(createEvent({
    eventType: 'scene.changed',
    requestId: 'evt-client',
    traceId: 'trace-client',
    timestamp: fixedTime,
    result: { sceneStateSnapshot: { cardOrder: [] } }
  })));

  assert.equal(events.length, 1);
  assert.equal(events[0].payload.eventType, 'scene.changed');
  assert.deepEqual(responses, []);
});

test('protocol rejects malformed and incompatible messages with stable codes', () => {
  expectProtocolError(() => validateMessage({}), PROTOCOL_ERROR_CODES.MISSING_FIELD);
  expectProtocolError(
    () => createRequest({ type: 'not-a-command', timestamp: fixedTime }),
    PROTOCOL_ERROR_CODES.UNKNOWN_TYPE
  );
  expectProtocolError(
    () => parseMessage('{"protocolVersion":2}'),
    PROTOCOL_ERROR_CODES.MISSING_FIELD
  );
  expectProtocolError(
    () => validateMessage({
      protocolVersion: 2,
      requestId: 'req',
      traceId: 'trace',
      type: 'health',
      timestamp: fixedTime,
      payload: {}
    }),
    PROTOCOL_ERROR_CODES.UNSUPPORTED_VERSION
  );
  expectProtocolError(
    () => validateMessage({
      protocolVersion: 1,
      requestId: 'req',
      traceId: 'trace',
      type: 'health',
      timestamp: fixedTime,
      payload: {},
      futureField: true
    }),
    PROTOCOL_ERROR_CODES.UNKNOWN_FIELD
  );
});

test('stable error code registry is unique and queryable', () => {
  assert.ok(ERROR_CODES.length > 0);
  assert.equal(ERROR_CODES.length, ERROR_CODE_SET.size);
  assert.ok(ERROR_CODE_SET.has('TRANSPORT_ACK_TIMEOUT'));
  assert.ok(ERROR_CODE_SET.has('LAYOUT_CARD_OUT_OF_BOUNDS'));
  assert.ok(ERROR_CODE_SET.has('FALLBACK_TO_NO_DESKTOP'));
});

test('diagnostic event has traceable structure and JSONL serialization', () => {
  const event = createDiagnosticEvent({
    traceId: 'trace-diagnostic',
    notificationId: 'notice-1',
    stage: 'layout-planned',
    code: 'LAYOUT_OUT_OF_BOUNDS',
    severity: 'warning',
    recoverable: true,
    message: 'Card moved to a safe anchor',
    timestamp: fixedTime,
    context: { renderer: 'native-v1', monitor: 'primary' }
  });

  assert.equal(event.traceId, 'trace-diagnostic');
  assert.equal(event.stage, 'layout-planned');
  assert.equal(event.severity, 'warning');
  assert.equal(diagnosticFingerprint(event), 'LAYOUT_OUT_OF_BOUNDS|layout-planned|warning|Card moved to a safe anchor');
  assert.match(serializeDiagnosticEvent(event), /\n$/);
});

test('diagnostic deduplication keeps first occurrence and respects the limit', () => {
  const createEvent = (code) => createDiagnosticEvent({
    traceId: 'trace',
    stage: 'error',
    code,
    message: code,
    timestamp: fixedTime
  });
  const first = createEvent('EVENT_INVALID');
  const duplicate = { ...first, diagnosticId: 'diag-duplicate' };
  const second = createEvent('TRANSPORT_DISCONNECTED');

  assert.deepEqual(deduplicateDiagnostics([first, duplicate, second]), [first, second]);
  assert.deepEqual(deduplicateDiagnostics([first, second], { maxEntries: 1 }), [first]);
});
