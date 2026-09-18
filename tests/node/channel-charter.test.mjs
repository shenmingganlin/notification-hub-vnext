import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFlightChannels,
  createStackCharter,
  createTickerCharter,
  createTickerMotion,
  migrateStackCharterFromSpace,
  resolveFlightId,
  splitLegacyTicker,
  stripCharterFromExport,
  toNativeTickerCharterPayload
} from '../../plugin/domain/channel-charter.js';

test('resolveFlightId aliases danmaku to ticker and defaults stack', () => {
  assert.equal(resolveFlightId(undefined), 'stack');
  assert.equal(resolveFlightId('danmaku'), 'ticker');
  assert.throws(() => resolveFlightId('orbit'), (error) => error.code === 'FLIGHT_ID_INVALID' && error.details.field === 'flight');
});

test('stack charter accepts snap and follow, defaults follow', () => {
  assert.equal(createStackCharter().settle, 'follow');
  assert.equal(createStackCharter({ settle: 'snap' }).settle, 'snap');
  assert.equal(createStackCharter({ settle: 'follow' }).settle, 'follow');
  assert.throws(() => createStackCharter({ settle: 'spring' }), (error) => (
    error.code === 'CHARTER_SETTLE_UNSUPPORTED'
    && error.details.expected === 'snap|follow'
    && error.details.actual === 'spring'
  ));
});

test('migrateStackCharterFromSpace copies settle', () => {
  assert.equal(migrateStackCharterFromSpace({ anchor: 'bottom-right', settle: 'snap' }).settle, 'snap');
  assert.equal(migrateStackCharterFromSpace({}).settle, 'follow');
});

test('stack charter accepts dock and next, defaults dock', () => {
  assert.equal(createStackCharter().newest, 'dock');
  assert.equal(createStackCharter({ newest: 'dock' }).newest, 'dock');
  assert.equal(createStackCharter({ newest: 'next' }).newest, 'next');
  assert.throws(() => createStackCharter({ newest: 'orbit' }), (error) => (
    error.code === 'CHARTER_NEWEST_UNSUPPORTED'
    && error.details.expected === 'dock|next'
    && error.details.actual === 'orbit'
  ));
});

test('migrateStackCharterFromSpace copies newest', () => {
  assert.equal(migrateStackCharterFromSpace({ newest: 'next' }).newest, 'next');
  assert.equal(migrateStackCharterFromSpace({}).newest, 'dock');
});

test('ticker charter rejects motion fields', () => {
  assert.throws(() => createTickerCharter({ direction: 'left' }), (error) => error.code === 'CHARTER_FIELD_UNKNOWN');
  assert.throws(() => createTickerCharter({ speedPxPerSec: 400 }), (error) => error.code === 'CHARTER_FIELD_UNKNOWN');
});

test('ticker motion rejects charter fields', () => {
  assert.throws(() => createTickerMotion({ minGapPx: 64 }), (error) => error.code === 'MOTION_FIELD_UNKNOWN');
  assert.equal(createTickerMotion({ direction: 'right' }).direction, 'right');
});

test('splitLegacyTicker separates highway law from this card', () => {
  const split = splitLegacyTicker({
    speedPxPerSec: 500,
    direction: 'right',
    band: 'bottom',
    minGapPx: 80,
    clickThrough: false,
    speedRandom: true
  });
  assert.equal(split.charter.band, 'bottom');
  assert.equal(split.charter.minGapPx, 80);
  assert.equal(split.charter.clickThrough, false);
  assert.equal(split.motion.direction, 'right');
  assert.equal(split.motion.speedPxPerSec, 500);
  assert.equal(split.motion.speedRandom, true);
  assert.equal('direction' in split.charter, false);
  assert.equal('minGapPx' in split.motion, false);
});

test('createFlightChannels migrates from a mixed profile once', () => {
  const channels = createFlightChannels({}, {
    profile: {
      ticker: { band: 'bottom', minGapPx: 40, direction: 'right', speedPxPerSec: 200 },
      card: { activeType: 'minimal', types: { minimal: { properties: { space: { anchor: 'top-left', gap: 12 } } } } }
    }
  });
  assert.equal(channels.stack.anchor, 'top-left');
  assert.equal(channels.stack.gap, 12);
  assert.equal(channels.stack.settle, 'follow');
  assert.equal(channels.ticker.band, 'bottom');
  assert.equal(channels.ticker.minGapPx, 40);
  assert.equal('direction' in channels.ticker, false);
});

test('export strip drops channels so packs do not ship highway law', () => {
  const packed = stripCharterFromExport({
    profile: { behaviorId: 'ticker', ticker: { direction: 'left' } },
    channels: { ticker: { band: 'top' } }
  });
  assert.equal('channels' in packed, false);
  assert.equal(packed.profile.ticker.direction, 'left');
});

test('native ticker charter payload is flight plus highway only', () => {
  const payload = toNativeTickerCharterPayload({ band: 'bottom', minGapPx: 80, trackCount: 5 });
  assert.equal(payload.flight, 'ticker');
  assert.equal(payload.channelId, 'visual.event.ticker');
  assert.equal(payload.charter.band, 'bottom');
  assert.equal(payload.charter.minGapPx, 80);
  assert.equal(payload.charter.trackCount, 5);
  assert.equal('direction' in payload.charter, false);
  assert.equal('speedPxPerSec' in payload.charter, false);
});
