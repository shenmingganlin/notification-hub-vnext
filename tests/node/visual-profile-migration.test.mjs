import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateVisualProfile, migrateVisualProfileV1ToV2 } from '../../plugin/domain/visual-profile-migration.js';
import { createVisualProfile, VISUAL_PROFILE_VERSION } from '../../plugin/domain/visual-settings.js';
import { VisualSettingsStore } from '../../plugin/domain/visual-settings-store.js';

const legacyMinimal = () => ({
  version: 1,
  card: {
    activeType: 'minimal',
    types: { minimal: { behavior: { layout: 'simple', boundary: 'work-area' }, appearance: { size: 'medium' } } }
  }
});

const legacyDanmaku = () => ({
  version: 1,
  card: {
    activeType: 'danmaku',
    types: {
      minimal: { behavior: { layout: 'simple' }, appearance: { size: 'medium' } },
      danmaku: { behavior: { layout: 'simple', anchor: 'top-right' }, appearance: { size: 'small', width: 520, height: 96 } }
    }
  }
});

test('v1 minimal profile upgrades to content-structure minimal with default stack behavior', () => {
  const { profile, migrated } = migrateVisualProfileV1ToV2(legacyMinimal());
  assert.equal(migrated, true);
  assert.equal(profile.version, 2);
  assert.equal(profile.behaviorId, 'stack');
  assert.equal(profile.card.activeType, 'minimal');
  assert.equal('behavior' in profile.card.types.minimal, false);
});

test('v1 danmaku mode becomes minimal card type plus ticker behavior', () => {
  const { profile } = migrateVisualProfileV1ToV2(legacyDanmaku());
  assert.equal(profile.behaviorId, 'ticker');
  assert.equal(profile.card.activeType, 'minimal');
  // 旧模式自己的外观被搬到唯一内容结构种类下。
  assert.equal(profile.card.types.minimal.appearance.size, 'small');
  assert.equal(profile.card.types.minimal.appearance.width, 520);
  assert.equal('danmaku' in profile.card.types, false);
  assert.equal('behavior' in profile.card.types.minimal, false);
});

test('v1 popup mode becomes minimal card type plus popup behavior', () => {
  const { profile } = migrateVisualProfileV1ToV2({ version: 1, card: { activeType: 'popup', types: { popup: { appearance: { size: 'large' }, behavior: { layout: 'simple' } } } } });
  assert.equal(profile.behaviorId, 'popup');
  assert.equal(profile.card.activeType, 'minimal');
  assert.equal(profile.card.types.minimal.appearance.size, 'large');
});

test('migration preserves nested visualProfiles card configs', () => {
  const { profile } = migrateVisualProfileV1ToV2({
    version: 1,
    card: { activeType: 'minimal' },
    visualProfiles: { 'visual.tool.success': { preset: 'accent', card: { activeType: 'danmaku', types: { danmaku: { appearance: { size: 'small' } } } } } }
  });
  assert.equal(profile.visualProfiles['visual.tool.success'].card.activeType, 'minimal');
  assert.equal(profile.visualProfiles['visual.tool.success'].card.types.minimal.appearance.size, 'small');
});

test('migration is idempotent and passes through current-version input unchanged', () => {
  const v2 = { version: 2, behaviorId: 'stack', card: { activeType: 'minimal', types: {} } };
  const result = migrateVisualProfile(v2);
  assert.equal(result.migrated, false);
  assert.deepEqual(result.profile, v2);
});

test('createVisualProfile accepts legacy v1 input and normalizes it to v2', () => {
  const profile = createVisualProfile(legacyDanmaku());
  assert.equal(profile.version, VISUAL_PROFILE_VERSION);
  assert.equal(profile.version, 2);
  assert.equal(profile.behaviorId, 'ticker');
  assert.equal(profile.card.activeType, 'minimal');
  assert.equal('behavior' in profile.card.types.minimal, false);
});

test('createVisualProfile exports behaviorId on fresh profiles and rejects unknown behaviors', () => {
  assert.equal(createVisualProfile({}).behaviorId, 'stack');
  assert.throws(() => createVisualProfile({ behaviorId: 'nope' }), (error) => error.code === 'VISUAL_PROFILE_BEHAVIOR_INVALID');
});

test('VisualSettingsStore restores a v1 snapshot by migrating its profile to v2', () => {
  const store = new VisualSettingsStore();
  const restored = store.restoreSnapshot({
    version: 1,
    revision: 3,
    updatedAt: new Date().toISOString(),
    settings: { profile: legacyDanmaku() }
  });
  assert.equal(restored.settings.profile.version, 2);
  assert.equal(restored.settings.profile.behaviorId, 'ticker');
  assert.equal(restored.settings.profile.card.activeType, 'minimal');
  assert.equal('behavior' in restored.settings.profile.card.types.minimal, false);
});
