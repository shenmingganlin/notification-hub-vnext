import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NOTIFICATION_PROFILE_DEFAULTS,
  NOTIFICATION_PROFILE_FIELDS,
  createNotificationProfile,
  validateNotificationProfile
} from '../../plugin/domain/notification-profile.js';

test('NotificationProfile fills defaults and deep-freezes the result', () => {
  const profile = createNotificationProfile();

  assert.equal(profile.id, 'default');
  assert.equal(profile.parentId, null);
  assert.equal(profile.enabled, true);
  assert.equal(profile.importance, 'normal');
  assert.equal(profile.displayMode, 'card');
  assert.deepEqual(profile.soundPolicy, { enabled: false, cue: 'default', suppressDuplicates: true });
  assert.deepEqual(profile.contentPolicy, { mode: 'full', maxLength: 4000 });
  assert.deepEqual(profile.historyPolicy, { save: true, maxAgeMs: null });
  assert.deepEqual(profile.runtimeHints, { layout: 'stack', lifetimeMs: 120000 });
  assert.deepEqual(profile.importanceKeywords, { keywords: [] });
  assert.deepEqual(profile, NOTIFICATION_PROFILE_DEFAULTS);
  assert.deepEqual(NOTIFICATION_PROFILE_FIELDS, [
    'id', 'parentId', 'enabled', 'importance', 'displayMode',
    'soundPolicy', 'contentPolicy', 'historyPolicy', 'runtimeHints', 'importanceKeywords'
  ]);
  assert.ok(Object.isFrozen(profile));
  assert.ok(Object.isFrozen(profile.soundPolicy));
  assert.throws(() => { profile.runtimeHints.layout = 'fixed'; }, TypeError);
});

test('NotificationProfile merges partial nested overrides without mutating input', () => {
  const input = {
    id: 'important',
    parentId: 'default',
    enabled: false,
    importance: 'critical',
    soundPolicy: { enabled: true },
    contentPolicy: { mode: 'summary' },
    historyPolicy: { maxAgeMs: 60_000 },
    runtimeHints: { layout: 'shelf' }
  };
  const profile = createNotificationProfile(input);

  assert.equal(profile.id, 'important');
  assert.equal(profile.parentId, 'default');
  assert.equal(profile.enabled, false);
  assert.equal(profile.importance, 'critical');
  assert.deepEqual(profile.soundPolicy, { enabled: true, cue: 'default', suppressDuplicates: true });
  assert.deepEqual(profile.contentPolicy, { mode: 'summary', maxLength: 4000 });
  assert.deepEqual(profile.historyPolicy, { save: true, maxAgeMs: 60_000 });
  assert.deepEqual(profile.runtimeHints, { layout: 'shelf', lifetimeMs: 120000 });
  input.soundPolicy.enabled = false;
  assert.equal(profile.soundPolicy.enabled, true);
});

test('NotificationProfile accepts a parentless custom profile and validates frozen profiles', () => {
  const profile = createNotificationProfile({ id: 'silent', displayMode: 'silent' });
  assert.equal(validateNotificationProfile(profile), true);
  assert.equal(profile.displayMode, 'silent');
});

test('NotificationProfile accepts normalized importance keywords', () => {
  const profile = createNotificationProfile({ id: 'keyword-profile', importanceKeywords: { keywords: ['验证码', ' 授权码 '] } });
  assert.deepEqual(profile.importanceKeywords, { keywords: ['验证码', '授权码'] });
});

test('NotificationProfile rejects unknown fields, invalid values, and invalid nested shapes', () => {
  const cases = [
    [{ unknown: true }, 'NOTIFICATION_PROFILE_FIELD_UNKNOWN', 'unknown'],
    [{ id: '' }, 'NOTIFICATION_PROFILE_ID_INVALID', 'id'],
    [{ parentId: '' }, 'NOTIFICATION_PROFILE_ID_INVALID', 'parentId'],
    [{ enabled: 'yes' }, 'NOTIFICATION_PROFILE_FIELD_INVALID', 'enabled'],
    [{ importance: 'urgent' }, 'NOTIFICATION_PROFILE_FIELD_INVALID', 'importance'],
    [{ displayMode: 'popup' }, 'NOTIFICATION_PROFILE_FIELD_INVALID', 'displayMode'],
    [{ soundPolicy: [] }, 'NOTIFICATION_PROFILE_FIELD_INVALID', 'soundPolicy'],
    [{ soundPolicy: { enabled: 'yes' } }, 'NOTIFICATION_PROFILE_FIELD_INVALID', 'soundPolicy.enabled'],
    [{ soundPolicy: { suppressDuplicates: 'yes' } }, 'NOTIFICATION_PROFILE_FIELD_INVALID', 'soundPolicy.suppressDuplicates'],
    [{ soundPolicy: { cue: '' } }, 'NOTIFICATION_PROFILE_FIELD_INVALID', 'soundPolicy.cue'],
    [{ contentPolicy: { mode: 'raw' } }, 'NOTIFICATION_PROFILE_FIELD_INVALID', 'contentPolicy.mode'],
    [{ contentPolicy: { maxLength: 0 } }, 'NOTIFICATION_PROFILE_FIELD_INVALID', 'contentPolicy.maxLength'],
    [{ historyPolicy: { maxAgeMs: -1 } }, 'NOTIFICATION_PROFILE_FIELD_INVALID', 'historyPolicy.maxAgeMs'],
    [{ runtimeHints: { layout: 'freeform' } }, 'NOTIFICATION_PROFILE_FIELD_INVALID', 'runtimeHints.layout'],
    [{ runtimeHints: { lifetimeMs: 0 } }, 'NOTIFICATION_PROFILE_FIELD_INVALID', 'runtimeHints.lifetimeMs']
  ];

  for (const [input, code, field] of cases) {
    assert.throws(
      () => createNotificationProfile(input),
      (error) => error.code === code && error.details.field === field
    );
  }
});

test('NotificationProfile rejects non-plain profiles and duplicate IDs are handled by callers', () => {
  assert.throws(
    () => createNotificationProfile([]),
    (error) => error.code === 'NOTIFICATION_PROFILE_INVALID'
  );
  assert.throws(
    () => validateNotificationProfile(null),
    (error) => error.code === 'NOTIFICATION_PROFILE_INVALID'
  );
});
