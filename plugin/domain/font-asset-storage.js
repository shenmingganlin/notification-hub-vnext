import { readFile, rm } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

import { replaceFileAtomically } from '../persistence/atomic-file-replace.js';

const FORMATS = new Set(['ttf', 'otf']);

function fail(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function safePart(value, field) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(value)) {
    throw fail('FONT_ASSET_PATH_INVALID', `${field} contains unsupported characters`, { field });
  }
  return value;
}

export function createFontAssetStorage(rootDir) {
  if (typeof rootDir !== 'string' || !rootDir.trim()) {
    throw fail('FONT_ASSET_PATH_INVALID', 'rootDir must be a non-empty string');
  }
  const root = resolve(rootDir);

  function resolveAssetPath(assetId, format) {
    const id = safePart(assetId, 'assetId');
    const normalized = safePart(format, 'format').toLowerCase();
    if (!FORMATS.has(normalized)) throw fail('FONT_ASSET_FORMAT_UNSUPPORTED', `Unsupported storage format: ${format}`);
    const target = resolve(root, `${id}.${normalized}`);
    const rel = relative(root, target);
    if (isAbsolute(rel) || rel.startsWith('..') || rel.includes('..\\') || rel.includes('../')) {
      throw fail('FONT_ASSET_PATH_INVALID', 'Asset path escapes storage root');
    }
    return target;
  }

  return {
    rootDir: root,
    resolveAssetPath,
    async put(assetId, format, buffer) {
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw fail('FONT_ASSET_DATA_INVALID', 'Asset data must be a non-empty Buffer');
      }
      const target = resolveAssetPath(assetId, format);
      try {
        return await replaceFileAtomically(target, buffer);
      } catch (cause) {
        if (cause.code?.startsWith('FONT_ASSET_')) throw cause;
        throw fail('FONT_ASSET_PERSIST_FAILED', 'Failed to persist font asset file', {
          path: target,
          cause: cause.message,
          code: cause.code,
          ...(cause.details ?? {})
        });
      }
    },
    async read(assetId, format) {
      return readFile(resolveAssetPath(assetId, format));
    },
    async remove(assetId, format) {
      await rm(resolveAssetPath(assetId, format), { force: true });
    }
  };
}
