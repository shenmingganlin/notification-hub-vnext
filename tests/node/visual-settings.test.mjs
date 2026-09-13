import assert from 'node:assert/strict';
import test from 'node:test';
import { createVisualProfile, createVisualSettings, VISUAL_PRESETS, VALID_DEFAULT_MODES } from '../../plugin/domain/visual-settings.js';

test('visual profile provides independent global and category presets', () => {
  const profile = createVisualProfile({ global: { preset: 'soft', intensity: 'expressive' }, categories: { error: { preset: 'critical', enabled: false } } });
  assert.deepEqual(VISUAL_PRESETS, ['minimal', 'soft', 'accent', 'warning', 'critical']);
  assert.equal(profile.global.preset, 'soft');
  assert.equal(profile.categories.error.preset, 'critical');
  assert.equal(profile.categories.error.enabled, false);
  assert.equal(profile.categories.chat.preset, 'minimal');
  assert.equal(Object.isFrozen(profile), true);
  assert.equal(Object.isFrozen(profile.categories.error), true);
});

test('visual profile strategies accept event bindings and controlled card overrides', () => {
  const profile = createVisualProfile({
    visualProfiles: {
      'visual.tool.success': {
        preset: 'accent',
        intensity: 'expressive',
        card: { types: { minimal: { appearance: { size: 'large' } } } }
      }
    }
  });
  assert.equal(profile.visualProfiles['visual.tool.success'].preset, 'accent');
  assert.equal(profile.visualProfiles['visual.tool.success'].intensity, 'expressive');
  assert.equal(profile.visualProfiles['visual.tool.success'].card.types.minimal.appearance.size, 'large');
  assert.ok(Object.isFrozen(profile.visualProfiles));
  assert.ok(Object.isFrozen(profile.visualProfiles['visual.tool.success']));
});

test('visual profile strategies reject unsafe ids and arbitrary fields', () => {
  assert.throws(() => createVisualProfile({ visualProfiles: { '../bad': { preset: 'soft' } } }), (error) => error.code === 'VISUAL_PROFILE_ID_INVALID');
  assert.throws(() => createVisualProfile({ visualProfiles: { 'visual.bad': { css: 'body{}' } } }), (error) => error.code === 'VISUAL_PROFILE_FIELD_UNKNOWN');
});

test('visual settings reject arbitrary styling fields and invalid presets', () => {
  assert.throws(() => createVisualSettings({ profile: { global: { css: 'body{}' } } }), (error) => error.code === 'VISUAL_PROFILE_FIELD_UNKNOWN');
  assert.throws(() => createVisualProfile({ global: { preset: 'custom-css' } }), (error) => error.code === 'VISUAL_PROFILE_PRESET_INVALID');
});

test('visual profile defaultMode is off, stack or ticker and migrates minimal', () => {
  assert.deepEqual(VALID_DEFAULT_MODES, ['off', 'stack', 'ticker']);
  assert.equal(createVisualProfile().global.defaultMode, 'off');
  assert.equal(createVisualProfile({ global: { defaultMode: 'stack' } }).global.defaultMode, 'stack');
  assert.equal(createVisualProfile({ global: { defaultMode: 'ticker' } }).global.defaultMode, 'ticker');
  assert.equal(createVisualProfile({ global: { defaultMode: 'minimal' } }).global.defaultMode, 'stack');
  assert.throws(() => createVisualProfile({ global: { defaultMode: 'popup' } }), (error) => error.code === 'VISUAL_PROFILE_FIELD_INVALID');
});
