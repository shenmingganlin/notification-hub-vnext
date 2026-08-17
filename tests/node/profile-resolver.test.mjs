import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveNotificationProfile } from '../../plugin/domain/profile-resolver.js';

const profiles = [
  {
    id: 'default',
    parentId: null,
    enabled: true,
    importance: 'normal',
    displayMode: 'card',
    soundPolicy: { enabled: false, cue: 'default', suppressDuplicates: true },
    contentPolicy: { mode: 'full', maxLength: 4000 },
    historyPolicy: { save: true, maxAgeMs: null },
    runtimeHints: { layout: 'stack', lifetimeMs: 120000 }
  },
  {
    id: 'important',
    parentId: 'default',
    importance: 'high',
    soundPolicy: { enabled: true },
    runtimeHints: { layout: 'shelf' }
  },
  {
    id: 'silent-important',
    parentId: 'important',
    displayMode: 'silent',
    contentPolicy: { mode: 'summary' }
  }
];

test('ProfileResolver merges the inheritance chain and reports field sources', () => {
  const result = resolveNotificationProfile({
    profiles,
    profileId: 'silent-important'
  });

  assert.equal(result.profile.id, 'silent-important');
  assert.equal(result.profile.parentId, 'important');
  assert.equal(result.profile.importance, 'high');
  assert.equal(result.profile.displayMode, 'silent');
  assert.deepEqual(result.profile.soundPolicy, { enabled: true, cue: 'default', suppressDuplicates: true });
  assert.deepEqual(result.profile.contentPolicy, { mode: 'summary', maxLength: 4000 });
  assert.deepEqual(result.profile.runtimeHints, { layout: 'shelf', lifetimeMs: 120000 });
  assert.deepEqual(result.chain, ['default', 'important', 'silent-important']);
  assert.equal(result.profileId, 'silent-important');
  assert.equal(result.sources.importance, 'important');
  assert.equal(result.sources.displayMode, 'silent-important');
  assert.equal(result.sources['soundPolicy.enabled'], 'important');
  assert.equal(result.sources['soundPolicy.cue'], 'default');
  assert.equal(result.sources['soundPolicy.suppressDuplicates'], 'default');
  assert.equal(result.sources['contentPolicy.mode'], 'silent-important');
  assert.equal(result.sources['contentPolicy.maxLength'], 'default');
  assert.equal(result.sources['runtimeHints.layout'], 'important');
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.profile));
  assert.ok(Object.isFrozen(result.sources));
  assert.ok(Object.isFrozen(result.chain));
});

test('ProfileResolver accepts an object map and resolves the default profile', () => {
  const result = resolveNotificationProfile({
    profiles: Object.fromEntries(profiles.map((profile) => [profile.id, profile]))
  });

  assert.equal(result.profileId, 'default');
  assert.equal(result.profile.id, 'default');
  assert.equal(result.sources.importance, 'default');
});

test('ProfileResolver rejects missing target and parent profiles', () => {
  assert.throws(
    () => resolveNotificationProfile({ profiles, profileId: 'missing' }),
    (error) => error.code === 'NOTIFICATION_PROFILE_NOT_FOUND'
      && error.details.profileId === 'missing'
  );

  assert.throws(
    () => resolveNotificationProfile({
      profiles: [{ ...profiles[0], id: 'orphan', parentId: 'missing' }],
      profileId: 'orphan'
    }),
    (error) => error.code === 'NOTIFICATION_PROFILE_PARENT_NOT_FOUND'
      && error.details.parentId === 'missing'
  );
});

test('ProfileResolver detects cycles and duplicate profile IDs', () => {
  assert.throws(
    () => resolveNotificationProfile({
      profiles: [
        { ...profiles[0], id: 'a', parentId: 'b' },
        { ...profiles[0], id: 'b', parentId: 'a' }
      ],
      profileId: 'a'
    }),
    (error) => error.code === 'NOTIFICATION_PROFILE_INHERITANCE_CYCLE'
      && error.details.profileId === 'a'
  );

  assert.throws(
    () => resolveNotificationProfile({
      profiles: [profiles[0], { ...profiles[0], id: 'default' }]
    }),
    (error) => error.code === 'NOTIFICATION_PROFILE_DUPLICATE_ID'
      && error.details.profileId === 'default'
  );
});

test('ProfileResolver preserves Profile validation errors and rejects invalid collections', () => {
  assert.throws(
    () => resolveNotificationProfile({
      profiles: [{ ...profiles[0], runtimeHints: { layout: 'unknown' } }]
    }),
    (error) => error.code === 'NOTIFICATION_PROFILE_FIELD_INVALID'
      && error.details.field === 'runtimeHints.layout'
  );

  assert.throws(
    () => resolveNotificationProfile({ profiles: 'profiles' }),
    (error) => error.code === 'NOTIFICATION_PROFILE_COLLECTION_INVALID'
  );

  assert.throws(
    () => resolveNotificationProfile({ profiles: [] }),
    (error) => error.code === 'NOTIFICATION_PROFILE_NOT_FOUND'
  );
});
