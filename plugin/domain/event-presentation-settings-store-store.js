import { readFile } from 'node:fs/promises';

import { replaceFileAtomically } from '../persistence/atomic-file-replace.js';
import {
  createEventPresentationSettingsStoreSnapshot,
  EVENT_PRESENTATION_SETTINGS_STORE_VERSION
} from './event-presentation-settings-store.js';

function storeError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function validatePath(filePath) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw storeError('EVENT_PRESENTATION_SETTINGS_PATH_INVALID', 'Event presentation settings path must be a non-empty string');
  }
}

function serialize(snapshot) {
  if (snapshot?.version !== EVENT_PRESENTATION_SETTINGS_STORE_VERSION) {
    throw storeError('EVENT_PRESENTATION_SETTINGS_SNAPSHOT_VERSION_UNSUPPORTED', 'Unsupported event presentation settings snapshot version');
  }
  return `${JSON.stringify(snapshot)}\n`;
}

function parse(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw storeError('EVENT_PRESENTATION_SETTINGS_SNAPSHOT_PARSE_FAILED', 'Event presentation settings snapshot contains invalid JSON');
  }
  if (value?.version !== EVENT_PRESENTATION_SETTINGS_STORE_VERSION) {
    throw storeError('EVENT_PRESENTATION_SETTINGS_SNAPSHOT_VERSION_UNSUPPORTED', 'Unsupported event presentation settings snapshot version');
  }
  try {
    return createEventPresentationSettingsStoreSnapshot(value.settings, value.revision, { updatedAt: value.updatedAt });
  } catch (cause) {
    throw storeError('EVENT_PRESENTATION_SETTINGS_SNAPSHOT_INVALID', 'Event presentation settings snapshot is invalid', {
      cause: cause.code ?? cause.message
    });
  }
}

export async function saveEventPresentationSettingsSnapshot(snapshot, filePath) {
  validatePath(filePath);
  const serialized = serialize(snapshot);
  try {
    return await replaceFileAtomically(filePath, serialized);
  } catch (cause) {
    if (cause.code?.startsWith('EVENT_PRESENTATION_SETTINGS_')) throw cause;
    throw storeError('EVENT_PRESENTATION_SETTINGS_PERSIST_FAILED', 'Failed to persist event presentation settings snapshot', {
      path: filePath,
      cause: cause.message,
      code: cause.code,
      ...(cause.details ?? {})
    });
  }
}

export async function loadEventPresentationSettingsSnapshot(filePath) {
  validatePath(filePath);
  try {
    return parse(await readFile(filePath, 'utf8'));
  } catch (cause) {
    if (cause.code === 'ENOENT') return null;
    if (cause.code?.startsWith('EVENT_PRESENTATION_SETTINGS_')) {
      throw storeError('EVENT_PRESENTATION_SETTINGS_LOAD_FAILED', 'Failed to load event presentation settings snapshot', {
        path: filePath,
        cause: cause.code,
        parseCause: cause.details?.cause
      });
    }
    throw storeError('EVENT_PRESENTATION_SETTINGS_LOAD_FAILED', 'Failed to load event presentation settings snapshot', {
      path: filePath,
      cause: cause.message,
      code: cause.code
    });
  }
}

export { parse as parseEventPresentationSettingsSnapshot, serialize as serializeEventPresentationSettingsSnapshot };
