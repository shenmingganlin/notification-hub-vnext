import { createPresentationSelector } from './notification-presentation-selector.js';

const PRESENTATION_CLASSIFICATION_VERSION = 'v1';

function presentationPlanError(code, message, field, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = field ? { field, ...details } : { ...details };
  return error;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]));
  return value;
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

const STRUCTURED_EVENTS = new Set([
  'tool_completed', 'tool_success', 'tool_error', 'timeout', 'rate_limit', 'error', 'failed',
  'rate_limited', 'provider_error', 'model_service_error',
  'tool_use', 'tool_result', 'tool_execution'
]);

function resolveSoundEvent(record, classification) {
  const classifiedEvents = classification?.facets?.event;
  const candidates = Array.isArray(classifiedEvents)
    ? classifiedEvents
    : (typeof classifiedEvents === 'string' ? [classifiedEvents] : []);
  const classifiedEvent = candidates.find((event) => STRUCTURED_EVENTS.has(event) && !['tool', 'error'].includes(event));
  if (classifiedEvent) return classifiedEvent;

  if (STRUCTURED_EVENTS.has(record.type)) return record.type;
  if (record.status === 'failed') return 'failed';
  if (record.type === 'tool_result' || record.type === 'tool_completed') return 'tool_success';
  return 'arrived';
}

function validatePresentationInput(record, classification) {
  if (!isPlainObject(record) || typeof record.notificationId !== 'string' || record.notificationId.trim().length === 0) {
    throw presentationPlanError(
      'NOTIFICATION_PRESENTATION_RECORD_INVALID',
      'record.notificationId must be a non-empty string',
      'record.notificationId'
    );
  }
  if (!isPlainObject(classification)) {
    throw presentationPlanError(
      'NOTIFICATION_PRESENTATION_CLASSIFICATION_INVALID',
      'classification must be a plain object',
      'classification'
    );
  }
  if (classification.version !== PRESENTATION_CLASSIFICATION_VERSION) {
    throw presentationPlanError(
      'NOTIFICATION_PRESENTATION_CLASSIFICATION_VERSION_INVALID',
      `classification.version must be ${PRESENTATION_CLASSIFICATION_VERSION}`,
      'classification.version',
      { expected: PRESENTATION_CLASSIFICATION_VERSION }
    );
  }
  if (!Array.isArray(classification.labels) || typeof classification.status !== 'string') {
    throw presentationPlanError(
      'NOTIFICATION_PRESENTATION_CLASSIFICATION_INVALID',
      'classification.labels and classification.status are required',
      'classification'
    );
  }
}

export function createNotificationPresentationInput(record, classification, presentationProfile = null) {
  validatePresentationInput(record, classification);
  const labels = [...classification.labels];
  const visualLabels = labels.map((label) => label === 'external_call' ? 'plugin' : label);
  const evidence = Array.isArray(classification.evidence) ? clone(classification.evidence) : [];
  let selector = null;
  try {
    selector = createPresentationSelector({ record, classification, profile: presentationProfile });
  } catch {
    selector = null;
  }
  const soundEvent = resolveSoundEvent(record, classification);
  return freezeDeep({
    notificationId: record.notificationId,
    classification,
    visualInput: {
      labels: visualLabels,
      categoryId: selector?.categoryId ?? null,
      visualProfileId: selector?.visual.visualProfileId ?? null,
      status: classification.status,
      importance: record.importance ?? 'normal'
    },
    ...(selector ? { selector } : {}),
    soundInput: {
      ...(selector ? {
        eventId: selector.eventId,
        categoryId: selector.categoryId,
        eventTypeId: selector.eventTypeId,
        soundProfileId: selector.sound.soundProfileId
      } : {}),
      labels: [...labels],
      event: soundEvent,
      importance: record.importance ?? 'normal',
      producer: record.producer ? clone(record.producer) : null,
      source: typeof record.source === 'string' ? record.source : null,
      channel: typeof record.channel?.kind === 'string' ? record.channel.kind : null
    },
    explanation: {
      matchedCategories: [...labels],
      ...(selector ? { eventId: selector.eventId, categoryId: selector.categoryId } : {}),
      evidence
    }
  });
}
