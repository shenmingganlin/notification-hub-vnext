import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSceneStatePersistence,
  createSceneStatePersistenceFromHostContext,
  resolveSceneStatePersistenceConfig
} from '../../plugin/runtime/scene-state-config.js';

test('SceneState persistence config resolves a relative path below dataDir', () => {
  const resolved = resolveSceneStatePersistenceConfig({
    dataDir: 'C:\\Hana\\data\\notification-hub',
    config: {
      sceneStatePersistencePath: 'runtime\\scene-state.json',
      sceneStatePersistenceDebounceMs: 250
    }
  });
  assert.equal(resolved.enabled, true);
  assert.equal(resolved.filePath, 'C:\\Hana\\data\\notification-hub\\runtime\\scene-state.json');
  assert.equal(resolved.debounceMs, 250);
});

test('SceneState persistence config accepts an explicit absolute path', () => {
  const resolved = resolveSceneStatePersistenceConfig({
    dataDir: 'C:\\Hana\\data',
    config: { sceneStatePersistencePath: 'D:\\Snapshots\\scene-state.json' }
  });
  assert.equal(resolved.filePath, 'D:\\Snapshots\\scene-state.json');
});

test('SceneState persistence can be explicitly disabled without requiring dataDir', () => {
  assert.deepEqual(resolveSceneStatePersistenceConfig({
    config: { sceneStatePersistenceEnabled: false }
  }), {
    enabled: false,
    filePath: null,
    debounceMs: null
  });
  assert.equal(createSceneStatePersistence({
    config: { sceneStatePersistenceEnabled: false }
  }), null);
});

test('SceneState persistence config rejects invalid path and debounce values', () => {
  assert.throws(
    () => resolveSceneStatePersistenceConfig({ dataDir: 'C:\\Hana\\data', config: { sceneStatePersistencePath: '' } }),
    (error) => error.code === 'RUNTIME_SCENE_STATE_PATH_INVALID'
  );
  assert.throws(
    () => resolveSceneStatePersistenceConfig({
      dataDir: 'C:\\Hana\\data',
      config: { sceneStatePersistenceDebounceMs: -1 }
    }),
    (error) => error.code === 'RUNTIME_SCENE_STATE_DEBOUNCE_INVALID'
  );
  assert.throws(
    () => resolveSceneStatePersistenceConfig({ config: {} }),
    (error) => error.code === 'RUNTIME_SCENE_STATE_DATA_DIR_INVALID'
  );
});

test('SceneState persistence factory accepts the Hana host context shape', () => {
  const coordinator = createSceneStatePersistenceFromHostContext({
    dataDir: 'C:\\Hana\\data',
    config: { sceneStatePersistenceDebounceMs: 75 }
  }, { save: async () => {} });
  assert.equal(coordinator.filePath, 'C:\\Hana\\data\\scene-state.json');
  assert.equal(coordinator.debounceMs, 75);
});

test('SceneState persistence factory creates a coordinator with resolved settings', () => {
  const coordinator = createSceneStatePersistence({
    dataDir: 'C:\\Hana\\data',
    config: { sceneStatePersistenceDebounceMs: 50 },
    save: async () => {}
  });
  assert.equal(coordinator.filePath, 'C:\\Hana\\data\\scene-state.json');
  assert.equal(coordinator.debounceMs, 50);
});
