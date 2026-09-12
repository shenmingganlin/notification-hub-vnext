import { createHash, randomUUID } from 'node:crypto';
import { inspectVisualAssetBuffer } from './visual-asset-format.js';

const KINDS = Object.freeze(['background', 'avatar', 'icon', 'particle', 'decoration']);
const FORMATS = new Set(['png', 'webp', 'jpg']);
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
function fail(code, message, details = {}) { return Object.assign(new Error(message), { code, details }); }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function text(value, field) { if (typeof value !== 'string' || !value.trim()) throw fail('VISUAL_ASSET_FIELD_INVALID', `${field} must be a non-empty string`, { field }); return value.trim(); }
function clone(value) { if (Array.isArray(value)) return value.map(clone); if (plain(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])); return value; }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

export function createVisualAssetLibrary({ storage, now = () => new Date().toISOString() } = {}) {
  if (!storage || typeof storage.put !== 'function' || typeof storage.remove !== 'function') throw fail('VISUAL_ASSET_STORAGE_INVALID', 'A storage adapter is required');
  const assets = new Map(); const byHash = new Map(); const refs = new Map();
  const project = (asset) => asset ? freeze({ ...clone(asset), references: refs.get(asset.assetId)?.size ?? 0 }) : null;
  const snapshot = () => ({ version: 1, assets: [...assets.values()].map(clone), references: Object.fromEntries([...refs].map(([id, values]) => [id, [...values.values()].map(clone)])) });
  return {
    async importBuffer(input = {}) {
      if (!plain(input)) throw fail('VISUAL_ASSET_FIELD_INVALID', 'asset input must be an object');
      const name = text(input.name, 'name'); const kind = text(input.kind, 'kind');
      if (!KINDS.includes(kind)) throw fail('VISUAL_ASSET_KIND_INVALID', `Unsupported asset kind: ${kind}`, { field: 'kind' });
      const tags = input.tags ?? []; if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string' || !tag.trim())) throw fail('VISUAL_ASSET_TAGS_INVALID', 'tags must be an array of non-empty strings', { field: 'tags' });
      const buffer = input.buffer; const inspected = inspectVisualAssetBuffer(buffer, name); const sha256 = createHash('sha256').update(buffer).digest('hex');
      const duplicate = byHash.get(sha256); if (duplicate) return duplicate;
      const assetId = input.assetId ?? `visual-asset-${randomUUID()}`; if (typeof assetId !== 'string' || !ID_PATTERN.test(assetId)) throw fail('VISUAL_ASSET_ID_INVALID', 'assetId contains unsupported characters', { field: 'assetId' });
      await storage.put(assetId, inspected.format, buffer);
      const record = freeze({ assetId, name, kind, format: inspected.format, path: await storage.resolveAssetPath?.(assetId, inspected.format) ?? `${assetId}.${inspected.format}`, width: inspected.width, height: inspected.height, byteSize: buffer.length, hasAlpha: inspected.hasAlpha, sha256, tags: [...new Set(tags.map((tag) => tag.trim()))], createdAt: now() });
      assets.set(assetId, record); byHash.set(sha256, record); refs.set(assetId, new Map()); return project(record);
    },
    get(assetId) { return project(assets.get(assetId)); },
    list(query = {}) { const textQuery = String(query.search ?? '').trim().toLowerCase(); const kind = query.kind; return [...assets.values()].filter((asset) => (!kind || asset.kind === kind) && (!textQuery || asset.name.toLowerCase().includes(textQuery) || asset.tags.some((tag) => tag.toLowerCase().includes(textQuery)))).map(project); },
    restoreSnapshot(input = {}) { if (!plain(input) || input.version !== 1 || !Array.isArray(input.assets) || !plain(input.references)) throw fail('VISUAL_ASSET_SNAPSHOT_INVALID', 'Visual asset snapshot is invalid'); const next = new Map(); const nextHashes = new Map(); const nextRefs = new Map(); for (const asset of input.assets) { if (!plain(asset) || typeof asset.assetId !== 'string' || !ID_PATTERN.test(asset.assetId) || typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(asset.sha256) || typeof asset.format !== 'string' || !FORMATS.has(asset.format)) throw fail('VISUAL_ASSET_SNAPSHOT_INVALID', 'Asset record is invalid'); if (next.has(asset.assetId) || nextHashes.has(asset.sha256)) throw fail('VISUAL_ASSET_SNAPSHOT_INVALID', 'Asset snapshot contains duplicates'); const record = freeze({ ...clone(asset) }); next.set(asset.assetId, record); nextHashes.set(asset.sha256, record); nextRefs.set(asset.assetId, new Map()); } for (const [assetId, values] of Object.entries(input.references)) { if (!next.has(assetId) || !Array.isArray(values)) throw fail('VISUAL_ASSET_SNAPSHOT_INVALID', 'Asset references are invalid'); for (const reference of values) { if (!plain(reference) || typeof reference.ownerType !== 'string' || typeof reference.ownerId !== 'string' || typeof reference.slot !== 'string') throw fail('VISUAL_ASSET_SNAPSHOT_INVALID', 'Asset reference is invalid'); nextRefs.get(assetId).set(`${reference.ownerType}:${reference.ownerId}:${reference.slot}`, freeze(clone(reference))); } } assets.clear(); byHash.clear(); refs.clear(); for (const [id, asset] of next) { assets.set(id, asset); refs.set(id, nextRefs.get(id)); byHash.set(asset.sha256, asset); } return { assetCount: assets.size }; },
    findBySha256(sha256) { return project(byHash.get(sha256)); },
    references(assetId) { return [...(refs.get(assetId)?.values() ?? [])].map(clone); },
    async addReference(assetId, reference) { if (!assets.has(assetId)) throw fail('VISUAL_ASSET_NOT_FOUND', `Unknown asset: ${assetId}`, { assetId }); if (!plain(reference)) throw fail('VISUAL_ASSET_REFERENCE_INVALID', 'reference must be an object'); const ownerType = text(reference.ownerType, 'ownerType'); const ownerId = text(reference.ownerId, 'ownerId'); const slot = text(reference.slot ?? 'default', 'slot'); const key = `${ownerType}:${ownerId}:${slot}`; refs.get(assetId).set(key, freeze({ ownerType, ownerId, slot })); return project(assets.get(assetId)); },
    removeReference(assetId, reference) { const value = refs.get(assetId); if (!value) return false; const key = `${reference.ownerType}:${reference.ownerId}:${reference.slot ?? 'default'}`; return value.delete(key); },
    async remove(assetId) { const asset = assets.get(assetId); if (!asset) return false; const references = this.references(assetId); if (references.length) throw fail('VISUAL_ASSET_IN_USE', `Asset is still referenced: ${assetId}`, { assetId, references }); await storage.remove(asset.assetId, asset.format); assets.delete(assetId); byHash.delete(asset.sha256); refs.delete(assetId); return true; },
    snapshot
  };
}

export { KINDS as VISUAL_ASSET_KINDS };
