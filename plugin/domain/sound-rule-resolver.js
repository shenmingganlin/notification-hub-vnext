import { SOUND_CUES, createSoundProfile } from './sound-profile.js';
import { normalizeSoundId } from './custom-sound-asset.js';

const IMPORTANCE_RANK = Object.freeze({ low: 0, normal: 1, high: 2, critical: 3 });
const EVENT_CUES = Object.freeze({
  'chat.assistant_reply.completed': null,
  'chat.assistant_reply.cancelled': 'warning',
  'chat.assistant_reply.interrupted': 'warning',
  'channel.message.received': 'channel-incoming',
  'channel.message.sent': 'channel-incoming',
  'channel.message.failed': 'warning',
  'tool.execution.succeeded': 'tool-complete',
  'tool.execution.failed': 'tool-failed',
  'tool.execution.timed_out': 'warning',
  'tool.execution.blocked': 'warning',
  'tool.execution.cancelled': 'warning',
  'model_service.request.failed': 'warning',
  'model_service.request.timed_out': 'warning',
  'session.health.degraded': 'warning',
  'session.persistence.failed': 'warning',
  'external_integration.event.received': 'plugin-notice',
  'external_integration.event.succeeded': 'plugin-notice',
  'external_integration.event.failed': 'warning',
  'delivery.important_sound': 'critical-error'
});

function fail(code, message) { const error = new Error(message); error.code = code; return error; }
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function normalizedSoundInput(presentation) {
  if (!plain(presentation) || !plain(presentation.soundInput)) throw fail('SOUND_RULE_PRESENTATION_INVALID', 'presentation.soundInput is required');
  const input = presentation.soundInput;
  const fallback = { arrived: 'chat.assistant_reply.completed', tool_success: 'tool.execution.succeeded', tool_completed: 'tool.execution.succeeded', tool_error: 'tool.execution.failed', timeout: 'tool.execution.timed_out', error: 'session.persistence.failed' }[input.event];
  const eventId = typeof input.eventId === 'string' && input.eventId.trim() ? input.eventId.trim() : fallback;
  if (!eventId) throw fail('SOUND_RULE_PRESENTATION_INVALID', 'soundInput.eventId is required');
  return { ...input, eventId, importance: typeof input.importance === 'string' ? input.importance : 'normal' };
}

export function resolveSoundRule({ presentation, profile, context = {} } = {}) {
  const input = normalizedSoundInput(presentation);
  if (!plain(profile)) throw fail('SOUND_RULE_PROFILE_INVALID', 'profile must be a plain object');
  const normalized = createSoundProfile(profile);
  const global = normalized.global;
  const override = normalized.soundOverrides.find((entry) => entry.eventId === input.eventId) ?? null;
  const presentationSoundId = input.soundRuleSoundId ?? input.soundProfileId ?? null;
  const profileStrategy = presentationSoundId && normalized.soundProfiles[presentationSoundId]
    ? normalized.soundProfiles[presentationSoundId]
    : null;
  const strategy = profileStrategy ?? {};
  const soundId = override?.soundId ?? (input.soundRuleSoundId ? normalizeSoundId(input.soundRuleSoundId) : (strategy.soundId ?? global.soundId ?? null));
  const cue = soundId ? null : (strategy.cue ?? EVENT_CUES[input.eventId] ?? global.cue);
  if (cue !== null && !SOUND_CUES.includes(cue)) throw fail('SOUND_RULE_CUE_INVALID', 'resolved cue is unsupported');
  const volume = Math.max(0, Math.min(1, (global.volume ?? 1) * (override?.volume ?? input.soundRuleVolume ?? strategy.volume ?? 1)));
  const importance = IMPORTANCE_RANK[input.importance] === undefined ? 'normal' : input.importance;
  const critical = importance === 'critical';
  const ctx = { globalEnabled: true, isDuplicate: false, ...context };
  const suppressDuplicates = global.suppressDuplicates !== false;
  let play = true;
  let reason = 'allowed';
  if (!ctx.globalEnabled) { play = false; reason = 'global-disabled'; }
  else if (IMPORTANCE_RANK[importance] < IMPORTANCE_RANK[global.minImportance ?? 'low']) { play = false; reason = 'below-threshold'; }
  else if (global.quietMode && (!critical || global.criticalBypass !== true)) { play = false; reason = 'quiet-mode'; }
  else if (!global.enabled) { play = false; reason = 'policy-disabled'; }
  else if (ctx.isDuplicate && suppressDuplicates && (!critical || global.criticalBypass !== true)) { play = false; reason = 'duplicate-suppressed'; }
  return freeze({
    play, cue, ...(soundId ? { soundId } : {}), volume,
    volumeLayers: { global: global.volume ?? 1, rule: override?.volume ?? input.soundRuleVolume ?? strategy.volume ?? 1, final: volume },
    priority: critical ? 'critical' : importance === 'high' ? 'high' : 'normal',
    interrupt: critical && global.criticalInterrupts === true,
    suppressDuplicates,
    cooldownMs: critical ? global.criticalCooldownMs : 0,
    matchedRuleId: override?.eventId ? `override:${override.eventId}` : null,
    matchedBy: override ? 'event' : profileStrategy ? 'presentation-profile' : 'global',
    reason,
    bypassed: play && critical && (global.quietMode || (ctx.isDuplicate && suppressDuplicates))
  });
}

export function resolveSoundRuleSafe(input = {}) {
  try { return resolveSoundRule(input); } catch { return freeze({ play: false, cue: 'chat-incoming', volume: 1, priority: 'normal', interrupt: false, suppressDuplicates: true, cooldownMs: 0, matchedRuleId: null, matchedBy: 'fallback', reason: 'invalid-input', bypassed: false }); }
}
