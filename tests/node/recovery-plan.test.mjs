import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRecoverySnapshot, saveRecoverySnapshot } from '../../plugin/runtime/recovery-snapshot.js';
import { RuntimeProcessManager } from '../../plugin/runtime/process-manager.js';
import { loadRecoveryPlan, selectRecoveryPlan } from '../../plugin/runtime/recovery-plan.js';

const sceneState = {
  sceneStateVersion: 1,
  protocolVersion: 1,
  updatedAt: '2026-08-01T12:00:00.000Z',
  sceneWindow: { x: 120, y: 80, width: 420, height: 180 },
  cardOrder: ['card-a'],
  cards: [{ id: 'card-a', title: 'Card A', body: 'A', x: 10, y: 20, width: 320, height: 160 }],
  layout: {
    mode: 'stack',
    direction: 'down',
    anchor: 'top-right',
    spacing: 12,
    workArea: {
      resolution: 'provider',
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      dpiScale: 1,
      isFallback: false,
      source: 'primary-monitor'
    }
  }
};

function legacySnapshot() {
  return createRecoverySnapshot({
    entries: [{
      key: 'legacy-window',
      type: 'scene.update',
      payload: { x: 1, y: 2, width: 300, height: 200 }
    }]
  });
}

test('selectRecoveryPlan prefers a valid SceneState projection', () => {
  const plan = selectRecoveryPlan({ sceneState, recoverySnapshot: legacySnapshot() });

  assert.equal(plan.source, 'scene-state');
  assert.deepEqual(plan.snapshot.entries.map(({ key, type }) => ({ key, type })), [
    { key: 'scene-window', type: 'scene.update' },
    { key: 'scene-layout', type: 'scene.set-mode' },
    { key: 'scene-card-card-a', type: 'scene.create' }
  ]);
  assert.deepEqual(plan.diagnostics, []);
});

test('selectRecoveryPlan falls back to legacy snapshot on unsupported SceneState', () => {
  const legacy = legacySnapshot();
  const plan = selectRecoveryPlan({
    sceneState: { ...sceneState, sceneStateVersion: 99 },
    recoverySnapshot: legacy
  });

  assert.equal(plan.source, 'recovery-snapshot');
  assert.deepEqual(plan.snapshot, legacy);
  assert.equal(plan.diagnostics.length, 1);
  assert.equal(plan.diagnostics[0].code, 'RUNTIME_SCENE_STATE_RECOVERY_FALLBACK');
  assert.equal(plan.diagnostics[0].cause, 'RUNTIME_SCENE_STATE_VERSION_UNSUPPORTED');
});

test('selectRecoveryPlan rejects a failed SceneState when no legacy fallback exists', () => {
  assert.throws(
    () => selectRecoveryPlan({ sceneState: { ...sceneState, layout: { mode: 'invalid' } } }),
    (error) => error.code === 'RUNTIME_RECOVERY_NO_VALID_SOURCE'
      && error.details.attempts[0].cause === 'RUNTIME_SCENE_STATE_LAYOUT_INVALID'
  );
});

test('loadRecoveryPlan uses legacy file when SceneState file is missing', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'notification-hub-recovery-plan-'));
  const scenePath = path.join(directory, 'scene-state.json');
  const recoveryPath = path.join(directory, 'recovery.json');
  try {
    const legacy = legacySnapshot();
    await saveRecoverySnapshot(legacy, recoveryPath);
    const plan = await loadRecoveryPlan({ sceneStatePath: scenePath, recoverySnapshotPath: recoveryPath });

    assert.equal(plan.source, 'recovery-snapshot');
    assert.deepEqual(plan.snapshot, legacy);
    assert.equal(plan.diagnostics.length, 1);
    assert.equal(plan.diagnostics[0].kind, 'missing');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('loadRecoveryPlan prefers a valid SceneState file over legacy file', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'notification-hub-recovery-plan-'));
  const scenePath = path.join(directory, 'scene-state.json');
  const recoveryPath = path.join(directory, 'recovery.json');
  try {
    await writeFile(scenePath, JSON.stringify(sceneState), 'utf8');
    await saveRecoverySnapshot(legacySnapshot(), recoveryPath);
    const plan = await loadRecoveryPlan({ sceneStatePath: scenePath, recoverySnapshotPath: recoveryPath });

    assert.equal(plan.source, 'scene-state');
    assert.equal(plan.snapshot.entries[0].key, 'scene-window');
    assert.deepEqual(plan.diagnostics, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('RuntimeProcessManager accepts SceneState first with legacy recovery fallback', () => {
  const manager = new RuntimeProcessManager({
    runtimePath: 'runtime.exe',
    pipeName: '\\\\.\\pipe\\recovery-plan-test',
    sceneState,
    recoverySnapshot: legacySnapshot(),
    autoRestart: false
  });

  assert.equal(manager.recoverySource, 'scene-state');
  assert.equal(manager.recoverySnapshot.entries[0].key, 'scene-window');
  assert.deepEqual(manager.recoveryDiagnostics, []);
});

test('RuntimeProcessManager records fallback diagnostics when SceneState is invalid', () => {
  const manager = new RuntimeProcessManager({
    runtimePath: 'runtime.exe',
    pipeName: '\\\\.\\pipe\\recovery-plan-fallback-test',
    sceneState: { ...sceneState, sceneStateVersion: 99 },
    recoverySnapshot: legacySnapshot(),
    autoRestart: false
  });

  assert.equal(manager.recoverySource, 'recovery-snapshot');
  assert.equal(manager.recoveryDiagnostics[0].code, 'RUNTIME_SCENE_STATE_RECOVERY_FALLBACK');
  assert.equal(manager.recoveryDiagnostics[0].cause, 'RUNTIME_SCENE_STATE_VERSION_UNSUPPORTED');
});

test('loadRecoveryPlan can explicitly start empty when both sources are missing', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'notification-hub-recovery-plan-'));
  try {
    const plan = await loadRecoveryPlan({
      sceneStatePath: path.join(directory, 'scene-state.json'),
      recoverySnapshotPath: path.join(directory, 'recovery.json'),
      allowEmpty: true
    });
    assert.equal(plan.source, 'empty');
    assert.deepEqual(plan.snapshot.entries, []);
    assert.equal(plan.diagnostics[0].code, 'RUNTIME_RECOVERY_EMPTY_INITIAL_STATE');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('loadRecoveryPlan reports both invalid sources instead of silently starting empty', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'notification-hub-recovery-plan-'));
  const scenePath = path.join(directory, 'scene-state.json');
  const recoveryPath = path.join(directory, 'recovery.json');
  try {
    await writeFile(scenePath, JSON.stringify({ ...sceneState, sceneStateVersion: 99 }), 'utf8');
    await writeFile(recoveryPath, '{"recoveryVersion":99}', 'utf8');

    await assert.rejects(
      loadRecoveryPlan({ sceneStatePath: scenePath, recoverySnapshotPath: recoveryPath }),
      (error) => error.code === 'RUNTIME_RECOVERY_NO_VALID_SOURCE'
        && error.details.attempts.length === 2
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
