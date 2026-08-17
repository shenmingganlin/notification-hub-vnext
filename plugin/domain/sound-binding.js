import { normalizeSoundId } from './custom-sound-asset.js';
import { getEventDefinition, listEventDefinitions } from './notification-event-catalog.js';

export const SOUND_BINDING_EVENT_IDS = Object.freeze(
  listEventDefinitions({ presentationEligible: true }).map((definition) => definition.eventId)
);

function bindingError(code, message, field = null) {
  const error = new Error(message);
  error.code = code;
  error.details = field ? { field } : {};
  return error;
}

function requireEventId(eventId) {
  if (typeof eventId !== 'string' || !eventId.trim()) {
    throw bindingError('SOUND_BINDING_EVENT_ID_INVALID', 'eventId must be a non-empty string', 'eventId');
  }
  const normalized = eventId.trim();
  const definition = getEventDefinition(normalized);
  if (!definition.presentationEligible) {
    throw bindingError('SOUND_BINDING_EVENT_ID_INVALID', 'eventId must be presentation eligible', 'eventId');
  }
  return normalized;
}

export function createSoundBinding({ eventId, soundId, volume } = {}) {
  const normalizedEventId = requireEventId(eventId);
  const normalizedSoundId = normalizeSoundId(soundId);
  if (volume !== undefined && (typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0 || volume > 1)) {
    throw bindingError('SOUND_BINDING_VOLUME_INVALID', 'volume must be between 0 and 1', 'volume');
  }
  return Object.freeze({
    eventId: normalizedEventId,
    soundId: normalizedSoundId,
    ...(volume === undefined ? {} : { volume })
  });
}

export function normalizeSoundBindingInput(input = {}) {
  const binding = createSoundBinding(input);
  return Object.freeze({
    ...binding,
    key: soundBindingKey(binding),
    ruleId: soundBindingRuleId(binding)
  });
}

export function soundBindingKey({ eventId } = {}) {
  return requireEventId(eventId);
}

export function soundBindingRuleId({ eventId } = {}) {
  return `custom-sound.${soundBindingKey({ eventId }).replaceAll('.', '-')}`;
}

export function soundIdForBinding({ soundId, eventId } = {}) {
  normalizeSoundId(soundId);
  return `custom.${soundBindingKey({ eventId }).replaceAll('.', '-')}`;
}

export function findSoundIdForBinding(profile, { eventId } = {}) {
  const normalizedEventId = requireEventId(eventId);
  const binding = Array.isArray(profile?.soundOverrides)
    ? profile.soundOverrides.find((entry) => entry.eventId === normalizedEventId)
    : null;
  return binding?.soundId ?? null;
}

export function findSoundBindingForSoundId(profile, soundId) {
  const normalizedSoundId = normalizeSoundId(soundId);
  const binding = Array.isArray(profile?.soundOverrides)
    ? profile.soundOverrides.find((entry) => entry.soundId === normalizedSoundId)
    : null;
  return binding ? normalizeSoundBindingInput(binding) : null;
}

export function upsertSoundBindingRule(profile, input) {
  const binding = normalizeSoundBindingInput(input);
  const nextOverrides = (Array.isArray(profile?.soundOverrides) ? profile.soundOverrides : [])
    .filter((entry) => entry.eventId !== binding.eventId);
  nextOverrides.push({ eventId: binding.eventId, soundId: binding.soundId, ...(binding.volume === undefined ? {} : { volume: binding.volume }) });
  return { ...profile, soundOverrides: nextOverrides };
}

export function removeSoundBinding(profile, input) {
  const eventId = requireEventId(input?.eventId);
  return {
    ...profile,
    soundOverrides: (Array.isArray(profile?.soundOverrides) ? profile.soundOverrides : [])
      .filter((entry) => entry.eventId !== eventId)
  };
}

export function removeSoundBindingRules(profile, soundId) {
  const normalizedSoundId = normalizeSoundId(soundId);
  const next = { ...profile };
  if (next.global?.soundId === normalizedSoundId) {
    next.global = { ...next.global };
    delete next.global.soundId;
  }
  return {
    ...next,
    soundOverrides: (Array.isArray(profile?.soundOverrides) ? profile.soundOverrides : [])
      .filter((entry) => entry.soundId !== normalizedSoundId),
  };
}

export function collectSoundAssetReferences(profile, soundId) {
  const normalizedSoundId = normalizeSoundId(soundId);
  const references = [];
  if (profile?.global?.soundId === normalizedSoundId) references.push({ type: 'global', label: '全局声音' });
  for (const [eventId, binding] of Object.entries(profile?.events ?? {})) {
    if (binding?.soundId === normalizedSoundId) references.push({ type: 'event', eventId, label: `事件：${eventId}` });
  }
  for (const override of profile?.soundOverrides ?? []) {
    if (override?.soundId === normalizedSoundId) references.push({ type: 'event', eventId: override.eventId, label: `事件：${override.eventId}` });
  }
  for (const rule of profile?.rules ?? []) {
    if (rule?.strategy?.soundId === normalizedSoundId) references.push({ type: 'rule', ruleId: rule.id ?? null, label: rule.name || rule.id || '声音规则' });
  }
  return Object.freeze(references.map((reference) => Object.freeze(reference)));
}

export function isSoundBinding(value) {
  try {
    normalizeSoundBindingInput(value);
    return true;
  } catch {
    return false;
  }
}
