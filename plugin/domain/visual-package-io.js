import AdmZip from 'adm-zip';
import { stripCharterFromExport } from './channel-charter.js';
import { createVisualPackageManifest, validateVisualPackageEntries, VISUAL_PACKAGE_FORMAT, VISUAL_PACKAGE_CAPABILITIES } from './visual-package-manifest.js';

const PACKAGE_VERSION = '1.0.0';
const CONFLICT_STRATEGIES = Object.freeze(['copy', 'skip', 'overwrite']);
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const PROTECTED_PROFILE_ID = 'visual.default';

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
function readFlag(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return defaultValue;
}

function collectProfileAssetRefs(profile) {
  const minimal = profile?.card?.types?.minimal;
  if (!minimal || typeof minimal !== 'object') return [];
  const references = [];
  const add = (assetId, slot) => {
    if (typeof assetId === 'string' && assetId.trim()) references.push({ assetId: assetId.trim(), slot });
  };
  add(minimal.appearance?.backgroundAssetId, 'card.minimal.appearance.background');
  add(minimal.skin?.background?.assetId, 'card.minimal.skin.background');
  for (const [partId, part] of Object.entries(minimal.parts ?? {})) {
    if (!part || typeof part !== 'object') continue;
    add(part.backgroundAssetId, `card.minimal.parts.${partId}.background`);
    if (partId === 'icon') add(part.assetId, 'card.minimal.parts.icon.asset');
  }
  for (const [slot, value] of Object.entries(minimal.effects?.slots ?? {})) add(value?.assetId, `card.minimal.effects.${slot}`);
  return references;
}

function collectProfileFontRefs(profile) {
  const parts = profile?.card?.types?.minimal?.parts;
  if (!parts || typeof parts !== 'object') return [];
  const references = [];
  const add = (assetId, slot) => {
    if (typeof assetId === 'string' && assetId.trim()) references.push({ assetId: assetId.trim(), slot });
  };
  add(parts.title?.fontAssetId, 'card.minimal.parts.title.font');
  add(parts.body?.fontAssetId, 'card.minimal.parts.body.font');
  add(parts.assistantName?.fontAssetId, 'card.minimal.parts.assistantName.font');
  return references;
}

function resolveLocalAsset(assetLibrary, fingerprint = {}) {
  if (!assetLibrary) return null;
  if (fingerprint.sha256 && typeof assetLibrary.findBySha256 === 'function') {
    const byHash = assetLibrary.findBySha256(fingerprint.sha256);
    if (byHash) return byHash;
  }
  if (fingerprint.assetId && typeof assetLibrary.get === 'function') return assetLibrary.get(fingerprint.assetId) ?? null;
  return null;
}

function applyMissingAssetPolicy(profile, { missingIds, assetIdMapping, clearMissingAssets }) {
  const minimal = profile?.card?.types?.minimal;
  if (!minimal) return;
  const resolve = (current) => {
    if (typeof current !== 'string' || !current) return current;
    if (assetIdMapping.has(current) && assetIdMapping.get(current)) return assetIdMapping.get(current);
    if (missingIds.has(current) && clearMissingAssets) return null;
    return current;
  };
  if (minimal.appearance && 'backgroundAssetId' in minimal.appearance) {
    minimal.appearance.backgroundAssetId = resolve(minimal.appearance.backgroundAssetId);
  }
  if (minimal.skin?.background && 'assetId' in minimal.skin.background) {
    minimal.skin.background.assetId = resolve(minimal.skin.background.assetId);
  }
  for (const part of Object.values(minimal.parts ?? {})) {
    if (!part || typeof part !== 'object') continue;
    if ('backgroundAssetId' in part) part.backgroundAssetId = resolve(part.backgroundAssetId) ?? null;
    if ('assetId' in part) part.assetId = resolve(part.assetId) ?? null;
  }
  for (const value of Object.values(minimal.effects?.slots ?? {})) {
    if (!value || typeof value !== 'object' || !('assetId' in value)) continue;
    value.assetId = resolve(value.assetId);
  }
}

function applyMissingFontPolicy(profile, { missingIds, assetIdMapping, clearMissingFonts }) {
  const parts = profile?.card?.types?.minimal?.parts;
  if (!parts || typeof parts !== 'object') return;
  const resolve = (current) => {
    if (typeof current !== 'string' || !current) return current;
    if (assetIdMapping.has(current) && assetIdMapping.get(current)) return assetIdMapping.get(current);
    if (missingIds.has(current) && clearMissingFonts) return null;
    return current;
  };
  for (const part of Object.values(parts)) {
    if (!part || typeof part !== 'object' || !('fontAssetId' in part)) continue;
    part.fontAssetId = resolve(part.fontAssetId) ?? null;
  }
}

function collectFingerprintsFromZip(zip, entries) {
  const fingerprints = new Map();
  const metadataEntry = zip.getEntry('settings/assets.json');
  if (metadataEntry) {
    try {
      const metadata = JSON.parse(metadataEntry.getData().toString('utf-8'));
      for (const asset of Array.isArray(metadata?.assets) ? metadata.assets : []) {
        if (asset?.assetId) fingerprints.set(asset.assetId, { ...asset });
      }
    } catch { /* optional metadata */ }
  }
  const profileEntries = entries.filter((name) => name.startsWith('settings/profiles/') && name.endsWith('.json'));
  for (const entryPath of profileEntries) {
    const entry = zip.getEntry(entryPath);
    if (!entry) continue;
    let profileData;
    try { profileData = JSON.parse(entry.getData().toString('utf-8')); } catch { continue; }
    for (const reference of collectProfileAssetRefs(profileData?.profile)) {
      const existing = fingerprints.get(reference.assetId);
      if (existing) {
        if (!existing.slot) existing.slot = reference.slot;
        continue;
      }
      fingerprints.set(reference.assetId, { assetId: reference.assetId, slot: reference.slot });
    }
  }
  return [...fingerprints.values()];
}

function collectFontFingerprintsFromZip(zip, entries) {
  const fingerprints = new Map();
  const metadataEntry = zip.getEntry('settings/fonts.json');
  if (metadataEntry) {
    try {
      const metadata = JSON.parse(metadataEntry.getData().toString('utf-8'));
      for (const asset of Array.isArray(metadata?.assets) ? metadata.assets : []) {
        if (asset?.assetId) fingerprints.set(asset.assetId, { ...asset });
      }
    } catch { /* optional metadata */ }
  }
  const profileEntries = entries.filter((name) => name.startsWith('settings/profiles/') && name.endsWith('.json'));
  for (const entryPath of profileEntries) {
    const entry = zip.getEntry(entryPath);
    if (!entry) continue;
    let profileData;
    try { profileData = JSON.parse(entry.getData().toString('utf-8')); } catch { continue; }
    for (const reference of collectProfileFontRefs(profileData?.profile)) {
      const existing = fingerprints.get(reference.assetId);
      if (existing) {
        if (!existing.slot) existing.slot = reference.slot;
        continue;
      }
      fingerprints.set(reference.assetId, { assetId: reference.assetId, slot: reference.slot });
    }
  }
  return [...fingerprints.values()];
}

function classifyPackageAssets(fingerprints, assetLibrary) {
  const missingAssets = [];
  const resolvedAssets = [];
  const assetIdMapping = new Map();
  for (const fingerprint of fingerprints) {
    const local = resolveLocalAsset(assetLibrary, fingerprint);
    if (local) {
      resolvedAssets.push({ assetId: fingerprint.assetId, mappedAssetId: local.assetId, name: local.name });
      assetIdMapping.set(fingerprint.assetId, local.assetId);
    } else {
      missingAssets.push({
        assetId: fingerprint.assetId,
        name: fingerprint.name ?? fingerprint.assetId,
        sha256: fingerprint.sha256 ?? null,
        slot: fingerprint.slot ?? null
      });
    }
  }
  return { missingAssets, resolvedAssets, assetIdMapping };
}

async function collectPackageData({ profileRegistry, bindingRegistry, assetLibrary, fontLibrary, profileIds }) {
  const profileIdsToExport = profileIds ?? profileRegistry.list();
  if (profileIdsToExport.length === 0) throw packageError('VISUAL_PACKAGE_IO_EMPTY', 'No profiles to export');

  const profiles = [];
  const bindings = [];
  const fingerprints = [];
  const fontFingerprints = [];
  const seen = new Set();
  const fontSeen = new Set();
  const entries = ['manifest.json'];

  for (const profileId of profileIdsToExport) {
    const record = profileRegistry.get(profileId);
    if (!record) throw packageError('VISUAL_PACKAGE_IO_PROFILE_NOT_FOUND', `Unknown profile: ${profileId}`, { profileId });
    const profile = stripCharterFromExport(clone(record.profile));
    profiles.push({ profileId: record.profileId, name: record.name, profile });
    entries.push(`settings/profiles/${profileId}.json`);
    for (const reference of collectProfileAssetRefs(profile)) {
      if (seen.has(reference.assetId)) continue;
      seen.add(reference.assetId);
      const asset = assetLibrary?.get?.(reference.assetId);
      fingerprints.push({
        assetId: reference.assetId,
        name: asset?.name ?? reference.assetId,
        kind: asset?.kind ?? null,
        format: asset?.format ?? null,
        sha256: asset?.sha256 ?? null,
        slot: reference.slot
      });
    }
    for (const reference of collectProfileFontRefs(profile)) {
      if (fontSeen.has(reference.assetId)) continue;
      fontSeen.add(reference.assetId);
      const font = fontLibrary?.get?.(reference.assetId);
      fontFingerprints.push({
        assetId: reference.assetId,
        name: font?.name ?? reference.assetId,
        format: font?.format ?? null,
        sha256: font?.sha256 ?? null,
        slot: reference.slot
      });
    }
  }

  const allBindings = bindingRegistry.list();
  for (const binding of allBindings) {
    if (profileIdsToExport.includes(binding.visualProfileId)) {
      bindings.push({ eventId: binding.eventId, visualProfileId: binding.visualProfileId, behaviorChannelId: binding.behaviorChannelId, source: binding.source ?? 'local' });
    }
  }
  if (bindings.length > 0) entries.push('settings/event-bindings.json');
  if (fingerprints.length > 0) entries.push('settings/assets.json');
  if (fontFingerprints.length > 0) entries.push('settings/fonts.json');

  return { profiles, bindings, assets: fingerprints, fonts: fontFingerprints, entries, assetIds: fingerprints.map((item) => item.assetId) };
}

/**
 * Export one or more visual profiles to a visual package ZIP buffer.
 * Packages carry look + event bindings + asset fingerprints. They never embed library files.
 */
export async function exportVisualPackage({ profileRegistry, bindingRegistry, assetLibrary, fontLibrary, storage, profileIds = null, meta = {} } = {}) {
  if (!profileRegistry || typeof profileRegistry.list !== 'function') throw packageError('VISUAL_PACKAGE_IO_INVALID', 'profileRegistry is required');
  if (!bindingRegistry || typeof bindingRegistry.list !== 'function') throw packageError('VISUAL_PACKAGE_IO_INVALID', 'bindingRegistry is required');

  const data = await collectPackageData({ profileRegistry, bindingRegistry, assetLibrary, fontLibrary, profileIds, storage });
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
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));
  for (const profile of data.profiles) {
    zip.addFile(`settings/profiles/${profile.profileId}.json`, Buffer.from(JSON.stringify(profile, null, 2), 'utf-8'));
  }
  if (data.bindings.length > 0) {
    zip.addFile('settings/event-bindings.json', Buffer.from(JSON.stringify({ bindings: data.bindings, exportedAt: new Date().toISOString() }, null, 2), 'utf-8'));
  }
  if (data.assets.length > 0) {
    zip.addFile('settings/assets.json', Buffer.from(JSON.stringify({ assets: data.assets }, null, 2), 'utf-8'));
  }
  if (data.fonts.length > 0) {
    zip.addFile('settings/fonts.json', Buffer.from(JSON.stringify({ assets: data.fonts }, null, 2), 'utf-8'));
  }
  return zip.toBuffer();
}

/**
 * Preview what would happen when importing a visual package.
 * Does not modify any registries or storage.
 */
export async function previewImportVisualPackage({ zipBuffer, profileRegistry, assetLibrary, fontLibrary } = {}) {
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
        exists: profileRegistry.has(profileData.profileId),
        protected: profileData.profileId === PROTECTED_PROFILE_ID && profileRegistry.has(profileData.profileId)
      });
    }
  }

  const bindingEntry = zip.getEntry('settings/event-bindings.json');
  let bindingCount = 0;
  if (bindingEntry) {
    try {
      const bindingData = JSON.parse(bindingEntry.getData().toString('utf-8'));
      bindingCount = Array.isArray(bindingData?.bindings) ? bindingData.bindings.length : 0;
    } catch { /* ignore */ }
  }

  const fingerprints = collectFingerprintsFromZip(zip, entries);
  const classified = classifyPackageAssets(fingerprints, assetLibrary);
  const fontFingerprints = collectFontFingerprintsFromZip(zip, entries);
  const classifiedFonts = classifyPackageAssets(fontFingerprints, fontLibrary);
  const embeddedAssetCount = entries.filter((name) => name.startsWith('assets/')).length;
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
    assetCount: fingerprints.length,
    referencedAssetCount: fingerprints.length,
    resolvedAssetCount: classified.resolvedAssets.length,
    missingAssets: classified.missingAssets,
    missingAssetCount: classified.missingAssets.length,
    fontCount: fontFingerprints.length,
    resolvedFontCount: classifiedFonts.resolvedAssets.length,
    missingFonts: classifiedFonts.missingAssets,
    missingFontCount: classifiedFonts.missingAssets.length,
    embeddedAssetCount,
    newAssetCount: classified.missingAssets.length,
    entries
  };
}

/**
 * Import a visual package ZIP into the current registries.
 * Never copies library binaries out of the zip. Missing art/fonts fail unless cleared.
 */
export async function importVisualPackage({ zipBuffer, profileRegistry, bindingRegistry, assetLibrary, fontLibrary, storage, strategy = 'copy', applyBindings = true, clearMissingAssets = false, clearMissingFonts = false } = {}) {
  if (!zipBuffer || !Buffer.isBuffer(zipBuffer)) throw packageError('VISUAL_PACKAGE_IO_INVALID', 'zipBuffer is required');
  if (!profileRegistry || typeof profileRegistry.has !== 'function') throw packageError('VISUAL_PACKAGE_IO_INVALID', 'profileRegistry is required');
  if (!bindingRegistry || typeof bindingRegistry.apply !== 'function') throw packageError('VISUAL_PACKAGE_IO_INVALID', 'bindingRegistry is required');
  if (!CONFLICT_STRATEGIES.includes(strategy)) throw packageError('VISUAL_PACKAGE_IO_STRATEGY_INVALID', `Unsupported conflict strategy: ${strategy}`, { strategy });
  const syncEvents = readFlag(applyBindings, true);
  const clearMissing = readFlag(clearMissingAssets, false);
  const clearFonts = readFlag(clearMissingFonts, false);

  const preview = await previewImportVisualPackage({ zipBuffer, profileRegistry, assetLibrary, fontLibrary });
  const zip = new AdmZip(zipBuffer);

  const registeredProfiles = [];
  const skippedProfiles = [];
  const importedAssets = [];
  const skippedAssets = [];
  const importedBindings = [];
  const issues = [];
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
      applyBindings: syncEvents,
      clearMissingAssets: clearMissing,
      clearMissingFonts: clearFonts,
      failed: true,
      rolledBack: true,
      failedStage,
      error: original,
      rollbackReason: 'import-failed-after-state-restore',
      profiles: { registered: registeredProfiles, skipped: skippedProfiles },
      assets: { imported: importedAssets, skipped: skippedAssets, missing: preview.missingAssets, resolved: [] },
      fonts: { missing: preview.missingFonts, resolved: [] },
      bindings: { imported: importedBindings },
      bindingCount: importedBindings.length,
      issues,
      issueSummary: summarizeIssues(issues)
    };
  };

  try {
    failedStage = 'assets';
    const fingerprints = collectFingerprintsFromZip(zip, preview.entries);
    const classified = classifyPackageAssets(fingerprints, assetLibrary);
    const assetIdMapping = classified.assetIdMapping;
    const missingIds = new Set(classified.missingAssets.map((item) => item.assetId));
    const fontFingerprints = collectFontFingerprintsFromZip(zip, preview.entries);
    const classifiedFonts = classifyPackageAssets(fontFingerprints, fontLibrary);
    const fontIdMapping = classifiedFonts.assetIdMapping;
    const missingFontIds = new Set(classifiedFonts.missingAssets.map((item) => item.assetId));
    if (preview.embeddedAssetCount > 0) {
      addIssue(buildIssue({
        scope: 'asset',
        code: 'ASSET_EMBEDDED_IGNORED',
        severity: 'warning',
        message: 'Package embedded asset files are ignored; only local library fingerprints are used',
        details: { embeddedAssetCount: preview.embeddedAssetCount }
      }));
    }
    if (classified.missingAssets.length && !clearMissing) {
      const first = classified.missingAssets[0];
      const issue = addIssue(buildIssue({
        scope: 'asset',
        code: 'ASSET_DEPENDENCY_MISSING',
        id: first.assetId,
        message: `Profile references missing asset: ${first.assetId}`,
        details: { missingAssets: classified.missingAssets }
      }));
      throw packageError('VISUAL_PACKAGE_IMPORT_FAILED', `Missing asset dependency: ${first.assetId}`, { stage: 'dependencies', assetId: first.assetId, issue });
    }
    if (classifiedFonts.missingAssets.length && !clearFonts) {
      const first = classifiedFonts.missingAssets[0];
      const issue = addIssue(buildIssue({
        scope: 'font',
        code: 'FONT_DEPENDENCY_MISSING',
        id: first.assetId,
        message: `Profile references missing font: ${first.assetId}`,
        details: { missingFonts: classifiedFonts.missingAssets }
      }));
      throw packageError('VISUAL_PACKAGE_IMPORT_FAILED', `Missing font dependency: ${first.assetId}`, { stage: 'dependencies', assetId: first.assetId, issue });
    }
    for (const missing of classified.missingAssets) {
      skippedAssets.push({ assetId: missing.assetId, reason: 'missing_cleared' });
      addIssue(buildIssue({
        scope: 'asset',
        code: 'ASSET_DEPENDENCY_CLEARED',
        severity: 'warning',
        id: missing.assetId,
        message: `Missing asset cleared: ${missing.assetId}`,
        details: { slot: missing.slot }
      }));
    }
    for (const resolved of classified.resolvedAssets) {
      if (resolved.mappedAssetId !== resolved.assetId) {
        skippedAssets.push({ assetId: resolved.assetId, mappedAssetId: resolved.mappedAssetId, reason: 'duplicate_sha256' });
        addIssue(buildIssue({
          scope: 'asset',
          code: 'ASSET_DUPLICATE_REUSED',
          severity: 'warning',
          id: resolved.assetId,
          message: `Asset reused by SHA256: ${resolved.assetId}`,
          details: { mappedAssetId: resolved.mappedAssetId }
        }));
      }
    }

    failedStage = 'profiles';
    const profileEntries = zip.getEntries().filter((entry) => entry.entryName.startsWith('settings/profiles/') && entry.entryName.endsWith('.json'));
    const profileIdMapping = new Map();

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
      applyMissingAssetPolicy(normalizedProfile, { missingIds, assetIdMapping, clearMissingAssets: clearMissing });
      applyMissingFontPolicy(normalizedProfile, { missingIds: missingFontIds, assetIdMapping: fontIdMapping, clearMissingFonts: clearFonts });

      if (exists && strategy === 'skip') {
        skippedProfiles.push({ profileId: originalId, reason: 'strategy_skip' });
        addIssue(buildIssue({ scope: 'profile', code: 'PROFILE_CONFLICT_SKIPPED', severity: 'warning', id: originalId, message: `Profile conflict skipped: ${originalId}`, details: { strategy } }));
        profileIdMapping.set(originalId, syncEvents ? originalId : null);
        continue;
      }

      if (exists && originalId === PROTECTED_PROFILE_ID && strategy === 'overwrite') {
        throw packageError('VISUAL_PROFILE_REGISTRY_PROTECTED', '默认视觉方案不可覆盖', { stage: 'profiles', profileId: originalId });
      }

      if (exists && strategy === 'overwrite') {
        try {
          const registered = profileRegistry.replace(originalId, {
            name: profileData.name ?? originalId,
            profile: normalizedProfile,
            source: 'imported'
          });
          registeredProfiles.push({ originalId, effectiveId: originalId, name: registered.name, profile: registered.profile });
          profileIdMapping.set(originalId, originalId);
        } catch (error) {
          throw packageError('VISUAL_PACKAGE_IMPORT_FAILED', `Cannot overwrite profile: ${originalId}`, { stage: 'profiles', profileId: originalId, cause: error.message });
        }
        continue;
      }

      let effectiveId = originalId;
      if (exists && strategy === 'copy') {
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
        registeredProfiles.push({ originalId, effectiveId, name: registered.name, profile: registered.profile });
        profileIdMapping.set(originalId, effectiveId);
      } catch (error) {
        throw packageError('VISUAL_PACKAGE_IMPORT_FAILED', `Profile import failed: ${originalId}`, { stage: 'profiles', profileId: originalId, cause: error.message });
      }
    }

    failedStage = 'bindings';
    const bindingEntry = zip.getEntry('settings/event-bindings.json');
    if (syncEvents && bindingEntry && profileIdMapping.size > 0) {
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
      for (const binding of bindingData.bindings) {
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
      applyBindings: syncEvents,
      clearMissingAssets: clearMissing,
      clearMissingFonts: clearFonts,
      profiles: { registered: registeredProfiles, skipped: skippedProfiles },
      assets: { imported: importedAssets, skipped: skippedAssets, missing: classified.missingAssets, resolved: classified.resolvedAssets },
      fonts: { missing: classifiedFonts.missingAssets, resolved: classifiedFonts.resolvedAssets },
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

export function generatePackageId() {
  return `visual-package-${Date.now()}`;
}
