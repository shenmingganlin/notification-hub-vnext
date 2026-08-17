import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEffectRule,
  createEffectRules,
  listEffectRuleTargets,
  removeEffectRule,
  resolveEffectRule,
  upsertEffectRule
} from '../../plugin/domain/effect-rules.js';

test('effect rules validate event targets and sound effects', () => {
  const rule = createEffectRule({
    id: 'sound-rule-1', name: '工具失败提示', enabled: true,
    eventIds: ['tool.execution.failed', 'tool.execution.timed_out'],
    effect: { soundId: 'sound.tool.failed', volume: 0.72 }
  }, 'sound');
  assert.deepEqual(rule.eventIds, ['tool.execution.failed', 'tool.execution.timed_out']);
  assert.equal(rule.effect.volume, 0.72);
  assert.throws(() => createEffectRule({ ...rule, eventIds: ['delivery.notification.shown'] }, 'sound'), /presentation/);
  assert.throws(() => createEffectRule({ ...rule, effect: { soundId: 'sound.x', volume: 2 } }, 'sound'), /volume/);
});

test('visual rules validate preset and intensity', () => {
  const rule = createEffectRule({
    id: 'visual-rule-1', name: '失败强调', eventIds: ['tool.execution.failed'],
    effect: { preset: 'warning', intensity: 'balanced' }
  }, 'visual');
  assert.equal(rule.effect.preset, 'warning');
  assert.throws(() => createEffectRule({ ...rule, effect: { preset: 'unknown' } }, 'visual'), /preset/);
});

test('effect rules upsert, resolve first enabled match, and remove by id', () => {
  const initial = createEffectRules([], 'sound');
  const first = upsertEffectRule(initial, { id: 'a', name: 'A', eventIds: ['tool.execution.failed'], effect: { soundId: 'sound.a' } }, 'sound');
  const second = upsertEffectRule(first, { id: 'b', name: 'B', eventIds: ['tool.execution.failed'], effect: { soundId: 'sound.b' } }, 'sound');
  assert.equal(resolveEffectRule(second, 'tool.execution.failed', 'sound').id, 'a');
  const disabled = upsertEffectRule(second, { id: 'a', name: 'A', enabled: false, eventIds: ['tool.execution.failed'], effect: { soundId: 'sound.a' } }, 'sound');
  assert.equal(resolveEffectRule(disabled, 'tool.execution.failed', 'sound').id, 'b');
  assert.equal(removeEffectRule(disabled, 'b', 'sound').length, 1);
  assert.equal(listEffectRuleTargets().some((item) => item.eventId === 'tool.execution.failed'), true);
});
