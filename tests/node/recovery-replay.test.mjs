import assert from 'node:assert/strict';
import test from 'node:test';

import { RecoveryReplayCoordinator } from '../../plugin/runtime/recovery-replay.js';
import { createRecoverySnapshot } from '../../plugin/runtime/recovery-snapshot.js';

function entry(key) {
  return { key, type: 'config.update', payload: { key } };
}

test('RecoveryReplayCoordinator preserves order and records successful applications', async () => {
  const snapshot = createRecoverySnapshot({ entries: [entry('first'), entry('second')] });
  const coordinator = new RecoveryReplayCoordinator({ snapshot });
  const requests = [];
  const applied = [];

  const results = await coordinator.replay({
    async request(type, payload, options) {
      requests.push({ type, payload, options });
      return { type: 'ack', payload: { requestType: type } };
    }
  }, { onApplied: (result) => applied.push(result.key) });

  assert.deepEqual(applied, ['first', 'second']);
  assert.deepEqual(results.map(({ key }) => key), ['first', 'second']);
  assert.deepEqual(requests.map(({ payload }) => payload.key), ['first', 'second']);
  assert.equal(requests[0].options.idempotencyKey, `recovery:${snapshot.updatedAt}:first`);
  assert.deepEqual(coordinator.attempts, new Map());
  assert.deepEqual(coordinator.diagnostics, []);
});

test('RecoveryReplayCoordinator retains transient failures and increments attempts across replays', async () => {
  const snapshot = createRecoverySnapshot({ entries: [entry('transient')] });
  const coordinator = new RecoveryReplayCoordinator({ snapshot });
  let requests = 0;
  const skipped = [];
  const client = {
    async request() {
      requests += 1;
      if (requests === 1) throw Object.assign(new Error('temporary timeout'), { code: 'TRANSPORT_ACK_TIMEOUT' });
      return { type: 'ack' };
    }
  };

  const first = await coordinator.replay(client, { onSkipped: (details) => skipped.push(details) });
  assert.equal(first[0].error.details.status, 'retained');
  assert.equal(first[0].error.details.attempt, 1);
  assert.deepEqual(snapshot.entries.map(({ key }) => key), ['transient']);
  assert.equal(coordinator.attempts.get('transient'), 1);

  const second = await coordinator.replay(client);
  assert.equal(second[0].skipped, undefined);
  assert.equal(coordinator.attempts.get('transient'), 1);
  assert.equal(skipped.length, 1);
});

test('RecoveryReplayCoordinator removes only definitively unrecoverable failures and continues', async () => {
  const snapshot = createRecoverySnapshot({ entries: [entry('invalid'), entry('after-invalid')] });
  const coordinator = new RecoveryReplayCoordinator({ snapshot });
  const requests = [];
  const diagnostics = [];

  const results = await coordinator.replay({
    async request(type, payload) {
      requests.push(payload.key);
      if (payload.key === 'invalid') {
        throw Object.assign(new Error('invalid payload'), { code: 'RUNTIME_RECOVERY_INVALID_PAYLOAD' });
      }
      return { type: 'ack' };
    }
  }, { onDiagnostic: (error) => diagnostics.push(error.details) });

  assert.deepEqual(requests, ['invalid', 'after-invalid']);
  assert.deepEqual(results.map((result) => result.skipped === true), [true, false]);
  assert.deepEqual(snapshot.entries.map(({ key }) => key), ['after-invalid']);
  assert.equal(coordinator.attempts.get('invalid'), 1);
  assert.equal(diagnostics[0].status, 'removed');
  assert.equal(coordinator.diagnostics[0].lastError.code, 'RUNTIME_RECOVERY_INVALID_PAYLOAD');
});
