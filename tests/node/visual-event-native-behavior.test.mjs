import assert from 'node:assert/strict';
import test from 'node:test';

import {
  VISUAL_EVENT_STACK_CHANNEL,
  VISUAL_EVENT_TICKER_CHANNEL,
  hasExplicitVisualBinding,
  resolveVisualEventNativeFlight,
  resolveVisualEventNativeBehavior,
  resolveVisualEventCardIntent,
  classifyVisualDiagnosticLevel,
  visualPreviewFingerprint
} from '../../plugin/domain/visual-event-native-flight.js';
import { resolveVisualEventNativeBehavior as resolveFromShim } from '../../plugin/domain/visual-event-native-behavior.js';

const tickerNative = {
  flight: 'ticker',
  flightChannelId: VISUAL_EVENT_TICKER_CHANNEL,
  behaviorProfileId: 'ticker',
  behaviorChannelId: VISUAL_EVENT_TICKER_CHANNEL
};
const stackNative = {
  flight: 'stack',
  flightChannelId: VISUAL_EVENT_STACK_CHANNEL,
  behaviorProfileId: 'stack',
  behaviorChannelId: VISUAL_EVENT_STACK_CHANNEL
};

test('ticker and danmaku profiles fly on the event ticker channel', () => {
  assert.deepEqual(resolveVisualEventNativeFlight({ behaviorId: 'ticker' }), tickerNative);
  assert.deepEqual(resolveVisualEventNativeFlight({ behaviorId: 'danmaku' }), tickerNative);
  assert.deepEqual(resolveVisualEventNativeFlight({ flight: 'ticker' }), tickerNative);
});

test('behaviorId ticket wins over a stale flight key', () => {
  assert.deepEqual(resolveVisualEventNativeFlight({ behaviorId: 'stack', flight: 'ticker' }), stackNative);
});

test('stack, popup and missing profiles stack on the event stack channel', () => {
  assert.deepEqual(resolveVisualEventNativeFlight({ behaviorId: 'stack' }), stackNative);
  assert.deepEqual(resolveVisualEventNativeFlight({ behaviorId: 'popup' }), stackNative);
  assert.deepEqual(resolveVisualEventNativeFlight({}), stackNative);
  assert.deepEqual(resolveVisualEventNativeFlight(null), stackNative);
  assert.deepEqual(resolveVisualEventNativeFlight(undefined), stackNative);
});

test('legacy resolver name and shim file still export the same mapping', () => {
  assert.equal(resolveVisualEventNativeBehavior, resolveVisualEventNativeFlight);
  assert.deepEqual(resolveFromShim({ behaviorId: 'ticker' }), tickerNative);
});

test('explicit visual binding is only true when the registry has that event', () => {
  const registry = {
    get(eventId) {
      return eventId === 'chat.assistant_reply.completed' ? { visualProfileId: 'visual.ticker' } : null;
    }
  };
  assert.equal(hasExplicitVisualBinding(registry, 'chat.assistant_reply.completed'), true);
  assert.equal(hasExplicitVisualBinding(registry, 'tool.execution.succeeded'), false);
  assert.equal(hasExplicitVisualBinding(registry, null), false);
  assert.equal(hasExplicitVisualBinding(null, 'chat.assistant_reply.completed'), false);
});

test('visual event card intent prefers global off, then binding, then defaultMode', () => {
  const storeProfile = { global: { enabled: true, defaultMode: 'off' }, behaviorId: 'ticker' };
  const binding = { visualProfileId: 'visual.bound', categoryId: 'chat' };
  const boundProfile = { behaviorId: 'ticker' };
  assert.equal(resolveVisualEventCardIntent({ eventId: 'chat.assistant_reply.completed', globalEnabled: false, binding, boundProfile, storeProfile }).reason, 'global-disabled');
  assert.equal(resolveVisualEventCardIntent({ eventId: 'chat.assistant_reply.completed', globalEnabled: false, binding, boundProfile, storeProfile }).showCard, false);
  const bound = resolveVisualEventCardIntent({ eventId: 'chat.assistant_reply.completed', globalEnabled: true, defaultMode: 'stack', binding, boundProfile, storeProfile });
  assert.equal(bound.showCard, true);
  assert.equal(bound.reason, 'bound');
  assert.equal(bound.nativeFlight.flight, 'ticker');
  assert.equal(bound.nativeBehavior.behaviorProfileId, 'ticker');
  const unboundOff = resolveVisualEventCardIntent({ eventId: 'chat.assistant_reply.completed', globalEnabled: true, defaultMode: 'off', storeProfile });
  assert.equal(unboundOff.showCard, false);
  assert.equal(unboundOff.reason, 'unbound');
  const unboundStack = resolveVisualEventCardIntent({ eventId: 'chat.assistant_reply.completed', globalEnabled: true, defaultMode: 'stack', storeProfile });
  assert.equal(unboundStack.showCard, true);
  assert.equal(unboundStack.visualProfile.behaviorId, 'stack');
  assert.equal(unboundStack.visualProfile.flight, 'stack');
  const unboundTicker = resolveVisualEventCardIntent({ eventId: 'chat.assistant_reply.completed', globalEnabled: true, defaultMode: 'ticker', storeProfile });
  assert.equal(unboundTicker.showCard, true);
  assert.equal(unboundTicker.nativeBehavior.behaviorChannelId, VISUAL_EVENT_TICKER_CHANNEL);
  assert.equal(unboundTicker.nativeFlight.flightChannelId, VISUAL_EVENT_TICKER_CHANNEL);
  assert.equal(resolveVisualEventCardIntent({ eventId: 'x', globalEnabled: true, defaultMode: 'stack', binding, boundProfile: null }).reason, 'missing-profile');
});

test('diagnostic level comes from throw/code and preview fingerprint includes appearance', () => {
  assert.equal(classifyVisualDiagnosticLevel({ code: 'VISUAL_PREVIEW_CREATED' }, 'PREVIEW_SESSION'), 'ok');
  assert.equal(classifyVisualDiagnosticLevel(Object.assign(new Error('missing'), { code: 'VISUAL_EVENT_BINDING_PROFILE_MISSING' }), 'EVENT_CARD'), 'error');
  assert.equal(classifyVisualDiagnosticLevel({ code: 'VISUAL_PREVIEW_RECREATED' }, 'PREVIEW_RECREATE'), 'warn');
  const colorA = visualPreviewFingerprint({ card: { types: { minimal: { appearance: { backgroundColor: '#111111' } } } } });
  const colorB = visualPreviewFingerprint({ card: { types: { minimal: { appearance: { backgroundColor: '#222222' } } } } });
  const tracks = visualPreviewFingerprint({ behaviorId: 'ticker', ticker: { trackCount: 4, speedPxPerSec: 400 } });
  const tracksB = visualPreviewFingerprint({ behaviorId: 'ticker', ticker: { trackCount: 8, speedPxPerSec: 400 } });
  const gapA = visualPreviewFingerprint({ behaviorId: 'ticker', ticker: { trackCount: 4, trackGapPx: 8 } });
  const gapB = visualPreviewFingerprint({ behaviorId: 'ticker', ticker: { trackCount: 4, trackGapPx: 24 } });
  assert.notEqual(colorA, colorB);
  assert.notEqual(tracks, tracksB);
  assert.notEqual(gapA, gapB);
});
