import { classifyEvent } from './event-classifier.js';
import { canonicalEventFromLegacy } from './notification-semantics.js';
import { getEventDefinition } from './notification-event-catalog.js';
import { resolvePresentationBinding } from './notification-presentation-profile.js';
import { importanceDetails } from './notification-importance.js';
import { formatNotificationContent } from './content-formatter.js';
import { resolveNotificationProfile } from './profile-resolver.js';

function ingestionError(code, message, field) {
  const error = new Error(message);
  error.code = code;
  error.details = field ? { field } : {};
  return error;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneDeep(value) {
  if (Array.isArray(value)) return value.map(cloneDeep);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneDeep(entry)]));
  }
  return value;
}

function requireNonEmptyString(field, value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw ingestionError(
      'NOTIFICATION_INGESTION_NOTIFICATION_INVALID',
      `${field} must be a non-empty string`,
      field
    );
  }
}

function validateNotification(notification) {
  if (!isPlainObject(notification)) {
    throw ingestionError(
      'NOTIFICATION_INGESTION_NOTIFICATION_INVALID',
      'notification must be a plain object',
      'notification'
    );
  }
  requireNonEmptyString('notification.title', notification.title);
  requireNonEmptyString('notification.content', notification.content);
}

function validateEventBoundary(event) {
  if (!isPlainObject(event)) {
    throw ingestionError(
      'NOTIFICATION_INGESTION_EVENT_INVALID',
      'event must be a plain object',
      'event'
    );
  }
}

function validateApi(api) {
  if (!api || typeof api.createNotification !== 'function') {
    throw ingestionError(
      'NOTIFICATION_INGESTION_API_INVALID',
      'api must expose createNotification()'
    );
  }
}

function resolveProfiles(profiles) {
  if (profiles === undefined) return [{ id: 'default' }];
  if (Array.isArray(profiles) || isPlainObject(profiles)) return profiles;
  throw ingestionError(
    'NOTIFICATION_INGESTION_PROFILES_INVALID',
    'profiles must be an array or plain object',
    'profiles'
  );
}

export function prepareNotificationInput({
  event,
  notification,
  profiles,
  profileId = 'default',
  contentPolicy,
  presentationProfile
} = {}) {
  validateEventBoundary(event);
  validateNotification(notification);

  const classification = classifyEvent(event);
  const profile = resolveNotificationProfile({
    profiles: resolveProfiles(profiles),
    profileId
  });
  const formatted = formatNotificationContent({
    record: notification,
    profile,
    contentPolicy
  });
  let canonicalEvent = null;
  try {
    canonicalEvent = canonicalEventFromLegacy({ event, record: notification, classification });
  } catch (error) {
    if (error?.code !== 'CANONICAL_EVENT_LEGACY_UNKNOWN') throw error;
  }

  const presentation = canonicalEvent
    ? resolvePresentationBinding({
      eventId: canonicalEvent.eventId,
      categoryId: canonicalEvent.categoryId,
      profile: presentationProfile
    })
    : null;
  const importance = importanceDetails({
    title: notification.title,
    content: formatted.content,
    summary: formatted.summary,
    settings: profile.profile.importanceKeywords ?? {},
    explicitImportance: notification.importance ?? profile.profile.importance
  });
  const metadata = {
    ...cloneDeep(notification.metadata ?? {}),
    eventClassification: classification,
    importance,
    ...(canonicalEvent ? {
      semantic: canonicalEvent,
      eventId: canonicalEvent.eventId
    } : {})
  };
  return {
    recordInput: {
      ...cloneDeep(notification),
      notificationId: notification.notificationId ?? event.eventId,
      traceId: notification.traceId ?? event.traceId,
      type: notification.type ?? event.type,
      source: notification.source ?? event.source ?? event.type,
      content: formatted.content,
      summary: formatted.summary,
      importance: notification.importance ?? profile.profile.importance,
      importanceClass: importance.value,
      contentPolicy: cloneDeep(formatted.policy),
      profileRef: profile.profileId,
      historyPolicy: cloneDeep(profile.profile.historyPolicy),
      runtimeHints: cloneDeep(profile.profile.runtimeHints),
      ...(canonicalEvent ? {
        eventId: canonicalEvent.eventId,
        categoryId: canonicalEvent.categoryId,
        eventTypeId: canonicalEvent.eventTypeId,
        presentation: cloneDeep(presentation ?? getEventDefinition(canonicalEvent.eventId).defaultPresentation)
      } : {}),
      status: 'formatted',
      metadata
    },
    classification,
    canonicalEvent,
    profile,
    formatted
  };
}

export function ingestNotification({
  api,
  event,
  notification,
  profiles,
  profileId = 'default',
  contentPolicy,
  presentationProfile,
  beforeCreate
} = {}) {
  validateApi(api);
  const prepared = prepareNotificationInput({
    event,
    notification,
    profiles,
    profileId,
    contentPolicy,
    presentationProfile
  });
  const beforeCreateResult = typeof beforeCreate === 'function'
    ? beforeCreate({
      recordInput: prepared.recordInput,
      classification: prepared.classification,
      canonicalEvent: prepared.canonicalEvent,
      profile: prepared.profile,
      formatted: prepared.formatted
    })
    : null;
  const record = beforeCreateResult?.existingRecord
    ?? api.createNotification(prepared.recordInput);
  return {
    record,
    classification: prepared.classification,
    canonicalEvent: prepared.canonicalEvent,
    profile: prepared.profile,
    formatted: prepared.formatted,
    beforeCreate: beforeCreateResult
  };
}
