import assert from 'node:assert/strict';
import test from 'node:test';
import { createVisualRuntimePromotionAdapter } from '../../plugin/domain/visual-runtime-promotion-adapter.js';

test('promotion commits Plugin state only after Native create succeeds', async () => {
  const calls = [];
  const adapter = createVisualRuntimePromotionAdapter({
    createNativeCard: async (input) => { calls.push(['create', input.promotedCard.notificationId]); return { id: input.promotedCard.notificationId }; },
    commit: async (input) => { calls.push(['commit', input.record.notificationId]); return { shown: true }; }
  });
  const result = await adapter.promote({
    promotedCard: { notificationId: 'queued-1' },
    record: { notificationId: 'queued-1' },
    nativePayload: { id: 'native-queued-1' }
  });
  assert.deepEqual(calls, [['create', 'queued-1'], ['commit', 'queued-1']]);
  assert.equal(result.decision, 'committed');
});

test('promotion does not commit when Native create fails', async () => {
  let committed = false;
  const adapter = createVisualRuntimePromotionAdapter({
    createNativeCard: async () => { throw new Error('native create failed'); },
    commit: async () => { committed = true; }
  });
  await assert.rejects(() => adapter.promote({ promotedCard: { notificationId: 'queued-2' }, record: { notificationId: 'queued-2' } }));
  assert.equal(committed, false);
  assert.equal(adapter.hasCommitted('queued-2'), false);
});

test('promotion is idempotent after commit', async () => {
  let creates = 0;
  let commits = 0;
  const adapter = createVisualRuntimePromotionAdapter({
    createNativeCard: async () => { creates += 1; return {}; },
    commit: async () => { commits += 1; return {}; }
  });
  const input = { promotedCard: { notificationId: 'queued-3' }, record: { notificationId: 'queued-3' } };
  await adapter.promote(input);
  const second = await adapter.promote(input);
  assert.equal(second.decision, 'already-committed');
  assert.equal(creates, 1);
  assert.equal(commits, 1);
});
