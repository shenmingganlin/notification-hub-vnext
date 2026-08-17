const SOUND_DIAGNOSTIC_STATUSES = Object.freeze([
  'played', 'failed', 'suppressed', 'merged', 'queued', 'skipped', 'dropped', 'cleared', 'unavailable'
]);

const OUTCOME_EXPLANATIONS = Object.freeze({
  played: '声音已实际播放。',
  failed: '策略允许播放，但播放器执行失败。',
  suppressed: '声音在冷却窗口内被抑制。',
  merged: '相同声音已与已有请求合并。',
  queued: '声音已进入播放队列。',
  skipped: '声音策略决定不播放。',
  dropped: '声音因队列限制被丢弃。',
  cleared: '声音请求在调度器清理时被取消。',
  unavailable: '声音播放状态不可用。'
});

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function boundedString(value, max = 160) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function safeNullableNumber(value, minimum = 0, maximum = 1) {
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : null;
}

function normalizeLabels(value) {
  return [...new Set(Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim().slice(0, 64)).slice(0, 12) : [])];
}

function normalizeProducer(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const kind = boundedString(value.kind, 32);
  const id = boundedString(value.id, 96);
  return kind ? { kind, ...(id ? { id } : {}) } : null;
}

function normalizeInput(input = {}) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const producer = normalizeProducer(value.producer);
  return {
    labels: normalizeLabels(value.labels),
    event: boundedString(value.event, 96),
    importance: boundedString(value.importance, 24),
    producer,
    source: boundedString(value.source, 96),
    channel: boundedString(value.channel, 64),
    stableKey: boundedString(value.stableKey, 160)
  };
}

function normalizeVolumeLayers(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const layers = {};
  for (const key of ['global', 'category', 'rule', 'final']) {
    const number = safeNullableNumber(Number(value[key]));
    if (number !== null) layers[key] = number;
  }
  return Object.keys(layers).length ? layers : null;
}

function normalizeDecision(value) {
  const decision = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const volumeLayers = normalizeVolumeLayers(decision.volumeLayers);
  return {
    play: decision.play === true,
    soundId: boundedString(decision.soundId, 160),
    cue: boundedString(decision.cue, 96),
    volume: safeNullableNumber(Number(decision.volume)),
    ...(volumeLayers ? { volumeLayers } : {}),
    priority: boundedString(decision.priority, 24),
    interrupt: decision.interrupt === true,
    suppressDuplicates: decision.suppressDuplicates !== false,
    cooldownMs: Number.isFinite(decision.cooldownMs) ? Math.max(0, Math.min(86_400_000, decision.cooldownMs)) : 0,
    matchedRuleId: boundedString(decision.matchedRuleId, 160),
    matchedBy: boundedString(decision.matchedBy, 64),
    reason: boundedString(decision.reason, 96),
    bypassed: decision.bypassed === true
  };
}

function normalizeScheduling(value) {
  const scheduling = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const status = normalizeSoundDiagnosticStatus(scheduling.status);
  return {
    status,
    reason: boundedString(scheduling.reason, 96),
    stableKey: boundedString(scheduling.stableKey, 160),
    queuePosition: Number.isInteger(scheduling.queuePosition) && scheduling.queuePosition >= 0 ? scheduling.queuePosition : null,
    soundKey: boundedString(scheduling.soundKey, 160),
    suppressDuplicates: scheduling.suppressDuplicates === true
  };
}

function normalizePlayback(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const attempted = typeof value.attempted === 'boolean'
    ? value.attempted
    : value.played === true || value.played === false;
  return {
    attempted,
    played: value.played === true,
    ...(value.muted === true ? { muted: true } : {}),
    source: boundedString(value.source, 32),
    soundId: boundedString(value.soundId, 160),
    cue: boundedString(value.cue, 96),
    volume: safeNullableNumber(Number(value.volume)),
    reason: boundedString(value.reason, 96),
    diagnostic: boundedString(value.diagnostic, 120),
    backend: boundedString(value.backend, 64)
  };
}

export function normalizeSoundDiagnosticStatus(value) {
  return SOUND_DIAGNOSTIC_STATUSES.includes(value) ? value : 'unavailable';
}

export function createSoundDiagnostic(input = {}) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const scheduling = normalizeScheduling(value.scheduling);
  const playback = normalizePlayback(value.playback);
  const status = playback?.played === true ? 'played' : playback && playback.attempted && playback.played === false
    ? 'failed' : scheduling.status;
  const timestamp = boundedString(value.timestamp, 40) || new Date().toISOString();
  const source = ['notification', 'settings-test', 'sound-asset-test', 'sound-workbench'].includes(value.source) ? value.source : 'notification';
  const outcome = normalizeSoundDiagnosticStatus(status);
  const diagnostic = {
    id: boundedString(value.id, 96) || `sound-diagnostic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
    source,
    input: normalizeInput(value.input),
    decision: normalizeDecision(value.decision),
    scheduling,
    playback,
    summary: {
      outcome,
      explanation: boundedString(value.summary?.explanation, 180) || OUTCOME_EXPLANATIONS[outcome]
    }
  };
  return freeze(diagnostic);
}

export function getSoundDiagnosticStatuses() {
  return SOUND_DIAGNOSTIC_STATUSES;
}
