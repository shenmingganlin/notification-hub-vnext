const DEFAULT_POLICY = Object.freeze({
  mode: 'summary',
  maxMembers: 5,
  maxContentLength: 2000,
  preserveRecords: true,
  titleTemplate: '{firstTitle} · {count} 条通知'
});
const MODES = ['single', 'summary', 'full'];
const IMPORTANCE_ORDER = ['low', 'normal', 'high', 'critical'];
const TITLE_PLACEHOLDERS = new Set(['firstTitle', 'count']);

export const AGGREGATION_MODES = Object.freeze([...MODES]);

function aggregationError(code, message, field, details = {}) {
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

function validatePolicy(policy) {
  if (!isPlainObject(policy)) {
    throw aggregationError('NOTIFICATION_AGGREGATION_CONTENT_LENGTH_INVALID', 'policy must be a plain object', 'policy');
  }
  if (!MODES.includes(policy.mode)) {
    throw aggregationError('NOTIFICATION_AGGREGATION_MODE_INVALID', `Unsupported aggregation mode: ${policy.mode}`, 'policy.mode');
  }
  if (!Number.isInteger(policy.maxMembers) || policy.maxMembers <= 0 || policy.maxMembers > 1000) {
    throw aggregationError(
      'NOTIFICATION_AGGREGATION_MEMBER_LIMIT_INVALID',
      'policy.maxMembers must be an integer from 1 to 1000',
      'policy.maxMembers'
    );
  }
  if (!Number.isInteger(policy.maxContentLength) || policy.maxContentLength <= 0 || policy.maxContentLength > 100000) {
    throw aggregationError(
      'NOTIFICATION_AGGREGATION_CONTENT_LENGTH_INVALID',
      'policy.maxContentLength must be an integer from 1 to 100000',
      'policy.maxContentLength'
    );
  }
  if (typeof policy.preserveRecords !== 'boolean') {
    throw aggregationError(
      'NOTIFICATION_AGGREGATION_CONTENT_LENGTH_INVALID',
      'policy.preserveRecords must be a boolean',
      'policy.preserveRecords'
    );
  }
  if (typeof policy.titleTemplate !== 'string' || policy.titleTemplate.length === 0) {
    throw aggregationError(
      'NOTIFICATION_AGGREGATION_TITLE_TEMPLATE_INVALID',
      'policy.titleTemplate must be a non-empty string',
      'policy.titleTemplate'
    );
  }
  const placeholders = [...policy.titleTemplate.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
  if (placeholders.some((placeholder) => !TITLE_PLACEHOLDERS.has(placeholder))) {
    throw aggregationError(
      'NOTIFICATION_AGGREGATION_TITLE_TEMPLATE_INVALID',
      'policy.titleTemplate contains an unsupported placeholder',
      'policy.titleTemplate'
    );
  }
}

function validateMember(member, index) {
  const field = (name) => `members[${index}].${name}`;
  if (!isPlainObject(member)) {
    throw aggregationError('NOTIFICATION_AGGREGATION_MEMBER_INVALID', 'member must be a plain object', `members[${index}]`);
  }
  for (const name of ['notificationId', 'title', 'content', 'createdAt']) {
    if (typeof member[name] !== 'string' || member[name].trim().length === 0) {
      throw aggregationError(
        'NOTIFICATION_AGGREGATION_MEMBER_INVALID',
        `${field(name)} must be a non-empty string`,
        field(name)
      );
    }
  }
  if (Number.isNaN(Date.parse(member.createdAt))) {
    throw aggregationError(
      'NOTIFICATION_AGGREGATION_MEMBER_INVALID',
      `${field('createdAt')} must be a valid timestamp`,
      field('createdAt')
    );
  }
  if (!IMPORTANCE_ORDER.includes(member.importance)) {
    throw aggregationError(
      'NOTIFICATION_AGGREGATION_MEMBER_INVALID',
      `${field('importance')} is invalid`,
      field('importance')
    );
  }
  if (member.summary !== undefined && typeof member.summary !== 'string') {
    throw aggregationError(
      'NOTIFICATION_AGGREGATION_MEMBER_INVALID',
      `${field('summary')} must be a string`,
      field('summary')
    );
  }
  if (member.source !== undefined && typeof member.source !== 'string') {
    throw aggregationError(
      'NOTIFICATION_AGGREGATION_MEMBER_INVALID',
      `${field('source')} must be a string`,
      field('source')
    );
  }
}

function validateInput({ groupKey, members, policy }) {
  if (typeof groupKey !== 'string' || groupKey.trim().length === 0) {
    throw aggregationError(
      'NOTIFICATION_AGGREGATION_GROUP_KEY_INVALID',
      'groupKey must be a non-empty string',
      'groupKey'
    );
  }
  if (!Array.isArray(members) || members.length === 0) {
    throw aggregationError(
      'NOTIFICATION_AGGREGATION_MEMBERS_INVALID',
      'members must be a non-empty array',
      'members'
    );
  }
  members.forEach(validateMember);
  validatePolicy(policy);
  if (members.length > policy.maxMembers || (policy.mode === 'single' && members.length > 1)) {
    throw aggregationError(
      'NOTIFICATION_AGGREGATION_MEMBER_LIMIT_INVALID',
      'members exceed the aggregation limit',
      'members'
    );
  }
}

function memberSummary(member) {
  return {
    notificationId: member.notificationId,
    title: member.title,
    summary: member.summary ?? member.content,
    content: member.content,
    importance: member.importance,
    source: member.source,
    createdAt: member.createdAt
  };
}

function renderTitle(template, firstTitle, count) {
  return template
    .replaceAll('{firstTitle}', firstTitle)
    .replaceAll('{count}', String(count));
}

function renderContent(members, mode, maxLength) {
  const values = members.map((member) => mode === 'full' ? member.content : (member.summary ?? member.content));
  let content = '';
  let included = 0;
  for (const value of values) {
    const candidate = content ? `${content}\n${value}` : value;
    if (candidate.length > maxLength) break;
    content = candidate;
    included += 1;
  }
  return {
    content,
    truncated: included < values.length
  };
}

export function createNotificationAggregation({ groupKey, members, policy = {} } = {}) {
  if (!isPlainObject(policy)) {
    throw aggregationError(
      'NOTIFICATION_AGGREGATION_CONTENT_LENGTH_INVALID',
      'policy must be a plain object',
      'policy'
    );
  }
  const effectivePolicy = { ...DEFAULT_POLICY, ...cloneDeep(policy) };
  validateInput({ groupKey, members, policy: effectivePolicy });
  const summaries = members.map(memberSummary);
  const contentMode = effectivePolicy.mode === 'single' ? 'summary' : effectivePolicy.mode;
  const rendered = renderContent(members, contentMode, effectivePolicy.maxContentLength);
  const highestImportance = members.reduce((highest, member) => (
    IMPORTANCE_ORDER.indexOf(member.importance) > IMPORTANCE_ORDER.indexOf(highest)
      ? member.importance
      : highest
  ), 'low');
  const result = {
    aggregationId: `group-${groupKey}`,
    groupKey,
    mode: effectivePolicy.mode,
    memberCount: members.length,
    members: summaries,
    title: renderTitle(effectivePolicy.titleTemplate, members[0].title, members.length),
    content: rendered.content,
    importance: highestImportance,
    containsCritical: highestImportance === 'critical',
    firstCreatedAt: members[0].createdAt,
    lastCreatedAt: members[members.length - 1].createdAt,
    truncated: rendered.truncated
  };
  if (effectivePolicy.preserveRecords) result.records = cloneDeep(members);
  return freezeDeep(result);
}
