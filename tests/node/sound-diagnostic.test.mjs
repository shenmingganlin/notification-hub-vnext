import assert from 'node:assert/strict';
import test from 'node:test';

import { createSoundDiagnostic, normalizeSoundDiagnosticStatus } from '../../plugin/domain/sound-diagnostic.js';

test('sound diagnostic normalizes the explainable decision and playback contract', () => {
  const diagnostic = createSoundDiagnostic({
    id: 'diag-1',
    timestamp: '2026-08-15T00:00:00.000Z',
    source: 'notification',
    input: {
      labels: ['tool', 'error'],
      event: 'tool_error',
      importance: 'high',
      producer: { kind: 'api', id: 'example' },
      source: 'plugin',
      channel: null,
      stableKey: 'event:example:123',
      rawPath: 'C:\\secret.wav',
      body: 'must not leak'
    },
    decision: {
      play: true,
      soundId: 'custom.tool.failed',
      cue: 'tool-failed',
      volume: 0.72,
      volumeLayers: { global: 1, category: 0.8, rule: 0.9, final: 0.72 },
      priority: 'high',
      interrupt: false,
      cooldownMs: 0,
      matchedRuleId: null,
      matchedBy: 'category',
      reason: 'allowed',
      bypassed: false
    },
    scheduling: { status: 'played', reason: null, stableKey: 'event:example:123', queuePosition: 0 },
    playback: {
      attempted: true,
      played: true,
      source: 'file',
      soundId: 'custom.tool.failed',
      cue: null,
      volume: 0.72,
      reason: 'played',
      diagnostic: null,
      backend: 'windows-pcm',
      path: 'C:\\secret.wav'
    }
  });

  assert.deepEqual(diagnostic.input, {
    labels: ['tool', 'error'],
    event: 'tool_error',
    importance: 'high',
    producer: { kind: 'api', id: 'example' },
    source: 'plugin',
    channel: null,
    stableKey: 'event:example:123'
  });
  assert.equal(diagnostic.decision.volume, 0.72);
  assert.equal(diagnostic.playback.backend, 'windows-pcm');
  assert.equal(diagnostic.summary.outcome, 'played');
  assert.match(diagnostic.summary.explanation, /实际播放/);
  assert.equal(Object.isFrozen(diagnostic), true);
  assert.equal(Object.isFrozen(diagnostic.input), true);
  assert.equal(Object.isFrozen(diagnostic.input.labels), true);
  assert.equal(Object.isFrozen(diagnostic.decision.volumeLayers), true);
  assert.throws(() => { diagnostic.source = 'leak'; }, TypeError);
});

test('sound diagnostic preserves explicit not-attempted and muted playback semantics', () => {
  const skipped = createSoundDiagnostic({
    source: 'notification',
    scheduling: { status: 'skipped', reason: 'global-disabled' },
    playback: { attempted: false, played: false, muted: false }
  });
  assert.equal(skipped.playback.attempted, false);
  assert.equal(skipped.playback.muted, undefined);
  assert.equal(skipped.summary.outcome, 'skipped');

  const muted = createSoundDiagnostic({
    source: 'sound-asset-test',
    scheduling: { status: 'played' },
    playback: { attempted: true, played: true, muted: true, reason: 'muted' }
  });
  assert.equal(muted.playback.muted, true);
  assert.equal(muted.summary.outcome, 'played');
});

test('sound diagnostic uses stable statuses and safe defaults', () => {
  assert.equal(normalizeSoundDiagnosticStatus('failed'), 'failed');
  assert.equal(normalizeSoundDiagnosticStatus('unknown'), 'unavailable');
  const diagnostic = createSoundDiagnostic({ source: 'settings-test', scheduling: { status: 'merged', cue: 'ignored' } });
  assert.equal(diagnostic.source, 'settings-test');
  assert.equal(diagnostic.scheduling.status, 'merged');
  assert.equal(diagnostic.summary.outcome, 'merged');
  assert.equal(diagnostic.playback, null);
  assert.equal(diagnostic.input.labels.length, 0);
  assert.equal(diagnostic.decision.play, false);
});
