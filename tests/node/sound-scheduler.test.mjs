import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSoundPlaybackKey } from '../../plugin/domain/audio-adapter.js';
import { createSoundScheduler } from '../../plugin/domain/sound-scheduler.js';

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
    resolveNext(value = { played: true }) {
      pending.shift()?.resolve(value);
    },
    rejectNext(error = new Error('player failed')) {
      pending.shift()?.reject(error);
    }
  };
}

function decision(cue, importance = 'normal', extra = {}) {
  return { play: true, cue, volume: 1, importance, ...extra };
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

test('plays ordinary and high-priority sounds independently without a serial queue', async () => {
  const player = controlledPlayer();
  const scheduler = createSoundScheduler({ play: player.play.bind(player) });

  const first = scheduler.schedule(decision('chat-incoming'), { stableKey: 'a' });
  const second = scheduler.schedule(decision('tool-complete', 'high'), { stableKey: 'b' });
  await flush();
  assert.deepEqual(player.calls.map((call) => call.decision.cue), ['chat-incoming', 'tool-complete']);
  assert.equal(scheduler.getStatus().queued, 0);

  player.resolveNext();
  player.resolveNext();
  assert.equal((await first).status, 'played');
  assert.equal((await second).status, 'played');
});

test('merges queued sounds with the same cue', async () => {
  const player = controlledPlayer();
  const scheduler = createSoundScheduler({ play: player.play.bind(player) });

  const first = scheduler.schedule(decision('chat-incoming'), { stableKey: 'a' });
  const second = scheduler.schedule(decision('chat-incoming'), { stableKey: 'b' });
  await flush();
  assert.equal(player.calls.length, 1);
  assert.equal(scheduler.getStatus().queued, 0);
  player.resolveNext();
  assert.equal((await first).status, 'played');
  assert.equal((await second).status, 'merged');
});

test('merges different built-in cues that resolve to the same Windows system sound resource', async () => {
  const player = controlledPlayer();
  const scheduler = createSoundScheduler({ play: player.play.bind(player), keyOf: resolveSoundPlaybackKey });

  const first = scheduler.schedule(decision('tool-failed'), { stableKey: 'tool-failed' });
  const second = scheduler.schedule(decision('warning'), { stableKey: 'warning' });
  await flush();

  assert.equal(player.calls.length, 1);
  assert.equal((await second).status, 'merged');
  player.resolveNext();
  assert.equal((await first).status, 'played');
});

test('does not merge repeated cues when suppression is disabled', async () => {
  const player = controlledPlayer();
  const scheduler = createSoundScheduler({ play: player.play.bind(player) });

  const first = scheduler.schedule(decision('chat-incoming', 'normal', { suppressDuplicates: false }), { stableKey: 'a' });
  const second = scheduler.schedule(decision('chat-incoming', 'normal', { suppressDuplicates: false }), { stableKey: 'b' });
  await flush();
  assert.equal(player.calls.length, 2);
  player.resolveNext();
  player.resolveNext();
  assert.equal((await first).status, 'played');
  assert.equal((await second).status, 'played');
});

test('plays every disabled-suppression burst request immediately without queueing', async () => {
  const player = controlledPlayer();
  const scheduler = createSoundScheduler({ play: player.play.bind(player) });
  const requests = Array.from({ length: 20 }, (_, index) => scheduler.schedule(
    decision('chat-incoming', 'normal', { suppressDuplicates: false }),
    { stableKey: `burst-${index}` }
  ));

  await flush();
  assert.equal(player.calls.length, 20);
  assert.equal(scheduler.getStatus().queued, 0);

  while (player.pending.length) player.resolveNext();
  const results = await Promise.all(requests);
  assert.equal(results.filter((entry) => entry.status === 'played').length, 20);
  assert.equal(results.some((entry) => entry.status === 'dropped'), false);
});

test('critical sounds play independently and do not clear ordinary sounds', async () => {
  const player = controlledPlayer();
  const scheduler = createSoundScheduler({ play: player.play.bind(player) });

  const normal = scheduler.schedule(decision('chat-incoming'), { stableKey: 'normal' });
  const critical = scheduler.schedule(decision('critical-error', 'critical'), { stableKey: 'critical' });
  await flush();
  assert.deepEqual(player.calls.map((call) => call.decision.cue), ['chat-incoming', 'critical-error']);
  player.resolveNext();
  player.resolveNext();
  assert.equal((await normal).status, 'played');
  assert.equal((await critical).status, 'played');
});

test('does not apply stable-key cooldown because suppression only merges the same active sound', async () => {
  const player = controlledPlayer();
  const scheduler = createSoundScheduler({ play: player.play.bind(player) });

  const first = scheduler.schedule(decision('critical-error', 'critical', { cooldownMs: 500 }), { stableKey: 'same' });
  await flush();
  const second = scheduler.schedule(decision('warning', 'critical', { cooldownMs: 500 }), { stableKey: 'different' });
  await flush();
  assert.equal(player.calls.length, 2);
  player.resolveNext();
  player.resolveNext();
  assert.equal((await first).status, 'played');
  assert.equal((await second).status, 'played');
});

test('底层播放器返回 played:false 时调度器报告失败并保留播放结果', async () => {
  const player = controlledPlayer();
  const scheduler = createSoundScheduler({ play: player.play.bind(player) });

  const failed = scheduler.schedule(decision('error'), { stableKey: 'backend-failed' });
  await flush();
  player.resolveNext({ played: false, reason: 'playback-failed', diagnostic: 'SOUND_PLAYBACK_FAILED' });

  assert.deepEqual(await failed, {
    status: 'failed',
    soundKey: 'error',
    suppressDuplicates: true,
    diagnostic: 'SOUND_PLAYBACK_FAILED',
    playback: { played: false, reason: 'playback-failed', diagnostic: 'SOUND_PLAYBACK_FAILED' }
  });
});

test('player failure settles one request and does not block the next', async () => {
  const player = controlledPlayer();
  const scheduler = createSoundScheduler({ play: player.play.bind(player) });

  const failed = scheduler.schedule(decision('error'), { stableKey: 'failed' });
  const next = scheduler.schedule(decision('success'), { stableKey: 'next' });
  await flush();
  player.rejectNext();
  await flush();
  assert.equal((await failed).status, 'failed');
  assert.equal(player.calls.length, 2);
  player.resolveNext();
  assert.equal((await next).status, 'played');
});

test('plays a large burst without a queue limit when duplicate suppression is disabled', async () => {
  const player = controlledPlayer();
  const scheduler = createSoundScheduler({ play: player.play.bind(player), maxQueue: 2 });
  const requests = Array.from({ length: 20 }, (_, index) => scheduler.schedule(
    decision(`sound-${index}`, 'normal', { suppressDuplicates: false }),
    { stableKey: `burst-${index}` }
  ));
  await flush();
  assert.equal(player.calls.length, 20);
  assert.equal(scheduler.getStatus().queued, 0);
  while (player.pending.length) player.resolveNext();
  assert.equal((await Promise.all(requests)).every((entry) => entry.status === 'played'), true);
});

test('waitForIdle resolves only after all independent playbacks finish', async () => {
  const player = controlledPlayer();
  const scheduler = createSoundScheduler({ play: player.play.bind(player), pollMs: 1 });
  const current = scheduler.schedule(decision('current'), { stableKey: 'current' });
  const second = scheduler.schedule(decision('queued'), { stableKey: 'queued' });
  await flush();
  let idle = false;
  const idlePromise = scheduler.waitForIdle({ timeoutMs: 1000, pollMs: 1 }).then((value) => { idle = value; return value; });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(idle, false);
  player.resolveNext();
  player.resolveNext();
  assert.equal(await current.then((value) => value.status), 'played');
  assert.equal(await second.then((value) => value.status), 'played');
  assert.equal(await idlePromise, true);
});

test('clear drops queued requests and releases cooldown timers', async () => {
  const player = controlledPlayer();
  const timers = [];
  const cleared = [];
  const scheduler = createSoundScheduler({
    play: player.play.bind(player),
    setTimer(callback) { timers.push(callback); return timers.length; },
    clearTimer(id) { cleared.push(id); }
  });

  const current = scheduler.schedule(decision('one', 'critical', { cooldownMs: 100 }), { stableKey: 'one' });
  const second = scheduler.schedule(decision('two'), { stableKey: 'two' });
  scheduler.clear();
  assert.equal((await current).status, 'cleared');
  assert.equal((await second).status, 'cleared');
  assert.deepEqual(cleared, []);
  assert.deepEqual(scheduler.getStatus(), { queued: 0, playing: false, lastCriticalAt: null });
});
