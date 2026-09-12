import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  COMMAND_TYPES,
  EVENT_TYPES,
  PROTOCOL_ERROR_CODES,
  parseMessage,
  validateMessage
} from '../../plugin/protocol/index.js';

const corpus = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/protocol-corpus.json'), 'utf8'));
const schema = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'schemas/protocol-message.schema.json'), 'utf8'));
const envelope = (overrides = {}) => ({
  protocolVersion: 1,
  requestId: 'req-phase3',
  traceId: 'trace-phase3',
  type: 'health',
  timestamp: '2026-08-01T00:00:00.000Z',
  payload: {},
  ...overrides
});

test('protocol registry and schema expose every non-visual command and event', () => {
  assert.ok(COMMAND_TYPES.includes('visual-assets.configure'));
  assert.ok(COMMAND_TYPES.includes('audio.play'));
  assert.deepEqual(EVENT_TYPES, ['scene.changed', 'audio.voice_finished']);
  assert.ok(schema.properties.type.enum.includes('visual-assets.configure'));
  assert.ok(schema.properties.type.enum.includes('audio.play'));
  assert.ok(schema.properties.type.enum.includes('event'));
});

test('Node validates the shared protocol corpus', () => {
  for (const message of corpus.valid) validateMessage(message);
  for (const entry of corpus.invalid) {
    assert.throws(() => validateMessage(entry.message), (error) => error.code === entry.code);
  }
});

test('Node applies the same ISO-8601 timestamp rule to requests and responses', () => {
  assert.throws(() => validateMessage(envelope({ timestamp: '2026-08-01' })), (error) => error.code === PROTOCOL_ERROR_CODES.INVALID_MESSAGE);
  assert.throws(() => validateMessage(envelope({ timestamp: 'not-a-timestamp' })), (error) => error.code === PROTOCOL_ERROR_CODES.INVALID_MESSAGE);
  assert.throws(() => validateMessage(envelope({ timestamp: '2026-02-30T00:00:00.000Z' })), (error) => error.code === PROTOCOL_ERROR_CODES.INVALID_MESSAGE);
  assert.doesNotThrow(() => validateMessage(envelope({ type: 'error', payload: {
    requestType: 'health', accepted: false, code: 'E', message: 'bad', retryable: false, details: {}
  } })));
});

test('Node strictly validates error response payloads', () => {
  const valid = corpus.valid.find((message) => message.type === 'error');
  assert.doesNotThrow(() => validateMessage(valid));
  for (const payload of [
    { accepted: false, code: 'E', message: 'bad', retryable: false, details: {} },
    { requestType: 'health', accepted: true, code: 'E', message: 'bad', retryable: false, details: {} },
    { requestType: 'health', accepted: false, code: 'E', message: 'bad', retryable: 'no', details: {} },
    { requestType: 'health', accepted: false, code: 'E', message: 'bad', retryable: false, details: [] }
  ]) {
    assert.throws(() => validateMessage(envelope({ type: 'error', payload })), (error) => error.code === PROTOCOL_ERROR_CODES.INVALID_PAYLOAD);
  }
});

test('schema declares the error response contract', () => {
  const payloadSchema = schema.properties.payload;
  assert.ok(payloadSchema.oneOf, 'payload must distinguish error payloads');
  const errorSchema = payloadSchema.oneOf.find((candidate) => candidate.properties?.accepted?.const === false);
  assert.ok(errorSchema);
  assert.deepEqual(errorSchema.required.sort(), ['accepted', 'code', 'details', 'message', 'requestType', 'retryable'].sort());
});
