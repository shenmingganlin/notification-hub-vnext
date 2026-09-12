import assert from 'node:assert/strict';
import test from 'node:test';
import { createVisualProfileRegistry } from '../../plugin/domain/visual-profile-registry.js';
import { createEventBindingRegistry } from '../../plugin/domain/event-binding-registry.js';
import { VisualRegistryPersistenceCoordinator } from '../../plugin/domain/visual-registry-persistence-coordinator.js';
import NotificationHubVNextPlugin from '../../plugin/index.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

function registries() {
  const profileRegistry = createVisualProfileRegistry();
  const bindingRegistry = createEventBindingRegistry({ profileRegistry });
  return { profileRegistry, bindingRegistry };
}

for (const [label, value, code] of [
  ['malformed JSON', '{not-json', 'VISUAL_REGISTRY_LOAD_FAILED'],
  ['unsupported version', JSON.stringify({ version: 99, revision: 1, profiles: [], bindings: [] }), 'VISUAL_REGISTRY_SNAPSHOT_VERSION_INVALID'],
  ['invalid profile', JSON.stringify({ version: 1, revision: 1, profiles: [{ profileId: '../escape', name: 'Bad', profile: {} }], bindings: [] }), 'VISUAL_PROFILE_REGISTRY_ID_INVALID'],
  ['invalid binding reference', JSON.stringify({ version: 1, revision: 1, profiles: [], bindings: [{ eventId: 'tool.execution.succeeded', visualProfileId: 'missing' }] }), 'VISUAL_PROFILE_NOT_FOUND']
]) {
  test(`rejects ${label} without mutating target registries`, async () => {
    const { profileRegistry, bindingRegistry } = registries();
    profileRegistry.register({ profileId: 'existing', name: 'Existing', profile: {} });
    const coordinator = new VisualRegistryPersistenceCoordinator({ profileRegistry, bindingRegistry, filePath: 'visual-registry.json', load: async () => JSON.parse(value), save: async () => {} });
    await assert.rejects(() => coordinator.restore(), (error) => error.code === code || error.details?.cause === code);
    assert.deepEqual(profileRegistry.list(), ['existing']);
    assert.deepEqual(bindingRegistry.list(), []);
  });
}

test('plugin continues loading after corrupt visual registry and preserves sound settings', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'nh-visual-corrupt-'));
  try {
    await writeFile(path.join(dataDir, 'visual-registry.json'), '{not-json', 'utf8');
    const context = { dataDir, pluginDir: path.join(dataDir, 'plugin'), config: { runtimeEnabled: false, notificationPersistenceEnabled: false, soundSettingsPersistenceEnabled: false, visualSettingsPersistenceEnabled: false, eventPresentationSettingsPersistenceEnabled: false }, log: { info() {}, debug() {}, warn() {}, error() {} } };
    const plugin = new NotificationHubVNextPlugin(context);
    await plugin.updateEventPresentationSettings({ events: { 'tool.execution.failed': { soundProfileId: 'sound.keep', visualProfileId: 'visual.old', behaviorProfileId: 'stack', behaviorChannelId: 'stack.main' } } });
    await plugin.onload();
    assert.equal(plugin.getEventPresentationSettings().settings.events['tool.execution.failed'].soundProfileId, 'sound.keep');
    assert.equal(plugin.getVisualRegistryPersistenceStatus().status, 'error');
    await plugin.onunload();
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});
