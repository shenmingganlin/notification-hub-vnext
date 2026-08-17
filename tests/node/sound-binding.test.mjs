import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SOUND_BINDING_EVENT_IDS,
  collectSoundAssetReferences,
  normalizeSoundBindingInput,
  removeSoundBinding,
  upsertSoundBindingRule
} from '../../plugin/domain/sound-binding.js';

test('sound binding is eventId based and validates presentation events', () => {
  const binding = normalizeSoundBindingInput({ eventId: 'tool.execution.failed', soundId: 'failure-bell', volume: 0.35 });
  assert.deepEqual(binding, {
    eventId: 'tool.execution.failed', soundId: 'failure-bell', volume: 0.35,
    key: 'tool.execution.failed', ruleId: 'custom-sound.tool-execution-failed'
  });
  assert.ok(SOUND_BINDING_EVENT_IDS.includes('delivery.important_sound'));
  assert.throws(() => normalizeSoundBindingInput({ eventId: 'tool.execution.started', soundId: 'bell' }), /presentation eligible/);
  assert.throws(() => normalizeSoundBindingInput({ category: 'tool', event: 'error', importance: 'critical', soundId: 'bell' }), /eventId/);
});

test('event binding upsert and removal are exact', () => {
  const profile = { soundOverrides: [{ eventId: 'chat.assistant_reply.completed', soundId: 'old' }] };
  const next = upsertSoundBindingRule(profile, { eventId: 'chat.assistant_reply.completed', soundId: 'new', volume: 0.5 });
  assert.deepEqual(next.soundOverrides, [{ eventId: 'chat.assistant_reply.completed', soundId: 'new', volume: 0.5 }]);
  assert.deepEqual(removeSoundBinding(next, { eventId: 'chat.assistant_reply.completed' }).soundOverrides, []);
  assert.deepEqual(profile.soundOverrides, [{ eventId: 'chat.assistant_reply.completed', soundId: 'old' }]);
});

test('asset references expose event identity without category or importance', () => {
  const refs = collectSoundAssetReferences({
    global: { soundId: 'bell' },
    soundOverrides: [{ eventId: 'tool.execution.failed', soundId: 'bell' }]
  }, 'bell');
  assert.deepEqual(refs.map((entry) => entry.type), ['global', 'event']);
  assert.equal(refs[1].eventId, 'tool.execution.failed');
});
