import assert from 'node:assert/strict';
import test from 'node:test';
import { createVisualRuntimePromotionQueue } from '../../plugin/domain/visual-runtime-promotion-queue.js';

test('promotion queue deduplicates one notification and retries after failure', async () => {
  let attempts = 0;
  const queue = createVisualRuntimePromotionQueue({
    execute: async (input) => {
      attempts += 1;
      if (attempts === 1) throw new Error('temporary native failure');
      return input.record.notificationId;
    }
  });
  const input = { record: { notificationId: 'promotion-1' } };
  const first = queue.enqueue(input);
  const second = queue.enqueue(input);
  assert.strictEqual(first, second);
  assert.equal(queue.size, 1);
  await queue.retry();
  assert.equal(await first, 'promotion-1');
  assert.equal(attempts, 2);
});

test('promotion queue close rejects and clears pending work', async () => {
  let release;
  const queue = createVisualRuntimePromotionQueue({ execute: async () => new Promise((resolve) => { release = resolve; }) });
  const pending = queue.enqueue({ record: { notificationId: 'promotion-2' } });
  queue.close();
  await assert.rejects(pending, /promotion queue closed/);
  release();
  assert.equal(queue.size, 0);
});
