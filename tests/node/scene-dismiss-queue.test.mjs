import assert from 'node:assert/strict';
import test from 'node:test';

import { createSceneDismissQueue } from '../../plugin/domain/scene-dismiss-queue.js';

test('Scene dismiss queue serializes requests and deduplicates one card', async () => {
  const active = new Set();
  let maxActive = 0;
  const order = [];
  const queue = createSceneDismissQueue({
    execute: async ({ notificationId }) => {
      active.add(notificationId);
      maxActive = Math.max(maxActive, active.size);
      order.push(notificationId);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active.delete(notificationId);
      return notificationId;
    }
  });

  const first = queue.enqueue({ notificationId: 'card-a' });
  const duplicate = queue.enqueue({ notificationId: 'card-a' });
  const second = queue.enqueue({ notificationId: 'card-b' });
  assert.strictEqual(first, duplicate);
  assert.deepEqual(await Promise.all([first, second]), ['card-a', 'card-b']);
  assert.equal(maxActive, 1);
  assert.deepEqual(order, ['card-a', 'card-b']);
});

test('Scene dismiss queue rejects pending entries when cleared', async () => {
  let release;
  const queue = createSceneDismissQueue({ execute: () => new Promise((resolve) => { release = resolve; }) });
  const first = queue.enqueue({ notificationId: 'card-a' });
  const second = queue.enqueue({ notificationId: 'card-b' });
  queue.clearPending(Object.assign(new Error('cleared'), { code: 'TEST_QUEUE_CLEARED' }));
  await assert.rejects(second, (error) => error.code === 'TEST_QUEUE_CLEARED');
  release('done');
  assert.equal(await first, 'done');
});
