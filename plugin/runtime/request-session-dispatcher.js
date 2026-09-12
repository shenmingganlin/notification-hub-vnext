function sessionError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

/**
 * Owns request/response correlation for one transport session.
 * The transport decides when a session is disconnected; this module settles
 * the requests that belong to that session and ignores late responses.
 */
export class RequestSessionDispatcher {
  constructor({ onTimeout } = {}) {
    this.pending = new Map();
    this.onTimeout = onTimeout;
  }

  get size() {
    return this.pending.size;
  }

  track({ requestId, traceId, requestType, resolve, reject, timeoutMs, session }) {
    if (this.pending.has(requestId)) {
      throw sessionError('TRANSPORT_REQUEST_ID_DUPLICATE', `Request ${requestId} is already pending`, {
        requestId
      });
    }
    const timer = setTimeout(() => {
      const timeoutError = sessionError('TRANSPORT_ACK_TIMEOUT', `ACK timed out for ${requestId}`, {
        requestId,
        traceId,
        type: requestType
      });
      this.onTimeout?.(timeoutError, requestId, this.pending.get(requestId));
    }, timeoutMs);
    this.pending.set(requestId, { resolve, reject, timer, traceId, requestType, session });
  }

  settleResponse(message) {
    const pending = this.pending.get(message.requestId);
    if (!pending) return { matched: false, accepted: false };

    const responseRequestType = message.payload?.requestType;
    if (message.traceId !== pending.traceId || responseRequestType !== pending.requestType) {
      const mismatch = sessionError(
        'PROTOCOL_RESPONSE_MISMATCH',
        `Response correlation mismatch for ${message.requestId}`,
        {
          requestId: message.requestId,
          expectedTraceId: pending.traceId,
          receivedTraceId: message.traceId,
          expectedRequestType: pending.requestType,
          receivedRequestType: responseRequestType
        }
      );
      this.remove(message.requestId);
      pending.reject(mismatch);
      return { matched: true, accepted: false, error: mismatch };
    }

    this.remove(message.requestId);
    if (message.type === 'error') {
      pending.reject(sessionError(message.payload.code, message.payload.message, {
        ...message.payload.details,
        retryable: message.payload.retryable
      }));
    } else {
      pending.resolve(message);
    }
    return { matched: true, accepted: true };
  }

  reject(requestId, error) {
    const pending = this.pending.get(requestId);
    if (!pending) return false;
    this.remove(requestId);
    pending.reject(error);
    return true;
  }

  rejectAll(error) {
    for (const [requestId, pending] of this.pending) {
      this.remove(requestId);
      pending.reject(error);
    }
  }

  remove(requestId) {
    const pending = this.pending.get(requestId);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.pending.delete(requestId);
    return true;
  }
}
