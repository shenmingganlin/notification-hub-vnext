import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateSync, crc32 } from 'node:zlib';
import AdmZip from 'adm-zip';

import { createVisualProfileRegistry } from '../../plugin/domain/visual-profile-registry.js';
import { createEventBindingRegistry } from '../../plugin/domain/event-binding-registry.js';
import { createVisualAssetLibrary } from '../../plugin/domain/visual-asset-library.js';
import { createVisualAssetStorage } from '../../plugin/domain/visual-asset-storage.js';
import { createFontAssetLibrary } from '../../plugin/domain/font-asset-library.js';
import { exportVisualPackage, previewImportVisualPackage, importVisualPackage, generatePackageId } from '../../plugin/domain/visual-package-io.js';
import { ttfNamed } from './font-asset-fixture.mjs';

// ---- Helpers ----

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([len, Buffer.from(type, 'ascii'), data, crcBuf]);
}

function createMinimalPngBuffer() {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(1, 0);
  ihdrData.writeUInt32BE(1, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 0;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const raw = Buffer.from([0x00, 0xff]);
  const compressed = deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdrData), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

function createTempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { path: dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function createTestRegistries() {
  const profileRegistry = createVisualProfileRegistry();
  const bindingRegistry = createEventBindingRegistry({ profileRegistry });
  return { profileRegistry, bindingRegistry };
}

function createMemoryFontStorage() {
  const files = new Map();
  return {
    files,
    async put(id, format, data) { files.set(`${id}.${format}`, Buffer.from(data)); },
    async remove(id, format) { files.delete(`${id}.${format}`); },
    async resolveAssetPath(id, format) { return `font-assets/${id}.${format}`; }
  };
}

function createFontedProfile(profileRegistry, id, name, fontAssetId) {
  return profileRegistry.register({
    profileId: id,
    name,
    profile: {
      global: { enabled: true, preset: 'minimal', intensity: 'balanced' },
      card: {
        activeType: 'minimal',
        types: {
          minimal: {
            appearance: { size: 'medium' },
            parts: { title: { fill: '#f2fff9', fontAssetId }, body: { fill: '#d7ece3', fontAssetId } }
          }
        }
      }
    },
    source: 'local'
  });
}

function createTestProfile(profileRegistry, id, name, cardOverrides) {
  const profile = {
    global: { enabled: true, preset: 'minimal', intensity: 'balanced' },
    card: {
      activeType: 'minimal',
      types: {
        minimal: {
          behavior: { layout: 'simple', boundary: 'work-area' },
          appearance: { size: 'medium', aspectRatio: 'default', backgroundColor: '#0e1916', backgroundFit: 'fill', backgroundPadding: 0, borderRadius: 16, opacity: 0.96, ...(cardOverrides || {}) }
        }
      }
    }
  };
  return profileRegistry.register({ profileId: id, name, profile, source: 'local' });
}

// ---- Export tests ----

test('export rejects empty profile registry', async () => {
  const { profileRegistry, bindingRegistry } = createTestRegistries();
  await assert.rejects(() => exportVisualPackage({ profileRegistry, bindingRegistry }), { code: 'VISUAL_PACKAGE_IO_EMPTY' });
});

test('export produces a valid ZIP with manifest and profile', async () => {
  const { profileRegistry, bindingRegistry } = createTestRegistries();
  createTestProfile(profileRegistry, 'test-export-1', 'Test Export');
  const zipBuffer = await exportVisualPackage({ profileRegistry, bindingRegistry });
  assert.ok(Buffer.isBuffer(zipBuffer));
  assert.ok(zipBuffer.length > 0);
  const zip = new AdmZip(zipBuffer);
  const entryNames = zip.getEntries().map((e) => e.entryName);
  assert.ok(entryNames.includes('manifest.json'), 'manifest.json is missing');
  assert.ok(entryNames.some((name) => name.startsWith('settings/profiles/')), 'profile files are missing');
});

test('export writes every selected profile into one zip', async () => {
  const { profileRegistry, bindingRegistry } = createTestRegistries();
  createTestProfile(profileRegistry, 'look-a', '晨间');
  createTestProfile(profileRegistry, 'look-b', '夜间');
  const zipBuffer = await exportVisualPackage({
    profileRegistry,
    bindingRegistry,
    profileIds: ['look-a', 'look-b'],
    meta: { packageName: '视觉配置' }
  });
  const zip = new AdmZip(zipBuffer);
  const entryNames = zip.getEntries().map((e) => e.entryName);
  assert.ok(entryNames.includes('settings/profiles/look-a.json'));
  assert.ok(entryNames.includes('settings/profiles/look-b.json'));
  const manifest = JSON.parse(zip.getEntry('manifest.json').getData().toString('utf-8'));
  assert.equal(manifest.packageName, '视觉配置');
});

test('export includes event bindings when profiles are bound', async () => {
  const { profileRegistry, bindingRegistry } = createTestRegistries();
  createTestProfile(profileRegistry, 'test-binding-export', 'Binding Test');
  bindingRegistry.apply({ profileId: 'test-binding-export', eventIds: ['chat.assistant_reply.completed'] });
  const zipBuffer = await exportVisualPackage({ profileRegistry, bindingRegistry });
  const zip = new AdmZip(zipBuffer);
  const entryNames = zip.getEntries().map((e) => e.entryName);
  assert.ok(entryNames.includes('settings/event-bindings.json'), 'event-bindings.json is missing');
});

test('export writes asset fingerprints and never embeds library files', async () => {
  const dir = createTempDir('visual-pkg-export-asset-');
  try {
    const storage = createVisualAssetStorage(dir.path);
    const assetLibrary = createVisualAssetLibrary({ storage });
    const pngBuffer = createMinimalPngBuffer();
    const asset = await assetLibrary.importBuffer({ name: 'test-pixel.png', kind: 'background', buffer: pngBuffer, tags: [] });
    const { profileRegistry, bindingRegistry } = createTestRegistries();
    createTestProfile(profileRegistry, 'test-asset-export', 'Asset Export', { backgroundAssetId: asset.assetId });
    const zipBuffer = await exportVisualPackage({ profileRegistry, bindingRegistry, assetLibrary, storage });
    const zip = new AdmZip(zipBuffer);
    const entryNames = zip.getEntries().map((e) => e.entryName);
    assert.equal(entryNames.some((name) => name.startsWith('assets/')), false);
    assert.ok(entryNames.includes('settings/assets.json'));
    const fingerprints = JSON.parse(zip.getEntry('settings/assets.json').getData().toString('utf-8'));
    assert.equal(fingerprints.assets[0].assetId, asset.assetId);
    assert.equal(fingerprints.assets[0].sha256, asset.sha256);
  } finally {
    dir.cleanup();
  }
});

test('manifest in exported ZIP has correct format and entries', async () => {
  const { profileRegistry, bindingRegistry } = createTestRegistries();
  createTestProfile(profileRegistry, 'test-manifest', 'Manifest Check');
  const zipBuffer = await exportVisualPackage({ profileRegistry, bindingRegistry });
  const zip = new AdmZip(zipBuffer);
  const manifest = JSON.parse(zip.getEntry('manifest.json').getData().toString('utf-8'));
  assert.equal(manifest.format, 'notification-hub-visual-package');
  assert.ok(manifest.packageId.startsWith('visual-package-'));
  assert.ok(manifest.packageName);
  assert.ok(manifest.version);
  assert.ok(manifest.capabilities.includes('profile'));
  assert.ok(Array.isArray(manifest.entries));
  assert.ok(manifest.entries.includes('manifest.json'));
});

test('export accepts custom meta overrides', async () => {
  const { profileRegistry, bindingRegistry } = createTestRegistries();
  createTestProfile(profileRegistry, 'test-meta', 'Meta Override');
  const zipBuffer = await exportVisualPackage({
    profileRegistry, bindingRegistry,
    meta: { packageId: 'custom-pack', packageName: 'Custom Pack', version: '2.0.0' }
  });
  const zip = new AdmZip(zipBuffer);
  const manifest = JSON.parse(zip.getEntry('manifest.json').getData().toString('utf-8'));
  assert.equal(manifest.packageId, 'custom-pack');
  assert.equal(manifest.packageName, 'Custom Pack');
  assert.equal(manifest.version, '2.0.0');
});

// ---- Preview tests ----

test('preview rejects invalid ZIP buffer', async () => {
  const { profileRegistry } = createTestRegistries();
  await assert.rejects(() => previewImportVisualPackage({ zipBuffer: Buffer.from('not-a-zip'), profileRegistry }), { code: 'VISUAL_PACKAGE_IO_INVALID' });
});

test('preview rejects missing manifest', async () => {
  const { profileRegistry } = createTestRegistries();
  const zip = new AdmZip();
  zip.addFile('settings/profiles/test.json', Buffer.from('{}', 'utf-8'));
  await assert.rejects(() => previewImportVisualPackage({ zipBuffer: zip.toBuffer(), profileRegistry }), { code: 'VISUAL_PACKAGE_INVALID_MANIFEST' });
});

test('preview returns correct profile counts', async () => {
  const { profileRegistry } = createTestRegistries();
  createTestProfile(profileRegistry, 'existing-profile', 'Existing');
  const exportRegistry = createVisualProfileRegistry();
  const { bindingRegistry } = createTestRegistries();
  createTestProfile(exportRegistry, 'new-profile', 'New Profile');
  const zipBuffer = await exportVisualPackage({ profileRegistry: exportRegistry, bindingRegistry });
  const preview = await previewImportVisualPackage({ zipBuffer, profileRegistry });
  assert.equal(preview.profileCount, 1);
  assert.equal(preview.newProfiles, 1);
  assert.equal(preview.conflictProfiles, 0);
  assert.equal(preview.bindingCount, 0);
  assert.ok(preview.packageId);
});

test('preview detects profile conflicts', async () => {
  const { profileRegistry } = createTestRegistries();
  createTestProfile(profileRegistry, 'shared-profile', 'Shared');
  const exportRegistry = createVisualProfileRegistry();
  const { bindingRegistry } = createTestRegistries();
  createTestProfile(exportRegistry, 'shared-profile', 'Shared');
  const zipBuffer = await exportVisualPackage({ profileRegistry: exportRegistry, bindingRegistry });
  const preview = await previewImportVisualPackage({ zipBuffer, profileRegistry });
  assert.equal(preview.profileCount, 1);
  assert.equal(preview.newProfiles, 0);
  assert.equal(preview.conflictProfiles, 1);
});

// ---- Import tests ----

test('import with copy strategy creates new profile IDs', async () => {
  const { profileRegistry, bindingRegistry } = createTestRegistries();
  createTestProfile(profileRegistry, 'original-profile', 'Original');
  const exportRegistry = createVisualProfileRegistry();
  const exportBindingRegistry = createEventBindingRegistry({ profileRegistry: exportRegistry });
  createTestProfile(exportRegistry, 'original-profile', 'Original');
  const zipBuffer = await exportVisualPackage({ profileRegistry: exportRegistry, bindingRegistry: exportBindingRegistry });
  const report = await importVisualPackage({ zipBuffer, profileRegistry, bindingRegistry, strategy: 'copy' });
  assert.equal(report.strategy, 'copy');
  assert.equal(report.profiles.registered.length, 1);
  assert.equal(report.profiles.registered[0].originalId, 'original-profile');
  assert.notEqual(report.profiles.registered[0].effectiveId, 'original-profile');
  assert.ok(report.profiles.registered[0].effectiveId.startsWith('original-profile-copy-'));
  assert.equal(report.profiles.skipped.length, 0);
});

test('import with skip strategy keeps existing profiles', async () => {
  const { profileRegistry, bindingRegistry } = createTestRegistries();
  createTestProfile(profileRegistry, 'skip-profile', 'Skip Test');
  const exportRegistry = createVisualProfileRegistry();
  const exportBindingRegistry = createEventBindingRegistry({ profileRegistry: exportRegistry });
  createTestProfile(exportRegistry, 'skip-profile', 'Skip Test');
  const zipBuffer = await exportVisualPackage({ profileRegistry: exportRegistry, bindingRegistry: exportBindingRegistry });
  const report = await importVisualPackage({ zipBuffer, profileRegistry, bindingRegistry, strategy: 'skip' });
  assert.equal(report.profiles.registered.length, 0);
  assert.equal(report.profiles.skipped.length, 1);
  assert.equal(report.profiles.skipped[0].reason, 'strategy_skip');
});

test('import with overwrite strategy replaces existing profiles', async () => {
  const { profileRegistry, bindingRegistry } = createTestRegistries();
  createTestProfile(profileRegistry, 'overwrite-profile', 'Old Name');
  const exportRegistry = createVisualProfileRegistry();
  const exportBindingRegistry = createEventBindingRegistry({ profileRegistry: exportRegistry });
  createTestProfile(exportRegistry, 'overwrite-profile', 'New Name');
  const zipBuffer = await exportVisualPackage({ profileRegistry: exportRegistry, bindingRegistry: exportBindingRegistry });
  const report = await importVisualPackage({ zipBuffer, profileRegistry, bindingRegistry, strategy: 'overwrite' });
  assert.equal(report.profiles.registered.length, 1);
  assert.equal(report.profiles.registered[0].effectiveId, 'overwrite-profile');
  assert.equal(profileRegistry.get('overwrite-profile').name, 'New Name');
});

test('overwrite of in-use profile replaces look and keeps event references', async () => {
  const { profileRegistry, bindingRegistry } = createTestRegistries();
  createTestProfile(profileRegistry, 'u5f39-u5e55', '弹幕');
  bindingRegistry.apply({ profileId: 'u5f39-u5e55', eventIds: ['chat.assistant_reply.completed'] });
  const exportRegistry = createVisualProfileRegistry();
  const exportBindingRegistry = createEventBindingRegistry({ profileRegistry: exportRegistry });
  createTestProfile(exportRegistry, 'u5f39-u5e55', '弹幕改', { backgroundColor: '#123456' });
  const zipBuffer = await exportVisualPackage({ profileRegistry: exportRegistry, bindingRegistry: exportBindingRegistry });
  const report = await importVisualPackage({
    zipBuffer,
    profileRegistry,
    bindingRegistry,
    strategy: 'overwrite',
    applyBindings: false
  });
  assert.equal(report.failed, undefined);
  assert.equal(report.profiles.registered.length, 1);
  assert.equal(profileRegistry.get('u5f39-u5e55').name, '弹幕改');
  assert.equal(profileRegistry.get('u5f39-u5e55').profile.card.types.minimal.appearance.backgroundColor, '#123456');
  assert.deepEqual(profileRegistry.references('u5f39-u5e55'), ['chat.assistant_reply.completed']);
  assert.equal(bindingRegistry.get('chat.assistant_reply.completed').visualProfileId, 'u5f39-u5e55');
});

test('import with no conflicts registers profiles directly', async () => {
  const { profileRegistry, bindingRegistry } = createTestRegistries();
  createTestProfile(profileRegistry, 'existing-pkg', 'Existing');
  const exportRegistry = createVisualProfileRegistry();
  const exportBindingRegistry = createEventBindingRegistry({ profileRegistry: exportRegistry });
  createTestProfile(exportRegistry, 'fresh-profile', 'Fresh');
  const zipBuffer = await exportVisualPackage({ profileRegistry: exportRegistry, bindingRegistry: exportBindingRegistry });
  const report = await importVisualPackage({ zipBuffer, profileRegistry, bindingRegistry, strategy: 'copy' });
  assert.equal(report.profiles.registered.length, 1);
  assert.equal(report.profiles.registered[0].effectiveId, 'fresh-profile');
  assert.ok(profileRegistry.has('fresh-profile'));
});

test('import registers bindings when profiles are imported', async () => {
  const { profileRegistry, bindingRegistry } = createTestRegistries();
  const exportRegistry = createVisualProfileRegistry();
  const exportBindingRegistry = createEventBindingRegistry({ profileRegistry: exportRegistry });
  createTestProfile(exportRegistry, 'binding-profile', 'Binding Test');
  exportBindingRegistry.apply({ profileId: 'binding-profile', eventIds: ['chat.assistant_reply.completed'] });
  const zipBuffer = await exportVisualPackage({ profileRegistry: exportRegistry, bindingRegistry: exportBindingRegistry });
  await importVisualPackage({ zipBuffer, profileRegistry, bindingRegistry, strategy: 'copy' });
  assert.ok(bindingRegistry.list().some((b) => b.visualProfileId === 'binding-profile'));
});

test('import reconnects matching local art by fingerprint and never copies zip binaries', async () => {
  const sourceDir = createTempDir('visual-pkg-import-asset-src-');
  const targetDir = createTempDir('visual-pkg-import-asset-dst-');
  try {
    const pngBuffer = createMinimalPngBuffer();
    const exportStorage = createVisualAssetStorage(sourceDir.path);
    const exportAssetLibrary = createVisualAssetLibrary({ storage: exportStorage });
    const asset = await exportAssetLibrary.importBuffer({ name: 'test-import.png', kind: 'background', buffer: pngBuffer, tags: [] });
    const exportRegistry = createVisualProfileRegistry();
    const exportBindingRegistry = createEventBindingRegistry({ profileRegistry: exportRegistry });
    createTestProfile(exportRegistry, 'asset-import-profile', 'Asset Import', { backgroundAssetId: asset.assetId });
    const zipBuffer = await exportVisualPackage({
      profileRegistry: exportRegistry, bindingRegistry: exportBindingRegistry,
      assetLibrary: exportAssetLibrary, storage: exportStorage
    });
    const targetStorage = createVisualAssetStorage(targetDir.path);
    const targetAssets = createVisualAssetLibrary({ storage: targetStorage });
    const local = await targetAssets.importBuffer({ assetId: 'local-copy', name: 'local.png', kind: 'background', buffer: pngBuffer, tags: [] });
    const importRegistry = createVisualProfileRegistry();
    const importBindingRegistry = createEventBindingRegistry({ profileRegistry: importRegistry });
    const report = await importVisualPackage({
      zipBuffer, profileRegistry: importRegistry, bindingRegistry: importBindingRegistry,
      assetLibrary: targetAssets, storage: targetStorage, strategy: 'copy'
    });
    assert.equal(report.failed, undefined);
    assert.equal(report.assets.imported.length, 0);
    assert.equal(importRegistry.get('asset-import-profile').profile.card.types.minimal.appearance.backgroundAssetId, local.assetId);
    assert.equal(targetAssets.list().length, 1);
  } finally {
    sourceDir.cleanup();
    targetDir.cleanup();
  }
});

// ---- Error handling tests ----

test('missing asset dependency is reported and rolls back the imported profile', async () => {
  const sourceProfiles = createVisualProfileRegistry();
  const sourceBindings = createEventBindingRegistry({ profileRegistry: sourceProfiles });
  createTestProfile(sourceProfiles, 'missing-asset-profile', 'Missing Asset', { backgroundAssetId: 'missing-asset' });
  const zipBuffer = await exportVisualPackage({ profileRegistry: sourceProfiles, bindingRegistry: sourceBindings });

  const targetProfiles = createVisualProfileRegistry();
  const targetBindings = createEventBindingRegistry({ profileRegistry: targetProfiles });
  const targetDir = createTempDir('visual-pkg-missing-dependency-');
  try {
    const targetStorage = createVisualAssetStorage(targetDir.path);
    const targetAssets = createVisualAssetLibrary({ storage: targetStorage });
    const report = await importVisualPackage({ zipBuffer, profileRegistry: targetProfiles, bindingRegistry: targetBindings, assetLibrary: targetAssets, storage: targetStorage });

    assert.equal(report.failed, true);
    assert.equal(report.rolledBack, true);
    assert.equal(report.failedStage, 'dependencies');
    assert.ok(report.issues.some((issue) => issue.code === 'ASSET_DEPENDENCY_MISSING' && issue.id === 'missing-asset'));
    assert.equal(report.issueSummary.errors, 1);
    assert.deepEqual(targetProfiles.list(), []);
  } finally {
    targetDir.cleanup();
  }
});

test('invalid binding is reported with event details and rolls back the package', async () => {
  const sourceProfiles = createVisualProfileRegistry();
  const sourceBindings = createEventBindingRegistry({ profileRegistry: sourceProfiles });
  createTestProfile(sourceProfiles, 'invalid-binding-profile', 'Invalid Binding');
  const exported = await exportVisualPackage({ profileRegistry: sourceProfiles, bindingRegistry: sourceBindings });
  const zip = new AdmZip(exported);
  zip.addFile('settings/event-bindings.json', Buffer.from(JSON.stringify({ bindings: [{ eventId: 'unknown.event', visualProfileId: 'invalid-binding-profile' }] }), 'utf-8'));

  const targetProfiles = createVisualProfileRegistry();
  const targetBindings = createEventBindingRegistry({ profileRegistry: targetProfiles });
  const report = await importVisualPackage({ zipBuffer: zip.toBuffer(), profileRegistry: targetProfiles, bindingRegistry: targetBindings });

  assert.equal(report.failed, true);
  assert.equal(report.rolledBack, true);
  assert.equal(report.failedStage, 'bindings');
  assert.ok(report.issues.some((issue) => issue.code === 'BINDING_EVENT_INVALID' && issue.id === 'unknown.event'));
  assert.deepEqual(targetProfiles.list(), []);
});

test('strategy skips are exposed as warning issues in the import report', async () => {
  const targetProfiles = createVisualProfileRegistry();
  const targetBindings = createEventBindingRegistry({ profileRegistry: targetProfiles });
  createTestProfile(targetProfiles, 'skipped-profile', 'Existing');
  const sourceProfiles = createVisualProfileRegistry();
  const sourceBindings = createEventBindingRegistry({ profileRegistry: sourceProfiles });
  createTestProfile(sourceProfiles, 'skipped-profile', 'Imported');
  const zipBuffer = await exportVisualPackage({ profileRegistry: sourceProfiles, bindingRegistry: sourceBindings });

  const report = await importVisualPackage({ zipBuffer, profileRegistry: targetProfiles, bindingRegistry: targetBindings, strategy: 'skip' });

  assert.equal(report.failed, undefined);
  assert.ok(report.issues.some((issue) => issue.code === 'PROFILE_CONFLICT_SKIPPED' && issue.id === 'skipped-profile'));
  assert.equal(report.issueSummary.warnings, 1);
  assert.equal(report.issueSummary.errors, 0);
});

test('failed profile import does not copy zip binaries into the local library', async () => {
  const sourceDir = createTempDir('visual-pkg-rollback-source-');
  const targetDir = createTempDir('visual-pkg-rollback-target-');
  try {
    const pngBuffer = createMinimalPngBuffer();
    const sourceStorage = createVisualAssetStorage(sourceDir.path);
    const sourceAssets = createVisualAssetLibrary({ storage: sourceStorage });
    const sourceAsset = await sourceAssets.importBuffer({ assetId: 'rollback-asset', name: 'rollback.png', kind: 'background', buffer: pngBuffer, tags: [] });
    const sourceProfiles = createVisualProfileRegistry();
    const sourceBindings = createEventBindingRegistry({ profileRegistry: sourceProfiles });
    createTestProfile(sourceProfiles, 'rollback-profile', 'Rollback Profile', { backgroundAssetId: sourceAsset.assetId });
    const zipBuffer = await exportVisualPackage({ profileRegistry: sourceProfiles, bindingRegistry: sourceBindings, assetLibrary: sourceAssets, storage: sourceStorage });

    const targetStorage = createVisualAssetStorage(targetDir.path);
    const targetAssets = createVisualAssetLibrary({ storage: targetStorage });
    const targetProfiles = createVisualProfileRegistry();
    const targetBindings = createEventBindingRegistry({ profileRegistry: targetProfiles });
    targetProfiles.register = () => { throw Object.assign(new Error('injected profile failure'), { code: 'INJECTED_PROFILE_FAILURE' }); };

    const report = await importVisualPackage({ zipBuffer, profileRegistry: targetProfiles, bindingRegistry: targetBindings, assetLibrary: targetAssets, storage: targetStorage, clearMissingAssets: true });

    assert.equal(report.rolledBack, true);
    assert.equal(report.failedStage, 'profiles');
    assert.deepEqual(targetProfiles.list(), []);
    assert.deepEqual(targetAssets.list(), []);
  } finally {
    sourceDir.cleanup();
    targetDir.cleanup();
  }
});

test('failed binding import rolls back newly registered profiles and bindings', async () => {
  const sourceProfiles = createVisualProfileRegistry();
  const sourceBindings = createEventBindingRegistry({ profileRegistry: sourceProfiles });
  createTestProfile(sourceProfiles, 'binding-rollback-profile', 'Binding Rollback');
  sourceBindings.apply({ profileId: 'binding-rollback-profile', eventIds: ['chat.assistant_reply.completed'] });
  const zipBuffer = await exportVisualPackage({ profileRegistry: sourceProfiles, bindingRegistry: sourceBindings });

  const targetProfiles = createVisualProfileRegistry();
  const targetBindings = createEventBindingRegistry({ profileRegistry: targetProfiles });
  targetBindings.apply = () => { throw Object.assign(new Error('injected binding failure'), { code: 'INJECTED_BINDING_FAILURE' }); };

  const report = await importVisualPackage({ zipBuffer, profileRegistry: targetProfiles, bindingRegistry: targetBindings });

  assert.equal(report.rolledBack, true);
  assert.equal(report.failedStage, 'bindings');
  assert.deepEqual(targetProfiles.list(), []);
  assert.deepEqual(targetBindings.list(), []);
});

test('failed overwrite import restores the original profile after binding failure', async () => {
  const sourceProfiles = createVisualProfileRegistry();
  const sourceBindings = createEventBindingRegistry({ profileRegistry: sourceProfiles });
  createTestProfile(sourceProfiles, 'overwrite-rollback-profile', 'Imported Name', { backgroundColor: '#123456' });
  sourceBindings.apply({ profileId: 'overwrite-rollback-profile', eventIds: ['chat.assistant_reply.completed'] });
  const zipBuffer = await exportVisualPackage({ profileRegistry: sourceProfiles, bindingRegistry: sourceBindings });

  const targetProfiles = createVisualProfileRegistry();
  createTestProfile(targetProfiles, 'overwrite-rollback-profile', 'Original Name', { backgroundColor: '#654321' });
  const targetBindings = createEventBindingRegistry({ profileRegistry: targetProfiles });
  targetBindings.apply = () => { throw Object.assign(new Error('injected binding failure'), { code: 'INJECTED_BINDING_FAILURE' }); };
  const before = targetProfiles.get('overwrite-rollback-profile');

  const report = await importVisualPackage({ zipBuffer, profileRegistry: targetProfiles, bindingRegistry: targetBindings, strategy: 'overwrite' });

  assert.equal(report.rolledBack, true);
  assert.equal(report.failedStage, 'bindings');
  assert.equal(targetProfiles.get('overwrite-rollback-profile').name, before.name);
  assert.equal(targetProfiles.get('overwrite-rollback-profile').profile.card.types.minimal.appearance.backgroundColor, '#654321');
  assert.deepEqual(targetBindings.list(), []);
  assert.deepEqual(targetProfiles.references('overwrite-rollback-profile'), []);
});

test('import remaps profile asset references when SHA256 dedup reuses another assetId', async () => {
  const sourceDir = createTempDir('visual-pkg-map-source-');
  const targetDir = createTempDir('visual-pkg-map-target-');
  try {
    const pngBuffer = createMinimalPngBuffer();
    const sourceStorage = createVisualAssetStorage(sourceDir.path);
    const sourceAssets = createVisualAssetLibrary({ storage: sourceStorage });
    const sourceAsset = await sourceAssets.importBuffer({ assetId: 'package-asset', name: 'package.png', kind: 'background', buffer: pngBuffer, tags: [] });
    const sourceProfiles = createVisualProfileRegistry();
    const sourceBindings = createEventBindingRegistry({ profileRegistry: sourceProfiles });
    createTestProfile(sourceProfiles, 'mapped-profile', 'Mapped', { backgroundAssetId: sourceAsset.assetId });
    const zipBuffer = await exportVisualPackage({ profileRegistry: sourceProfiles, bindingRegistry: sourceBindings, assetLibrary: sourceAssets, storage: sourceStorage });

    const targetStorage = createVisualAssetStorage(targetDir.path);
    const targetAssets = createVisualAssetLibrary({ storage: targetStorage });
    const targetAsset = await targetAssets.importBuffer({ assetId: 'existing-asset', name: 'existing.png', kind: 'background', buffer: pngBuffer, tags: [] });
    const targetProfiles = createVisualProfileRegistry();
    const targetBindings = createEventBindingRegistry({ profileRegistry: targetProfiles });
    const report = await importVisualPackage({ zipBuffer, profileRegistry: targetProfiles, bindingRegistry: targetBindings, assetLibrary: targetAssets, storage: targetStorage });

    assert.equal(report.assets.imported.length, 0);
    assert.equal(report.assets.skipped[0].reason, 'duplicate_sha256');
    assert.equal(targetProfiles.get('mapped-profile').profile.card.types.minimal.appearance.backgroundAssetId, targetAsset.assetId);
  } finally {
    sourceDir.cleanup();
    targetDir.cleanup();
  }
});

test('import rejects missing profileRegistry', async () => {
  await assert.rejects(() => importVisualPackage({ zipBuffer: Buffer.from([]), bindingRegistry: {} }), { code: 'VISUAL_PACKAGE_IO_INVALID' });
});

test('export rejects missing profileRegistry', async () => {
  await assert.rejects(() => exportVisualPackage({ bindingRegistry: {} }), { code: 'VISUAL_PACKAGE_IO_INVALID' });
});

test('preview reports missing art without treating zip binaries as the library', async () => {
  const sourceProfiles = createVisualProfileRegistry();
  const sourceBindings = createEventBindingRegistry({ profileRegistry: sourceProfiles });
  createTestProfile(sourceProfiles, 'missing-preview', 'Missing Preview', { backgroundAssetId: 'ghost-art' });
  const zipBuffer = await exportVisualPackage({ profileRegistry: sourceProfiles, bindingRegistry: sourceBindings });
  const targetProfiles = createVisualProfileRegistry();
  const preview = await previewImportVisualPackage({ zipBuffer, profileRegistry: targetProfiles });
  assert.equal(preview.assetCount, 1);
  assert.equal(preview.missingAssetCount, 1);
  assert.equal(preview.missingAssets[0].assetId, 'ghost-art');
  assert.equal(preview.embeddedAssetCount, 0);
});

test('clearMissingAssets imports with empty background slots', async () => {
  const sourceProfiles = createVisualProfileRegistry();
  const sourceBindings = createEventBindingRegistry({ profileRegistry: sourceProfiles });
  createTestProfile(sourceProfiles, 'clear-art-profile', 'Clear Art', { backgroundAssetId: 'ghost-art' });
  const zipBuffer = await exportVisualPackage({ profileRegistry: sourceProfiles, bindingRegistry: sourceBindings });
  const targetDir = createTempDir('visual-pkg-clear-missing-');
  try {
    const targetStorage = createVisualAssetStorage(targetDir.path);
    const targetAssets = createVisualAssetLibrary({ storage: targetStorage });
    const targetProfiles = createVisualProfileRegistry();
    const targetBindings = createEventBindingRegistry({ profileRegistry: targetProfiles });
    const report = await importVisualPackage({
      zipBuffer, profileRegistry: targetProfiles, bindingRegistry: targetBindings,
      assetLibrary: targetAssets, storage: targetStorage, clearMissingAssets: true
    });
    assert.equal(report.failed, undefined);
    assert.equal(report.clearMissingAssets, true);
    assert.equal(targetProfiles.get('clear-art-profile').profile.card.types.minimal.appearance.backgroundAssetId, null);
    assert.deepEqual(targetAssets.list(), []);
  } finally {
    targetDir.cleanup();
  }
});

test('applyBindings false keeps local event bindings untouched', async () => {
  const sourceProfiles = createVisualProfileRegistry();
  const sourceBindings = createEventBindingRegistry({ profileRegistry: sourceProfiles });
  createTestProfile(sourceProfiles, 'binding-off-profile', 'Binding Off');
  sourceBindings.apply({ profileId: 'binding-off-profile', eventIds: ['chat.assistant_reply.completed'] });
  const zipBuffer = await exportVisualPackage({ profileRegistry: sourceProfiles, bindingRegistry: sourceBindings });
  const targetProfiles = createVisualProfileRegistry();
  const targetBindings = createEventBindingRegistry({ profileRegistry: targetProfiles });
  const report = await importVisualPackage({
    zipBuffer, profileRegistry: targetProfiles, bindingRegistry: targetBindings, applyBindings: false
  });
  assert.equal(report.failed, undefined);
  assert.equal(report.applyBindings, false);
  assert.equal(report.bindings.imported.length, 0);
  assert.deepEqual(targetBindings.list(), []);
});

test('skip plus applyBindings steals events onto the local profile', async () => {
  const targetProfiles = createVisualProfileRegistry();
  const targetBindings = createEventBindingRegistry({ profileRegistry: targetProfiles });
  createTestProfile(targetProfiles, 'kept-profile', 'Local Look');
  const sourceProfiles = createVisualProfileRegistry();
  const sourceBindings = createEventBindingRegistry({ profileRegistry: sourceProfiles });
  createTestProfile(sourceProfiles, 'kept-profile', 'Imported Look');
  sourceBindings.apply({ profileId: 'kept-profile', eventIds: ['chat.assistant_reply.completed'] });
  const zipBuffer = await exportVisualPackage({ profileRegistry: sourceProfiles, bindingRegistry: sourceBindings });
  const report = await importVisualPackage({
    zipBuffer, profileRegistry: targetProfiles, bindingRegistry: targetBindings, strategy: 'skip', applyBindings: true
  });
  assert.equal(report.profiles.registered.length, 0);
  assert.equal(targetProfiles.get('kept-profile').name, 'Local Look');
  assert.equal(targetBindings.list()[0].visualProfileId, 'kept-profile');
});

test('import ignores embedded asset binaries from old packages', async () => {
  const sourceProfiles = createVisualProfileRegistry();
  const sourceBindings = createEventBindingRegistry({ profileRegistry: sourceProfiles });
  createTestProfile(sourceProfiles, 'legacy-embedded', 'Legacy');
  const exported = await exportVisualPackage({ profileRegistry: sourceProfiles, bindingRegistry: sourceBindings });
  const zip = new AdmZip(exported);
  zip.addFile('assets/legacy.png', createMinimalPngBuffer());
  const targetDir = createTempDir('visual-pkg-ignore-embedded-');
  try {
    const targetStorage = createVisualAssetStorage(targetDir.path);
    const targetAssets = createVisualAssetLibrary({ storage: targetStorage });
    const targetProfiles = createVisualProfileRegistry();
    const targetBindings = createEventBindingRegistry({ profileRegistry: targetProfiles });
    const report = await importVisualPackage({
      zipBuffer: zip.toBuffer(), profileRegistry: targetProfiles, bindingRegistry: targetBindings,
      assetLibrary: targetAssets, storage: targetStorage
    });
    assert.equal(report.failed, undefined);
    assert.ok(report.issues.some((issue) => issue.code === 'ASSET_EMBEDDED_IGNORED'));
    assert.deepEqual(targetAssets.list(), []);
  } finally {
    targetDir.cleanup();
  }
});

test('overwrite of visual.default is refused', async () => {
  const targetProfiles = createVisualProfileRegistry();
  const targetBindings = createEventBindingRegistry({ profileRegistry: targetProfiles });
  createTestProfile(targetProfiles, 'visual.default', '默认视觉方案');
  const sourceProfiles = createVisualProfileRegistry();
  const sourceBindings = createEventBindingRegistry({ profileRegistry: sourceProfiles });
  createTestProfile(sourceProfiles, 'visual.default', '外来默认');
  const zipBuffer = await exportVisualPackage({ profileRegistry: sourceProfiles, bindingRegistry: sourceBindings });
  const report = await importVisualPackage({
    zipBuffer, profileRegistry: targetProfiles, bindingRegistry: targetBindings, strategy: 'overwrite'
  });
  assert.equal(report.failed, true);
  assert.equal(report.error.code, 'VISUAL_PROFILE_REGISTRY_PROTECTED');
  assert.equal(targetProfiles.get('visual.default').name, '默认视觉方案');
});

test('generatePackageId returns a non-empty string', () => {
  const id = generatePackageId();
  assert.equal(typeof id, 'string');
  assert.ok(id.length > 0);
  assert.ok(id.startsWith('visual-package-'));
});

test('export writes font fingerprints and never embeds font files', async () => {
  const { profileRegistry, bindingRegistry } = createTestRegistries();
  const fonts = createFontAssetLibrary({ storage: createMemoryFontStorage() });
  const font = await fonts.importBuffer({ name: 'mint.ttf', buffer: ttfNamed('Mint Sans', 'Mint Sans') });
  createFontedProfile(profileRegistry, 'font-profile', 'Fonted', font.assetId);
  const zipBuffer = await exportVisualPackage({ profileRegistry, bindingRegistry, fontLibrary: fonts });
  const zip = new AdmZip(zipBuffer);
  assert.ok(zip.getEntry('settings/fonts.json'));
  assert.equal(zip.getEntries().some((entry) => /\.(ttf|otf)$/i.test(entry.entryName)), false);
  const metadata = JSON.parse(zip.getEntry('settings/fonts.json').getData().toString('utf-8'));
  assert.equal(metadata.assets[0].assetId, font.assetId);
  assert.equal(metadata.assets[0].sha256, font.sha256);
  assert.equal(metadata.assets[0].name, 'Mint Sans');
});

test('preview reports missing fonts without treating zip binaries as the library', async () => {
  const sourceProfiles = createVisualProfileRegistry();
  const sourceBindings = createEventBindingRegistry({ profileRegistry: sourceProfiles });
  createFontedProfile(sourceProfiles, 'missing-font-preview', 'Missing Font Preview', 'ghost-font');
  const zipBuffer = await exportVisualPackage({ profileRegistry: sourceProfiles, bindingRegistry: sourceBindings });
  const targetProfiles = createVisualProfileRegistry();
  const preview = await previewImportVisualPackage({ zipBuffer, profileRegistry: targetProfiles });
  assert.equal(preview.fontCount, 1);
  assert.equal(preview.missingFontCount, 1);
  assert.equal(preview.missingFonts[0].assetId, 'ghost-font');
});

test('missing font dependency is reported and rolls back the imported profile', async () => {
  const sourceProfiles = createVisualProfileRegistry();
  const sourceBindings = createEventBindingRegistry({ profileRegistry: sourceProfiles });
  createFontedProfile(sourceProfiles, 'missing-font-profile', 'Missing Font', 'ghost-font');
  const zipBuffer = await exportVisualPackage({ profileRegistry: sourceProfiles, bindingRegistry: sourceBindings });
  const targetProfiles = createVisualProfileRegistry();
  const targetBindings = createEventBindingRegistry({ profileRegistry: targetProfiles });
  const report = await importVisualPackage({ zipBuffer, profileRegistry: targetProfiles, bindingRegistry: targetBindings });
  assert.equal(report.failed, true);
  assert.equal(report.rolledBack, true);
  assert.ok(report.issues.some((issue) => issue.code === 'FONT_DEPENDENCY_MISSING' && issue.id === 'ghost-font'));
  assert.deepEqual(targetProfiles.list(), []);
});

test('clearMissingFonts imports with empty font slots', async () => {
  const sourceProfiles = createVisualProfileRegistry();
  const sourceBindings = createEventBindingRegistry({ profileRegistry: sourceProfiles });
  createFontedProfile(sourceProfiles, 'clear-font-profile', 'Clear Font', 'ghost-font');
  const zipBuffer = await exportVisualPackage({ profileRegistry: sourceProfiles, bindingRegistry: sourceBindings });
  const targetProfiles = createVisualProfileRegistry();
  const targetBindings = createEventBindingRegistry({ profileRegistry: targetProfiles });
  const report = await importVisualPackage({
    zipBuffer, profileRegistry: targetProfiles, bindingRegistry: targetBindings, clearMissingFonts: true
  });
  assert.equal(report.failed, undefined);
  assert.equal(report.clearMissingFonts, true);
  const parts = targetProfiles.get('clear-font-profile').profile.card.types.minimal.parts;
  assert.equal(parts.title.fill, '#f2fff9');
  assert.equal(parts.title.fontAssetId ?? null, null);
  assert.equal(parts.body.fontAssetId ?? null, null);
});