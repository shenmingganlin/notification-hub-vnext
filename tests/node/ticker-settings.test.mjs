import assert from 'node:assert/strict';
import test from 'node:test';

import { createTickerSettings, createVisualProfile, resolveTickerMotion, TICKER_DEFAULTS } from '../../plugin/domain/visual-settings.js';
import { resolveVisualRule } from '../../plugin/domain/visual-rule-resolver.js';
import { projectNativeVisualPayload } from '../../plugin/domain/native-visual-payload.js';

// Ticker（弹幕）参数管道：profile → resolver 决策 → Native 投影。
// 契约：docs/superpowers/specs/ticker-behavior-contract.md §2 / §17

test('ticker settings default to the Lumen contract values', () => {
  assert.deepEqual(createTickerSettings(), { ...TICKER_DEFAULTS });
});

test('ticker settings accept a full valid payload and freeze it', () => {
  const ticker = createTickerSettings({
    speedPxPerSec: 800,
    band: 'bottom',
    bandRatio: 1,
    trackCount: 12,
    trackGapPx: 16,
    minGapPx: 24,
    hoverPause: true,
    overflow: 'queue',
    speedRandom: true,
    clickThrough: false
  });
  assert.deepEqual(ticker, {
    speedPxPerSec: 800,
    band: 'bottom',
    bandRatio: 1,
    trackCount: 12,
    trackGapPx: 16,
    minGapPx: 24,
    speedRandom: true,
    clickThrough: false,
    hoverPause: true,
    overflow: 'queue'
  });
  assert.ok(Object.isFrozen(ticker));
});

test('ticker trackCount has a floor but no ceiling (full-screen danmaku)', () => {
  assert.equal(createTickerSettings({ trackCount: 999 }).trackCount, 999);
  assert.throws(() => createTickerSettings({ trackCount: -1 }), (error) => error.code === 'VISUAL_PROFILE_TICKER_INVALID');
});

test('ticker rejects out-of-range values', () => {
  for (const bad of [
    { speedPxPerSec: 100 },
    { speedPxPerSec: 900 },
    { band: 'middle' },
    { bandRatio: 0.1 },
    { bandRatio: 1.2 },
    { minGapPx: 10 },
    { minGapPx: 999 },
    { trackGapPx: -1 },
    { trackGapPx: 49 },
    { hoverPause: 'yes' },
    { overflow: 'drop' },
    { speedRandom: 'yes' },
    { clickThrough: 'yes' }
  ]) {
    assert.throws(() => createTickerSettings(bad), (error) => error.code === 'VISUAL_PROFILE_TICKER_INVALID',
      `expected VISUAL_PROFILE_TICKER_INVALID for ${JSON.stringify(bad)}`);
  }
});

test('ticker rejects unknown fields', () => {
  assert.throws(() => createTickerSettings({ unknown: 1 }), (error) => error.code === 'VISUAL_PROFILE_FIELD_UNKNOWN');
});

test('profile keeps its historical shape when ticker is absent', () => {
  assert.equal('ticker' in createVisualProfile({}), false);
});

test('profile carries validated ticker settings when provided', () => {
  const profile = createVisualProfile({ behaviorId: 'ticker', ticker: { speedPxPerSec: 500 } });
  assert.equal(profile.behaviorId, 'ticker');
  assert.equal(profile.ticker.speedPxPerSec, 500);
  assert.equal(profile.ticker.band, TICKER_DEFAULTS.band);
});

test('visual rule decision forwards ticker settings only when present', () => {
  const visualInput = { labels: ['chat'], status: 'ok', importance: 'normal' };
  const withTicker = resolveVisualRule({ visualInput, profile: { behaviorId: 'ticker', ticker: { band: 'bottom' } } });
  assert.equal(withTicker.behaviorId, 'ticker');
  assert.equal(withTicker.ticker.band, 'bottom');
  assert.equal('ticker' in resolveVisualRule({ visualInput, profile: {} }), false);
});

test('native projection omits ticker when the card does not carry one', () => {
  assert.equal('ticker' in projectNativeVisualPayload({}), false);
});

test('native projection clamps out-of-range ticker values', () => {
  const projected = projectNativeVisualPayload({
    ticker: { speedPxPerSec: 9999, band: 'middle', bandRatio: 5, trackCount: -3, minGapPx: 1, hoverPause: 'yes', overflow: 'drop' }
  });
  assert.deepEqual(projected.ticker, {
    speedPxPerSec: 800,
    band: 'top',
    bandRatio: 1,
    trackCount: 0,
    trackGapPx: 8,
    minGapPx: 24,
    clickThrough: true,
    hoverPause: false,
    overflow: 'avoid'
  });
});

test('native projection forwards valid ticker values unchanged', () => {
  const projected = projectNativeVisualPayload({
    ticker: { speedPxPerSec: 400, band: 'bottom', bandRatio: 0.28, trackCount: 3, minGapPx: 64, hoverPause: false, overflow: 'avoid' }
  });
  assert.deepEqual(projected.ticker, {
    speedPxPerSec: 400,
    band: 'bottom',
    bandRatio: 0.28,
    trackCount: 3,
    trackGapPx: 8,
    minGapPx: 64,
    clickThrough: true,
    hoverPause: false,
    overflow: 'avoid'
  });
});

test('resolveTickerMotion rolls speed only when speedRandom is on', () => {
  const fixed = resolveTickerMotion({ speedPxPerSec: 400, speedRandom: false });
  assert.equal(fixed.speedPxPerSec, 400);
  const rolled = resolveTickerMotion({ speedPxPerSec: 400, speedRandom: true }, () => 0);
  assert.equal(rolled.speedPxPerSec, 150);
  const fastest = resolveTickerMotion({ speedPxPerSec: 400, speedRandom: true }, () => 0.999);
  assert.equal(fastest.speedPxPerSec, 800);
});

test('native projection disables timeout dismiss for ticker cards', () => {
  const projected = projectNativeVisualPayload({
    interaction: { dismissMode: 'timeout', timeoutMs: 4000 },
    ticker: { speedPxPerSec: 400, band: 'top', bandRatio: 0.28, trackCount: 0, minGapPx: 64 }
  });
  assert.equal(projected.interaction.dismissMode, 'closeButton');
});
