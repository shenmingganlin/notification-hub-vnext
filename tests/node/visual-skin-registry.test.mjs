import assert from 'node:assert/strict';
import test from 'node:test';
import { createSkinRegistry, SKIN_REGISTRY_DEFAULTS } from '../../plugin/domain/visual-skin-registry.js';
import { SKIN_DEFAULTS } from '../../plugin/domain/card-visual-settings.js';

test('skin registry has default skin', () => {
  const registry = createSkinRegistry();
  assert.equal(registry.has('skin.default'), true);
  const skin = registry.get('skin.default');
  assert.equal(skin.skinName, '默认');
  assert.equal(skin.skinId, 'skin.default');
});

test('skin registry registers and retrieves custom skins', () => {
  const registry = createSkinRegistry();
  const registered = registry.register('skin.dark', {
    skinName: '暗色主题',
    semanticColors: { title: '#FFFFFF', body: '#CCCCCC', assistantName: '#62D0A8', metadata: '#888888', status: '#FFD700' },
    background: { color: '#1a1a1a' },
    decoration: { borderRadius: 8, opacity: 0.85 }
  });
  assert.equal(registered.skinName, '暗色主题');
  assert.equal(registered.skinId, 'skin.dark');
  const retrieved = registry.get('skin.dark');
  assert.equal(retrieved.skinName, '暗色主题');
});

test('skin registry removes custom skins but protects default', () => {
  const registry = createSkinRegistry();
  registry.register('skin.custom', { skinName: 'Custom' });
  const removed = registry.remove('skin.custom');
  assert.equal(removed.skinName, 'Custom');
  assert.equal(registry.has('skin.custom'), false);
  assert.throws(() => registry.remove('skin.default'), (e) => e.code === 'VISUAL_SKIN_DEFAULT_PROTECTED');
  assert.throws(() => registry.remove('skin.nonexistent'), (e) => e.code === 'VISUAL_SKIN_NOT_FOUND');
});

test('skin registry lists all skins', () => {
  const registry = createSkinRegistry({ 'skin.custom': { skinName: 'Custom' } });
  const list = registry.list();
  assert.ok(list.length >= 2);
  assert.ok(list.some((s) => s.id === 'skin.custom'));
  assert.ok(list.some((s) => s.id === 'skin.default'));
});

test('skin registry snapshot and restore round-trip', () => {
  const registry = createSkinRegistry({ 'skin.custom': { skinName: 'Custom', background: { color: '#123456' } } });
  const snapshot = registry.snapshot();
  assert.ok(snapshot['skin.custom']);
  assert.equal(snapshot['skin.custom'].skinName, 'Custom');
  const registry2 = createSkinRegistry();
  registry2.restore(snapshot);
  assert.equal(registry2.has('skin.custom'), true);
  assert.equal(registry2.get('skin.custom').background.color, '#123456');
  assert.equal(registry2.has('skin.default'), true);
});

test('skin registry get returns null for unknown', () => {
  const registry = createSkinRegistry();
  assert.equal(registry.get('skin.nonexistent'), null);
  assert.equal(registry.get(''), null);
  assert.notEqual(registry.get(null), null);
  assert.equal(registry.get(null).skinId, 'skin.default');
});

test('skin registry rejects invalid skin data', () => {
  const registry = createSkinRegistry();
  assert.throws(() => registry.register('bad id!', {}), (e) => e.code === 'VISUAL_SKIN_ID_INVALID');
  assert.throws(() => registry.register('skin.custom', 'not-a-plain-object'), (e) => e.code === 'VISUAL_SKIN_INVALID');
  assert.throws(() => registry.register('skin.custom', { decoration: { borderRadius: 481 } }), (e) => e.code === 'CARD_VISUAL_FIELD_INVALID');
});

test('SKIN_REGISTRY_DEFAULTS has default skin', () => {
  assert.equal(SKIN_REGISTRY_DEFAULTS.has('skin.default'), true);
});