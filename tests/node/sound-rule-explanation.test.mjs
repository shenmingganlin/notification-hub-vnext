import assert from 'node:assert/strict';
import test from 'node:test';

import { createSoundRuleExplanation } from '../../plugin/domain/sound-rule-explanation.js';

test('sound rule explanation preserves the final decision and volume layers', () => {
  const explanation = createSoundRuleExplanation({
    input: { labels: ['model_service', 'error'], event: 'model_service_error', importance: 'critical', source: 'hana' },
    decision: {
      play: true,
      cue: 'warning',
      volume: 0.56,
      volumeLayers: { global: 0.8, category: 0.7, rule: 1, final: 0.56 },
      matchedRuleId: 'model-service-critical',
      matchedBy: 'rule',
      reason: 'allowed',
      suppressDuplicates: true
    },
    diagnostic: { scheduling: { status: 'played', soundKey: 'warning' }, playback: { attempted: true, played: true } }
  });
  assert.equal(explanation.outcome, 'play');
  assert.equal(explanation.reasonCode, 'allowed');
  assert.equal(explanation.matchedRuleId, 'model-service-critical');
  assert.equal(explanation.volume.final, 0.56);
  assert.equal(explanation.sound.cue, 'warning');
  assert.match(explanation.summary, /允许播放/);
  assert.equal(Object.isFrozen(explanation), true);
  assert.equal(Object.isFrozen(explanation.volume), true);
});

test('sound rule explanation maps policy skips, merged playback, and failures', () => {
  const base = { input: { labels: ['chat'], event: 'arrived', importance: 'normal' } };
  assert.equal(createSoundRuleExplanation({ ...base, decision: { play: false, reason: 'global-disabled' } }).outcome, 'skip');
  assert.match(createSoundRuleExplanation({ ...base, decision: { play: false, reason: 'global-disabled' } }).summary, /全局声音/);
  assert.equal(createSoundRuleExplanation({ ...base, decision: { play: true, reason: 'allowed' }, diagnostic: { scheduling: { status: 'merged' } } }).outcome, 'merge');
  assert.equal(createSoundRuleExplanation({ ...base, decision: { play: true, reason: 'allowed' }, diagnostic: { scheduling: { status: 'played' }, playback: { attempted: true, played: false, diagnostic: 'SOUND_PLAYBACK_FAILED' } } }).outcome, 'fail');
});

test('sound rule explanation keeps safe fields and excludes raw content', () => {
  const explanation = createSoundRuleExplanation({
    input: { labels: ['plugin'], event: 'error', importance: 'high', content: 'secret prompt', path: 'C:\\private\\sound.wav' },
    decision: { play: false, reason: 'policy-disabled', secret: 'token', volume: 2 }
  });
  assert.equal(explanation.content, undefined);
  assert.equal(explanation.path, undefined);
  assert.equal(explanation.secret, undefined);
  assert.equal(explanation.volume.final, 1);
});
