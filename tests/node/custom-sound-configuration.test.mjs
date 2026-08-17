import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import NotificationHubVNextPlugin from '../../plugin/index.js';

function context(dataDir) {
  return {
    dataDir,
    pluginDir: path.join(dataDir, 'plugin'),
    config: { notificationPersistenceEnabled: false, soundSettingsPersistenceEnabled: false },
    log: { info() {}, debug() {}, warn() {}, error() {} }
  };
}

function backend() {
  return {
    warmup: async () => true,
    playCue: async () => ({ played: true }),
    playFile: async () => ({ played: true }),
    dispose() {}
  };
}

function scheduler({ play }) {
  return {
    async schedule(decision) { return { status: 'played', playback: await play({ decision }) }; },
    async waitForIdle() { return true; },
    clear() {}
  };
}

test('different three-layer bindings stay independent and identical bindings replace only themselves', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'nhsound-triple-'));
  const plugin = new NotificationHubVNextPlugin(context(dataDir), {
    soundBackendFactory: backend,
    soundPreviewBackendFactory: backend,
    soundSchedulerFactory: scheduler,
    soundFilePickerFactory: () => ({ save: async () => ({ cancelled: true }) })
  });
  try {
    const first = await plugin.importSoundAsset({
      file: new File([Buffer.from('first')], 'shared.wav', { type: 'audio/wav' }),
      binding: { eventId: 'tool.execution.failed' }
    });
    const second = await plugin.importSoundAsset({
      file: new File([Buffer.from('second')], 'shared.wav', { type: 'audio/wav' }),
      binding: { eventId: 'tool.execution.timed_out' }
    });
    assert.notEqual(first.asset.soundId, second.asset.soundId);
    assert.equal(plugin.getSoundAssetStatus().assets.filter((asset) => asset.kind === 'custom').length, 2);
    const replacement = await plugin.importSoundAsset({
      file: new File([Buffer.from('replacement')], 'shared.wav', { type: 'audio/wav' }),
      binding: { eventId: 'tool.execution.failed' },
      replaceExisting: true
    });
    assert.equal(replacement.replaced, true);
    assert.equal(replacement.asset.soundId, first.asset.soundId);
    assert.equal(plugin.getSoundAssetStatus().assets.filter((asset) => asset.kind === 'custom').length, 2);
    assert.equal(plugin.getSoundSettingsStatus().profile.soundOverrides.filter((entry) => entry.soundId === first.asset.soundId).length, 1);
    assert.equal(plugin.getSoundSettingsStatus().profile.soundOverrides.some((entry) => entry.soundId === second.asset.soundId && entry.eventId === 'tool.execution.timed_out'), true);
  } finally {
    await plugin.onunload().catch(() => {});
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('removing a custom binding updates the live resolver immediately', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'nhsound-remove-binding-'));
  const calls = [];
  const api = new NotificationHubVNextPlugin(context(dataDir), {
    soundBackendFactory: backend,
    soundPreviewBackendFactory: backend,
    soundSchedulerFactory: scheduler
  });
  try {
    await api.onload();
    const imported = await api.importSoundAsset({ file: new File([Buffer.from('sound')], 'remove.wav', { type: 'audio/wav' }) });
    await api.updateSoundAssetConfiguration({ soundId: imported.asset.soundId, eventId: 'tool.execution.succeeded' });
    await api.removeSoundBindingConfiguration({ eventId: 'tool.execution.succeeded' });
    assert.equal(api.getSoundSettingsStatus().profile.soundOverrides.some((entry) => entry.eventId === 'tool.execution.succeeded'), false);
    const result = api.notificationApi.ingestEvent({
      event: { eventId: 'tool.execution.succeeded', type: 'toolUse', stopReason: 'tool_result' },
      notification: { notificationId: 'remove-binding-test', type: 'tool_result', title: '完成', content: '完成' },
      profiles: [{ id: 'default' }]
    });
    await result.sound.playback;
    assert.notEqual(result.sound.decision.soundId, imported.asset.soundId);
    void calls;
  } finally {
    await api.onunload().catch(() => {});
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('saved custom binding is applied to the real notification task path', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'nhsound-real-task-'));
  const calls = [];
  const realBackend = () => ({
    warmup: async () => true,
    playCue: async (input) => { calls.push({ method: 'playCue', input }); return { played: true }; },
    playFile: async (input) => { calls.push({ method: 'playFile', input }); return { played: true }; },
    dispose() {}
  });
  const realScheduler = ({ play }) => ({
    async schedule(decision, context) { return { status: 'played', playback: await play({ decision, context }) }; },
    async waitForIdle() { return true; },
    clear() {}
  });
  const plugin = new NotificationHubVNextPlugin({ ...context(dataDir), config: { ...context(dataDir).config, globalSoundEnabled: true } }, {
    soundBackendFactory: realBackend,
    soundPreviewBackendFactory: realBackend,
    soundSchedulerFactory: realScheduler,
    soundFilePickerFactory: () => ({ save: async () => ({ cancelled: true }) })
  });
  try {
    const imported = await plugin.importSoundAsset({ file: new File([Buffer.from('sound')], 'task.wav', { type: 'audio/wav' }) });
    await plugin.updateSoundSettings({ globalSoundEnabled: true });
    await plugin.updateSoundAssetConfiguration({ soundId: imported.asset.soundId, eventId: 'tool.execution.succeeded', volume: 0.4 });
    const result = plugin.notificationApi.ingestEvent({
      event: { eventId: 'real-task-custom-sound', type: 'toolUse', stopReason: 'tool_result', source: 'hana.tool' },
      notification: { notificationId: 'real-task-custom-sound', type: 'tool_result', title: '任务完成', content: '完成' },
      profiles: [{ id: 'default' }]
    });
    await result.sound.playback;
    assert.equal(result.sound.decision.soundId, imported.asset.soundId);
    assert.equal(result.sound.decision.volume, 0.4);
    assert.equal(calls.at(-1).method, 'playFile');
    assert.equal(calls.at(-1).input.volume, 0.4);
    assert.equal(plugin.getSoundSettingsStatus().soundDiagnostics.at(-1).playback.source, 'file');
  } finally {
    await plugin.onunload().catch(() => {});
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('audio import stays independent, an existing binding volume can be saved again, and deletion cascades references', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'nhsound-config-'));
  const plugin = new NotificationHubVNextPlugin(context(dataDir), {
    soundBackendFactory: backend,
    soundPreviewBackendFactory: backend,
    soundSchedulerFactory: scheduler,
    soundFilePickerFactory: () => ({ save: async () => ({ cancelled: true }) })
  });
  try {
    const imported = await plugin.importSoundAsset({ file: new File([Buffer.from('sound')], 'ganlin.wav', { type: 'audio/wav' }) });
    assert.equal(plugin.getSoundSettingsStatus().profile.soundOverrides.length, 0);
    const triple = await plugin.updateSoundAssetConfiguration({ soundId: imported.asset.soundId, eventId: 'tool.execution.succeeded', volume: 0.4 });
    assert.equal(triple.profile.soundOverrides.some((entry) => entry.eventId === 'tool.execution.succeeded' && entry.volume === 0.4 && entry.soundId === imported.asset.soundId), true);
    const tripleAgain = await plugin.updateSoundAssetConfiguration({ soundId: imported.asset.soundId, eventId: 'tool.execution.succeeded', volume: 0.75 });
    assert.equal(tripleAgain.profile.soundOverrides.filter((entry) => entry.soundId === imported.asset.soundId && entry.eventId === 'tool.execution.succeeded').length, 1);
    assert.equal(tripleAgain.profile.soundOverrides.find((entry) => entry.soundId === imported.asset.soundId && entry.eventId === 'tool.execution.succeeded').volume, 0.75);
    const tripleOther = await plugin.updateSoundAssetConfiguration({ soundId: imported.asset.soundId, eventId: 'external_integration.event.failed' });
    assert.equal(tripleOther.profile.soundOverrides.filter((entry) => entry.soundId === imported.asset.soundId).length, 2);
    const beforePreview = plugin.getSoundSettingsStatus().profile.soundOverrides.length;
    const preview = await plugin.testSoundSettings({ eventId: 'tool.execution.succeeded', labels: ['tool'], event: 'tool_completed', importance: 'normal', soundId: imported.asset.soundId });
    assert.equal(preview.decision.soundId, imported.asset.soundId);
    assert.equal(plugin.getSoundSettingsStatus().profile.soundOverrides.length, beforePreview);
    await plugin.updateSoundSettings({ globalSoundEnabled: false });
    const mutedPreview = await plugin.testSoundSettings({ eventId: 'tool.execution.succeeded', labels: ['tool'], event: 'tool_completed', importance: 'normal', soundId: imported.asset.soundId });
    assert.equal(mutedPreview.scheduled, false);
    assert.equal(mutedPreview.decision.reason, 'global-disabled');
    await plugin.updateSoundSettings({ globalSoundEnabled: true });
    const cascadeDeleted = await plugin.deleteSoundAsset({ soundId: imported.asset.soundId });
    assert.equal(cascadeDeleted.removed, true);
    assert.equal(cascadeDeleted.profile.soundOverrides.some((entry) => entry.soundId === imported.asset.soundId), false);
    await assert.rejects(readFile(imported.path));
  } finally {
    await plugin.onunload().catch(() => {});
    await rm(dataDir, { recursive: true, force: true });
  }
});
