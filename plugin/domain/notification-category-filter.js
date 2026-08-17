import {
  NOTIFICATION_CATEGORY_LABELS,
  projectNotificationCategories
} from './notification-classification.js';

function categoryFilterError(code, message, field, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = field ? { field, ...details } : { ...details };
  return error;
}

function validateCategories(categories) {
  if (!Array.isArray(categories) || categories.length === 0) {
    throw categoryFilterError(
      'NOTIFICATION_CATEGORY_FILTER_INVALID',
      'categories must be a non-empty array',
      'categories'
    );
  }
  const unique = [...new Set(categories.map((category) => category === 'plugin' ? 'external_call' : category))];
  if (unique.some((category) => typeof category !== 'string' || !NOTIFICATION_CATEGORY_LABELS.includes(category))) {
    throw categoryFilterError(
      'NOTIFICATION_CATEGORY_FILTER_INVALID',
      'categories contains an unsupported category',
      'categories',
      { supported: NOTIFICATION_CATEGORY_LABELS }
    );
  }
  return unique;
}

export function filterNotificationsByCategories(records, categories, options = {}) {
  if (!Array.isArray(records)) {
    throw categoryFilterError(
      'NOTIFICATION_CATEGORY_FILTER_RECORDS_INVALID',
      'records must be an array',
      'records'
    );
  }
  const requested = validateCategories(categories);
  const match = options?.match ?? 'any';
  if (!['any', 'all'].includes(match)) {
    throw categoryFilterError(
      'NOTIFICATION_CATEGORY_FILTER_MATCH_INVALID',
      'match must be any or all',
      'match'
    );
  }

  return records.filter((record) => {
    const labels = new Set(projectNotificationCategories(record).labels);
    return match === 'all'
      ? requested.every((category) => labels.has(category))
      : requested.some((category) => labels.has(category));
  });
}
