import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveNotificationSound,
  resolveSoundRule,
  validateSoundPolicy,
  validateSoundPolicyContext
} from '../../plugin/domain/sound-policy.js';

function notification(importance = 'normal') {
  return {
    notificationId: 'notification-1',
    type: 'task.completed',
    source: 'test',
    importance
  };
}

test('sound policy exports the presentation-based rule resolver', () => {
  const result = resolveSoundRule({
    presentation: { soundInput: { eventId: 'chat.assistant_reply.completed', importance: 'normal' } },
    profile: { global: { enabled: true } }
  });
  assert.equal(result.play, true);
  assert.equal(result.cue, 'chat-incoming');
  assert.equal(result.matchedBy, 'global');
});

test('default sound policy keeps notification silent', () => {
  const result = resolveNotificationSound({
    notification: notification(),
    policy: {
      enabled: false,
      cue: 'default'
    }
  });

  assert.equal(result.play, false);
  assert.equal(result.reason, 'policy-disabled');
  assert.equal(result.cue, 'default');
  assert.equal(result.volume, 1);
});

test('enabled policy allows a notification with its cue and volume', () => {
  const result = resolveNotificationSound({
    notification: notification('high'),
    policy: { enabled: true, cue: 'success', volume: 0.4 }
  });

  assert.deepEqual(result, {
    play: true,
    cue: 'success',
    volume: 0.4,
    importance: 'high',
    reason: 'allowed',
    bypassed: false,
    isDuplicate: false,
    suppressDuplicates: true
  });
});

test('importance below the configured threshold stays silent', () => {
  const result = resolveNotificationSound({
    notification: notification('normal'),
    policy: { enabled: true, minImportance: 'high' }
  });

  assert.equal(result.play, false);
  assert.equal(result.reason, 'below-threshold');
});

test('quiet mode suppresses ordinary notifications', () => {
  const result = resolveNotificationSound({
    notification: notification('normal'),
    policy: { enabled: true, quietMode: true }
  });

  assert.equal(result.play, false);
  assert.equal(result.reason, 'quiet-mode');
  assert.equal(result.bypassed, false);
});

test('duplicate notifications are silent by default', () => {
  const result = resolveNotificationSound({
    notification: notification('high'),
    policy: { enabled: true },
    context: { isDuplicate: true }
  });

  assert.equal(result.play, false);
  assert.equal(result.reason, 'duplicate-suppressed');
  assert.equal(result.isDuplicate, true);
});

test('critical notification can bypass quiet mode and duplicate suppression', () => {
  const result = resolveNotificationSound({
    notification: notification('critical'),
    policy: { enabled: true, cue: 'critical', quietMode: true },
    context: { isDuplicate: true }
  });

  assert.equal(result.play, true);
  assert.equal(result.reason, 'allowed');
  assert.equal(result.bypassed, true);
});

test('critical notification cannot bypass global sound disablement', () => {
  const result = resolveNotificationSound({
    notification: notification('critical'),
    policy: { enabled: true },
    context: { globalEnabled: false }
  });

  assert.equal(result.play, false);
  assert.equal(result.reason, 'global-disabled');
  assert.equal(result.bypassed, false);
});

test('critical notification cannot bypass the importance threshold', () => {
  const result = resolveNotificationSound({
    notification: notification('critical'),
    policy: { enabled: true, minImportance: 'critical' }
  });

  assert.equal(result.play, true);

  const belowThreshold = resolveNotificationSound({
    notification: notification('high'),
    policy: { enabled: true, minImportance: 'critical', quietMode: true },
    context: { isDuplicate: true }
  });
  assert.equal(belowThreshold.play, false);
  assert.equal(belowThreshold.reason, 'below-threshold');
});

test('policy can disable duplicate suppression for ordinary notifications', () => {
  const result = resolveNotificationSound({
    notification: notification('normal'),
    policy: { enabled: true, suppressDuplicates: false },
    context: { isDuplicate: true }
  });

  assert.equal(result.play, true);
  assert.equal(result.reason, 'allowed');
});

test('invalid inputs return stable validation errors', () => {
  assert.throws(
    () => resolveNotificationSound({ notification: notification('urgent') }),
    (error) => error.code === 'SOUND_POLICY_IMPORTANCE_INVALID'
  );
  assert.throws(
    () => resolveNotificationSound({ notification: notification(), policy: { volume: 1.1 } }),
    (error) => error.code === 'SOUND_POLICY_VOLUME_INVALID'
  );
  assert.throws(
    () => resolveNotificationSound({ notification: notification(), policy: { cue: '' } }),
    (error) => error.code === 'SOUND_POLICY_CUE_INVALID'
  );
  assert.throws(
    () => resolveNotificationSound({ notification: notification(), context: { isDuplicate: 'yes' } }),
    (error) => error.code === 'SOUND_POLICY_CONTEXT_INVALID'
  );
  assert.throws(
    () => resolveNotificationSound({ notification: null }),
    (error) => error.code === 'SOUND_POLICY_NOTIFICATION_INVALID'
  );
  assert.throws(
    () => validateSoundPolicy(null),
    (error) => error.code === 'SOUND_POLICY_POLICY_INVALID'
  );
  assert.throws(
    () => validateSoundPolicyContext(null),
    (error) => error.code === 'SOUND_POLICY_CONTEXT_INVALID'
  );
});

test('sound decision does not mutate inputs and freezes output', () => {
  const input = {
    notification: notification('high'),
    policy: { enabled: true, cue: 'default' },
    context: { isDuplicate: false }
  };
  const snapshot = structuredClone(input);
  const result = resolveNotificationSound(input);

  assert.deepEqual(input, snapshot);
  assert.equal(Object.isFrozen(result), true);
  assert.throws(() => { result.play = false; }, TypeError);
});
