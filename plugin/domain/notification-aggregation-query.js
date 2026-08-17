import {
  createNotificationFingerprint,
  evaluateNotificationDuplicate
} from './notification-deduplication.js';
import {
  createNotificationGroupKey,
  evaluateNotificationGrouping
} from './notification-grouping.js';
import { createNotificationAggregation } from './notification-aggregation.js';
import { validateNotificationRecord } from './notification-record.js';

function queryError(code, message, field, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = { ...(field ? { field } : {}), ...details };
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

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

const IMPORTANCE_ORDER = Object.freeze(['low', 'normal', 'high', 'critical']);
const SORT_FIELDS = Object.freeze(['firstCreatedAt', 'lastCreatedAt', 'importance', 'memberCount']);
const FILTER_FIELDS = Object.freeze([
  'importance', 'source', 'type', 'groupKey', 'containsCritical',
  'createdAfter', 'createdBefore', 'text'
]);

function validatePolicyBoundary(name, policy) {
  if (!isPlainObject(policy)) {
    throw queryError(
      'NOTIFICATION_AGGREGATION_QUERY_POLICY_INVALID',
      `${name} must be a plain object`,
      name
    );
  }
}

function validateFilter(filter) {
  if (!isPlainObject(filter)) {
    throw queryError(
      'NOTIFICATION_AGGREGATION_QUERY_FILTER_INVALID',
      'filter must be a plain object',
      'filter'
    );
  }
  for (const field of Object.keys(filter)) {
    if (!FILTER_FIELDS.includes(field)) {
      throw queryError(
        'NOTIFICATION_AGGREGATION_QUERY_FILTER_INVALID',
        `Unsupported filter field: ${field}`,
        `filter.${field}`
      );
    }
  }
  if (filter.importance !== undefined && !IMPORTANCE_ORDER.includes(filter.importance)) {
    throw queryError(
      'NOTIFICATION_AGGREGATION_QUERY_FILTER_IMPORTANCE_INVALID',
      `Unsupported filter importance: ${filter.importance}`,
      'filter.importance'
    );
  }
  if (filter.containsCritical !== undefined && typeof filter.containsCritical !== 'boolean') {
    throw queryError(
      'NOTIFICATION_AGGREGATION_QUERY_FILTER_INVALID',
      'filter.containsCritical must be a boolean',
      'filter.containsCritical'
    );
  }
  for (const field of ['createdAfter', 'createdBefore']) {
    if (filter[field] !== undefined && (typeof filter[field] !== 'string' || Number.isNaN(Date.parse(filter[field])))) {
      throw queryError(
        'NOTIFICATION_AGGREGATION_QUERY_FILTER_TIMESTAMP_INVALID',
        `filter.${field} must be a valid timestamp`,
        `filter.${field}`
      );
    }
  }
  for (const field of ['source', 'type', 'groupKey', 'text']) {
    if (filter[field] !== undefined && typeof filter[field] !== 'string') {
      throw queryError(
        'NOTIFICATION_AGGREGATION_QUERY_FILTER_INVALID',
        `filter.${field} must be a string`,
        `filter.${field}`
      );
    }
  }
  if (filter.createdAfter !== undefined && filter.createdBefore !== undefined
    && Date.parse(filter.createdAfter) >= Date.parse(filter.createdBefore)) {
    throw queryError(
      'NOTIFICATION_AGGREGATION_QUERY_FILTER_TIMESTAMP_INVALID',
      'filter.createdAfter must be earlier than filter.createdBefore',
      'filter'
    );
  }
}

function validateSort(sort) {
  if (!isPlainObject(sort)) {
    throw queryError('NOTIFICATION_AGGREGATION_QUERY_SORT_INVALID', 'sort must be a plain object', 'sort');
  }
  const effectiveSort = {
    field: sort.field ?? 'firstCreatedAt',
    direction: sort.direction ?? 'asc'
  };
  if (!SORT_FIELDS.includes(effectiveSort.field)
    || !['asc', 'desc'].includes(effectiveSort.direction)) {
    throw queryError('NOTIFICATION_AGGREGATION_QUERY_SORT_INVALID', 'sort field or direction is invalid', 'sort');
  }
  return effectiveSort;
}

function validatePagination(offset, limit) {
  if (!Number.isInteger(offset) || offset < 0 || offset > 1000000
    || !Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw queryError(
      'NOTIFICATION_AGGREGATION_QUERY_PAGINATION_INVALID',
      'offset must be 0..1000000 and limit must be 1..500',
      'pagination'
    );
  }
}

function validateRecords(records) {
  if (!Array.isArray(records)) {
    throw queryError(
      'NOTIFICATION_AGGREGATION_QUERY_RECORDS_INVALID',
      'records must be an array',
      'records'
    );
  }
  records.forEach((record, index) => {
    try {
      validateNotificationRecord(record);
    } catch (error) {
      throw queryError(
        'NOTIFICATION_AGGREGATION_QUERY_RECORD_INVALID',
        `records[${index}] is not a valid NotificationRecord`,
        `records[${index}]`,
        { causeCode: error.code }
      );
    }
  });
}

function aggregationMember(record) {
  return {
    notificationId: record.notificationId,
    title: record.title,
    content: record.content,
    ...(typeof record.summary === 'string' ? { summary: record.summary } : {}),
    importance: record.importance,
    source: record.source,
    type: record.type,
    createdAt: record.createdAt
  };
}

function compareCreatedAt(left, right) {
  const difference = Date.parse(left.createdAt) - Date.parse(right.createdAt);
  return difference || left.notificationId.localeCompare(right.notificationId);
}

function createGroupState(record, groupKey, aggregationPolicy) {
  return {
    groupKey,
    createdAt: record.createdAt,
    lastActivityAt: record.createdAt,
    memberCount: 1,
    containsCritical: record.importance === 'critical',
    members: [record],
    aggregationPolicy
  };
}

function groupSummary(group, aggregationPolicy) {
  return createNotificationAggregation({
    groupKey: group.groupKey,
    members: group.members.map(aggregationMember),
    policy: aggregationPolicy
  });
}

function matchesFilter(aggregation, group, filter) {
  if (filter.importance !== undefined && aggregation.importance !== filter.importance) return false;
  if (filter.groupKey !== undefined && aggregation.groupKey !== filter.groupKey) return false;
  if (filter.containsCritical !== undefined && aggregation.containsCritical !== filter.containsCritical) return false;
  if (filter.source !== undefined && !group.members.some((member) => member.source === filter.source)) return false;
  if (filter.type !== undefined && !group.members.some((member) => member.type === filter.type)) return false;
  const firstTime = Date.parse(aggregation.firstCreatedAt);
  if (filter.createdAfter !== undefined && firstTime < Date.parse(filter.createdAfter)) return false;
  if (filter.createdBefore !== undefined && firstTime >= Date.parse(filter.createdBefore)) return false;
  if (filter.text !== undefined && filter.text.length > 0) {
    const text = filter.text.toLocaleLowerCase();
    if (!`${aggregation.title}\n${aggregation.content}`.toLocaleLowerCase().includes(text)) return false;
  }
  return true;
}

function compareAggregations(left, right, sort) {
  let difference;
  if (sort.field === 'importance') {
    difference = IMPORTANCE_ORDER.indexOf(left.importance) - IMPORTANCE_ORDER.indexOf(right.importance);
  } else if (sort.field === 'memberCount') {
    difference = left.memberCount - right.memberCount;
  } else {
    difference = Date.parse(left[sort.field]) - Date.parse(right[sort.field]);
  }
  if (sort.direction === 'desc') difference *= -1;
  return difference || left.aggregationId.localeCompare(right.aggregationId);
}

function addToGroup(group, record) {
  return {
    ...group,
    lastActivityAt: record.createdAt,
    memberCount: group.memberCount + 1,
    containsCritical: group.containsCritical || record.importance === 'critical',
    members: [...group.members, record]
  };
}

function groupRecord(record, groups, groupingPolicy, aggregationPolicy) {
  const keyResult = createNotificationGroupKey(record, groupingPolicy);
  const sessionOnly = groupingPolicy.mode === 'session' && keyResult.basis !== 'session';
  if (!keyResult.stable || sessionOnly) {
    const ungroupedKey = `ungrouped:${record.notificationId}`;
    const group = createGroupState(record, ungroupedKey, aggregationPolicy);
    groups.push(group);
    return group;
  }

  const candidates = groups.filter((group) => group.groupKey === keyResult.key);
  const current = candidates.at(-1);
  if (!current) {
    const group = createGroupState(record, keyResult.key, aggregationPolicy);
    groups.push(group);
    return group;
  }

  const decision = evaluateNotificationGrouping({
    notification: record,
    group: current,
    policy: groupingPolicy
  });
  if (decision.decision === 'join') {
    const next = addToGroup(current, record);
    groups[groups.indexOf(current)] = next;
    return next;
  }

  const group = createGroupState(record, keyResult.key, aggregationPolicy);
  groups.push(group);
  return group;
}

export function queryNotificationAggregations({
  records,
  groupingPolicy = {},
  deduplicationPolicy = {},
  aggregationPolicy = {},
  includeDuplicates = false,
  filter = {},
  sort = {},
  offset = 0,
  limit = 50
} = {}) {
  validateRecords(records);
  validatePolicyBoundary('groupingPolicy', groupingPolicy);
  validatePolicyBoundary('deduplicationPolicy', deduplicationPolicy);
  validatePolicyBoundary('aggregationPolicy', aggregationPolicy);
  validateFilter(filter);
  const effectiveSort = validateSort(sort);
  validatePagination(offset, limit);
  if (typeof includeDuplicates !== 'boolean') {
    throw queryError(
      'NOTIFICATION_AGGREGATION_QUERY_POLICY_INVALID',
      'includeDuplicates must be a boolean',
      'includeDuplicates'
    );
  }

  const sortedRecords = [...records].sort(compareCreatedAt);
  const groups = [];
  const latestByFingerprint = new Map();
  let duplicateCount = 0;
  for (const record of sortedRecords) {
    const fingerprint = createNotificationFingerprint(record, deduplicationPolicy);
    const previous = fingerprint.key === null ? undefined : latestByFingerprint.get(fingerprint.key);
    const duplicate = evaluateNotificationDuplicate({
      notification: record,
      previous,
      policy: deduplicationPolicy
    });
    if (fingerprint.key !== null && duplicate.decision !== 'duplicate') {
      latestByFingerprint.set(fingerprint.key, record);
    }
    if (duplicate.decision === 'duplicate') {
      duplicateCount += 1;
      if (!includeDuplicates) continue;
    }
    groupRecord(record, groups, groupingPolicy, aggregationPolicy);
  }

  const filtered = groups
    .map((group) => ({ aggregation: groupSummary(group, aggregationPolicy), group }))
    .filter(({ aggregation, group }) => matchesFilter(aggregation, group, filter))
    .sort((left, right) => compareAggregations(left.aggregation, right.aggregation, effectiveSort));
  const totalCount = filtered.length;
  const page = filtered.slice(offset, offset + limit).map(({ aggregation }) => aggregation);
  const ungroupedCount = groups.filter((group) => group.groupKey.startsWith('ungrouped:')).length;
  return freezeDeep({
    aggregations: page,
    duplicateCount,
    ungroupedCount,
    sourceCount: records.length,
    totalCount,
    returnedCount: page.length,
    offset,
    limit,
    sort: effectiveSort,
    hasMore: offset + page.length < totalCount
  });
}
