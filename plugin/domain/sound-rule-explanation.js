const OUTCOME_COPY = Object.freeze({
  play: '声音策略允许播放。',
  skip: '声音策略决定不播放。',
  merge: '相同声音已与当前播放合并。',
  fail: '策略允许播放，但播放器执行失败。',
  unavailable: '声音播放状态不可用。'
});

const REASON_COPY = Object.freeze({
  'global-disabled': '全局声音已关闭。',
  'policy-disabled': '当前声音策略已关闭。',
  'below-threshold': '通知重要性低于当前策略阈值。',
  'quiet-mode': '当前处于安静模式。',
  'duplicate-suppressed': '重复通知声音被抑制。',
  'no-player': '当前没有可用的声音播放器。',
  'settings-test-policy-bypassed': '试听入口按现有测试策略继续调度。'
});

function boundedString(value, max = 160) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function boundedNumber(value, minimum = 0, maximum = 1) {
  return Number.isFinite(Number(value)) ? Math.max(minimum, Math.min(maximum, Number(value))) : null;
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

function normalizeLabels(value) {
  return [...new Set(Array.isArray(value)
    ? value.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim().slice(0, 64)).slice(0, 12)
    : [])];
}

function normalizeInput(input = {}) {
  return {
    labels: normalizeLabels(input?.labels),
    event: boundedString(input?.event, 96),
    importance: boundedString(input?.importance, 24),
    source: boundedString(input?.source, 96),
    channel: boundedString(input?.channel, 64)
  };
}

function normalizeVolume(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    global: boundedNumber(source.global),
    category: boundedNumber(source.category),
    rule: boundedNumber(source.rule),
    final: boundedNumber(source.final ?? source.volume)
  };
}

function normalizeDecision(decision = {}) {
  return {
    reason: boundedString(decision.reason, 96),
    matchedBy: boundedString(decision.matchedBy, 64),
    matchedRuleId: boundedString(decision.matchedRuleId, 160),
    soundId: boundedString(decision.soundId, 160),
    cue: boundedString(decision.cue, 96),
    volume: normalizeVolume(decision.volumeLayers ?? { volume: decision.volume }),
    suppressDuplicates: decision.suppressDuplicates !== false,
    bypassed: decision.bypassed === true,
    play: decision.play === true
  };
}

function normalizeScheduling(scheduling) {
  if (!scheduling || typeof scheduling !== 'object' || Array.isArray(scheduling)) return null;
  return {
    status: boundedString(scheduling.status, 32),
    soundKey: boundedString(scheduling.soundKey, 160)
  };
}

function normalizePlayback(playback) {
  if (!playback || typeof playback !== 'object' || Array.isArray(playback)) return null;
  return {
    attempted: playback.attempted === true || playback.played === true || playback.played === false,
    played: playback.played === true,
    diagnostic: boundedString(playback.diagnostic, 120)
  };
}

function outcomeOf(decision, scheduling, playback) {
  if (playback?.attempted && playback.played === false) return 'fail';
  if (scheduling?.status === 'merged') return 'merge';
  if (decision.play) return playback?.played === false ? 'fail' : 'play';
  return 'skip';
}

function summaryOf(outcome, decision, scheduling, playback) {
  if (outcome === 'fail') return OUTCOME_COPY.fail;
  if (outcome === 'merge') return OUTCOME_COPY.merge;
  if (outcome === 'play') return OUTCOME_COPY.play;
  if (outcome === 'skip') return REASON_COPY[decision.reason] ?? OUTCOME_COPY.skip;
  if (playback?.diagnostic) return `声音状态不可用：${playback.diagnostic}`;
  if (scheduling?.status) return `调度状态：${scheduling.status}。`;
  return OUTCOME_COPY.unavailable;
}

export function createSoundRuleExplanation({ input = {}, decision = {}, diagnostic = null } = {}) {
  const normalizedDecision = normalizeDecision(decision);
  const scheduling = normalizeScheduling(diagnostic?.scheduling);
  const playback = normalizePlayback(diagnostic?.playback);
  const outcome = outcomeOf(normalizedDecision, scheduling, playback);
  return freeze({
    outcome,
    reasonCode: normalizedDecision.reason,
    summary: summaryOf(outcome, normalizedDecision, scheduling, playback),
    ...normalizeInput(input),
    matchedBy: normalizedDecision.matchedBy,
    matchedRuleId: normalizedDecision.matchedRuleId,
    sound: { soundId: normalizedDecision.soundId, cue: normalizedDecision.cue },
    volume: normalizedDecision.volume,
    policy: {
      suppressDuplicates: normalizedDecision.suppressDuplicates,
      bypassed: normalizedDecision.bypassed
    },
    scheduling,
    playback
  });
}
