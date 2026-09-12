import assert from 'node:assert/strict';
import test from 'node:test';
import { createVisualProfileRegistry } from '../../plugin/domain/visual-profile-registry.js';
import { createEventBindingRegistry } from '../../plugin/domain/event-binding-registry.js';
import { createVisualRegistrySnapshot } from '../../plugin/domain/visual-registry-persistence.js';
import { VisualRegistryPersistenceCoordinator } from '../../plugin/domain/visual-registry-persistence-coordinator.js';

function registries() {
  const profileRegistry = createVisualProfileRegistry();
  const bindingRegistry = createEventBindingRegistry({ profileRegistry });
  return { profileRegistry, bindingRegistry };
}

test('visual registry persistence saves the latest snapshot and restores it', async () => {
  const source = registries();
  source.profileRegistry.register({ profileId: 'persist.stack', name: 'Persist Stack', profile: {} });
  source.bindingRegistry.apply({ profileId: 'persist.stack', eventIds: ['tool.execution.succeeded'] });
  let stored = null;
  const coordinator = new VisualRegistryPersistenceCoordinator({
    profileRegistry: source.profileRegistry,
    bindingRegistry: source.bindingRegistry,
    filePath: 'visual-registry.json',
    save: async (snapshot) => { stored = snapshot; },
    load: async () => stored,
    debounceMs: 0,
    schedule: (callback) => { callback(); return 1; },
    cancel: () => {}
  });
  coordinator.observe();
  source.profileRegistry.register({ profileId: 'persist.warning', name: 'Persist Warning', profile: {} });
  coordinator.queueCurrentSnapshot();
  await coordinator.flush();
  const target = registries();
  const restore = new VisualRegistryPersistenceCoordinator({ ...target, filePath: 'visual-registry.json', save: async () => {}, load: async () => stored });
  await restore.restore();
  assert.equal(target.profileRegistry.has('persist.stack'), true);
  assert.equal(target.profileRegistry.has('persist.warning'), true);
});

test('visual registry persistence keeps pending snapshot after save failure', async () => {
  const target = registries();
  target.profileRegistry.register({ profileId: 'persist.retry', name: 'Retry', profile: {} });
  const diagnostics = [];
  const coordinator = new VisualRegistryPersistenceCoordinator({
    ...target,
    filePath: 'visual-registry.json',
    save: async () => { throw new Error('disk unavailable'); },
    load: async () => null,
    debounceMs: 0,
    schedule: () => 1,
    cancel: () => {}
  });
  coordinator.on('diagnostic', (diagnostic) => diagnostics.push(diagnostic));
  coordinator.queueCurrentSnapshot();
  await assert.rejects(() => coordinator.flush(), (error) => error.code === 'VISUAL_REGISTRY_PERSIST_FAILED' && error.details.cause === 'disk unavailable');
  assert.ok(coordinator.pendingSnapshot);
  assert.equal(diagnostics[0].code, 'VISUAL_REGISTRY_PERSIST_FAILED');
});
