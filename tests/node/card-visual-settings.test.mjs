import assert from 'node:assert/strict';
import test from 'node:test';
import { CARD_ASPECT_RATIOS, CARD_FITS, CARD_SIZES, createCardVisualSettings, PROPERTIES_DEFAULTS, SKIN_DEFAULTS, EFFECT_DEFAULTS } from '../../plugin/domain/card-visual-settings.js';

test('minimal card visual settings have stable defaults and are deeply frozen', () => {
  const settings = createCardVisualSettings();
  assert.equal(settings.activeType, 'minimal');
  assert.deepEqual(CARD_SIZES, ['small', 'medium', 'large']);
  assert.deepEqual(CARD_ASPECT_RATIOS, ['default', 'square', 'wide']);
  assert.deepEqual(settings.types.minimal, {
    behavior: { layout: 'simple', boundary: 'work-area' },
    appearance: { size: 'medium', aspectRatio: 'default', backgroundColor: '#0e1916', backgroundFit: 'fill', backgroundPadding: 0, borderRadius: 16, opacity: 0.96 },
    properties: PROPERTIES_DEFAULTS,
    skin: SKIN_DEFAULTS,
    effects: EFFECT_DEFAULTS
  });
  assert.equal(Object.isFrozen(settings.types.minimal.appearance), true);
  assert.equal(Object.isFrozen(settings.types.minimal.properties), true);
  assert.equal(Object.isFrozen(settings.types.minimal.skin), true);
  assert.equal(Object.isFrozen(settings.types.minimal.effects), true);
});

test('minimal card settings accept controlled behavior and appearance fields', () => {
  const settings = createCardVisualSettings({
    activeType: 'minimal',
    types: { minimal: { behavior: { layout: 'simple' }, appearance: { size: 'large', aspectRatio: 'wide', backgroundColor: '#123456', backgroundAssetId: 'visual-asset-1', backgroundFit: 'cover', backgroundPadding: 8, borderRadius: 24, opacity: 0.8 } } }
  });
  assert.equal(settings.types.minimal.appearance.size, 'large');
  assert.equal(settings.types.minimal.appearance.aspectRatio, 'wide');
  assert.equal(settings.types.minimal.appearance.backgroundColor, '#123456');
  assert.equal(settings.types.minimal.appearance.backgroundAssetId, 'visual-asset-1');
  assert.equal(settings.types.minimal.appearance.backgroundFit, 'cover');
  assert.equal(settings.types.minimal.appearance.backgroundPadding, 8);
  assert.equal(settings.types.minimal.appearance.borderRadius, 24);
});

test('minimal card settings accept and normalize backgroundFit values', () => {
  const settings = createCardVisualSettings({ types: { minimal: { appearance: { backgroundFit: 'contain' } } } });
  assert.equal(settings.types.minimal.appearance.backgroundFit, 'contain');
  assert.throws(() => createCardVisualSettings({ types: { minimal: { appearance: { backgroundFit: 'zoom' } } } }), (error) => error.code === 'CARD_VISUAL_FIT_INVALID');
});

test('minimal card settings accept and validate backgroundPadding values', () => {
  const settings = createCardVisualSettings({ types: { minimal: { appearance: { backgroundPadding: 20 } } } });
  assert.equal(settings.types.minimal.appearance.backgroundPadding, 20);
  assert.throws(() => createCardVisualSettings({ types: { minimal: { appearance: { backgroundPadding: -1 } } } }), (error) => error.code === 'CARD_VISUAL_FIELD_INVALID');
  assert.throws(() => createCardVisualSettings({ types: { minimal: { appearance: { backgroundPadding: 41 } } } }), (error) => error.code === 'CARD_VISUAL_FIELD_INVALID');
  assert.throws(() => createCardVisualSettings({ types: { minimal: { appearance: { backgroundPadding: '10' } } } }), (error) => error.code === 'CARD_VISUAL_FIELD_INVALID');
});

test('CARD_FITS exports the three fit modes', () => {
  assert.deepEqual(CARD_FITS, ['fill', 'contain', 'cover']);
});

test('minimal card settings accept bounded dimensions and layout spacing', () => {
  const settings = createCardVisualSettings({ types: { minimal: {
    behavior: { anchor: 'top-right', gap: 12, margin: 24 },
    appearance: { width: 480, height: 120 }
  } } });
  assert.deepEqual(settings.types.minimal.behavior, { layout: 'simple', boundary: 'work-area', anchor: 'top-right', gap: 12, margin: 24 });
  assert.equal(settings.types.minimal.appearance.width, 480);
  assert.equal(settings.types.minimal.appearance.height, 120);
  assert.throws(() => createCardVisualSettings({ types: { minimal: { appearance: { width: 100 } } } }), (error) => error.code === 'CARD_VISUAL_DIMENSION_INVALID');
  assert.throws(() => createCardVisualSettings({ types: { minimal: { behavior: { margin: 97 } } } }), (error) => error.code === 'CARD_VISUAL_SPACING_INVALID');
});

test('card visual settings reject arbitrary styling and unsupported types', () => {
  assert.throws(() => createCardVisualSettings({ types: { minimal: { appearance: { css: 'body{}' } } } }), (error) => error.code === 'CARD_VISUAL_FIELD_UNKNOWN');
  assert.throws(() => createCardVisualSettings({ types: { minimal: { appearance: { backgroundColor: 'red' } } } }), (error) => error.code === 'CARD_VISUAL_COLOR_INVALID');
  assert.throws(() => createCardVisualSettings({ activeType: 'unknown' }), (error) => error.code === 'CARD_VISUAL_TYPE_INVALID');
  const implemented = createCardVisualSettings({ activeType: 'danmaku' });
  assert.equal(implemented.types.danmaku.appearance.width, 520);
  assert.equal(implemented.types.danmaku.appearance.height, 96);
  assert.equal(createCardVisualSettings({ activeType: 'popup' }).types.popup.appearance.width, 500);
});
