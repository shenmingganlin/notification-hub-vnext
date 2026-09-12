import assert from 'node:assert/strict';
import test from 'node:test';

import { RequestSessionDispatcher } from '../../plugin/runtime/request-session-dispatcher.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function response(requestId, traceId, requestType, payload = {}) {
  return {
    requestId,
    traceId,
    type: 'ack',
    payload: { requestType, ...payload }
  };
}

test('dispatcher correlates out-of-order responses by requestId and validates trace/type', async () => {
  const dispatcher = new RequestSessionDispatcher();
  const first = deferred();
  const second = deferred();
  dispatcher.track({ requestId: 'req-1', traceId: 'trace-1', requestType: 'health', ...first, timeoutMs: 100 });
  dispatcher.track({ requestId: 'req-2', traceId: 'trace-2', requestType: 'hello', ...second, timeoutMs: 100 });

  const secondResult = dispatcher.settleResponse(response('req-2', 'trace-2', 'hello'));
  const firstResult = dispatcher.settleResponse(response('req-1', 'trace-1', 'health'));

  assert.deepEqual(secondResult, { matched: true, accepted: true });
  assert.deepEqual(firstResult, { matched: true, accepted: true });
  assert.equal(await second.promise.then((message) => message.requestId), 'req-2');
  assert.equal(await first.promise.then((message) => message.requestId), 'req-1');
  assert.equal(dispatcher.size, 0);
});

test('dispatcher rejects correlation mismatch and ignores a late response', async () => {
  const dispatcher = new RequestSessionDispatcher();
  const pending = deferred();
  dispatcher.track({ requestId: 'req-1', traceId: 'trace-1', requestType: 'health', ...pending, timeoutMs: 100 });

  const mismatch = dispatcher.settleResponse(response('req-1', 'wrong-trace', 'health'));
  assert.equal(mismatch.matched, true);
  assert.equal(mismatch.accepted, false);
  await assert.rejects(pending.promise, (error) => error.code === 'PROTOCOL_RESPONSE_MISMATCH');
  assert.deepEqual(dispatcher.settleResponse(response('req-1', 'trace-1', 'health')), {
    matched: false,
    accepted: false
  });
});

test('dispatcher reports timeout and late response cannot settle the request again', async () => {
  const timeout = deferred();
  const dispatcher = new RequestSessionDispatcher({
    onTimeout: (error, requestId) => {
      assert.equal(requestId, 'req-timeout');
      dispatcher.reject(requestId, error);
    }
  });
  dispatcher.track({
    requestId: 'req-timeout',
    traceId: 'trace-timeout',
    requestType: 'health',
    ...timeout,
    timeoutMs: 10
  });

  await assert.rejects(timeout.promise, (error) => error.code === 'TRANSPORT_ACK_TIMEOUT');
  assert.equal(dispatcher.size, 0);
  assert.deepEqual(dispatcher.settleResponse(response('req-timeout', 'trace-timeout', 'health')), {
    matched: false,
    accepted: false
  });
});

test('dispatcher rejects every request on session disconnect', async () => {
  const first = deferred();
  const second = deferred();
  const dispatcher = new RequestSessionDispatcher();
  dispatcher.track({ requestId: 'req-1', traceId: 'trace-1', requestType: 'health', ...first, timeoutMs: 100 });
  dispatcher.track({ requestId: 'req-2', traceId: 'trace-2', requestType: 'hello', ...second, timeoutMs: 100 });

  const disconnect = Object.assign(new Error('Named Pipe disconnected'), { code: 'TRANSPORT_DISCONNECTED' });
  dispatcher.rejectAll(disconnect);

  await assert.rejects(first.promise, (error) => error === disconnect);
  await assert.rejects(second.promise, (error) => error === disconnect);
  assert.equal(dispatcher.size, 0);
});
