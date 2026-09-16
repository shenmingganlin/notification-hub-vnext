import assert from 'node:assert/strict';
import test from 'node:test';
import { createCardProperties, createCardSkin, createCardEffect, PROPERTIES_DEFAULTS, SKIN_DEFAULTS, EFFECT_DEFAULTS } from '../../plugin/domain/card-visual-settings.js';

test('createCardProperties returns stable defaults and is deeply frozen', () => {
  const props = createCardProperties();
  assert.deepEqual(props, PROPERTIES_DEFAULTS);
  assert.equal(Object.isFrozen(props), true);
  assert.equal(Object.isFrozen(props.space), true);
  assert.equal(Object.isFrozen(props.shape), true);
  assert.equal(Object.isFrozen(props.typography), true);
  assert.equal(Object.isFrozen(props.lifecycle), true);
  assert.equal(Object.isFrozen(props.interaction), true);
  assert.equal(Object.isFrozen(props.resource), true);
});

test('createCardProperties accepts partial overrides', () => {
  const props = createCardProperties({
    space: { size: 'large', gap: 16 },
    shape: { borderRadius: 24, opacity: 0.9 },
    lifecycle: { durationMs: 15000 }
  });
  assert.equal(props.space.size, 'large');
  assert.equal(props.space.gap, 16);
  assert.equal(props.space.anchor, 'bottom-right'); // default
  assert.equal(props.shape.borderRadius, 24);
  assert.equal(props.shape.opacity, 0.9);
  assert.equal(createCardProperties({ shape: { opacity: 0 } }).shape.opacity, 0);
  assert.equal(props.lifecycle.durationMs, 15000);
  assert.equal(props.lifecycle.enterDurationMs, 260); // default
});

test('createCardProperties rejects invalid values', () => {
  assert.throws(() => createCardProperties({ space: { size: 'xlarge' } }), (e) => e.code === 'CARD_VISUAL_PROPERTY_INVALID');
  assert.throws(() => createCardProperties({ space: { gap: -1 } }), (e) => e.code === 'CARD_VISUAL_FIELD_INVALID');
  assert.throws(() => createCardProperties({ shape: { opacity: 2 } }), (e) => e.code === 'CARD_VISUAL_FIELD_INVALID');
  assert.throws(() => createCardProperties({ typography: { titleLines: 5 } }), (e) => e.code === 'CARD_VISUAL_FIELD_INVALID');
  assert.throws(() => createCardProperties({ lifecycle: { durationMs: 100 } }), (e) => e.code === 'CARD_VISUAL_FIELD_INVALID');
  assert.throws(() => createCardProperties({ interaction: { dismissMode: 'swipe' } }), (e) => e.code === 'CARD_VISUAL_PROPERTY_INVALID');
  assert.throws(() => createCardProperties({ interaction: { autoDismiss: 'maybe' } }), (e) => e.code === 'CARD_VISUAL_PROPERTY_INVALID');
  assert.throws(() => createCardProperties({ interaction: { timeoutMs: 120001 } }), (e) => e.code === 'CARD_VISUAL_FIELD_INVALID');
  assert.throws(() => createCardProperties({ lifecycle: { holdDurationMs: 120001 } }), (e) => e.code === 'CARD_VISUAL_FIELD_INVALID');
  assert.throws(() => createCardProperties({ resource: { maxVisible: 200 } }), (e) => e.code === 'CARD_VISUAL_FIELD_INVALID');
  assert.equal(createCardProperties({ interaction: { autoDismiss: 'on', timeoutMs: 120000 } }).interaction.autoDismiss, 'on');
  assert.equal(createCardProperties({ lifecycle: { holdDurationMs: 120000 } }).lifecycle.holdDurationMs, 120000);
  assert.equal(createCardProperties().interaction.autoDismiss, 'off');
  assert.throws(() => createCardProperties({ unknown: {} }), (e) => e.code === 'CARD_VISUAL_FIELD_UNKNOWN');
});

test('createCardSkin returns stable defaults', () => {
  const skin = createCardSkin();
  assert.deepEqual(skin, SKIN_DEFAULTS);
  assert.equal(Object.isFrozen(skin), true);
  assert.equal(Object.isFrozen(skin.semanticColors), true);
  assert.equal(Object.isFrozen(skin.background), true);
  assert.equal(Object.isFrozen(skin.decoration), true);
});

test('createCardSkin accepts partial overrides', () => {
  const skin = createCardSkin({
    skinName: '暗色主题',
    semanticColors: { title: '#FFFFFF', body: '#CCCCCC' },
    background: { color: '#1a1a1a' },
    decoration: { borderRadius: 8, opacity: 0.85 }
  });
  assert.equal(skin.skinId, 'skin.default');
  assert.equal(skin.skinName, '暗色主题');
  assert.equal(skin.semanticColors.title, '#FFFFFF');
  assert.equal(skin.semanticColors.body, '#CCCCCC');
  assert.equal(skin.semanticColors.assistantName, '#62D0A8'); // default
  assert.equal(skin.background.color, '#1a1a1a');
  assert.equal(skin.decoration.borderRadius, 8);
  assert.equal(skin.decoration.opacity, 0.85);
  assert.equal(createCardSkin({ decoration: { opacity: 0 } }).decoration.opacity, 0);
});

test('createCardSkin rejects invalid values', () => {
  assert.throws(() => createCardSkin({ semanticColors: { title: 'white' } }), (e) => e.code === 'CARD_VISUAL_COLOR_INVALID');
  assert.throws(() => createCardSkin({ background: { color: 'red' } }), (e) => e.code === 'CARD_VISUAL_COLOR_INVALID');
  assert.equal(createCardSkin({ decoration: { borderRadius: 60 } }).decoration.borderRadius, 60);
  assert.throws(() => createCardSkin({ decoration: { borderRadius: 481 } }), (e) => e.code === 'CARD_VISUAL_FIELD_INVALID');
  assert.throws(() => createCardSkin({ decoration: { opacity: 1.1 } }), (e) => e.code === 'CARD_VISUAL_FIELD_INVALID');
  assert.throws(() => createCardSkin({ decoration: { density: 'ultra' } }), (e) => e.code === 'CARD_VISUAL_SKIN_INVALID');
  assert.throws(() => createCardSkin({ unknown: 'x' }), (e) => e.code === 'CARD_VISUAL_FIELD_UNKNOWN');
});

test('createCardEffect returns stable defaults', () => {
  const effect = createCardEffect();
  assert.deepEqual(effect, EFFECT_DEFAULTS);
  assert.equal(Object.isFrozen(effect), true);
  assert.equal(Object.isFrozen(effect.slots), true);
  assert.equal(Object.isFrozen(effect.slots.enter), true);
  assert.equal(Object.isFrozen(effect.slots.exitParticles), true);
});

test('createCardEffect accepts partial overrides', () => {
  const effect = createCardEffect({
    effectConfigId: 'effect.soft',
    slots: {
      enter: { effectId: 'scale', durationMs: 400 },
      exitParticles: { enabled: true, maxParticles: 30 }
    }
  });
  assert.equal(effect.effectConfigId, 'effect.soft');
  assert.equal(effect.slots.enter.effectId, 'scale');
  assert.equal(effect.slots.enter.durationMs, 400);
  assert.equal(effect.slots.exitParticles.maxParticles, 30);
  assert.equal(effect.slots.enter.enabled, true);
  assert.equal(effect.slots.enterParticles.enabled, true); // default
});

test('createCardEffect rejects invalid values', () => {
  assert.throws(() => createCardEffect({ slots: { enter: { effectId: 'explode' } } }), (e) => e.code === 'CARD_VISUAL_EFFECT_INVALID');
  assert.throws(() => createCardEffect({ slots: { enter: { durationMs: 20000 } } }), (e) => e.code === 'CARD_VISUAL_FIELD_INVALID');
  assert.throws(() => createCardEffect({ slots: { enter: { maxParticles: 1000 } } }), (e) => e.code === 'CARD_VISUAL_FIELD_INVALID');
  assert.throws(() => createCardEffect({ slots: { unknown: {} } }), (e) => e.code === 'CARD_VISUAL_FIELD_UNKNOWN');
  assert.throws(() => createCardEffect({ effectConfigId: 'bad id!' }), (e) => e.code === 'CARD_VISUAL_FIELD_INVALID');
});