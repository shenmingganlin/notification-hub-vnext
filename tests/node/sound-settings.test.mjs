import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SOUND_SETTINGS_DEFAULTS,
  createSoundSettings,
  validateSoundSettings
} from '../../plugin/domain/sound-settings.js';

test('empty sound settings resolve to frozen defaults without mutating input', () => {
  const input = {};
  const result = createSoundSettings(input);

  assert.deepEqual(result, SOUND_SETTINGS_DEFAULTS);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.defaultPolicy), true);
  assert.equal(Object.isFrozen(result.typePolicies), true);
  assert.equal(Object.isFrozen(result.importancePolicies), true);
  assert.deepEqual(input, {});
});

test('global sound setting and work-mode mute accept explicit booleans', () => {
  const result = createSoundSettings({
    globalSoundEnabled: false,
    workModeMuted: true
  });

  assert.equal(result.globalSoundEnabled, false);
  assert.equal(result.workModeMuted, true);
});

test('default policy and type or importance overrides merge without losing defaults', () => {
  const result = createSoundSettings({
    defaultPolicy: { enabled: true, volume: 0.4 },
    typePolicies: {
      'task.completed': { cue: 'success', enabled: true }
    },
    importancePolicies: {
      critical: { cue: 'critical', volume: 0.8 }
    }
  });

  assert.deepEqual(result.defaultPolicy, {
    enabled: true,
    cue: 'chat-incoming',
    volume: 0.4,
    minImportance: 'low',
    suppressDuplicates: true,
    quietMode: false,
    criticalBypass: true
  });
  assert.deepEqual(result.typePolicies, {
    'task.completed': { cue: 'success', enabled: true }
  });
  assert.deepEqual(result.importancePolicies, {
    critical: { cue: 'critical', volume: 0.8 }
  });
});

test('sound settings reject unknown fields and invalid policy values with stable codes', () => {
  assert.throws(
    () => createSoundSettings({ unknown: true }),
    (error) => error.code === 'SOUND_SETTINGS_FIELD_UNKNOWN'
  );
  assert.throws(
    () => createSoundSettings({ globalSoundEnabled: 'false' }),
    (error) => error.code === 'SOUND_SETTINGS_FIELD_INVALID'
  );
  assert.throws(
    () => createSoundSettings({ workModeMuted: 1 }),
    (error) => error.code === 'SOUND_SETTINGS_FIELD_INVALID'
  );
  assert.throws(
    () => createSoundSettings({ fallback: 'none' }),
    (error) => error.code === 'SOUND_SETTINGS_FALLBACK_INVALID'
  );
  assert.throws(
    () => createSoundSettings({ defaultPolicy: { volume: 1.1 } }),
    (error) => error.code === 'SOUND_SETTINGS_VOLUME_INVALID'
  );
  assert.throws(
    () => createSoundSettings({ defaultPolicy: { cue: '' } }),
    (error) => error.code === 'SOUND_SETTINGS_CUE_INVALID'
  );
  assert.throws(
    () => createSoundSettings({ importancePolicies: { urgent: { enabled: true } } }),
    (error) => error.code === 'SOUND_SETTINGS_IMPORTANCE_INVALID'
  );
  assert.throws(
    () => createSoundSettings({ typePolicies: { completed: { unsupported: true } } }),
    (error) => error.code === 'SOUND_SETTINGS_FIELD_UNKNOWN'
  );
  assert.throws(
    () => createSoundSettings(null),
    (error) => error.code === 'SOUND_SETTINGS_FIELD_INVALID'
  );
});

test('nested sound settings are isolated from input and deeply frozen', () => {
  const input = {
    defaultPolicy: { enabled: true },
    typePolicies: { 'task.completed': { cue: 'success' } },
    importancePolicies: { critical: { volume: 0.7 } }
  };
  const snapshot = structuredClone(input);
  const result = createSoundSettings(input);

  assert.deepEqual(input, snapshot);
  assert.equal(Object.isFrozen(result.defaultPolicy), true);
  assert.equal(Object.isFrozen(result.typePolicies['task.completed']), true);
  assert.equal(Object.isFrozen(result.importancePolicies.critical), true);
  assert.throws(() => { result.defaultPolicy.enabled = false; }, TypeError);
});

test('validateSoundSettings accepts a complete normalized settings object', () => {
  assert.equal(validateSoundSettings(createSoundSettings({})), true);
});

test('removed category and importance policies do not enter the sound profile', () => {
  const result = createSoundSettings({
    globalSoundEnabled: false,
    defaultPolicy: { enabled: true, volume: 0.4, cue: 'warning' },
    typePolicies: { 'task.completed': { cue: 'tool-complete', enabled: true } },
    importancePolicies: { critical: { cue: 'critical-error', volume: 0.9 } }
  });

  assert.equal(result.profile.version, 1);
  assert.equal(result.profile.global.enabled, true);
  assert.equal(result.profile.global.volume, 0.4);
  assert.equal(result.profile.global.cue, 'warning');
  assert.equal(result.profile.globalSoundEnabled, undefined);
  assert.deepEqual(result.profile.soundOverrides, []);
  assert.equal(result.globalSoundEnabled, false);
  assert.deepEqual(result.typePolicies['task.completed'], { cue: 'tool-complete', enabled: true });
});

test('legacy category/rules profile snapshots are migrated without blocking restore', () => {
  const result = createSoundSettings({ profile: { version: 1, global: { enabled: true }, categories: { chat: { enabled: true } }, rules: [] } });
  assert.equal(result.profile.global.enabled, true);
  assert.deepEqual(result.profile.soundOverrides, []);
});

test('event sound binding is configured explicitly', () => {
  const result = createSoundSettings({ profile: { global: { enabled: true }, soundOverrides: [{ eventId: 'tool.execution.failed', soundId: 'failure' }] } });
  assert.equal(result.profile.soundOverrides[0].eventId, 'tool.execution.failed');
});

test('new profile settings are accepted and reject unknown profile fields', () => {
  const result = createSoundSettings({ profile: { global: { enabled: true } } });
  assert.equal(result.profile.global.enabled, true);
  assert.throws(
    () => createSoundSettings({ profile: { global: { unknown: true } } }),
    (error) => error.code === 'SOUND_PROFILE_FIELD_UNKNOWN'
  );
});
