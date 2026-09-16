import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BEHAVIOR_MODES,
  createBehaviorProfile,
  createFlightProfile
} from '../../plugin/domain/notification-behavior.js';

test('flight profile splits ticket from life and keeps old keys as aliases', () => {
  const profile = createFlightProfile({
    flight: 'ticker',
    channelId: 'visual.event.ticker',
    durationMs: 12000,
    maxVisible: 8
  });
  assert.equal(profile.flight, 'ticker');
  assert.equal(profile.mode, 'ticker');
  assert.equal(profile.life.durationMs, 12000);
  assert.equal(profile.durationMs, 12000);
  assert.equal(profile.maxVisible, 8);
  assert.equal(createBehaviorProfile, createFlightProfile);
});

test('danmaku ticket normalizes to ticker flight', () => {
  const profile = createFlightProfile({ mode: 'danmaku', channelId: 'lane.mail' });
  assert.equal(profile.flight, 'ticker');
  assert.equal(profile.mode, 'ticker');
  assert.ok(BEHAVIOR_MODES.includes('danmaku'));
});

test('flight profile rejects unknown tickets with FLIGHT_ codes', () => {
  assert.throws(() => createFlightProfile({ flight: 'orbit' }), (error) => (
    error.code === 'FLIGHT_ID_INVALID'
    && error.details.field === 'flight'
  ));
});

test('invalid stay duration uses LIFE_ codes not the old behavior duration code', () => {
  assert.throws(() => createFlightProfile({ durationMs: -8 }), (error) => (
    error.code === 'LIFE_FIELD_INVALID'
    && error.details.field === 'life.durationMs'
  ));
});
