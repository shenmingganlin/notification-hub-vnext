import assert from 'node:assert/strict';
import test from 'node:test';

import { NotificationApi } from '../../plugin/api/notification-api.js';
import { createNotificationRecord } from '../../plugin/domain/notification-record.js';

const profiles = [{
  id: 'default',
  soundPolicy: { enabled: true, cue: 'success' }
}];

function input({ eventId, traceId, createdAt, importance = 'normal' }) {
  return {
    event: {
      eventId,
      traceId,
      type: 'message_end',
      stopReason: 'end_turn',
      source: 'model'
    },
    notification: {
      title: '重复声音测试',
      content: '相同 trace 的通知',
      importance,
      createdAt
    },
    profiles
  };
}

test('duplicate notification remains stored but is silent by default', async () => {
  const calls = [];
  const api = new NotificationApi({
    soundPlayer: async (payload) => {
      calls.push(payload);
      return { played: true };
    }
  });

  const first = api.ingestEvent(input({
    eventId: 'dedup-event-1',
    traceId: 'dedup-trace-1',
    createdAt: '2026-08-04T12:00:00.000Z'
  }));
  const second = api.ingestEvent(input({
    eventId: 'dedup-event-2',
    traceId: 'dedup-trace-1',
    createdAt: '2026-08-04T12:00:30.000Z'
  }));

  await Promise.all([first.sound.playback, second.sound.playback].filter(Boolean));
  assert.equal(api.store.size, 2);
  assert.equal(first.deduplication.decision, 'new');
  assert.equal(second.deduplication.decision, 'duplicate');
  assert.equal(second.deduplication.suppress, true);
  assert.equal(second.sound.decision.reason, 'duplicate-suppressed');
  assert.equal(second.sound.scheduled, false);
  assert.equal(calls.length, 1);
});

test('same stable key outside the deduplication window can play again', async () => {
  const calls = [];
  const api = new NotificationApi({
    soundPlayer: async (payload) => {
      calls.push(payload);
      return { played: true };
    }
  });

  const first = api.ingestEvent(input({
    eventId: 'dedup-event-window-1',
    traceId: 'dedup-trace-window',
    createdAt: '2026-08-04T12:00:00.000Z'
  }));
  const second = api.ingestEvent(input({
    eventId: 'dedup-event-window-2',
    traceId: 'dedup-trace-window',
    createdAt: '2026-08-04T12:02:00.000Z'
  }));

  await Promise.all([first.sound.playback, second.sound.playback].filter(Boolean));
  assert.equal(second.deduplication.decision, 'outside_window');
  assert.equal(second.deduplication.suppress, false);
  assert.equal(second.sound.decision.play, true);
  assert.equal(second.sound.scheduled, true);
  assert.equal(calls.length, 2);
});

test('Profile can identify duplicates without suppressing their sounds', async () => {
  const calls = [];
  const api = new NotificationApi({
    soundPlayer: async (payload) => {
      calls.push(payload);
      return { played: true };
    }
  });
  const loudProfiles = [{
    id: 'default',
    soundPolicy: { enabled: true, cue: 'success', suppressDuplicates: false }
  }];

  const first = api.ingestEvent({
    ...input({
      eventId: 'dedup-event-loud-1',
      traceId: 'dedup-trace-loud',
      createdAt: '2026-08-04T12:00:00.000Z'
    }),
    profiles: loudProfiles
  });
  const second = api.ingestEvent({
    ...input({
      eventId: 'dedup-event-loud-2',
      traceId: 'dedup-trace-loud',
      createdAt: '2026-08-04T12:00:30.000Z'
    }),
    profiles: loudProfiles
  });

  await Promise.all([first.sound.playback, second.sound.playback]);
  assert.equal(second.deduplication.decision, 'duplicate');
  assert.equal(second.deduplication.suppress, true);
  assert.equal(second.sound.decision.isDuplicate, false);
  assert.equal(second.sound.decision.play, true);
  assert.equal(second.sound.scheduled, true);
  assert.equal(calls.length, 2);
});

test('critical duplicate remains audible under the default critical bypass policy', async () => {
  const calls = [];
  const api = new NotificationApi({
    soundPlayer: async (payload) => {
      calls.push(payload);
      return { played: true };
    }
  });
  const criticalProfiles = [{
    id: 'default',
    soundPolicy: { enabled: true, cue: 'critical' }
  }];

  api.ingestEvent({
    ...input({
      eventId: 'dedup-event-critical-1',
      traceId: 'dedup-trace-critical',
      createdAt: '2026-08-04T12:00:00.000Z',
      importance: 'critical'
    }),
    profiles: criticalProfiles
  });
  const second = api.ingestEvent({
    ...input({
      eventId: 'dedup-event-critical-2',
      traceId: 'dedup-trace-critical',
      createdAt: '2026-08-04T12:00:30.000Z',
      importance: 'critical'
    }),
    profiles: criticalProfiles
  });

  await second.sound.playback;
  assert.equal(second.deduplication.decision, 'duplicate');
  assert.equal(second.deduplication.suppress, false);
  assert.equal(second.sound.decision.play, true);
  assert.equal(second.sound.decision.reason, 'allowed');
  assert.equal(calls.length, 2);
});

test('deduplication mode off does not suppress repeated sound', async () => {
  const calls = [];
  const api = new NotificationApi({
    deduplicationPolicy: { mode: 'off' },
    soundPlayer: async (payload) => {
      calls.push(payload);
      return { played: true };
    }
  });

  api.ingestEvent(input({
    eventId: 'dedup-event-off-1',
    traceId: 'dedup-trace-off',
    createdAt: '2026-08-04T12:00:00.000Z'
  }));
  const second = api.ingestEvent(input({
    eventId: 'dedup-event-off-2',
    traceId: 'dedup-trace-off',
    createdAt: '2026-08-04T12:00:30.000Z'
  }));

  await second.sound.playback;
  assert.equal(second.deduplication.decision, 'new');
  assert.equal(second.deduplication.suppress, false);
  assert.equal(second.sound.decision.play, true);
  assert.equal(calls.length, 2);
});

test('history source failure does not block notification ingestion', () => {
  const records = [];
  const store = {
    add(inputValue) {
      const record = createNotificationRecord(inputValue);
      records.push(record);
      return record;
    },
    get() {
      return records.at(-1) ?? null;
    },
    getSnapshotRecords() {
      throw new Error('history unavailable');
    }
  };
  const calls = [];
  const api = new NotificationApi({
    store,
    soundPlayer: () => {
      calls.push('play');
      return { played: true };
    }
  });

  const result = api.ingestEvent(input({
    eventId: 'dedup-event-failure',
    traceId: 'dedup-trace-failure',
    createdAt: '2026-08-04T12:00:00.000Z'
  }));

  assert.equal(records.length, 1);
  assert.equal(result.deduplication.decision, 'indeterminate');
  assert.equal(result.deduplication.diagnostic, 'NOTIFICATION_DEDUPLICATION_FAILED');
  assert.equal(result.sound.scheduled, true);
  assert.equal(calls.length, 0);
});
