import assert from 'node:assert/strict';
import test from 'node:test';

import {
  restoreNotificationDisplaySettings,
  restoreObservedPersistence,
  restoreSidebarDisplaySettings,
  stopHostStores,
  stopObservedPersistence
} from '../../plugin/persistence/host-store-lifecycle.js';
import { createNotificationDisplaySettings } from '../../plugin/domain/notification-display-settings.js';
import { createSidebarDisplaySettings } from '../../plugin/domain/sidebar-display-settings.js';

function fakePersistence({ restoreResult = null, restoreError = null, flushError = null } = {}) {
  const events = [];
  return {
    events,
    pendingSnapshot: null,
    observe() { events.push('observe'); },
    dispose() { events.push('dispose'); },
    async restore() {
      events.push('restore');
      if (restoreError) throw restoreError;
      return restoreResult;
    },
    async flush() {
      events.push('flush');
      if (flushError) throw flushError;
      return 'ok';
    }
  };
}

test('restoreObservedPersistence restores, then observes, and swallows restore errors', async () => {
  const ok = fakePersistence({ restoreResult: { id: 1 } });
  const restored = [];
  assert.equal(await restoreObservedPersistence({
    create: () => ok,
    afterRestore: ({ restored: value }) => restored.push(value)
  }), ok);
  assert.deepEqual(ok.events, ['restore', 'observe']);
  assert.deepEqual(restored, [{ id: 1 }]);

  const failed = fakePersistence({ restoreError: Object.assign(new Error('disk'), { code: 'X' }) });
  const errors = [];
  await restoreObservedPersistence({
    create: () => failed,
    onError: (error) => errors.push(error.code)
  });
  assert.deepEqual(failed.events, ['restore', 'observe']);
  assert.deepEqual(errors, ['X']);
});

test('stopObservedPersistence flushes then disposes even if flush fails', async () => {
  const persistence = fakePersistence({
    flushError: Object.assign(new Error('busy'), { code: 'FLUSH' })
  });
  const errors = [];
  const after = [];
  await stopObservedPersistence(persistence, {
    onError: (error) => errors.push(error.code),
    after: () => after.push('after')
  });
  assert.deepEqual(persistence.events, ['flush', 'dispose']);
  assert.deepEqual(errors, ['FLUSH']);
  assert.deepEqual(after, ['after']);
});

test('display and sidebar restore apply snapshots and stopHostStores follows unload order', async () => {
  const display = fakePersistence({
    restoreResult: createNotificationDisplaySettings({ cardLifetimeSeconds: 9 })
  });
  const sidebar = fakePersistence({
    restoreResult: createSidebarDisplaySettings({ limit: 5 })
  });
  const visual = fakePersistence();
  const sound = fakePersistence();
  const event = fakePersistence();
  const registry = fakePersistence();
  const order = [];
  const host = {
    ctx: {},
    notificationDisplaySettings: createNotificationDisplaySettings(),
    sidebarDisplaySettings: createSidebarDisplaySettings(),
    notificationDisplaySettingsPersistenceFactory: () => display,
    sidebarDisplaySettingsPersistenceFactory: () => sidebar,
    recordNotificationDiagnostic() {},
    visualSettingsPersistence: visual,
    soundSettingsPersistence: sound,
    eventPresentationSettingsPersistence: event,
    visualRegistryPersistence: registry,
    soundScheduler: { clear() { order.push('scheduler-clear'); } },
    soundBackend: { dispose() { order.push('backend-dispose'); } }
  };

  await restoreNotificationDisplaySettings(host);
  await restoreSidebarDisplaySettings(host);
  assert.equal(host.notificationDisplaySettings.cardLifetimeSeconds, 9);
  assert.equal(host.sidebarDisplaySettings.limit, 5);

  for (const persistence of [sound, visual, event, registry]) {
    persistence.flush = async () => { order.push(persistence === sound ? 'sound' : persistence === visual ? 'visual' : persistence === event ? 'event' : 'registry'); };
  }
  host.notificationDisplaySettingsPersistence.flush = async () => { order.push('display'); };
  host.sidebarDisplaySettingsPersistence.flush = async () => { order.push('sidebar'); };

  await stopHostStores(host);
  assert.deepEqual(order, ['sound', 'scheduler-clear', 'backend-dispose', 'visual', 'event', 'registry']);
  assert.equal(host.soundSettingsPersistence, null);
  assert.equal(host.visualSettingsPersistence, null);
  assert.equal(host.eventPresentationSettingsPersistence, null);
  assert.equal(host.visualRegistryPersistence, null);
  assert.equal(host.notificationDisplaySettingsPersistence, null);
  assert.equal(host.sidebarDisplaySettingsPersistence, null);
});
