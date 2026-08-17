import { SOUND_CUES } from './sound-profile.js';
import { createSoundAsset } from './custom-sound-asset.js';

const BUILTIN_NAMES = Object.freeze({
  default: '默认提示',
  success: '成功',
  error: '错误',
  critical: '关键通知',
  'chat-incoming': '聊天到达',
  'channel-incoming': '频道到达',
  'tool-complete': '工具完成',
  'tool-failed': '工具失败',
  'plugin-notice': '插件通知',
  warning: '警告',
  'critical-error': '关键错误'
});

function registryError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function builtInDuration(cue) {
  return cue === 'critical-error' || cue === 'critical' ? 220 : 160;
}

export function createBuiltInSoundAssets() {
  return Object.freeze(Object.keys(BUILTIN_NAMES).map((cue) => createSoundAsset({
    soundId: `builtin.${cue}`,
    name: BUILTIN_NAMES[cue],
    kind: 'builtin',
    format: 'builtin',
    builtinCue: cue,
    relativePath: '',
    durationMs: builtInDuration(cue),
    fileSizeBytes: 0,
    sha256: null,
    enabled: true
  })));
}

export function createSoundAssetRegistry({ assets = [] } = {}) {
  if (!Array.isArray(assets)) throw registryError('SOUND_ASSET_REGISTRY_INVALID', 'assets must be an array');
  const allAssets = [...createBuiltInSoundAssets(), ...assets.map((asset) => createSoundAsset(asset))];
  const byId = new Map();
  for (const asset of allAssets) {
    if (byId.has(asset.soundId)) throw registryError('SOUND_ASSET_DUPLICATE_ID', `duplicate soundId: ${asset.soundId}`, { soundId: asset.soundId });
    byId.set(asset.soundId, asset);
  }

  function list() {
    return Object.freeze([...byId.values()]);
  }

  function get(soundId) {
    return byId.get(soundId) ?? null;
  }

  function resolvePlayback(soundId) {
    const asset = get(soundId);
    if (!asset) return { kind: 'missing', soundId, diagnostic: 'SOUND_ASSET_NOT_FOUND' };
    if (!asset.enabled) return { kind: 'disabled', soundId, diagnostic: 'SOUND_ASSET_DISABLED' };
    return asset;
  }

  function add(asset) {
    const normalized = createSoundAsset(asset);
    if (byId.has(normalized.soundId)) throw registryError('SOUND_ASSET_DUPLICATE_ID', `duplicate soundId: ${normalized.soundId}`, { soundId: normalized.soundId });
    byId.set(normalized.soundId, normalized);
    return normalized;
  }

  function remove(soundId) {
    const asset = get(soundId);
    if (!asset) return false;
    if (asset.kind === 'builtin') throw registryError('SOUND_ASSET_BUILTIN_IMMUTABLE', 'built-in sound assets cannot be removed', { soundId });
    return byId.delete(soundId);
  }

  return Object.freeze({ list, get, add, remove, resolvePlayback });
}

export { SOUND_CUES };
