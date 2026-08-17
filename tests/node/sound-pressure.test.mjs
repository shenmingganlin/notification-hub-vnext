import assert from 'node:assert/strict';
import test from 'node:test';

import { NotificationApi } from '../../plugin/api/notification-api.js';
import { createSoundScheduler } from '../../plugin/domain/sound-scheduler.js';
import { createWindowsAudioBackend } from '../../plugin/domain/audio-adapter.js';

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function decision(cue, extra = {}) {
  return { play: true, cue, volume: 1, importance: 'normal', suppressDuplicates: false, ...extra };
}

function controlledPlayer() {
  const calls = [];
  const pending = [];
  return {
    calls,
    pending,
    play(input) {
      calls.push(input);
      return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    },
    resolveAll(value = { played: true }) {
      while (pending.length) pending.shift().resolve(value);
    }
  };
}

test('sound pressure: 1000 eager requests settle without dropped results (throughput contract, not a resource cap)', async () => {
  const player = controlledPlayer();
  const scheduler = createSoundScheduler({ play: player.play.bind(player), maxQueue: 1 });
  const requests = Array.from({ length: 1000 }, (_, index) => scheduler.schedule(
    decision(index % 5 === 0 ? 'tool-complete' : 'chat-incoming'),
    { stableKey: `pressure-${index}` }
  ));

  await flush();
  assert.equal(player.calls.length, 1000);
  assert.deepEqual(scheduler.getStatus(), { queued: 0, playing: true, lastCriticalAt: null });
  player.resolveAll();
  const results = await Promise.all(requests);
  assert.equal(results.length, 1000);
  assert.equal(results.filter((entry) => entry.status === 'played').length, 1000);
  assert.equal(results.some((entry) => entry.status === 'merged' || entry.status === 'dropped'), false);
  assert.deepEqual(scheduler.getStatus(), { queued: 0, playing: false, lastCriticalAt: null });
});

test('sound pressure: same-cue requests merge only while active, then play again after settlement', async () => {
  const player = controlledPlayer();
  const scheduler = createSoundScheduler({ play: player.play.bind(player) });
  const requests = Array.from({ length: 1000 }, (_, index) => scheduler.schedule(
    decision('chat-incoming', { suppressDuplicates: true }),
    { stableKey: `merge-${index}` }
  ));

  await flush();
  assert.equal(player.calls.length, 1);
  player.resolveAll();
  const results = await Promise.all(requests);
  assert.equal(results.filter((entry) => entry.status === 'played').length, 1);
  assert.equal(results.filter((entry) => entry.status === 'merged').length, 999);

  const afterSettlement = scheduler.schedule(decision('chat-incoming', { suppressDuplicates: true }), { stableKey: 'merge-after' });
  await flush();
  assert.equal(player.calls.length, 2);
  player.resolveAll();
  assert.equal((await afterSettlement).status, 'played');
});

test('sound pressure: clear settles 1000 active requests and scheduler remains safely idle', async () => {
  const player = controlledPlayer();
  const scheduler = createSoundScheduler({ play: player.play.bind(player) });
  const requests = Array.from({ length: 1000 }, (_, index) => scheduler.schedule(
    decision(`clear-${index}`),
    { stableKey: `clear-${index}` }
  ));

  await flush();
  assert.equal(player.calls.length, 1000);
  scheduler.clear();
  const results = await Promise.all(requests);
  assert.equal(results.filter((entry) => entry.status === 'cleared').length, 1000);
  assert.deepEqual(scheduler.getStatus(), { queued: 0, playing: false, lastCriticalAt: null });
  assert.equal((await scheduler.waitForIdle()), true);
  assert.equal((await scheduler.schedule(decision('after-clear'), { stableKey: 'after-clear' })).status, 'cleared');
});

test('sound pressure: Windows backend starts 128 independent cue processes without a backend queue', async () => {
  const calls = [];
  let active = 0;
  let maxActive = 0;
  const backend = createWindowsAudioBackend({
    platform: 'win32',
    powershellPath: 'pressure-powershell.exe',
    spawnImpl(command, args, options) {
      calls.push({ command, args, options });
      active += 1;
      maxActive = Math.max(maxActive, active);
      return {
        once(event, callback) {
          if (event === 'close') queueMicrotask(() => { active -= 1; callback(0); });
          return this;
        }
      };
    }
  });
  const requests = Array.from({ length: 128 }, (_, index) => backend.playCue({
    cue: index % 2 ? 'warning' : 'success',
    volume: 1
  }));
  const results = await Promise.all(requests);
  assert.equal(calls.length, 128);
  assert.equal(maxActive, 128);
  assert.equal(results.filter((entry) => entry.played).length, 128);
  backend.dispose();
});

test('sound pressure: interleaved failures settle and subsequent independent work continues', async () => {
  const pending = [];
  const scheduler = createSoundScheduler({
    play: () => new Promise((resolve, reject) => pending.push({ resolve, reject }))
  });
  const requests = Array.from({ length: 300 }, (_, index) => scheduler.schedule(
    decision(`sound-${index}`, { suppressDuplicates: false }),
    { stableKey: `failure-${index}` }
  ));

  await flush();
  assert.equal(pending.length, 300);
  pending.forEach((item, index) => {
    if (index % 10 === 0) item.reject(new Error(`failure-${index}`));
    else item.resolve({ played: true });
  });
  const results = await Promise.all(requests);
  assert.equal(results.filter((entry) => entry.status === 'failed').length, 30);
  assert.equal(results.filter((entry) => entry.status === 'played').length, 270);
  assert.deepEqual(scheduler.getStatus(), { queued: 0, playing: false, lastCriticalAt: null });

  const falsePlayback = scheduler.schedule(decision('false-played', { suppressDuplicates: false }));
  await flush();
  pending.at(-1).resolve({ played: false, reason: 'device-rejected' });
  assert.equal((await falsePlayback).status, 'failed');

  const next = scheduler.schedule(decision('recovery', { suppressDuplicates: false }), { stableKey: 'recovery' });
  await flush();
  assert.equal(pending.length, 302);
  pending.at(-1).resolve({ played: true });
  assert.equal((await next).status, 'played');
});

test('sound pressure: Windows backend converts spawn errors and non-zero exits into settled failures', async () => {
  const errorBackend = createWindowsAudioBackend({
    platform: 'win32',
    spawnImpl() {
      const process = {
        once(event, callback) {
          if (event === 'error') queueMicrotask(() => callback(new Error('spawn failed')));
          return process;
        }
      };
      return process;
    }
  });
  const errorResult = await errorBackend.playCue({ cue: 'success', volume: 1 });
  assert.equal(errorResult.played, false);
  errorBackend.dispose();

  const exitBackend = createWindowsAudioBackend({
    platform: 'win32',
    spawnImpl() {
      const process = {
        once(event, callback) {
          if (event === 'close') queueMicrotask(() => callback(9));
          return process;
        },
        stderr: { on() { return process; } }
      };
      return process;
    }
  });
  const exitResult = await exitBackend.playCue({ cue: 'warning', volume: 1 });
  assert.equal(exitResult.played, false);
  exitBackend.dispose();
});

test('notification pressure: 250 stored notifications remain non-blocking while all sound requests settle', async () => {
  const player = controlledPlayer();
  const scheduler = createSoundScheduler({ play: player.play.bind(player) });
  const api = new NotificationApi({
    globalSoundEnabled: true,
    soundProfile: { global: { enabled: true, suppressDuplicates: false } },
    soundScheduler: scheduler
  });
  const results = Array.from({ length: 250 }, (_, index) => api.ingestEvent({
    event: {
      eventId: `notification-pressure-${index}`,
      traceId: `notification-pressure-trace-${index}`,
      type: index % 2 ? 'message_end' : 'toolUse',
      stopReason: index % 2 ? 'end_turn' : 'success',
      source: 'pressure-test'
    },
    notification: {
      title: `压力测试 ${index}`,
      content: 'bounded test content',
      producer: { kind: 'api', id: 'pressure-test' },
      type: index % 2 ? 'assistant_message' : 'tool_complete',
      importance: index % 17 === 0 ? 'high' : 'normal'
    },
    profiles: [{ id: 'default' }]
  }));

  assert.equal(api.store.size, 250);
  assert.equal(results.every((entry) => entry.sound.scheduled), true);
  await flush();
  assert.equal(player.calls.length, 250);
  player.resolveAll();
  const playback = await Promise.all(results.map((entry) => entry.sound.playback));
  assert.equal(playback.filter((entry) => entry.status === 'played').length, 250);
  assert.equal(playback.some((entry) => entry.status === 'merged' || entry.status === 'dropped'), false);
  assert.deepEqual(scheduler.getStatus(), { queued: 0, playing: false, lastCriticalAt: null });
});

test('notification pressure: global mute blocks a 500-event burst without invoking playback', () => {
  let calls = 0;
  const api = new NotificationApi({
    globalSoundEnabled: false,
    soundProfile: { global: { enabled: true, suppressDuplicates: false } },
    soundPlayer: () => { calls += 1; return { played: true }; }
  });
  const results = Array.from({ length: 500 }, (_, index) => api.ingestEvent({
    event: { eventId: `muted-pressure-${index}`, traceId: `muted-pressure-${index}`, type: 'message_end', stopReason: 'end_turn', source: 'pressure-test' },
    notification: { title: '静音压力', content: 'silent', type: 'assistant_message' },
    profiles: [{ id: 'default' }]
  }));

  assert.equal(api.store.size, 500);
  assert.equal(calls, 0);
  assert.equal(results.every((entry) => entry.sound.scheduled === false), true);
  assert.equal(results.every((entry) => entry.sound.decision.reason === 'global-disabled'), true);
});
