import { createHash } from 'node:crypto';
import { readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { replaceFileAtomically } from '../persistence/atomic-file-replace.js';
import { SOUND_PACKAGE_MAX_ASSET_BYTES } from './sound-package.js';
import { SOUND_ASSET_FORMATS, createSoundAsset, normalizeSoundId } from './custom-sound-asset.js';
import { normalizeSoundBindingInput, soundIdForBinding } from './sound-binding.js';

const EXTENSION_FORMATS = Object.freeze({
  '.wav': 'wav',
  '.mp3': 'mp3',
  '.m4a': 'm4a',
  '.aac': 'aac',
  '.wma': 'wma'
});

function importerError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function safeName(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

function slugFromFilename(filename) {
  const base = path.basename(String(filename || ''), path.extname(String(filename || '')))
    .replace(/[^\p{L}\p{N}._-]+/gu, '_')
    .replace(/^[_\s]+|[_\s]+$/gu, '');
  return base || 'custom-sound';
}

function resolveTarget(root, relativePath) {
  const target = path.resolve(root, ...relativePath.split('/'));
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw importerError('SOUND_ASSET_PATH_INVALID', 'sound asset path escapes assetRoot');
  return target;
}

async function readFileValue(file, filePath, filename) {
  if (typeof filePath === 'string' && filePath.trim()) {
    let data;
    try { data = await readFile(filePath); } catch (cause) { throw importerError('SOUND_ASSET_FILE_READ_FAILED', '音频文件无法读取', { cause: cause.message }); }
    return { data, filename: filename || path.basename(filePath), mimeType: '' };
  }
  if (Buffer.isBuffer(file)) return { data: file, filename: 'custom.wav', mimeType: '' };
  if (file instanceof Uint8Array) return { data: Buffer.from(file), filename: 'custom.wav', mimeType: '' };
  if (!file || typeof file.arrayBuffer !== 'function') throw importerError('SOUND_ASSET_FILE_INVALID', 'audio must be a file upload');
  let arrayBuffer;
  try { arrayBuffer = await file.arrayBuffer(); } catch { throw importerError('SOUND_ASSET_FILE_INVALID', 'audio file could not be read'); }
  return {
    data: Buffer.from(arrayBuffer),
    filename: typeof file.name === 'string' ? file.name : 'custom.wav',
    mimeType: typeof file.type === 'string' ? file.type : ''
  };
}

export async function importSoundAsset({ file, filePath, filename, assetRoot, registry, name, soundId, binding, replaceExisting = false, commit } = {}) {
  if (!registry || typeof registry.get !== 'function' || typeof registry.add !== 'function') throw importerError('SOUND_ASSET_REGISTRY_INVALID', 'registry is required');
  if (typeof assetRoot !== 'string' || !assetRoot.trim()) throw importerError('SOUND_ASSET_PATH_INVALID', 'assetRoot must be a non-empty path');
  const input = await readFileValue(file, filePath, filename);
  if (input.data.length === 0) throw importerError('SOUND_ASSET_FILE_EMPTY', 'audio file must not be empty');
  if (input.data.length > SOUND_PACKAGE_MAX_ASSET_BYTES) throw importerError('SOUND_ASSET_TOO_LARGE', 'audio file exceeds the 64 MiB limit', { maxBytes: SOUND_PACKAGE_MAX_ASSET_BYTES });
  const extension = path.extname(input.filename).toLowerCase();
  const format = EXTENSION_FORMATS[extension];
  if (!format || !SOUND_ASSET_FORMATS.includes(format)) throw importerError('SOUND_ASSET_FORMAT_INVALID', '音频文件格式不受支持', { filename: input.filename });

  const baseSoundId = normalizeSoundId(soundId || slugFromFilename(input.filename));
  const normalizedBinding = binding ? normalizeSoundBindingInput({ ...binding, soundId: baseSoundId }) : null;
  const normalizedId = normalizedBinding ? soundIdForBinding(normalizedBinding) : baseSoundId;
  const previous = registry.get(normalizedId);
  if (previous && !replaceExisting) throw importerError('SOUND_ASSET_DUPLICATE_ID', `soundId already exists: ${normalizedId}`, { soundId: normalizedId });
  if (previous?.kind === 'builtin') throw importerError('SOUND_ASSET_BUILTIN_IMMUTABLE', '内置声音不能覆盖', { soundId: normalizedId });
  const asset = createSoundAsset({
    soundId: normalizedId,
    name: safeName(name, path.basename(input.filename, extension)),
    kind: 'custom',
    format,
    relativePath: previous?.format === format ? previous.relativePath : `custom/${normalizedId}.${format}`,
    durationMs: 0,
    fileSizeBytes: input.data.length,
    sha256: createHash('sha256').update(input.data).digest('hex'),
    enabled: true
  });
  const root = path.resolve(assetRoot);
  const target = resolveTarget(root, asset.relativePath);
  const previousTarget = previous ? resolveTarget(root, previous.relativePath) : null;
  const samePath = Boolean(previousTarget && previousTarget === target);
  const backup = `${previousTarget || target}.backup-${process.pid}-${Date.now()}`;
  let movedPrevious = false;
  let registryChanged = false;
  try {
    if (previous && previousTarget && !samePath) {
      try { await rename(previousTarget, backup); movedPrevious = true; } catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
    }
    await replaceFileAtomically(target, input.data);
    if (previous) registry.remove(normalizedId);
    registry.add(asset);
    registryChanged = true;
    if (typeof commit === 'function') await commit(asset);
    if (movedPrevious) await rm(backup, { force: true });
    return Object.freeze({ asset, path: target, replaced: Boolean(previous), binding: normalizedBinding });
  } catch (cause) {
    if (registryChanged) registry.remove(normalizedId);
    if (previous && !registry.get(normalizedId)) registry.add(previous);
    if (!samePath) await rm(target, { force: true }).catch(() => {});
    if (movedPrevious) await rename(backup, previousTarget).catch(() => {});
    if (cause.code?.startsWith('SOUND_ASSET_')) throw cause;
    throw importerError('SOUND_ASSET_IMPORT_FAILED', '音频导入失败', { cause: cause.message });
  }
}

export { EXTENSION_FORMATS };
