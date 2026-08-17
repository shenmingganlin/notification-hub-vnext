import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createNotificationRuleTarget,
  matchesNotificationRuleTarget,
  getNotificationRuleSpecificity
} from '../../plugin/domain/notification-rule-target.js';

test('rule target uses OR inside a field and AND across fields', () => {
  const target = createNotificationRuleTarget({
    categories: ['tool', 'external_call'],
    events: ['failed'],
    importance: ['high', 'critical']
  });

  assert.equal(matchesNotificationRuleTarget(target, {
    labels: ['tool', 'error', 'external_call'], event: 'failed', importance: 'critical'
  }), true);
  assert.equal(matchesNotificationRuleTarget(target, {
    labels: ['tool'], event: 'completed', importance: 'critical'
  }), false);
  assert.equal(getNotificationRuleSpecificity(target), 3);
});

test('target normalizes arrays, preserves caller input, and deeply freezes output', () => {
  const input = {
    categories: ['plugin', 'tool', 'plugin'],
    producerIds: ['z', 'a', 'z'],
    producerKinds: ['api', 'hana', 'api'],
    events: ['failed', 'arrived', 'failed'],
    importance: ['critical', 'low', 'critical'],
    sources: ['remote', 'local', 'remote'],
    channels: ['b', 'a', 'b']
  };
  const before = structuredClone(input);
  const target = createNotificationRuleTarget(input);

  assert.deepEqual(input, before);
  assert.deepEqual(target, {
    categories: ['tool', 'external_call'],
    producerIds: ['a', 'z'],
    producerKinds: ['hana', 'api'],
    events: ['arrived', 'failed'],
    importance: ['low', 'critical'],
    sources: ['local', 'remote'],
    channels: ['a', 'b']
  });
  assert.equal(Object.isFrozen(target), true);
  for (const value of Object.values(target)) assert.equal(Object.isFrozen(value), true);
  assert.throws(() => { target.categories.push('chat'); }, TypeError);
});

test('empty target is global and omitted input fields impose no constraint', () => {
  const target = createNotificationRuleTarget();
  assert.equal(matchesNotificationRuleTarget(target, {}), true);
  assert.equal(matchesNotificationRuleTarget(target, { labels: ['chat'] }), true);
  assert.equal(getNotificationRuleSpecificity(target), 0);
});

test('producer, source, channel, and category dimensions match structured sound input', () => {
  const target = createNotificationRuleTarget({
    producerIds: ['agent-1'],
    producerKinds: ['hana'],
    sources: ['hana.system'],
    channels: ['alerts'],
    categories: ['error']
  });
  const input = {
    labels: ['error'],
    producer: { id: 'agent-1', kind: 'hana' },
    source: 'hana.system',
    channel: 'alerts'
  };
  assert.equal(matchesNotificationRuleTarget(target, input), true);
  assert.equal(matchesNotificationRuleTarget(target, { ...input, producer: { ...input.producer, kind: 'api' } }), false);
});

test('unknown fields and invalid values are rejected', () => {
  assert.throws(() => createNotificationRuleTarget({ unknown: ['x'] }), /unknown/i);
  assert.throws(() => createNotificationRuleTarget({ categories: ['unknown'] }), /categor/);
  assert.throws(() => createNotificationRuleTarget({ importance: ['urgent'] }), /importance/);
  assert.throws(() => createNotificationRuleTarget({ events: [''] }), /event/);
});
