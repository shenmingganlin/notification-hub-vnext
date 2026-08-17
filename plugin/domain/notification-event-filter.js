import {
  NOTIFICATION_EVENT_LABELS,
  projectNotificationCategories
} from './notification-classification.js';

function eventFilterError(code, message, field, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = field ? { field, ...details } : { ...details };
  return error;
}

function validateEvents(events) {
  if (!Array.isArray(events) || events.length === 0) {
    throw eventFilterError(
      'NOTIFICATION_EVENT_FILTER_INVALID',
      'events must be a non-empty array',
      'events'
    );
  }
  const unique = [...new Set(events)];
  if (unique.some((event) => typeof event !== 'string' || !NOTIFICATION_EVENT_LABELS.includes(event))) {
    throw eventFilterError(
      'NOTIFICATION_EVENT_FILTER_INVALID',
      'events contains an unsupported event',
      'events',
      { supported: NOTIFICATION_EVENT_LABELS }
    );
  }
  return unique;
}

export function filterNotificationsByEvents(records, events, options = {}) {
  if (!Array.isArray(records)) {
    throw eventFilterError(
      'NOTIFICATION_EVENT_FILTER_RECORDS_INVALID',
      'records must be an array',
      'records'
    );
  }
  const requested = validateEvents(events);
  const match = options?.match ?? 'any';
  if (!['any', 'all'].includes(match)) {
    throw eventFilterError(
      'NOTIFICATION_EVENT_FILTER_MATCH_INVALID',
      'match must be any or all',
      'match'
    );
  }

  return records.filter((record) => {
    const actual = new Set(projectNotificationCategories(record).facets.event);
    const matches = (event) => actual.has(event)
      && !(event === 'error' && actual.has('tool_error'));
    return match === 'all'
      ? requested.every(matches)
      : requested.some(matches);
  });
}
