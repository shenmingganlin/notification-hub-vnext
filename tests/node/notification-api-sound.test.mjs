import assert from 'node:assert/strict';
import test from 'node:test';

import { NotificationApi } from '../../plugin/api/notification-api.js';
import { createSoundScheduler } from '../../plugin/domain/sound-scheduler.js';

const event = {
  eventId: 'sound-event-1',
  traceId: 'sound-trace-1',
  type: 'message_end',
  stopReason: 'end_turn',
  source: 'model'
};

const notification = {
  title: '声音接入测试',
  content: '通知应先入库，再决定是否安排声音。'
};

const profiles = [{
  id: 'default',
  soundPolicy: { enabled: true, cue: 'success' }
}];

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('enabled sound policy without a player keeps ingestion successful and unscheduled', () => {
  const api = new NotificationApi();
  const result = api.ingestEvent({ event, notification, profiles });

  assert.equal(result.record.notificationId, event.eventId);
  assert.equal(api.store.size, 1);
  assert.deepEqual(result.sound, {
    decision: {
      play: false,
      cue: 'success',
      volume: 1,
      importance: 'normal',
      reason: 'no-player',
      bypassed: false,
      isDuplicate: false,
      suppressDuplicates: true
    },
    scheduled: false,
    playback: null,
    global: {
      enabled: true,
      diagnostic: null
    }
  });
});

test('disabled sound policy does not call an injected sound player', () => {
  const calls = [];
  const api = new NotificationApi({
    soundPlayer: () => {
      calls.push('play');
      return { played: true };
    }
  });
  const result = api.ingestEvent({
    event: { ...event, eventId: 'sound-event-2' },
    notification,
    profiles: [{ id: 'default' }]
  });

  assert.equal(result.sound.scheduled, false);
  assert.equal(result.sound.decision.reason, 'policy-disabled');
  assert.equal(result.sound.playback, null);
  assert.deepEqual(calls, []);
});

test('allowed sound is scheduled after the notification is stored without blocking ingestion', async () => {
  const calls = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const api = new NotificationApi({
    soundPlayer: async (input) => {
      calls.push(input);
      await gate;
      return { played: true };
    }
  });

  const result = api.ingestEvent({
    event: { ...event, eventId: 'sound-event-3' },
    notification,
    profiles
  });

  assert.equal(result.record.notificationId, 'sound-event-3');
  assert.equal(api.store.size, 1);
  assert.equal(result.sound.scheduled, true);
  assert.equal(result.sound.playback instanceof Promise, true);
  assert.deepEqual(calls, []);

  await Promise.resolve();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].record, result.record);
  assert.equal(Object.isFrozen(calls[0].record), true);
  assert.equal(Object.isFrozen(calls[0].profile), true);
  assert.equal(Object.isFrozen(calls[0].decision), true);
  assert.equal(calls[0].decision.play, true);

  release();
  assert.deepEqual(await result.sound.playback, { played: true });
});

test('scheduler synchronous failure does not escape ingestion and records a failed playback', async () => {
  const diagnostics = [];
  const api = new NotificationApi({
    soundProfile: { global: { enabled: true } },
    soundScheduler: {
      schedule() {
        throw Object.assign(new Error('scheduler unavailable'), { code: 'SOUND_SCHEDULER_FAILED' });
      }
    },
    onSoundDiagnostic: (payload) => diagnostics.push(payload)
  });

  const result = api.ingestEvent({
    event: { ...event, eventId: 'sound-event-scheduler-sync-failure' },
    notification,
    profiles
  });

  assert.equal(result.record.notificationId, 'sound-event-scheduler-sync-failure');
  assert.equal(api.store.size, 1);
  assert.equal(result.sound.scheduled, true);
  assert.equal((await result.sound.playback).status, 'failed');
  assert.equal((await result.sound.playback).diagnostic, 'SOUND_SCHEDULER_FAILED');
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].scheduling.status, 'failed');
  assert.equal(diagnostics[0].playback.diagnostic, 'SOUND_SCHEDULER_FAILED');
});

test('scheduler rejected promise is absorbed into a stable failed playback result', async () => {
  const diagnostics = [];
  const api = new NotificationApi({
    soundProfile: { global: { enabled: true } },
    soundScheduler: {
      schedule() {
        return Promise.reject(Object.assign(new Error('scheduler rejected'), { code: 'SOUND_SCHEDULER_FAILED' }));
      }
    },
    onSoundDiagnostic: (payload) => diagnostics.push(payload)
  });

  const result = api.ingestEvent({
    event: { ...event, eventId: 'sound-event-scheduler-rejected' },
    notification,
    profiles
  });

  const playback = await result.sound.playback;
  assert.equal(playback.status, 'failed');
  assert.equal(playback.diagnostic, 'SOUND_SCHEDULER_FAILED');
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].scheduling.status, 'failed');
  assert.equal(diagnostics[0].playback.diagnostic, 'SOUND_SCHEDULER_FAILED');
});

test('sound player failure does not remove the stored notification', async () => {
  const api = new NotificationApi({
    soundPlayer: () => {
      throw new Error('speaker unavailable');
    }
  });
  const result = api.ingestEvent({
    event: { ...event, eventId: 'sound-event-4' },
    notification,
    profiles
  });

  assert.equal(api.getNotification('sound-event-4'), result.record);
  assert.deepEqual(await result.sound.playback, {
    attempted: true,
    played: false,
    source: 'none',
    cue: 'success',
    path: '',
    volume: 1,
    reason: 'playback-failed',
    diagnostic: 'SOUND_PLAYBACK_FAILED'
  });
});

test('async sound rejection becomes a handled playback failure', async () => {
  const api = new NotificationApi({
    soundPlayer: async () => {
      throw new Error('async speaker failure');
    }
  });
  const result = api.ingestEvent({
    event: { ...event, eventId: 'sound-event-5' },
    notification,
    profiles
  });

  assert.equal(result.sound.scheduled, true);
  const playback = await result.sound.playback;
  assert.equal(playback.reason, 'playback-failed');
  assert.equal(playback.diagnostic, 'SOUND_PLAYBACK_FAILED');
});

test('Store write failure does not call the sound player', () => {
  const calls = [];
  const store = {
    add() {
      throw new Error('store unavailable');
    },
    get() {
      return null;
    }
  };
  const api = new NotificationApi({
    store,
    soundPlayer: () => {
      calls.push('play');
      return { played: true };
    }
  });

  assert.throws(
    () => api.ingestEvent({
      event: { ...event, eventId: 'sound-event-6' },
      notification,
      profiles
    }),
    /store unavailable/
  );
  assert.deepEqual(calls, []);
});

test('explicit event presentation profile reaches the formal sound resolver', async () => {
  const api = new NotificationApi({
    presentationProfile: {
      global: {
        soundProfileId: 'sound.default',
        visualProfileId: 'visual.default',
        behaviorProfileId: 'stack',
        behaviorChannelId: 'stack.main'
      },
      events: {
        'tool.execution.failed': {
          soundProfileId: 'sound.error',
          visualProfileId: 'visual.error',
          behaviorProfileId: 'popup',
          behaviorChannelId: 'popup.alert'
        }
      }
    },
    soundProfile: {
      global: { enabled: true },
      soundProfiles: { 'sound.error': { cue: 'critical-error' } }
    },
    soundPlayer: async () => ({ played: true })
  });
  const result = api.ingestEvent({
    event: { ...event, eventId: 'tool.execution.failed', type: 'toolUse', stopReason: 'tool_error' },
    notification: { ...notification, type: 'tool_error', importance: 'high' },
    profiles: [{ id: 'default' }]
  });
  assert.equal(result.sound.decision.cue, 'critical-error');
  await result.sound.playback;
});

test('runtime canonical tool event updates soundInput before resolving event binding', async () => {
  const api = new NotificationApi({
    presentationProfile: {
      global: { soundProfileId: 'sound.chat.default', visualProfileId: 'visual.chat.default', behaviorProfileId: 'stack', behaviorChannelId: 'stack.main' },
      events: {
        'tool.execution.succeeded': { soundProfileId: 'sound.tool.success', visualProfileId: 'visual.tool.success', behaviorProfileId: 'stack', behaviorChannelId: 'tool.main' }
      }
    },
    soundProfile: {
      global: { enabled: true },
      soundOverrides: [{ eventId: 'tool.execution.succeeded', soundId: 'custom.tool-success' }]
    },
    soundPlayer: async () => ({ played: true })
  });
  const result = api.ingestEvent({
    event: { ...event, eventId: 'tool.execution.succeeded', type: 'toolUse', stopReason: 'end_turn' },
    notification: { ...notification, type: 'tool_result', source: 'hana.tool' },
    profiles: [{ id: 'default' }]
  });
  assert.equal(result.canonicalEvent.eventId, 'tool.execution.succeeded');
  assert.equal(result.sound.presentation.soundInput.eventId, 'tool.execution.succeeded');
  assert.equal(result.sound.decision.soundId, 'custom.tool-success');
  assert.equal(result.sound.decision.matchedRuleId, 'override:tool.execution.succeeded');
  await result.sound.playback;
});

test('runtime canonical event wins without a presentation profile', async () => {
  const api = new NotificationApi({
    soundProfile: {
      global: { enabled: true },
      soundOverrides: [
        { eventId: 'tool.execution.succeeded', soundId: 'custom.tool-success' },
        { eventId: 'tool.execution.failed', soundId: 'custom.tool-failure' }
      ]
    },
    soundPlayer: async () => ({ played: true })
  });

  const success = api.ingestEvent({
    event: { ...event, eventId: 'tool.execution.succeeded', type: 'toolUse', stopReason: 'end_turn' },
    notification: { ...notification, type: 'tool_result', source: 'hana.tool' },
    profiles: [{ id: 'default' }]
  });
  const failure = api.ingestEvent({
    event: { ...event, eventId: 'tool.execution.failed', type: 'toolUse', stopReason: 'tool_error' },
    notification: { ...notification, type: 'tool_error', source: 'hana.tool' },
    profiles: [{ id: 'default' }]
  });

  assert.equal(success.canonicalEvent.eventId, 'tool.execution.succeeded');
  assert.equal(success.sound.presentation.soundInput.eventId, 'tool.execution.succeeded');
  assert.equal(success.sound.decision.soundId, 'custom.tool-success');
  assert.equal(success.sound.decision.matchedRuleId, 'override:tool.execution.succeeded');
  assert.equal(failure.canonicalEvent.eventId, 'tool.execution.failed');
  assert.equal(failure.sound.presentation.soundInput.eventId, 'tool.execution.failed');
  assert.equal(failure.sound.decision.soundId, 'custom.tool-failure');
  assert.equal(failure.sound.decision.matchedRuleId, 'override:tool.execution.failed');
  await Promise.all([success.sound.playback, failure.sound.playback]);
});

test('sound profile resolves one cue for a multi-label tool failure notification', async () => {
  const calls = [];
  const api = new NotificationApi({
    soundProfile: {
      global: { enabled: true },
      soundProfiles: { 'sound.tool.failed': { cue: 'tool-failed' } }
    },
    soundPlayer: async (payload) => {
      calls.push(payload);
      return { played: true };
    }
  });
  const result = api.ingestEvent({
    event: {
      ...event,
      eventId: 'tool.execution.failed',
      type: 'toolUse',
      stopReason: 'tool_error'
    },
    notification: {
      ...notification,
      type: 'tool_error',
      source: 'plugin.api',
      producer: { kind: 'api', id: 'download-plugin' },
      importance: 'high'
    },
    profiles: [{ id: 'default' }]
  });

  assert.deepEqual(result.sound.presentation.soundInput.labels, ['tool', 'error', 'external_call']);
  assert.equal(result.sound.decision.cue, 'tool-failed');
  assert.equal(result.sound.decision.matchedBy, 'presentation-profile');
  assert.equal(result.sound.decision.matchedRuleId, null);
  assert.equal(result.sound.scheduled, true);
  await result.sound.playback;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].decision.cue, 'tool-failed');
});

test('sound profile override volume reaches the real sound player decision', async () => {
  const calls = [];
  const api = new NotificationApi({
    soundProfile: {
      global: { enabled: true },
      soundOverrides: [{ eventId: 'chat.assistant_reply.completed', soundId: 'custom.notice', volume: 0.25 }]
    },
    soundPlayer: async (payload) => { calls.push(payload); return { played: true }; }
  });
  const result = api.ingestEvent({
    event: { ...event, eventId: 'sound-event-profile-volume' },
    notification: { ...notification, producer: { kind: 'api', id: 'test-plugin' }, type: 'assistant_message' },
    profiles: [{ id: 'default' }]
  });
  await result.sound.playback;
  assert.equal(result.sound.decision.volume, 0.25);
  assert.equal(calls[0].decision.volume, 0.25);
});

test('vNext sound profile suppression setting controls duplicate sound decisions', () => {
  const api = new NotificationApi({
    deduplicationPolicy: { mode: 'window', windowMs: 60000, requireStableKey: true, suppressCritical: false },
    soundProfile: { global: { enabled: true, suppressDuplicates: false } },
    soundPlayer: () => ({ played: true })
  });
  const first = api.ingestEvent({ event: { ...event, eventId: 'sound-event-suppress-1', traceId: 'same-trace' }, notification: { ...notification, createdAt: '2026-08-15T01:00:00.000Z' }, profiles: [{ id: 'default' }] });
  const second = api.ingestEvent({ event: { ...event, eventId: 'sound-event-suppress-2', traceId: 'same-trace' }, notification: { ...notification, createdAt: '2026-08-15T01:00:30.000Z' }, profiles: [{ id: 'default' }] });
  assert.equal(second.deduplication.decision, 'duplicate');
  assert.equal(second.sound.decision.suppressDuplicates, false);
  assert.equal(second.sound.decision.play, true);
});

test('disabled duplicate suppression keeps a burst of distinct notifications audible', async () => {
  const calls = [];
  const pending = [];
  const scheduler = createSoundScheduler({
    play: (input) => {
      calls.push(input);
      return new Promise((resolve) => pending.push(resolve));
    }
  });
  const api = new NotificationApi({
    globalSoundEnabled: true,
    soundProfile: { global: { enabled: true, suppressDuplicates: false } },
    soundScheduler: scheduler
  });
  const results = Array.from({ length: 20 }, (_, index) => api.ingestEvent({
    event: { ...event, eventId: `sound-burst-${index}`, traceId: `sound-burst-trace-${index}` },
    notification: { ...notification, notificationId: `sound-burst-${index}` },
    profiles: [{ id: 'default' }]
  }));

  await Promise.resolve();
  assert.equal(calls.length, 20);
  assert.equal(scheduler.getStatus().queued, 0);
  while (scheduler.getStatus().playing || scheduler.getStatus().queued > 0 || pending.length > 0) {
    if (pending.length) pending.shift()({ played: true });
    await new Promise((resolve) => setImmediate(resolve));
  }
  const scheduling = await Promise.all(results.map((result) => result.sound.playback));
  assert.equal(scheduling.filter((entry) => entry.status === 'played').length, 20);
  assert.equal(scheduling.some((entry) => entry.status === 'dropped'), false);
});

test('sound profile global disablement prevents a critical player call', () => {
  const calls = [];
  const api = new NotificationApi({
    globalSoundEnabled: false,
    soundProfile: { global: { enabled: true } },
    soundPlayer: () => {
      calls.push('play');
      return { played: true };
    }
  });
  const result = api.ingestEvent({
    event: { ...event, eventId: 'sound-event-profile-global-off' },
    notification: { ...notification, importance: 'critical' },
    profiles: [{ id: 'default' }]
  });

  assert.equal(result.sound.decision.reason, 'global-disabled');
  assert.equal(result.sound.scheduled, false);
  assert.deepEqual(calls, []);
});

test('scheduler receives one modern sound decision without requiring a direct player', async () => {
  const calls = [];
  const api = new NotificationApi({
    soundProfile: { global: { enabled: true } },
    soundScheduler: {
      schedule(decision, context) {
        calls.push({ decision, context });
        return Promise.resolve({ status: 'played', playback: { backend: 'fake' } });
      }
    }
  });
  const result = api.ingestEvent({
    event: { ...event, eventId: 'sound-event-scheduler' },
    notification,
    profiles: [{ id: 'default' }]
  });

  assert.equal(result.sound.scheduled, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].decision.cue, 'chat-incoming');
  assert.equal(calls[0].context.record, result.record);
  assert.equal((await result.sound.playback).status, 'played');
});

test('NotificationApi merges the same active sound, keeps different sounds independent, and replays after settlement', async () => {
  const calls = [];
  const pending = [];
  const scheduler = createSoundScheduler({
    play(input) {
      calls.push(input);
      return new Promise((resolve) => pending.push(resolve));
    }
  });
  const api = new NotificationApi({
    soundProfile: {
      global: { enabled: true, suppressDuplicates: true },
      soundProfiles: { 'sound.tool.default': { enabled: true, cue: 'tool-complete' } }
    },
    soundScheduler: scheduler
  });
  const ingest = (eventId, overrides = {}) => api.ingestEvent({
    event: { ...event, eventId, traceId: `${eventId}-trace`, ...overrides.event },
    notification: { ...notification, notificationId: eventId, ...overrides.notification },
    profiles: [{ id: 'default' }]
  });

  const first = ingest('sound-active-first');
  await flush();
  const sameWhileActive = ingest('sound-active-same');
  const differentWhileActive = ingest('sound-active-tool', {
    event: { type: 'toolUse', stopReason: 'tool_completed' },
    notification: { type: 'tool_completed' }
  });
  await flush();

  assert.deepEqual(calls.map(({ decision: nextDecision }) => nextDecision.cue), ['chat-incoming', 'tool-complete']);
  assert.equal((await sameWhileActive.sound.playback).status, 'merged');
  assert.equal(scheduler.getStatus().playing, true);

  pending.shift()({ played: true });
  pending.shift()({ played: true });
  assert.equal((await first.sound.playback).status, 'played');
  assert.equal((await differentWhileActive.sound.playback).status, 'played');
  assert.equal(scheduler.getStatus().playing, false);

  const afterSettlement = ingest('sound-active-after');
  await flush();
  assert.equal(calls.filter(({ decision: nextDecision }) => nextDecision.cue === 'chat-incoming').length, 2);
  pending.shift()({ played: true });
  assert.equal((await afterSettlement.sound.playback).status, 'played');
  assert.equal(scheduler.getStatus().playing, false);
});

test('invalid sound player uses a stable constructor error', () => {
  assert.throws(
    () => new NotificationApi({ soundPlayer: true }),
    (error) => error.code === 'NOTIFICATION_API_SOUND_PLAYER_INVALID'
  );
});

test('global sound disablement keeps ordinary notification ingestion but skips playback', () => {
  const calls = [];
  const api = new NotificationApi({
    config: { globalSoundEnabled: false },
    soundPlayer: () => {
      calls.push('play');
      return { played: true };
    }
  });
  const result = api.ingestEvent({
    event: { ...event, eventId: 'sound-event-global-off' },
    notification,
    profiles
  });

  assert.equal(api.store.size, 1);
  assert.equal(result.sound.global.enabled, false);
  assert.equal(result.sound.global.diagnostic, null);
  assert.equal(result.sound.decision.reason, 'global-disabled');
  assert.equal(result.sound.scheduled, false);
  assert.equal(result.sound.playback, null);
  assert.deepEqual(calls, []);
});

test('global sound disablement cannot be bypassed by critical notifications', () => {
  const calls = [];
  const api = new NotificationApi({
    globalSoundEnabled: false,
    soundPlayer: () => {
      calls.push('play');
      return { played: true };
    }
  });
  const result = api.ingestEvent({
    event: { ...event, eventId: 'sound-event-global-critical' },
    notification: { ...notification, importance: 'critical' },
    profiles: [{ id: 'default', soundPolicy: { enabled: true, cue: 'critical' } }]
  });

  assert.equal(api.store.size, 1);
  assert.equal(result.record.importance, 'critical');
  assert.equal(result.sound.global.enabled, false);
  assert.equal(result.sound.decision.reason, 'global-disabled');
  assert.equal(result.sound.decision.bypassed, false);
  assert.equal(result.sound.scheduled, false);
  assert.deepEqual(calls, []);
});

test('invalid global sound configuration disables sound with a diagnostic but stores the notification', () => {
  const api = new NotificationApi({
    config: { globalSoundEnabled: 'false' },
    soundPlayer: () => ({ played: true })
  });
  const result = api.ingestEvent({
    event: { ...event, eventId: 'sound-event-global-invalid' },
    notification,
    profiles
  });

  assert.equal(api.store.size, 1);
  assert.deepEqual(result.sound.global, {
    enabled: false,
    diagnostic: 'NOTIFICATION_SOUND_CONFIG_INVALID'
  });
  assert.equal(result.sound.decision.reason, 'global-disabled');
  assert.equal(result.sound.scheduled, false);
});

test('global sound configuration read failure disables sound without blocking ingestion', () => {
  const api = new NotificationApi({
    config: {
      getAll() {
        throw new Error('host config unavailable');
      }
    },
    soundPlayer: () => ({ played: true })
  });
  const result = api.ingestEvent({
    event: { ...event, eventId: 'sound-event-global-read-failed' },
    notification,
    profiles
  });

  assert.equal(api.store.size, 1);
  assert.deepEqual(result.sound.global, {
    enabled: false,
    diagnostic: 'NOTIFICATION_SOUND_CONFIG_READ_FAILED'
  });
  assert.equal(result.sound.decision.reason, 'global-disabled');
  assert.equal(result.sound.scheduled, false);
});

test('re-enabling global sound restores Profile behavior and duplicate suppression', async () => {
  const calls = [];
  const api = new NotificationApi({
    globalSoundEnabled: true,
    soundPlayer: async (payload) => {
      calls.push(payload);
      return { played: true };
    }
  });
  const first = api.ingestEvent({
    event: { ...event, eventId: 'sound-event-global-on-1', traceId: 'sound-trace-global-on' },
    notification: {
      ...notification,
      traceId: 'sound-trace-global-on',
      createdAt: '2026-08-04T12:00:00.000Z'
    },
    profiles
  });
  const second = api.ingestEvent({
    event: { ...event, eventId: 'sound-event-global-on-2', traceId: 'sound-trace-global-on' },
    notification: {
      ...notification,
      traceId: 'sound-trace-global-on',
      createdAt: '2026-08-04T12:00:30.000Z'
    },
    profiles
  });

  await first.sound.playback;
  assert.equal(second.sound.global.enabled, true);
  assert.equal(second.deduplication.decision, 'duplicate');
  assert.equal(second.sound.decision.reason, 'duplicate-suppressed');
  assert.equal(second.sound.scheduled, false);
  assert.equal(calls.length, 1);
});
