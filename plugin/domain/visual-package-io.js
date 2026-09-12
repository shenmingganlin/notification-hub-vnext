import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import AdmZip from 'adm-zip';
import { createVisualPackageManifest, validateVisualPackageEntries, VISUAL_PACKAGE_FORMAT, VISUAL_PACKAGE_CAPABILITIES } from './visual-package-manifest.js';

const PACKAGE_VERSION = '1.0.0';
const ASSET_FORMATS = new Set(['png', 'webp', 'jpg']);
const CONFLICT_STRATEGIES = Object.freeze(['copy', 'skip', 'overwrite']);
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/i;

function buildIssue({ scope, code, severity = 'error', id = null, message, details = {} } = {}) {
  return { scope, code, severity, ...(id ? { id } : {}), message, details };
}
function summarizeIssues(issues = []) {
  return {
    total: issues.length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
    errors: issues.filter((issue) => issue.severity === 'error').length
  };
}

function packageError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (plain(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}
function text(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw packageError('VISUAL_PACKAGE_IO_INVALID', `${field} must be a non-empty string`, { field });
  return value.trim();
}
function validateId(value, field) {
  const id = text(value, field);
  if (!ID_PATTERN.test(id)) throw packageError('VISUAL_PACKAGE_IO_INVALID', `${field} contains unsupported characters`, { field });
  return id;
}

/**
 * Collect profiles, bindings, and assets into a package data structure.
 * Returns an intermediate representation that can be serialized to ZIP.
 */
async function collectPackageData({ profileRegistry, bindingRegistry, assetLibrary, profileIds, storage }) {
  const profileIdsToExport = profileIds ?? profileRegistry.list();
  if (profileIdsToExport.length === 0) throw packageError('VISUAL_PACKAGE_IO_EMPTY', 'No profiles to export');

  const profiles = [];
  const bindings = [];
  const assetIds = new Set();
  const entries = ['manifest.json'];

  for (const profileId of profileIdsToExport) {
    const record = profileRegistry.get(profileId);
    if (!record) throw packageError('VISUAL_PACKAGE_IO_PROFILE_NOT_FOUND', `Unknown profile: ${profileId}`, { profileId });
    profiles.push({ profileId: record.profileId, name: record.name, profile: clone(record.profile) });
    const entryPath = `settings/profiles/${profileId}.json`;
    entries.push(entryPath);

    // Collect asset IDs referenced by this profile's card appearance
    const card = record.profile.card;
    if (card?.types?.minimal?.appearance?.backgroundAssetId) {
      assetIds.add(card.types.minimal.appearance.backgroundAssetId);
    }
  }

  // Collect bindings that reference the exported profiles
  const allBindings = bindingRegistry.list();
  for (const binding of allBindings) {
    if (profileIdsToExport.includes(binding.visualProfileId)) {
      bindings.push({ eventId: binding.eventId, visualProfileId: binding.visualProfileId, behaviorChannelId: binding.behaviorChannelId, source: binding.source ?? 'local' });
    }
  }
  if (bindings.length > 0) entries.push('settings/event-bindings.json');
  if (assetIds.size > 0) entries.push('settings/assets.json');

  // Collect asset files from storage
  const assets = [];
  for (const assetId of assetIds) {
    const asset = assetLibrary?.get(assetId);
    if (!asset) continue;
    const format = asset.format.toLowerCase();
    if (!ASSET_FORMATS.has(format)) continue;
    const entryPath = `assets/${assetId}.${format}`;
    entries.push(entryPath);
    let buffer = null;
    if (storage && typeof storage.read === 'function') {
      try { buffer = await storage.read(assetId, format); } catch { /* skip missing assets */ }
    }
    assets.push({ assetId, name: asset.name, kind: asset.kind, format, width: asset.width, height: asset.height, byteSize: asset.byteSize, hasAlpha: asset.hasAlpha, sha256: asset.sha256, tags: [...asset.tags], buffer });
  }

  return { profiles, bindings, assets, entries, assetIds: [...assetIds] };
}

/**
 * Export one or more visual profiles to a visual package ZIP buffer.
 *
 * @param {object} options
 * @param {object}   options.profileRegistry - from createVisualProfileRegistry()
 * @param {object}   options.bindingRegistry - from createEventBindingRegistry()
 * @param {object}   [options.assetLibrary]  - from createVisualAssetLibrary()
 * @param {object}   [options.storage]       - from createVisualAssetStorage()
 * @param {string[]} [options.profileIds]    - specific profiles to export (default: all)
 * @param {object}   [options.meta]          - optional package metadata overrides
 * @returns {Promise<Buffer>} ZIP buffer
 */
export async function exportVisualPackage({ profileRegistry, bindingRegistry, assetLibrary, storage, profileIds = null, meta = {} } = {}) {
  if (!profileRegistry || typeof profileRegistry.list !== 'function') throw packageError('VISUAL_PACKAGE_IO_INVALID', 'profileRegistry is required');
  if (!bindingRegistry || typeof bindingRegistry.list !== 'function') throw packageError('VISUAL_PACKAGE_IO_INVALID', 'bindingRegistry is required');

  const data = await collectPackageData({ profileRegistry, bindingRegistry, assetLibrary, profileIds, storage });
  const packageId = validateId(meta.packageId ?? `visual-package-${Date.now()}`, 'packageId');
  const packageName = text(meta.packageName ?? data.profiles.map((p) => p.name).join(' + '), 'packageName');
  const capabilities = [...VISUAL_PACKAGE_CAPABILITIES];
  const manifest = createVisualPackageManifest({
    packageId,
    packageName,
    version: meta.version ?? PACKAGE_VERSION,
    runtimeMinVersion: meta.runtimeMinVersion ?? '0.1.0',
    createdAt: new Date().toISOString(),
    capabilities,
    entries: data.entries
  });

  const zip = new AdmZip();

  // Write manifest
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));

  // Write profile files
  for (const profile of data.profiles) {
    const profileJson = JSON.stringify(profile, null, 2);
    zip.addFile(`settings/profiles/${profile.profileId}.json`, Buffer.from(profileJson, 'utf-8'));
  }

  // Write bindings
  if (data.bindings.length > 0) {
    const bindingsJson = JSON.stringify({ bindings: data.bindings, exportedAt: new Date().toISOString() }, null, 2);
    zip.addFile('settings/event-bindings.json', Buffer.from(bindingsJson, 'utf-8'));
  }

  // Write asset metadata before the binary files so imports can preserve display names and tags.
  if (data.assets.length > 0) {
    const assetsJson = JSON.stringify({ assets: data.assets.map(({ buffer, ...asset }) => asset) }, null, 2);
    zip.addFile('settings/assets.json', Buffer.from(assetsJson, 'utf-8'));
  }

  // Write asset files
  for (const asset of data.assets) {
    if (asset.buffer) {
      zip.addFile(`assets/${asset.assetId}.${asset.format}`, asset.buffer);
    }
  }

  return zip.toBuffer();
}

/**
 * Preview what would happen when importing a visual package.
 * Does not modify any registries or storage.
 *
 * @param {object} options
 * @param {Buffer}  options.zipBuffer - ZIP file buffer
 * @param {object}  options.profileRegistry - current profile registry
 * @returns {Promise<object>} preview report
 */
export async function previewImportVisualPackage({ zipBuffer, profileRegistry, assetLibrary } = {}) {
  if (!zipBuffer || !Buffer.isBuffer(zipBuffer)) throw packageError('VISUAL_PACKAGE_IO_INVALID', 'zipBuffer is required');
  if (!profileRegistry || typeof profileRegistry.has !== 'function') throw packageError('VISUAL_PACKAGE_IO_INVALID', 'profileRegistry is required');

  let zip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    throw packageError('VISUAL_PACKAGE_IO_INVALID', 'Invalid or unsupported ZIP format');
  }
  const entries = zip.getEntries().map((entry) => entry.entryName).filter((name) => !name.endsWith('/'));
  const manifestEntry = zip.getEntry('manifest.json');
  if (!manifestEntry) throw packageError('VISUAL_PACKAGE_INVALID_MANIFEST', 'Package is missing manifest.json');

  let manifest;
  try {
    manifest = JSON.parse(manifestEntry.getData().toString('utf-8'));
  } catch {
    throw packageError('VISUAL_PACKAGE_INVALID_MANIFEST', 'manifest.json is not valid JSON');
  }
  if (manifest.format !== VISUAL_PACKAGE_FORMAT) throw packageError('VISUAL_PACKAGE_FORMAT_UNSUPPORTED', `Unsupported package format: ${manifest.format}`);
  try { createVisualPackageManifest(manifest); } catch (error) { throw packageError(error.code ?? 'VISUAL_PACKAGE_INVALID_MANIFEST', error.message, error.details); }

  const entryReport = validateVisualPackageEntries(entries);
  if (!entryReport.valid) throw packageError('VISUAL_PACKAGE_INVALID_ENTRY', 'Package contains unsupported entries', { errors: entryReport.errors });

  // Parse profile entries
  const profileEntries = entries.filter((name) => name.startsWith('settings/profiles/') && name.endsWith('.json'));
  const importProfiles = [];
  for (const entryPath of profileEntries) {
    const entry = zip.getEntry(entryPath);
    if (!entry) continue;
    let profileData;
    try { profileData = JSON.parse(entry.getData().toString('utf-8')); } catch { continue; }
    if (profileData && profileData.profileId) {
      importProfiles.push({
        profileId: profileData.profileId,
        name: profileData.name ?? profileData.profileId,
        exists: profileRegistry.has(profileData.profileId)
      });
    }
  }

  // Parse binding entries
  const bindingEntry = zip.getEntry('settings/event-bindings.json');
  let bindingCount = 0;
  if (bindingEntry) {
    try {
      const bindingData = JSON.parse(bindingEntry.getData().toString('utf-8'));
      bindingCount = Array.isArray(bindingData?.bindings) ? bindingData.bindings.length : 0;
    } catch { /* ignore */ }
  }

  // Parse asset entries
  const assetPaths = entries.filter((name) => name.startsWith('assets/'));
  const assetIds = assetPaths.map((p) => basename(p).replace(/\.[^.]+$/, ''));
  const existingAssets = new Set(assetIds.filter((id) => assetLibrary?.get?.(id)));

  const newProfiles = importProfiles.filter((p) => !p.exists).length;
  const conflictProfiles = importProfiles.filter((p) => p.exists).length;

  return {
    packageId: manifest.packageId,
    packageName: manifest.packageName,
    version: manifest.version,
    capabilities: manifest.capabilities ?? [],
    profiles: importProfiles,
    profileCount: importProfiles.length,
    newProfiles,
    conflictProfiles,
    bindingCount,
    assetCount: assetPaths.length,
    newAssetCount: assetPaths.length - existingAssets.size,
    entries
  };
}

/**
 * Import a visual package ZIP into the current registries and storage.
 *
 * @param {object} options
 * @param {Buffer}  options.zipBuffer - ZIP file buffer
 * @param {object}  options.profileRegistry - from createVisualProfileRegistry()
 * @param {object}  options.bindingRegistry - from createEventBindingRegistry()
 * @param {object}  [options.assetLibrary]  - from createVisualAssetLibrary()
 * @param {object}  [options.storage]       - from createVisualAssetStorage()
 * @param {string}  [options.strategy='copy'] - conflict strategy: 'copy', 'overwrite', 'skip'
 * @returns {Promise<object>} import report
 */
export async function importVisualPackage({ zipBuffer, profileRegistry, bindingRegistry, assetLibrary, storage, strategy = 'copy' } = {}) {
  if (!zipBuffer || !Buffer.isBuffer(zipBuffer)) throw packageError('VISUAL_PACKAGE_IO_INVALID', 'zipBuffer is required');
  if (!profileRegistry || typeof profileRegistry.has !== 'function') throw packageError('VISUAL_PACKAGE_IO_INVALID', 'profileRegistry is required');
  if (!bindingRegistry || typeof bindingRegistry.apply !== 'function') throw packageError('VISUAL_PACKAGE_IO_INVALID', 'bindingRegistry is required');
  if (!CONFLICT_STRATEGIES.includes(strategy)) throw packageError('VISUAL_PACKAGE_IO_STRATEGY_INVALID', `Unsupported conflict strategy: ${strategy}`, { strategy });

  const preview = await previewImportVisualPackage({ zipBuffer, profileRegistry, assetLibrary });
  const zip = new AdmZip(zipBuffer);

  const registeredProfiles = [];
  const skippedProfiles = [];
  const importedAssets = [];
  const skippedAssets = [];
  const importedBindings = [];
  const issues = [];
  const assetIdMapping = new Map();
  const createdAssets = [];
  const addIssue = (issue) => { issues.push(issue); return issue; };
  const profileSnapshot = typeof profileRegistry.snapshot === 'function' ? profileRegistry.snapshot() : null;
  const bindingSnapshot = typeof bindingRegistry.snapshot === 'function' ? bindingRegistry.snapshot() : null;
  const assetSnapshot = assetLibrary && typeof assetLibrary.snapshot === 'function' ? assetLibrary.snapshot() : null;
  const rollback = async () => {
    const failures = [];
    try {
      if (profileSnapshot && typeof profileRegistry.restoreSnapshot === 'function') profileRegistry.restoreSnapshot(profileSnapshot);
    } catch (error) {
      failures.push({ stage: 'profiles', code: error.code ?? 'RESTORE_FAILED', message: error.message });
    }
    try {
      if (bindingSnapshot && typeof bindingRegistry.restoreSnapshot === 'function') bindingRegistry.restoreSnapshot(bindingSnapshot);
    } catch (error) {
      failures.push({ stage: 'bindings', code: error.code ?? 'RESTORE_FAILED', message: error.message });
    }
    try {
      if (assetSnapshot && assetLibrary && typeof assetLibrary.restoreSnapshot === 'function') assetLibrary.restoreSnapshot(assetSnapshot);
    } catch (error) {
      failures.push({ stage: 'assets', code: error.code ?? 'RESTORE_FAILED', message: error.message });
    }
    if (storage && typeof storage.remove === 'function') {
      for (const asset of createdAssets) {
        try { await storage.remove(asset.assetId, asset.format); } catch (error) { failures.push({ stage: 'asset-files', assetId: asset.assetId, code: error.code ?? 'REMOVE_FAILED', message: error.message }); }
      }
    }
    if (failures.length > 0) throw packageError('VISUAL_PACKAGE_ROLLBACK_FAILED', 'Visual package rollback failed', { failures });
  };
  let failedStage = 'assets';
  const failImport = async (error) => {
    const failureIssue = error.details?.issue;
    if (failureIssue && !issues.some((issue) => issue.scope === failureIssue.scope && issue.code === failureIssue.code && issue.id === failureIssue.id)) issues.push(failureIssue);
    const original = { code: error.code ?? 'VISUAL_PACKAGE_IMPORT_FAILED', message: error.message, details: error.details ?? {} };
    try {
      await rollback();
    } catch (rollbackError) {
      throw packageError('VISUAL_PACKAGE_ROLLBACK_FAILED', rollbackError.message, {
        original,
        rollback: rollbackError.details ?? {}
      });
    }
    return {
      packageId: preview.packageId,
      packageName: preview.packageName,
      version: preview.version,
      strategy,
      failed: true,
      rolledBack: true,
      failedStage,
      error: original,
      rollbackReason: 'import-failed-after-state-restore',
      profiles: { registered: registeredProfiles, skipped: skippedProfiles },
      assets: { imported: importedAssets, skipped: skippedAssets },
      bindings: { imported: importedBindings },
      bindingCount: importedBindings.length,
      issues,
      issueSummary: summarizeIssues(issues)
    };
  };
  const assetMetadata = new Map();
  const assetMetadataEntry = zip.getEntry('settings/assets.json');
  if (assetMetadataEntry) {
    try {
      const metadata = JSON.parse(assetMetadataEntry.getData().toString('utf-8'));
      for (const asset of Array.isArray(metadata?.assets) ? metadata.assets : []) {
        if (asset?.assetId) assetMetadata.set(asset.assetId, asset);
      }
    } catch { /* malformed optional metadata is handled by binary validation */ }
  }

  try {
    // 1. Import assets first (register with asset library)
    failedStage = 'assets';
    if (assetLibrary) {
    const assetEntries = zip.getEntries().filter((entry) => entry.entryName.startsWith('assets/') && !entry.isDirectory);
    for (const entry of assetEntries) {
      const name = basename(entry.entryName);
      const dot = name.lastIndexOf('.');
      if (dot < 0) continue;
      const assetId = name.slice(0, dot);
      const format = name.slice(dot + 1).toLowerCase();
      if (!ASSET_FORMATS.has(format)) continue;

      let buffer;
      try { buffer = entry.getData(); } catch (error) { throw packageError('VISUAL_PACKAGE_IMPORT_FAILED', `Asset read failed: ${assetId}`, { stage: 'assets', assetId, cause: error.message }); }
      const metadata = assetMetadata.get(assetId) ?? {};
      const incomingSha256 = createHash('sha256').update(buffer).digest('hex');
      const existing = assetLibrary.get(assetId);
      let effectiveAssetId = assetId;
      if (existing) {
        if (existing.sha256 === incomingSha256) {
          assetIdMapping.set(assetId, existing.assetId);
          skippedAssets.push({ assetId, format, reason: 'already_exists_same_hash' });
          addIssue(buildIssue({ scope: 'asset', code: 'ASSET_DUPLICATE_REUSED', severity: 'warning', id: assetId, message: `Asset reused by SHA256: ${assetId}`, details: { mappedAssetId: existing.assetId } }));
          continue;
        }
        if (strategy === 'overwrite') {
          throw packageError('VISUAL_PACKAGE_ASSET_CONFLICT', `Asset conflict has different content: ${assetId}`, { stage: 'assets', assetId, existingSha256: existing.sha256, incomingSha256 });
        }
        if (strategy === 'skip') {
          assetIdMapping.set(assetId, null);
          skippedAssets.push({ assetId, format, reason: 'conflict_different_hash' });
          addIssue(buildIssue({ scope: 'asset', code: 'ASSET_CONFLICT_DIFFERENT_HASH', severity: 'error', id: assetId, message: `Asset conflict has different content: ${assetId}`, details: { strategy, existingSha256: existing.sha256, incomingSha256 } }));
          continue;
        }
        let counter = 1;
        while (assetLibrary.get(`${assetId}-copy-${counter}`)) counter += 1;
        effectiveAssetId = `${assetId}-copy-${counter}`;
        addIssue(buildIssue({ scope: 'asset', code: 'ASSET_CONFLICT_COPIED', severity: 'warning', id: assetId, message: `Asset conflict copied under a new ID: ${assetId}`, details: { mappedAssetId: effectiveAssetId, existingSha256: existing.sha256, incomingSha256 } }));
      }

      try {
        const imported = await assetLibrary.importBuffer({
          assetId: effectiveAssetId,
          name: metadata.name || name,
          kind: metadata.kind || 'background',
          buffer,
          tags: Array.isArray(metadata.tags) ? metadata.tags : []
        });
        assetIdMapping.set(assetId, imported.assetId);
        assetIdMapping.set(assetId, imported.assetId);
        if (imported.assetId !== assetId) {
          skippedAssets.push({ assetId, mappedAssetId: imported.assetId, format, reason: 'duplicate_sha256' });
          addIssue(buildIssue({ scope: 'asset', code: 'ASSET_DUPLICATE_REUSED', severity: 'warning', id: assetId, message: `Asset reused by SHA256: ${assetId}`, details: { mappedAssetId: imported.assetId } }));
        } else {
          createdAssets.push({ assetId: imported.assetId, format: imported.format ?? format });
          importedAssets.push({ assetId: imported.assetId, originalAssetId: assetId, format });
        }
      } catch (error) {
        throw packageError('VISUAL_PACKAGE_IMPORT_FAILED', `Asset import failed: ${assetId}`, { stage: 'assets', assetId, cause: error.message });
      }
    }
  }

    // 2. Import profiles
    failedStage = 'profiles';
    const profileEntries = zip.getEntries().filter((entry) => entry.entryName.startsWith('settings/profiles/') && entry.entryName.endsWith('.json'));
  const profileIdMapping = new Map(); // original -> effective

  for (const entry of profileEntries) {
    let profileData;
    try {
      profileData = JSON.parse(entry.getData().toString('utf-8'));
    } catch {
      throw packageError('VISUAL_PACKAGE_IMPORT_FAILED', 'Profile entry is not valid JSON', { stage: 'profiles', entry: entry.entryName });
    }
    if (!profileData || !profileData.profileId) throw packageError('VISUAL_PACKAGE_IMPORT_FAILED', 'Profile entry is missing profileId', { stage: 'profiles', entry: entry.entryName });

    const originalId = profileData.profileId;
    const exists = profileRegistry.has(originalId);
    const normalizedProfile = clone(profileData.profile ?? {});
    const appearance = normalizedProfile.card?.types?.minimal?.appearance;
    if (appearance?.backgroundAssetId && assetIdMapping.has(appearance.backgroundAssetId)) {
      appearance.backgroundAssetId = assetIdMapping.get(appearance.backgroundAssetId);
    }
    if (exists && strategy === 'skip') {
      skippedProfiles.push({ profileId: originalId, reason: 'strategy_skip' });
      addIssue(buildIssue({ scope: 'profile', code: 'PROFILE_CONFLICT_SKIPPED', severity: 'warning', id: originalId, message: `Profile conflict skipped: ${originalId}`, details: { strategy } }));
      profileIdMapping.set(originalId, null);
      continue;
    }
    if (appearance?.backgroundAssetId) {
      const referencedAssetId = appearance.backgroundAssetId;
      const availableAsset = assetLibrary?.get?.(referencedAssetId);
      if (!availableAsset) {
        const issue = addIssue(buildIssue({ scope: 'asset', code: 'ASSET_DEPENDENCY_MISSING', id: referencedAssetId, message: `Profile references missing asset: ${referencedAssetId}`, details: { profileId: originalId } }));
        throw packageError('VISUAL_PACKAGE_IMPORT_FAILED', `Missing asset dependency: ${referencedAssetId}`, { stage: 'dependencies', profileId: originalId, assetId: referencedAssetId, issue });
      }
    }

    if (exists) {
      if (strategy === 'overwrite') {
        // Remove existing profile and references before re-registering
        try {
          profileRegistry.remove(originalId);
        } catch (error) {
          throw packageError('VISUAL_PACKAGE_IMPORT_FAILED', `Cannot overwrite profile: ${originalId}`, { stage: 'profiles', profileId: originalId, cause: error.message });
        }
      }
    }

    let effectiveId = originalId;
    if (exists && strategy === 'copy') {
      // Generate a new ID by appending a suffix
      let counter = 1;
      while (profileRegistry.has(effectiveId)) {
        effectiveId = `${originalId}-copy-${counter}`;
        counter++;
      }
    }

    try {
      const registered = profileRegistry.register({
        profileId: effectiveId,
        name: profileData.name ?? originalId,
        profile: normalizedProfile,
        source: 'imported'
      });
      registeredProfiles.push({ originalId, effectiveId, name: registered.name });
      profileIdMapping.set(originalId, effectiveId);
    } catch (error) {
      throw packageError('VISUAL_PACKAGE_IMPORT_FAILED', `Profile import failed: ${originalId}`, { stage: 'profiles', profileId: originalId, cause: error.message });
    }
  }

    // 3. Import bindings
    failedStage = 'bindings';
    const bindingEntry = zip.getEntry('settings/event-bindings.json');
  if (bindingEntry && profileIdMapping.size > 0) {
    let bindingData;
    try {
      bindingData = JSON.parse(bindingEntry.getData().toString('utf-8'));
    } catch {
      const issue = addIssue(buildIssue({ scope: 'binding', code: 'BINDING_DATA_INVALID', id: bindingEntry.entryName, message: 'Binding entry is not valid JSON', details: {} }));
      throw packageError('VISUAL_PACKAGE_IMPORT_FAILED', 'Binding entry is not valid JSON', { stage: 'bindings', entry: bindingEntry.entryName, issue });
    }
    if (!Array.isArray(bindingData?.bindings)) {
      const issue = addIssue(buildIssue({ scope: 'binding', code: 'BINDING_DATA_INVALID', id: bindingEntry.entryName, message: 'Binding entry must contain an array', details: {} }));
      throw packageError('VISUAL_PACKAGE_IMPORT_FAILED', 'Binding entry is invalid', { stage: 'bindings', entry: bindingEntry.entryName, issue });
    }
    const bindings = bindingData.bindings;
    for (const binding of bindings) {
      const bindingId = binding?.eventId ?? '(missing-event)';
      if (!binding || typeof binding !== 'object' || Array.isArray(binding)) {
        const issue = addIssue(buildIssue({ scope: 'binding', code: 'BINDING_DATA_INVALID', id: bindingId, message: `Binding record is invalid: ${bindingId}`, details: {} }));
        throw packageError('VISUAL_PACKAGE_IMPORT_FAILED', `Binding record is invalid: ${bindingId}`, { stage: 'bindings', eventId: bindingId, issue });
      }
      const effectiveId = profileIdMapping.get(binding.visualProfileId);
      if (effectiveId === null) {
        addIssue(buildIssue({ scope: 'binding', code: 'BINDING_PROFILE_SKIPPED', severity: 'warning', id: bindingId, message: `Binding skipped because its Profile was skipped: ${bindingId}`, details: { visualProfileId: binding.visualProfileId } }));
        continue;
      }
      if (effectiveId === undefined) {
        const issue = addIssue(buildIssue({ scope: 'binding', code: 'BINDING_PROFILE_MISSING', id: bindingId, message: `Binding references an unknown Profile: ${binding.visualProfileId}`, details: { visualProfileId: binding.visualProfileId } }));
        throw packageError('VISUAL_PACKAGE_IMPORT_FAILED', `Binding references missing profile: ${binding.visualProfileId}`, { stage: 'bindings', profileId: binding.visualProfileId, issue });
      }
      if (!profileRegistry.has(effectiveId)) {
        const issue = addIssue(buildIssue({ scope: 'binding', code: 'BINDING_PROFILE_MISSING', id: bindingId, message: `Binding references a missing Profile: ${effectiveId}`, details: { visualProfileId: effectiveId } }));
        throw packageError('VISUAL_PACKAGE_IMPORT_FAILED', `Binding references missing profile: ${effectiveId}`, { stage: 'bindings', profileId: effectiveId, issue });
      }
      try {
        bindingRegistry.apply({
          profileId: effectiveId,
          eventIds: [binding.eventId],
          behaviorChannelId: binding.behaviorChannelId ?? null,
          source: 'imported'
        });
        importedBindings.push({ eventId: binding.eventId, visualProfileId: effectiveId });
      } catch (error) {
        const issueCode = error.code === 'VISUAL_EVENT_NOT_FOUND' ? 'BINDING_EVENT_INVALID' : error.code === 'VISUAL_EVENT_NOT_ELIGIBLE' ? 'BINDING_EVENT_INELIGIBLE' : 'BINDING_IMPORT_FAILED';
        const issue = addIssue(buildIssue({ scope: 'binding', code: issueCode, id: binding.eventId, message: `Binding import failed: ${binding.eventId}`, details: { visualProfileId: binding.visualProfileId, causeCode: error.code ?? 'UNKNOWN', cause: error.message } }));
        throw packageError('VISUAL_PACKAGE_IMPORT_FAILED', `Binding import failed: ${binding.eventId}`, { stage: 'bindings', eventId: binding.eventId, cause: error.message, issue });
      }
    }
  }

    return {
    packageId: preview.packageId,
    packageName: preview.packageName,
    version: preview.version,
    strategy,
    profiles: { registered: registeredProfiles, skipped: skippedProfiles },
    assets: { imported: importedAssets, skipped: skippedAssets },
    bindings: { imported: importedBindings },
    bindingCount: importedBindings.length,
    issues,
    issueSummary: summarizeIssues(issues)
    };
  } catch (error) {
    failedStage = error.details?.stage ?? failedStage;
    return failImport(error);
  }
}

/**
 * Generate a unique package ID from the current time.
 */
export function generatePackageId() {
  return `visual-package-${Date.now()}`;
}