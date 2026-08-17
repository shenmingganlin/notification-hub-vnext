import assert from 'node:assert/strict';
import test from 'node:test';

import { SOUND_CUES, SOUND_PROFILE_VERSION, createSoundProfile } from '../../plugin/domain/sound-profile.js';

test('sound profile contains only global policy, named profiles, and event bindings', () => {
  const profile = createSoundProfile();
  assert.equal(SOUND_PROFILE_VERSION, 1);
  assert.deepEqual(SOUND_CUES, ['chat-incoming', 'channel-incoming', 'tool-complete', 'tool-failed', 'plugin-notice', 'warning', 'critical-error']);
  assert.equal(profile.global.enabled, false);
  assert.deepEqual(profile.soundOverrides, []);
  assert.deepEqual(profile.soundProfiles, {});
  assert.equal(Object.isFrozen(profile), true);
});

test('event sound bindings normalize and reject old dimensions', () => {
  const profile = createSoundProfile({ soundOverrides: [{ eventId: 'tool.execution.failed', soundId: 'failure', volume: 0.4 }] });
  assert.deepEqual(profile.soundOverrides, [{ eventId: 'tool.execution.failed', soundId: 'failure', volume: 0.4 }]);
  assert.throws(() => createSoundProfile({ categories: { chat: {} } }), /Unknown profile field/);
  assert.throws(() => createSoundProfile({ rules: [] }), /Unknown profile field/);
  assert.throws(() => createSoundProfile({ soundOverrides: [{ category: 'tool', event: 'error', importance: 'critical', soundId: 'x' }] }), /Unknown sound override field/);
  assert.throws(() => createSoundProfile({ soundOverrides: [
    { eventId: 'tool.execution.failed', soundId: 'a' },
    { eventId: 'tool.execution.failed', soundId: 'b' }
  ] }), /duplicate sound override/);
});

test('global sound policy remains configurable', () => {
  const profile = createSoundProfile({ global: { enabled: true, volume: 0.4, cue: 'warning', criticalCooldownMs: 2500 } });
  assert.equal(profile.global.enabled, true);
  assert.equal(profile.global.volume, 0.4);
  assert.equal(profile.global.cue, 'warning');
  assert.equal(profile.global.criticalCooldownMs, 2500);
});
