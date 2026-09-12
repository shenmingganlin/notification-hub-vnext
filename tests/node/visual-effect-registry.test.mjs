import assert from 'node:assert/strict';
import test from 'node:test';
import { createEffectRegistry, EFFECT_REGISTRY_DEFAULTS } from '../../plugin/domain/visual-effect-registry.js';
import { EFFECT_DEFAULTS } from '../../plugin/domain/card-visual-settings.js';

test('effect registry has default effect config', () => {
  const registry = createEffectRegistry();
  assert.equal(registry.has('effect.none'), true);
  const effect = registry.get('effect.none');
  assert.equal(effect.effectConfigId, 'effect.none');
  assert.equal(effect.slots.enter.effectId, 'fade');
});

test('effect registry registers and retrieves custom configs', () => {
  const registry = createEffectRegistry();
  const registered = registry.register('effect.soft', {
    slots: {
      enter: { effectId: 'fade', durationMs: 400 },
      exit: { effectId: 'fade', durationMs: 300 },
      exitParticles: { enabled: true, maxParticles: 24 }
    }
  });
  assert.equal(registered.effectConfigId, 'effect.soft');
  assert.equal(registered.slots.enter.durationMs, 400);
  const retrieved = registry.get('effect.soft');
  assert.equal(retrieved.slots.exitParticles.maxParticles, 24);
});

test('effect registry removes custom configs but protects default', () => {
  const registry = createEffectRegistry();
  registry.register('effect.custom', { slots: { enter: { effectId: 'scale' } } });
  const removed = registry.remove('effect.custom');
  assert.equal(removed.slots.enter.effectId, 'scale');
  assert.equal(registry.has('effect.custom'), false);
  assert.throws(() => registry.remove('effect.none'), (e) => e.code === 'VISUAL_EFFECT_DEFAULT_PROTECTED');
  assert.throws(() => registry.remove('effect.nonexistent'), (e) => e.code === 'VISUAL_EFFECT_NOT_FOUND');
});

test('effect registry lists all configs', () => {
  const registry = createEffectRegistry({ 'effect.custom': { slots: { enter: { effectId: 'scale' } } } });
  const list = registry.list();
  assert.ok(list.length >= 2);
  assert.ok(list.some((e) => e.id === 'effect.custom'));
  assert.ok(list.some((e) => e.id === 'effect.none'));
});

test('effect registry snapshot and restore round-trip', () => {
  const registry = createEffectRegistry({ 'effect.custom': { slots: { enter: { durationMs: 500 } } } });
  const snapshot = registry.snapshot();
  assert.ok(snapshot['effect.custom']);
  assert.equal(snapshot['effect.custom'].slots.enter.durationMs, 500);
  const registry2 = createEffectRegistry();
  registry2.restore(snapshot);
  assert.equal(registry2.has('effect.custom'), true);
  assert.equal(registry2.get('effect.custom').slots.enter.durationMs, 500);
  assert.equal(registry2.has('effect.none'), true);
});

test('effect registry get returns default for empty and null', () => {
  const registry = createEffectRegistry();
  assert.equal(registry.get('effect.nonexistent'), null);
  assert.equal(registry.get(''), null);
  assert.notEqual(registry.get(null), null);
  assert.equal(registry.get(null).effectConfigId, 'effect.none');
});

test('effect registry rejects invalid effect data', () => {
  const registry = createEffectRegistry();
  assert.throws(() => registry.register('bad id!', {}), (e) => e.code === 'VISUAL_EFFECT_ID_INVALID');
  assert.throws(() => registry.register('effect.custom', 'not-a-plain-object'), (e) => e.code === 'VISUAL_EFFECT_INVALID');
  assert.throws(() => registry.register('effect.custom', { slots: { enter: { effectId: 'explode' } } }), (e) => e.code === 'CARD_VISUAL_EFFECT_INVALID');
});

test('EFFECT_REGISTRY_DEFAULTS has default effect', () => {
  assert.equal(EFFECT_REGISTRY_DEFAULTS.has('effect.none'), true);
});