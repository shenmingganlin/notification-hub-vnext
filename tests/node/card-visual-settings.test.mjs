import assert from 'node:assert/strict';
import test from 'node:test';
import { CARD_ASPECT_RATIOS, CARD_SIZES, createCardVisualSettings } from '../../plugin/domain/card-visual-settings.js';

test('minimal card visual settings have stable defaults and are deeply frozen', () => {
  const settings = createCardVisualSettings();
  assert.equal(settings.activeType, 'minimal');
  assert.deepEqual(CARD_SIZES, ['small', 'medium', 'large']);
  assert.deepEqual(CARD_ASPECT_RATIOS, ['default', 'square', 'wide']);
  assert.deepEqual(settings.types.minimal, {
    behavior: { layout: 'simple', boundary: 'work-area' },
    appearance: { size: 'medium', aspectRatio: 'default', backgroundColor: '#0e1916', borderRadius: 16, opacity: 0.96 }
  });
  assert.equal(Object.isFrozen(settings.types.minimal.appearance), true);
});

test('minimal card settings accept controlled behavior and appearance fields', () => {
  const settings = createCardVisualSettings({
    activeType: 'minimal',
    types: { minimal: { behavior: { layout: 'simple' }, appearance: { size: 'large', aspectRatio: 'wide', backgroundColor: '#123456', borderRadius: 24, opacity: 0.8 } } }
  });
  assert.equal(settings.types.minimal.appearance.size, 'large');
  assert.equal(settings.types.minimal.appearance.aspectRatio, 'wide');
  assert.equal(settings.types.minimal.appearance.backgroundColor, '#123456');
  assert.equal(settings.types.minimal.appearance.borderRadius, 24);
});

test('card visual settings reject arbitrary styling and unsupported types', () => {
  assert.throws(() => createCardVisualSettings({ types: { minimal: { appearance: { css: 'body{}' } } } }), (error) => error.code === 'CARD_VISUAL_FIELD_UNKNOWN');
  assert.throws(() => createCardVisualSettings({ types: { minimal: { appearance: { backgroundColor: 'red' } } } }), (error) => error.code === 'CARD_VISUAL_COLOR_INVALID');
  assert.throws(() => createCardVisualSettings({ activeType: 'danmaku' }), (error) => error.code === 'CARD_VISUAL_TYPE_NOT_IMPLEMENTED');
});
