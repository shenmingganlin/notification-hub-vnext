import assert from 'node:assert/strict';
import test from 'node:test';

import { projectNativeVisualPayload, spaceToNativeStackLayout } from '../../plugin/domain/native-visual-payload.js';

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

test('native visual payload accepts content-structure card types and rejects behavior-bearing types', () => {
  assert.equal(projectNativeVisualPayload({ cardType: 'minimal' }).cardType, 'minimal');
  assert.equal(projectNativeVisualPayload({ cardType: 'message' }).cardType, 'message');
  // danmaku/popup 是出现方式，不再是被接受的卡片种类。
  assert.throws(() => projectNativeVisualPayload({ cardType: 'danmaku' }), (error) => error.code === 'NATIVE_VISUAL_CARD_TYPE_INVALID');
  assert.throws(() => projectNativeVisualPayload({ cardType: 'popup' }), (error) => error.code === 'NATIVE_VISUAL_CARD_TYPE_INVALID');
  assert.throws(() => projectNativeVisualPayload({ cardType: 'future' }), (error) => error.code === 'NATIVE_VISUAL_CARD_TYPE_INVALID');
});

test('native visual payload omits zero paint overflow and projects a real overflow', () => {
  const omitted = projectNativeVisualPayload({ appearance: { paintOverflow: 0 } });
  assert.equal('paintOverflow' in omitted.appearance, false);
  const overflowed = projectNativeVisualPayload({ appearance: { paintOverflow: 12 } });
  assert.equal(overflowed.appearance.paintOverflow, 12);
});

test('native visual payload omits zero-width border and projects a real stroke', () => {
  const omitted = projectNativeVisualPayload({ appearance: { borderWidth: 0, borderColor: '#62d0a8' } });
  assert.equal('borderWidth' in omitted.appearance, false);
  assert.equal('borderColor' in omitted.appearance, false);
  const stroked = projectNativeVisualPayload({ appearance: { borderWidth: 2, borderColor: '#62d0a8' } });
  assert.equal(stroked.appearance.borderWidth, 2);
  assert.equal(stroked.appearance.borderColor, '#62d0a8');
});

test('native visual payload omits off hover highlight and projects on as a Native bool', () => {
  const omitted = projectNativeVisualPayload({ interaction: { hoverHighlight: 'off' } });
  assert.equal('hoverHighlight' in omitted.interaction, false);
  const on = projectNativeVisualPayload({ interaction: { hoverHighlight: 'on' } });
  assert.equal(on.interaction.hoverHighlight, true);
  const tickerPass = projectNativeVisualPayload({
    interaction: { hoverHighlight: 'on' },
    ticker: { speedPxPerSec: 400, band: 'top', bandRatio: 0.28, trackCount: 3, trackGapPx: 8, minGapPx: 64, clickThrough: true, overflow: 'avoid' }
  });
  assert.equal('hoverHighlight' in tickerPass.interaction, false);
  const tickerHit = projectNativeVisualPayload({
    interaction: { hoverHighlight: 'on' },
    ticker: { speedPxPerSec: 400, band: 'top', bandRatio: 0.28, trackCount: 3, trackGapPx: 8, minGapPx: 64, clickThrough: false, overflow: 'avoid' }
  });
  assert.equal(tickerHit.interaction.hoverHighlight, true);
});

test('native visual payload omits empty background assets instead of sending null', () => {
  const result = projectNativeVisualPayload({ appearance: { backgroundAssetId: null } });
  assert.equal('backgroundAssetId' in result.appearance, false);
});

test('native visual payload omits default background transform and projects a real pan-zoom', () => {
  const omitted = projectNativeVisualPayload({
    appearance: { backgroundAssetId: 'visual-asset-1', backgroundScale: 1, backgroundX: 0.5, backgroundY: 0.5 }
  });
  assert.equal('backgroundScale' in omitted.appearance, false);
  assert.equal('backgroundX' in omitted.appearance, false);
  assert.equal('backgroundY' in omitted.appearance, false);
  const moved = projectNativeVisualPayload({
    appearance: { backgroundAssetId: 'visual-asset-1', backgroundScale: 1.5, backgroundX: 0.2, backgroundY: 0.8 }
  });
  assert.equal(moved.appearance.backgroundScale, 1.5);
  assert.equal(moved.appearance.backgroundX, 0.2);
  assert.equal(moved.appearance.backgroundY, 0.8);
  const noAsset = projectNativeVisualPayload({
    appearance: { backgroundScale: 2, backgroundX: 0, backgroundY: 1 }
  });
  assert.equal('backgroundScale' in noAsset.appearance, false);
});

test('native visual payload falls back for categories outside the Native visual enum', () => {
  const result = projectNativeVisualPayload({ category: 'session' });
  assert.equal(result.category, null);
});

test('spaceToNativeStackLayout maps top anchors up and bottom anchors down without workArea keys', () => {
  const top = spaceToNativeStackLayout({ anchor: 'top-left', gap: 12 });
  assert.deepEqual(top, { layout: 'stack', direction: 'up', wrap: 'parallel', anchor: 'top-left', spacing: 12, marginLeft: 18, marginRight: 0, marginTop: 18, marginBottom: 0, settle: 'snap' });
  assert.equal('workAreaWidth' in top, false);
  assert.equal('workAreaHeight' in top, false);
  assert.equal('dpiScale' in top, false);
  const bottom = spaceToNativeStackLayout({ anchor: 'bottom-right' });
  assert.deepEqual(bottom, { layout: 'stack', direction: 'down', wrap: 'parallel', anchor: 'bottom-right', spacing: 8, marginLeft: 0, marginRight: 18, marginTop: 0, marginBottom: 18, settle: 'snap' });
  assert.equal(spaceToNativeStackLayout({ anchor: 'bottom-right', settle: 'follow' }).settle, 'snap');
  assert.equal(spaceToNativeStackLayout({ anchor: 'top-right', gap: 0 }).direction, 'up');
  assert.equal(spaceToNativeStackLayout({ anchor: 'top-right', gap: 0 }).spacing, 0);
  assert.equal(spaceToNativeStackLayout({ anchor: 'bottom-left', gap: 24 }).direction, 'down');
  assert.equal(spaceToNativeStackLayout({ anchor: 'bottom-right', grow: 'left' }).direction, 'right');
  assert.equal(spaceToNativeStackLayout({ anchor: 'top-left', grow: 'right' }).direction, 'left');
  assert.equal(spaceToNativeStackLayout({ anchor: 'top-left', grow: 'up' }).direction, 'up');
  assert.equal(spaceToNativeStackLayout({ anchor: 'top-left', grow: 'right', wrap: 'snake' }).direction, 'right');
  assert.equal(spaceToNativeStackLayout({ anchor: 'top-left', grow: 'right', wrap: 'snake' }).wrap, 'snake');
  assert.equal(spaceToNativeStackLayout({ anchor: 'bottom-right', wrap: 'off' }).wrap, 'off');
  assert.equal(spaceToNativeStackLayout({ anchor: 'bottom-right', wrap: 'off' }).direction, 'down');
});

test('native visual payload projects autoDismiss on as a Native bool and keeps it off ticker', () => {
  const omitted = projectNativeVisualPayload({ interaction: { autoDismiss: 'off' } });
  assert.equal('autoDismiss' in omitted.interaction, false);
  const on = projectNativeVisualPayload({ interaction: { autoDismiss: 'on', timeoutMs: 120000 } });
  assert.equal(on.interaction.autoDismiss, true);
  assert.equal(on.interaction.timeoutMs, 120000);
  const ticker = projectNativeVisualPayload({
    interaction: { autoDismiss: 'on', dismissMode: 'timeout', timeoutMs: 4000 },
    ticker: { speedPxPerSec: 400, band: 'top', bandRatio: 0.28, trackCount: 3, trackGapPx: 8, minGapPx: 64, clickThrough: true, overflow: 'avoid' }
  });
  assert.equal(ticker.interaction.dismissMode, 'closeButton');
  assert.equal('autoDismiss' in ticker.interaction, false);
});

test('native visual payload keeps fill opacity 0 so the plate can be fully clear', () => {
  const zero = projectNativeVisualPayload({ appearance: { opacity: 0 } });
  assert.equal(zero.appearance.opacity, 0);
  const tiny = projectNativeVisualPayload({ appearance: { opacity: 0.004 } });
  assert.equal(tiny.appearance.opacity, 0.004);
  const kept = projectNativeVisualPayload({ appearance: { opacity: 0.42 } });
  assert.equal(kept.appearance.opacity, 0.42);
});

test('native visual payload hydrates legacy timeout dismiss into closeButton plus autoDismiss', () => {
  const stacked = projectNativeVisualPayload({ interaction: { dismissMode: 'timeout', timeoutMs: 45000 } });
  assert.equal(stacked.interaction.dismissMode, 'closeButton');
  assert.equal(stacked.interaction.autoDismiss, true);
  assert.equal(stacked.interaction.timeoutMs, 45000);
});
