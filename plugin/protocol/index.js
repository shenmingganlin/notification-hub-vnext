/**
 * Versioned JSON protocol contracts for the Node.js side of vNext.
 *
 * Transport framing is deliberately outside this module. A Named Pipe adapter
 * may frame these messages as [uint32-le][UTF-8 JSON], while this module keeps
 * protocol semantics transport-independent.
 */

export const PROTOCOL_VERSION = 1;

export const COMMAND_TYPES = Object.freeze([
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

export const RESPONSE_TYPES = Object.freeze(['ack', 'error']);
export const MESSAGE_TYPES = Object.freeze([...COMMAND_TYPES, ...RESPONSE_TYPES]);

export const PROTOCOL_ERROR_CODES = Object.freeze({
  INVALID_MESSAGE: 'PROTOCOL_INVALID_MESSAGE',
  MISSING_FIELD: 'PROTOCOL_MISSING_FIELD',
  UNKNOWN_FIELD: 'PROTOCOL_UNKNOWN_FIELD',
  UNKNOWN_TYPE: 'PROTOCOL_UNKNOWN_TYPE',
  UNSUPPORTED_VERSION: 'PROTOCOL_VERSION_UNSUPPORTED',
  INVALID_PAYLOAD: 'PROTOCOL_INVALID_PAYLOAD'
});

const ENVELOPE_FIELDS = new Set([
  'protocolVersion',
  'requestId',
  'traceId',
  'type',
  'timestamp',
  'payload',
  'idempotencyKey'
]);

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

function protocolError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function assertRequestType(type) {
  if (!COMMAND_TYPES.includes(type)) {
    throw protocolError(
      PROTOCOL_ERROR_CODES.UNKNOWN_TYPE,
      `Unknown command type: ${String(type)}`,
      { type }
    );
  }
}

function createId(prefix) {
  const value = globalThis.crypto?.randomUUID?.();
  return value ? `${prefix}-${value}` : `${prefix}-${Date.now().toString(36)}`;
}

export function createRequest({
  type,
  payload = {},
  requestId = createId('req'),
  traceId = createId('trace'),
  timestamp = new Date().toISOString(),
  idempotencyKey
} = {}) {
  assertRequestType(type);
  const message = {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    traceId,
    type,
    timestamp,
    payload,
    ...(idempotencyKey === undefined ? {} : { idempotencyKey })
  };
  validateMessage(message);
  return Object.freeze(message);
}

export function createHello(options = {}) {
  return createRequest({
    type: 'hello',
    payload: {
      clientVersion: options.clientVersion ?? '0.1.0-alpha.1',
      supportedProtocolVersions: options.supportedProtocolVersions ?? [PROTOCOL_VERSION]
    },
    requestId: options.requestId,
    traceId: options.traceId,
    timestamp: options.timestamp
  });
}

export function createHealthRequest(options = {}) {
  return createRequest({ ...options, type: 'health' });
}

export function createCapabilitiesRequest(options = {}) {
  return createRequest({ ...options, type: 'capabilities' });
}

export function createAck(request, result = {}) {
  validateMessage(request);
  return createResponse({
    requestId: request.requestId,
    traceId: request.traceId,
    payload: { requestType: request.type, accepted: true, result }
  });
}

export function createErrorResponse(request, { code, message, retryable = false, details = {} } = {}) {
  validateMessage(request);
  if (!isNonEmptyString(code) || !isNonEmptyString(message)) {
    throw protocolError(PROTOCOL_ERROR_CODES.INVALID_PAYLOAD, 'Error response requires code and message');
  }
  if (typeof retryable !== 'boolean' || !isRecord(details)) {
    throw protocolError(PROTOCOL_ERROR_CODES.INVALID_PAYLOAD, 'retryable must be boolean and details must be an object');
  }
  return createResponse({
    requestId: request.requestId,
    traceId: request.traceId,
    type: 'error',
    payload: { requestType: request.type, accepted: false, code, message, retryable, details }
  });
}

function createResponse({
  requestId,
  traceId,
  type = 'ack',
  payload = {},
  timestamp = new Date().toISOString()
}) {
  const message = { protocolVersion: PROTOCOL_VERSION, requestId, traceId, type, timestamp, payload };
  validateMessage(message);
  return Object.freeze(message);
}

export function validateMessage(message, { allowUnknownFields = false } = {}) {
  if (!isRecord(message)) {
    throw protocolError(PROTOCOL_ERROR_CODES.INVALID_MESSAGE, 'Protocol message must be an object');
  }

  if (!allowUnknownFields) {
    const unknownFields = Object.keys(message).filter((field) => !ENVELOPE_FIELDS.has(field));
    if (unknownFields.length > 0) {
      throw protocolError(
        PROTOCOL_ERROR_CODES.UNKNOWN_FIELD,
        `Unknown protocol field(s): ${unknownFields.join(', ')}`,
        { fields: unknownFields }
      );
    }
  }

  for (const field of ['protocolVersion', 'requestId', 'traceId', 'type', 'timestamp', 'payload']) {
    if (!(field in message)) {
      throw protocolError(PROTOCOL_ERROR_CODES.MISSING_FIELD, `Missing protocol field: ${field}`, { field });
    }
  }

  if (message.protocolVersion !== PROTOCOL_VERSION) {
    throw protocolError(
      PROTOCOL_ERROR_CODES.UNSUPPORTED_VERSION,
      `Unsupported protocol version: ${String(message.protocolVersion)}`,
      { supported: [PROTOCOL_VERSION], received: message.protocolVersion }
    );
  }
  if (!isNonEmptyString(message.requestId) || !isNonEmptyString(message.traceId)) {
    throw protocolError(PROTOCOL_ERROR_CODES.INVALID_MESSAGE, 'requestId and traceId must be non-empty strings');
  }
  if ('idempotencyKey' in message && !isNonEmptyString(message.idempotencyKey)) {
    throw protocolError(PROTOCOL_ERROR_CODES.INVALID_MESSAGE, 'idempotencyKey must be a non-empty string');
  }
  if (!isNonEmptyString(message.type) || !MESSAGE_TYPES.includes(message.type)) {
    throw protocolError(PROTOCOL_ERROR_CODES.UNKNOWN_TYPE, `Unknown message type: ${String(message.type)}`, { type: message.type });
  }
  if (!isNonEmptyString(message.timestamp) || Number.isNaN(Date.parse(message.timestamp))) {
    throw protocolError(PROTOCOL_ERROR_CODES.INVALID_MESSAGE, 'timestamp must be an ISO-8601 date-time string');
  }
  if (!isRecord(message.payload)) {
    throw protocolError(PROTOCOL_ERROR_CODES.INVALID_PAYLOAD, 'payload must be an object');
  }
  return message;
}

export function serializeMessage(message) {
  validateMessage(message);
  return JSON.stringify(message);
}

export function parseMessage(serialized, options = {}) {
  if (typeof serialized !== 'string') {
    throw protocolError(PROTOCOL_ERROR_CODES.INVALID_MESSAGE, 'Serialized message must be a string');
  }
  let message;
  try {
    message = JSON.parse(serialized);
  } catch (error) {
    throw protocolError(PROTOCOL_ERROR_CODES.INVALID_MESSAGE, 'Serialized message is not valid JSON', {
      cause: error.message
    });
  }
  return validateMessage(message, options);
}
