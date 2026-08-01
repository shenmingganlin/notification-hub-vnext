import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  loadSceneState,
  saveSceneState,
  serializePersistedSceneState
} from '../../plugin/runtime/scene-state-store.js';

const sceneState = {
  sceneStateVersion: 1,
  protocolVersion: 1,
  updatedAt: '2026-08-01T12:00:00.000Z',
  sceneWindow: { x: 120, y: 80, width: 420, height: 180 },
  cardOrder: ['card-a'],
  cards: [{ id: 'card-a', title: 'Card A', body: 'A', x: 10, y: 20, width: 320, height: 160 }],
  layout: null
};

test('SceneState store persists and reloads a validated snapshot atomically', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'notification-hub-scene-state-'));
  const filePath = path.join(directory, 'scene-state.json');
  try {
    await saveSceneState(sceneState, filePath);
    assert.deepEqual(await loadSceneState(filePath), sceneState);
    assert.equal(await readFile(filePath, 'utf8'), `${JSON.stringify(sceneState)}\n`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('SceneState store creates parent directories and does not mutate input', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'notification-hub-scene-state-'));
  const filePath = path.join(directory, 'nested', 'scene-state.json');
  const input = structuredClone(sceneState);
  try {
    await saveSceneState(input, filePath);
    assert.deepEqual(input, sceneState);
    assert.equal(serializePersistedSceneState(input), `${JSON.stringify(sceneState)}\n`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('SceneState store replaces an existing snapshot without leaving backup files', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'notification-hub-scene-state-'));
  const filePath = path.join(directory, 'scene-state.json');
  const replacement = { ...sceneState, updatedAt: '2026-08-01T12:01:00.000Z' };
  try {
    await saveSceneState(sceneState, filePath);
    await saveSceneState(replacement, filePath);
    assert.deepEqual(await loadSceneState(filePath), replacement);
    const names = await (await import('node:fs/promises')).readdir(directory);
    assert.deepEqual(names, ['scene-state.json']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('SceneState store rejects corrupted snapshots with contract errors', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'notification-hub-scene-state-'));
  const filePath = path.join(directory, 'scene-state.json');
  try {
    await writeFile(filePath, '{"sceneStateVersion":99}', 'utf8');
    await assert.rejects(
      loadSceneState(filePath),
      (error) => error.code === 'RUNTIME_SCENE_STATE_VERSION_UNSUPPORTED'
    );
    await writeFile(filePath, '{not-json', 'utf8');
    await assert.rejects(
      loadSceneState(filePath),
      (error) => error.code === 'RUNTIME_SCENE_STATE_INVALID'
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('SceneState store preserves the previous file when the target path cannot be replaced', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'notification-hub-scene-state-'));
  const protectedParent = path.join(directory, 'occupied');
  const filePath = path.join(protectedParent, 'scene-state.json');
  try {
    await writeFile(protectedParent, 'occupied', 'utf8');
    await assert.rejects(
      saveSceneState(sceneState, filePath),
      (error) => error.code === 'RUNTIME_SCENE_STATE_PERSIST_FAILED'
    );
    assert.equal(await readFile(protectedParent, 'utf8'), 'occupied');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
