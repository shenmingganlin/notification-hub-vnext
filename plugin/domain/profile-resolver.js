import {
  NOTIFICATION_PROFILE_FIELDS,
  createNotificationProfile
} from './notification-profile.js';

const NESTED_FIELDS = new Set([
  'soundPolicy',
  'contentPolicy',
  'historyPolicy',
  'runtimeHints',
  'importanceKeywords'
]);

function resolverError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
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

function normalizeProfiles(profiles) {
  if (Array.isArray(profiles)) return profiles.map((profile) => cloneDeep(profile));
  if (isPlainObject(profiles)) {
    return Object.entries(profiles).map(([id, profile]) => {
      if (!isPlainObject(profile)) return profile;
      return profile.id === undefined ? { ...cloneDeep(profile), id } : cloneDeep(profile);
    });
  }
  throw resolverError(
    'NOTIFICATION_PROFILE_COLLECTION_INVALID',
    'profiles must be an array or plain object'
  );
}

function validateAndIndex(profiles) {
  const indexed = new Map();
  for (const input of profiles) {
    if (!isPlainObject(input)) {
      throw resolverError(
        'NOTIFICATION_PROFILE_INVALID',
        'Each NotificationProfile must be a plain object'
      );
    }
    const profile = createNotificationProfile(input);
    if (indexed.has(profile.id)) {
      throw resolverError(
        'NOTIFICATION_PROFILE_DUPLICATE_ID',
        `Duplicate NotificationProfile id: ${profile.id}`,
        { profileId: profile.id }
      );
    }
    indexed.set(profile.id, {
      profile,
      overrides: cloneDeep(input)
    });
  }
  return indexed;
}

function mergeValues(target, source) {
  const result = { ...target };
  for (const field of Object.keys(source)) {
    if (NESTED_FIELDS.has(field) && isPlainObject(source[field])) {
      result[field] = { ...(result[field] ?? {}), ...cloneDeep(source[field]) };
    } else {
      result[field] = cloneDeep(source[field]);
    }
  }
  return result;
}

function sourcePaths(profile, sourceId, sources) {
  for (const field of NOTIFICATION_PROFILE_FIELDS) {
    if (!(field in profile)) continue;
    if (NESTED_FIELDS.has(field) && isPlainObject(profile[field])) {
      for (const nested of Object.keys(profile[field])) {
        sources[`${field}.${nested}`] = sourceId;
      }
    } else {
      sources[field] = sourceId;
    }
  }
}

function resolveChain(indexed, profileId) {
  const chain = [];
  const visiting = new Set();
  let currentId = profileId;

  while (currentId !== null) {
    if (visiting.has(currentId)) {
      throw resolverError(
        'NOTIFICATION_PROFILE_INHERITANCE_CYCLE',
        `NotificationProfile inheritance cycle detected at: ${currentId}`,
        { profileId: currentId, chain: [...chain, currentId] }
      );
    }
    const entry = indexed.get(currentId);
    if (!entry) {
      if (chain.length === 0) {
        throw resolverError(
          'NOTIFICATION_PROFILE_NOT_FOUND',
          `NotificationProfile not found: ${currentId}`,
          { profileId: currentId }
        );
      }
      const parentId = chain.at(-1);
      throw resolverError(
        'NOTIFICATION_PROFILE_PARENT_NOT_FOUND',
        `Parent NotificationProfile not found: ${currentId}`,
        { profileId: parentId, parentId: currentId }
      );
    }
    visiting.add(currentId);
    chain.push(currentId);
    currentId = entry.overrides.parentId ?? null;
  }
  return chain;
}

export function resolveNotificationProfile({
  profiles,
  profileId = 'default',
  fallbackProfileId = 'default'
} = {}) {
  const normalized = normalizeProfiles(profiles);
  const indexed = validateAndIndex(normalized);
  const targetId = profileId ?? fallbackProfileId;
  const chain = resolveChain(indexed, targetId).reverse();
  let merged = {};
  const sources = {};

  for (const id of chain) {
    const entry = indexed.get(id);
    merged = mergeValues(merged, entry.overrides);
    sourcePaths(entry.overrides, id, sources);
  }

  const profile = createNotificationProfile(merged);
  for (const field of NOTIFICATION_PROFILE_FIELDS) {
    if (field === 'parentId' || field in sources) continue;
    if (NESTED_FIELDS.has(field)) {
      for (const nested of Object.keys(profile[field])) {
        sources[`${field}.${nested}`] ??= chain[0];
      }
    } else {
      sources[field] ??= chain[0];
    }
  }

  return freezeDeep({
    profile,
    sources,
    chain,
    profileId: targetId
  });
}
