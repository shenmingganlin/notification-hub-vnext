import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCardChannelPolicy,
  createCardChannelPolicies,
  resolveCardChannelPolicy
} from '../../plugin/domain/card-runtime-policy.js';

test('card channel policy defaults to an unsuppressed storm-safe channel', () => {
  const policy = createCardChannelPolicy({ policyId: 'storm', maxVisible: 1000 });
  assert.deepEqual(policy, {
    policyId: 'storm', suppression: 'off', maxVisible: 1000, overflow: 'allow', durationMs: 5000
  });
});

test('card channel policies validate suppression and bounded lifecycle fields', () => {
  assert.throws(() => createCardChannelPolicy({ suppression: 'unknown' }), /suppression/i);
  assert.throws(() => createCardChannelPolicy({ maxVisible: 0 }), /maxVisible/i);
  assert.throws(() => createCardChannelPolicy({ durationMs: -1 }), /durationMs/i);
  const policies = createCardChannelPolicies({ soft: { suppression: 'soft', overflow: 'queue' } });
  assert.equal(policies.default.suppression, 'off');
  assert.equal(policies.soft.suppression, 'soft');
});

test('event presentation binding resolves a channel policy with a default fallback', () => {
  const profile = {
    channelPolicies: { storm: { suppression: 'off', maxVisible: 1000, overflow: 'allow' } },
    events: { 'tool.execution.succeeded': { channelPolicyId: 'storm' } },
    categories: { tool: { channelPolicyId: 'missing' } }
  };
  assert.equal(resolveCardChannelPolicy({ eventId: 'tool.execution.succeeded', categoryId: 'tool', profile }).policyId, 'storm');
  assert.equal(resolveCardChannelPolicy({ eventId: 'tool.execution.failed', categoryId: 'tool', profile }).policyId, 'default');
});
