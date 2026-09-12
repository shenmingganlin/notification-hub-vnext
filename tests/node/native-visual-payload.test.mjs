import assert from 'node:assert/strict';
import test from 'node:test';

import { projectNativeVisualPayload } from '../../plugin/domain/native-visual-payload.js';

test('native visual payload projects rich settings into the strict scene contract', () => {
  const result = projectNativeVisualPayload({
    enabled: true,
    preset: 'warning',
    intensity: 'expressive',
    category: 'error',
    cardType: 'minimal',
    behavior: { layout: 'simple', boundary: 'work-area', anchor: 'top-right', gap: 20, margin: 24 },
    appearance: {
      size: 'large',
      aspectRatio: 'wide',
      width: 600,
      height: 300,
      backgroundColor: '#123456',
      backgroundAssetId: null,
      backgroundFit: 'cover',
      backgroundPadding: 8,
      borderRadius: 24,
      opacity: 0.82
    }
  });

  assert.deepEqual(result, {
    enabled: true,
    preset: 'warning',
    intensity: 'expressive',
    category: 'error',
    cardType: 'minimal',
    behavior: { layout: 'simple', boundary: 'work-area' },
    interaction: { dismissMode: 'closeButton', closeButtonPosition: 'top-right', timeoutMs: 30000 },
    appearance: {
      size: 'large',
      aspectRatio: 'wide',
      backgroundColor: '#123456',
      backgroundFit: 'cover',
      backgroundPadding: 8,
      borderRadius: 24,
      opacity: 0.82
    }
  });
});

test('native visual payload preserves implemented card types and rejects unknown types', () => {
  assert.equal(projectNativeVisualPayload({ cardType: 'danmaku' }).cardType, 'danmaku');
  assert.equal(projectNativeVisualPayload({ cardType: 'popup' }).cardType, 'popup');
  assert.throws(() => projectNativeVisualPayload({ cardType: 'future' }), (error) => error.code === 'NATIVE_VISUAL_CARD_TYPE_INVALID');
});

test('native visual payload omits empty background assets instead of sending null', () => {
  const result = projectNativeVisualPayload({ appearance: { backgroundAssetId: null } });
  assert.equal('backgroundAssetId' in result.appearance, false);
});

test('native visual payload falls back for categories outside the Native visual enum', () => {
  const result = projectNativeVisualPayload({ category: 'session' });
  assert.equal(result.category, null);
});
