import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSoundRule, resolveSoundRuleSafe } from '../../plugin/domain/sound-rule-resolver.js';

function presentation(overrides = {}) { return { soundInput: { eventId: 'tool.execution.failed', importance: 'normal', ...overrides } }; }
function profile(overrides = {}) { return { global: { enabled: true, cue: 'warning', volume: 1, suppressDuplicates: true }, soundOverrides: [], ...overrides }; }

test('event binding selects the configured sound and volume', () => {
  const result = resolveSoundRule({
    presentation: presentation(),
    profile: profile({ soundOverrides: [{ eventId: 'tool.execution.failed', soundId: 'failure-bell', volume: 0.4 }] })
  });
  assert.equal(result.soundId, 'failure-bell');
  assert.equal(result.cue, null);
  assert.equal(result.volume, 0.4);
  assert.equal(result.matchedBy, 'event');
});

test('event identity prevents another event from inheriting the binding', () => {
  const result = resolveSoundRule({
    presentation: presentation({ eventId: 'tool.execution.succeeded' }),
    profile: profile({ soundOverrides: [{ eventId: 'tool.execution.failed', soundId: 'failure-bell' }] })
  });
  assert.equal(result.soundId, undefined);
  assert.equal(result.cue, 'tool-complete');
  assert.equal(result.matchedBy, 'global');
});

test('important sound is an event, not an importance branch', () => {
  const result = resolveSoundRule({
    presentation: presentation({ eventId: 'delivery.important_sound' }),
    profile: profile()
  });
  assert.equal(result.cue, 'critical-error');
  assert.equal(result.priority, 'normal');
});

test('global sound policy still controls mute, duplicate, and volume', () => {
  const muted = resolveSoundRule({ presentation: presentation(), profile: profile({ global: { enabled: false } }) });
  assert.equal(muted.play, false);
  assert.equal(muted.reason, 'policy-disabled');
  const duplicate = resolveSoundRule({ presentation: presentation(), profile: profile(), context: { isDuplicate: true } });
  assert.equal(duplicate.play, false);
  assert.equal(duplicate.reason, 'duplicate-suppressed');
});

test('safe resolver returns a stable decision for malformed input', () => {
  assert.equal(resolveSoundRuleSafe({}).play, false);
});
