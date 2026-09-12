import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import NotificationHubVNextPlugin from '../../plugin/index.js';

function context() {
  return { dataDir: '', config: {}, pluginDir: process.cwd() };
}

test('plugin exposes visual registry snapshot and custom event read API', () => {
  const plugin = new NotificationHubVNextPlugin(context());
  plugin.visualProfileRegistry.register({ profileId: 'api.stack', name: 'API Stack', profile: {} });
  plugin.applyVisualProfileToEvents({ profileId: 'api.stack', eventIds: ['tool.execution.succeeded'] });
  const snapshot = plugin.getVisualRegistrySnapshot();
  assert.equal(snapshot.profiles.length, 2);
  assert.equal(plugin.listCustomVisualEvents()[0].eventId, 'tool.execution.succeeded');
  assert.equal(plugin.getVisualRegistrySnapshot().revision, 2);
});

test('plugin saves the editable visual draft as an exportable profile and replaces it by id', () => {
  const plugin = new NotificationHubVNextPlugin(context());
  const first = plugin.saveVisualProfile({ profileId: 'visual.workbench', name: '工作台方案', profile: { global: { enabled: true } } });
  assert.equal(first.profileId, 'visual.workbench');
  assert.equal(plugin.listVisualProfiles().find((item) => item.profileId === 'visual.workbench').name, '工作台方案');
  const second = plugin.saveVisualProfile({ profileId: 'visual.workbench', name: '工作台方案 2', profile: { global: { preset: 'accent' } } });
  assert.equal(second.name, '工作台方案 2');
  assert.equal(plugin.listVisualProfiles().filter((item) => item.profileId === 'visual.workbench').length, 1);
  assert.equal(plugin.visualProfileRegistry.get('visual.workbench').profile.global.preset, 'accent');
});

test('plugin removes an unreferenced visual profile but protects the default profile', () => {
  const plugin = new NotificationHubVNextPlugin(context());
  plugin.saveVisualProfile({ profileId: 'visual.delete-me', name: '删除我', profile: {} });
  assert.deepEqual(plugin.removeVisualProfile('visual.delete-me').removed, true);
  assert.equal(plugin.listVisualProfiles().some((item) => item.profileId === 'visual.delete-me'), false);
  assert.throws(() => plugin.removeVisualProfile('visual.default'), (error) => error.code === 'VISUAL_PROFILE_REGISTRY_PROTECTED');
});
test('plugin applies a saved profile to explicit events with one behavior channel', () => {
  const plugin = new NotificationHubVNextPlugin(context());
  plugin.saveVisualProfile({ profileId: 'visual.workbench', name: '工作台方案', profile: {} });
  const result = plugin.applyVisualProfileToEvents({ profileId: 'visual.workbench', eventIds: ['chat.assistant_reply.completed', 'tool.execution.succeeded'], behaviorChannelId: 'workbench.main' });
  assert.deepEqual(result.added, ['chat.assistant_reply.completed', 'tool.execution.succeeded']);
  assert.deepEqual(plugin.listCustomVisualEvents().map((item) => [item.eventId, item.visualProfileId, item.behaviorChannelId]), [
    ['chat.assistant_reply.completed', 'visual.workbench', 'workbench.main'],
    ['tool.execution.succeeded', 'visual.workbench', 'workbench.main']
  ]);
});

test('plugin exposes isolated visual diagnostics without notification content', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  await assert.rejects(() => plugin.updateVisualSettings({ profile: { card: { activeType: 'missing' } } }));
  const status = plugin.getVisualSettingsStatus();
  assert.ok(Array.isArray(status.visualDiagnostics));
  assert.ok(status.visualDiagnostics.length >= 1);
  assert.equal('content' in status.visualDiagnostics[0], false);
  assert.deepEqual(plugin.clearVisualDiagnostics().visualDiagnostics, []);
});
test('plugin restores visual registry across plugin lifecycles in a real data directory', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'nh-visual-registry-plugin-'));
  const makeContext = () => ({ dataDir, pluginDir: path.join(dataDir, 'plugin'), config: { runtimeEnabled: false, notificationPersistenceEnabled: false, soundSettingsPersistenceEnabled: false, visualSettingsPersistenceEnabled: false, eventPresentationSettingsPersistenceEnabled: false }, log: { info() {}, debug() {}, warn() {}, error() {} } });
  try {
    const first = new NotificationHubVNextPlugin(makeContext());
    await first.onload();
    first.visualProfileRegistry.register({ profileId: 'persisted.stack', name: 'Persisted Stack', profile: {} });
    first.applyVisualProfileToEvents({ profileId: 'persisted.stack', eventIds: ['tool.execution.succeeded'] });
    await first.onunload();
    const second = new NotificationHubVNextPlugin(makeContext());
    await second.onload();
    assert.equal(second.visualProfileRegistry.has('persisted.stack'), true);
    assert.equal(second.listCustomVisualEvents()[0].visualProfileId, 'persisted.stack');
    assert.equal(second.getVisualRegistryPersistenceStatus().status, 'saved');
    await second.onunload();
  } finally { await rm(dataDir, { recursive: true, force: true }); }
});

test('plugin opens, updates and closes a real visual workbench card without notification history', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  const calls = [];
  plugin.runtimeHost = {
    state: 'running',
    client: {
      async request(type, payload) {
        calls.push([type, payload]);
        if (type === 'health') return { payload: { result: { workArea: { left: 0, top: 0, width: 1920, height: 1080 }, layout: { direction: 'right', anchor: 'bottom-left', spacing: 12 } } } };
        return { payload: { result: { status: 'accepted' } } };
      }
    }
  };
  const draft = { global: { enabled: true }, card: { activeType: 'minimal', types: { minimal: { appearance: { backgroundColor: '#123456', borderRadius: 28, opacity: 0.72 } } } } };
  const updatedDraft = { ...draft, card: { ...draft.card, types: { minimal: { ...draft.card.types.minimal, appearance: { ...draft.card.types.minimal.appearance, backgroundColor: '#654321', borderRadius: 8, opacity: 0.48 } } } } };
  const opened = await plugin.openVisualWorkbenchCard({ phase: 'enter', draft });
  assert.match(opened.card.id, /^nh-visual-workbench-/);
  assert.equal(calls[1][0], 'scene.create');
  assert.deepEqual(calls[1][1].visual.appearance, { size: 'medium', aspectRatio: 'default', backgroundColor: '#123456', backgroundFit: 'fill', backgroundPadding: 0, borderRadius: 28, opacity: 0.72 });
  const updated = await plugin.updateVisualWorkbenchCard({ phase: 'hold', draft: updatedDraft });
  assert.equal(updated.card.id, opened.card.id);
  assert.equal(calls[2][0], 'health');
  assert.equal(calls[3][0], 'scene.update');
  assert.equal(calls[3][1].id, calls[1][1].id);
  assert.deepEqual(calls[3][1].visual.appearance, { size: 'medium', aspectRatio: 'default', backgroundColor: '#654321', backgroundFit: 'fill', backgroundPadding: 0, borderRadius: 8, opacity: 0.48 });
  assert.deepEqual(calls[3][1] && { x: calls[3][1].x, y: calls[3][1].y, width: calls[3][1].width, height: calls[3][1].height }, { x: calls[1][1].x, y: calls[1][1].y, width: calls[1][1].width, height: calls[1][1].height });
  assert.notEqual(plugin.visualSettingsStore.getSnapshot().settings.profile.card.types.minimal.appearance.backgroundColor, '#654321');
  const closed = await plugin.closeVisualWorkbenchCard();
  assert.equal(closed.closed, true);
  assert.equal(calls[4][0], 'scene.dismiss');
  assert.equal(plugin.notificationStore.size, 0);
});
test('realtime preview projects the draft and preserves Native-returned geometry', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  const calls = [];
  let createdId = null;
  let updateCount = 0;
  plugin.runtimeHost = {
    state: 'running',
    client: {
      async request(type, payload) {
        calls.push([type, payload]);
        if (type === 'health') {
          return { payload: { result: {
            workArea: { left: 0, top: 0, width: 1920, height: 1080 },
            layout: { direction: 'right', anchor: 'bottom-left', spacing: 12 },
            sceneCards: createdId ? [{ id: createdId, x: updateCount === 0 ? 301 : 401, y: updateCount === 0 ? 302 : 402, width: updateCount === 0 ? 503 : 601, height: updateCount === 0 ? 204 : 302 }] : []
          } } };
        }
        if (type === 'scene.create') {
          createdId = payload.id;
          return { payload: { result: { sceneCards: [{ id: payload.id, x: 101, y: 102, width: 501, height: 202 }] } } };
        }
        if (type === 'scene.update') {
          updateCount += 1;
          return { payload: { result: { sceneStateSnapshot: { cards: [{ id: payload.id, x: 401, y: 402, width: 601, height: 302 }] } } } };
        }
        return { payload: { result: { status: 'accepted' } } };
      }
    }
  };
  const draft = {
    global: { enabled: true },
    card: {
      activeType: 'minimal',
      types: { minimal: {
        appearance: { backgroundColor: '#123456', borderRadius: 28, opacity: 0.72, size: 'large' },
        properties: { space: { gap: 36, margin: 42 } },
        skin: { background: { color: '#654321' } },
        effects: { slots: { idle: { enabled: true, effectId: 'bounce' } } }
      } }
    }
  };
  const updatedDraft = {
    ...draft,
    card: { ...draft.card, types: { minimal: { ...draft.card.types.minimal, appearance: { ...draft.card.types.minimal.appearance, backgroundColor: '#abcdef', borderRadius: 8, opacity: 0.48 } } } }
  };

  const opened = await plugin.openVisualPreviewCard({ draft });
  const create = calls.find(([type]) => type === 'scene.create')[1];
  assert.deepEqual(create.visual.appearance, {
    size: 'large', aspectRatio: 'default', backgroundColor: '#123456', backgroundFit: 'fill', backgroundPadding: 0, borderRadius: 28, opacity: 0.72
  });
  assert.equal(create.visual.intensity, 'expressive');
  assert.notEqual(create.x, 0);
  assert.deepEqual(plugin.visualPreviewCardGeometry, { x: 101, y: 102, width: 501, height: 202 });

  const updateResult = await plugin.updateVisualPreviewCard({ draft: updatedDraft });
  assert.equal(updateResult.receivedDraft, true);
  assert.equal(updateResult.updated, true);
  assert.equal(updateResult.recreated, false);
  assert.equal(updateResult.cardId, opened.card.id);
  assert.match(updateResult.draftFingerprint, /^[a-f0-9]{16}$/);
  assert.match(updateResult.nativeVisualFingerprint, /^[a-f0-9]{16}$/);
  assert.equal(updateResult.nativeVisualFingerprint, updateResult.draftFingerprint);
  assert.equal('title' in updateResult, false);
  const firstUpdate = calls.filter(([type]) => type === 'scene.update')[0][1];
  assert.deepEqual({ x: firstUpdate.x, y: firstUpdate.y, width: firstUpdate.width, height: firstUpdate.height }, { x: 301, y: 302, width: 503, height: 204 });
  assert.equal(firstUpdate.visual.appearance.backgroundColor, '#abcdef');
  assert.equal(firstUpdate.visual.appearance.borderRadius, 8);
  assert.equal(firstUpdate.visual.appearance.opacity, 0.48);
  assert.equal(plugin.visualSettingsStore.getSnapshot().settings.profile.card.types.minimal.appearance.backgroundColor, '#0e1916');
  assert.equal(plugin.visualSettingsStore.getSnapshot().settings.profile.card.types.minimal.appearance.borderRadius, 16);
  assert.equal(plugin.visualSettingsStore.getSnapshot().settings.profile.card.types.minimal.appearance.opacity, 0.96);

  await plugin.updateVisualPreviewCard({ draft: updatedDraft });
  const secondUpdate = calls.filter(([type]) => type === 'scene.update')[1][1];
  assert.deepEqual({ x: secondUpdate.x, y: secondUpdate.y, width: secondUpdate.width, height: secondUpdate.height }, { x: 401, y: 402, width: 601, height: 302 });
  assert.equal(secondUpdate.id, opened.card.id);
});

test('realtime preview opens the real page default draft with a legal simple layout', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  const calls = [];
  plugin.runtimeHost = { state: 'running', client: { async request(type, payload) {
    calls.push([type, payload]);
    if (type === 'health') return { payload: { result: { workArea: { left: 0, top: 0, width: 1920, height: 1080 }, layout: { direction: 'right', anchor: 'bottom-left', spacing: 12 } } } };
    return { payload: { result: { status: 'accepted' } } };
  } } };

  await plugin.openVisualPreviewCard({ draft: { global: { enabled: true }, card: { activeType: 'minimal', types: { minimal: {} } } } });
  const create = calls.find(([type]) => type === 'scene.create')[1];
  assert.equal(create.visual.behavior.layout, 'simple');
  assert.equal(create.visual.behavior.boundary, 'work-area');
});

test('realtime preview normalizes legacy minimal behavior before Native', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  const calls = [];
  plugin.runtimeHost = { state: 'running', client: { async request(type, payload) {
    calls.push([type, payload]);
    if (type === 'health') return { payload: { result: { workArea: { left: 0, top: 0, width: 1920, height: 1080 }, layout: { direction: 'right', anchor: 'bottom-left', spacing: 12 } } } };
    return { payload: { result: { status: 'accepted' } } };
  } } };

  await plugin.openVisualPreviewCard({ draft: {
    global: { enabled: true },
    card: { activeType: 'minimal', types: { minimal: { behavior: { layout: 'stack', boundary: 'screen', anchor: 'center', gap: 'legacy', margin: -1 } } } }
  } });
  const create = calls.find(([type]) => type === 'scene.create')[1];
  assert.deepEqual(create.visual.behavior, { layout: 'simple', boundary: 'work-area' });
});

test('realtime preview never sends an invalid layout to Native', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  const calls = [];
  plugin.runtimeHost = { state: 'running', client: { async request(type, payload) {
    calls.push([type, payload]);
    if (type === 'health') return { payload: { result: { workArea: { left: 0, top: 0, width: 1920, height: 1080 }, layout: { direction: 'right', anchor: 'bottom-left', spacing: 12 } } } };
    assert.equal(payload.visual.behavior.layout, 'simple');
    return { payload: { result: { status: 'accepted' } } };
  } } };

  await assert.doesNotReject(() => plugin.openVisualPreviewCard({ draft: {
    global: { enabled: true },
    card: { activeType: 'minimal', types: { minimal: { behavior: { layout: 'invalid-layout' } } } }
  } }));
  assert.equal(calls.filter(([type]) => type === 'scene.create').length, 1);
});

test('realtime preview normalizes legacy minimal properties space and keeps layout facts aligned', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  const calls = [];
  plugin.runtimeHost = { state: 'running', client: { async request(type, payload) {
    calls.push([type, payload]);
    if (type === 'health') return { payload: { result: { workArea: { left: 0, top: 0, width: 1920, height: 1080 }, layout: { direction: 'right', anchor: 'bottom-left', spacing: 12 } } } };
    return { payload: { result: { status: 'accepted' } } };
  } } };

  await assert.doesNotReject(() => plugin.openVisualPreviewCard({ draft: {
    global: { enabled: true },
    card: { activeType: 'minimal', types: { minimal: {
      properties: { space: { layout: 'legacy-layout', anchor: 'center', gap: 'legacy', margin: -1 } }
    } } }
  } }));
  const create = calls.find(([type]) => type === 'scene.create')[1];
  assert.deepEqual(create.visual.behavior, { layout: 'simple', boundary: 'work-area' });
  assert.equal(create.visual.appearance.size, 'medium');
  assert.equal(create.visual.appearance.aspectRatio, 'default');
  assert.doesNotMatch(JSON.stringify(create), /legacy-layout|center|legacy/);
});

test('realtime preview preserves field details for unrelated contract failures', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  plugin.runtimeHost = { state: 'running', client: { async request(type) {
    if (type === 'health') return { payload: { result: { workArea: { left: 0, top: 0, width: 1920, height: 1080 }, layout: { direction: 'right', anchor: 'bottom-left', spacing: 12 } } } };
    return { payload: { result: { status: 'accepted' } } };
  } } };

  await assert.rejects(
    () => plugin.openVisualPreviewCard({ draft: { global: { enabled: true }, card: { activeType: 'minimal', types: { minimal: { appearance: { backgroundColor: 'red' } } } } } }),
    (error) => error.code === 'CARD_VISUAL_COLOR_INVALID' && error.details.field === 'card.types.minimal.appearance.backgroundColor'
  );
});

test('plugin recreates a missing realtime preview card with a distinct session id', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  const calls = [];
  let updateAttempted = false;
  plugin.runtimeHost = {
    state: 'running',
    client: {
      async request(type, payload) {
        calls.push([type, payload]);
        if (type === 'health') return { payload: { result: { workArea: { left: 0, top: 0, width: 1920, height: 1080 }, layout: { direction: 'right', anchor: 'bottom-left', spacing: 12 } } } };
        if (type === 'scene.update' && !updateAttempted) { updateAttempted = true; throw Object.assign(new Error('scene card not found'), { code: 'RUNTIME_SCENE_CARD_NOT_FOUND' }); }
        return { payload: { result: { status: 'accepted' } } };
      }
    }
  };
  const opened = await plugin.openVisualPreviewCard({ draft: { global: { enabled: true }, card: { activeType: 'minimal', types: { minimal: { appearance: { backgroundColor: '#123456' } } } } } });
  const updated = await plugin.updateVisualPreviewCard({ draft: { global: { enabled: true }, card: { activeType: 'minimal', types: { minimal: { appearance: { backgroundColor: '#654321' } } } } } });
  assert.equal(updated.recreated, true);
  assert.notEqual(updated.card.id, opened.card.id);
  assert.ok(calls.some(([type]) => type === 'scene.create'));
  assert.ok(plugin.getVisualSettingsStatus().visualDiagnostics.some((entry) => entry.stage === 'PREVIEW_RECREATE'));
});

test('a closed realtime preview cannot be recreated by a late update', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  let releaseUpdate;
  const updateStarted = new Promise((resolve) => { releaseUpdate = resolve; });
  const calls = [];
  plugin.runtimeHost = {
    state: 'running',
    client: { async request(type, payload) {
      calls.push([type, payload]);
      if (type === 'health') return { payload: { result: { workArea: { left: 0, top: 0, width: 1920, height: 1080 }, layout: { direction: 'right', anchor: 'bottom-left', spacing: 12 } } } };
      if (type === 'scene.update') { await updateStarted; throw Object.assign(new Error('scene card not found'), { code: 'RUNTIME_SCENE_CARD_NOT_FOUND' }); }
      return { payload: { result: { status: 'accepted' } } };
    } }
  };
  await plugin.openVisualPreviewCard({ draft: { global: { enabled: true } } });
  const lateUpdate = plugin.updateVisualPreviewCard({ draft: { global: { enabled: true } } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await plugin.closeVisualPreviewCard();
  releaseUpdate();
  await assert.rejects(() => lateUpdate, (error) => error.code === 'VISUAL_PREVIEW_SESSION_CLOSED');
  assert.equal(calls.filter(([type]) => type === 'scene.create').length, 1);
  assert.equal(calls.filter(([type]) => type === 'scene.dismiss').length, 1);
});

test('opening an existing realtime preview reuses its Native card', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  const calls = [];
  plugin.runtimeHost = {
    state: 'running',
    client: {
      async request(type, payload) {
        calls.push([type, payload]);
        if (type === 'health') return { payload: { result: { workArea: { left: 0, top: 0, width: 1920, height: 1080 }, layout: { direction: 'right', anchor: 'bottom-left', spacing: 12 } } } };
        return { payload: { result: { status: 'accepted' } } };
      }
    }
  };
  const first = await plugin.openVisualPreviewCard({ draft: { global: { enabled: true } } });
  const second = await plugin.openVisualPreviewCard({ draft: { global: { enabled: true }, card: { types: { minimal: { appearance: { backgroundColor: '#654321' } } } } } });
  assert.equal(second.card.id, first.card.id);
  assert.equal(calls.filter(([type]) => type === 'scene.create').length, 1);
  assert.equal(calls.filter(([type]) => type === 'scene.update').length, 1);
});

test('visual event experiment uses the bound profile without notification history or sound', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  plugin.saveVisualProfile({ profileId: 'visual.bound', name: 'Bound', profile: { global: { preset: 'accent' } } });
  plugin.applyVisualProfileToEvents({ profileId: 'visual.bound', eventIds: ['tool.execution.succeeded'] });
  const calls = [];
  plugin.runtimeHost = { state: 'running', client: { async request(type, payload) { calls.push([type, payload]); if (type === 'health') return { payload: { result: { workArea: { left: 0, top: 0, width: 1920, height: 1080 }, layout: { direction: 'right', anchor: 'bottom-left', spacing: 12 } } } }; return { payload: { result: { status: 'accepted' } } }; } } };
  const result = await plugin.runVisualEventExperiment({ eventId: 'tool.execution.succeeded', count: 2, intervalMs: 0 });
  assert.equal(result.visualProfileId, 'visual.bound');
  assert.equal(result.historyWritten, false);
  assert.equal(result.soundPlayed, false);
  assert.equal(result.generated, 2);
  assert.equal(plugin.notificationStore.size, 0);
  assert.equal(calls.filter(([type]) => type === 'scene.create').length, 2);
  assert.equal(calls.find(([type]) => type === 'scene.create')[1].visual.preset, 'accent');
});

test('custom visual profiles protect referenced assets from deletion', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'nh-visual-profile-asset-refs-'));
  try {
    const plugin = new NotificationHubVNextPlugin({ dataDir, config: {}, pluginDir: process.cwd() });
    const asset = await plugin.visualAssetLibrary.importBuffer({
      name: 'profile-background.png',
      kind: 'background',
      tags: [],
      buffer: await readFile(new URL('../fixtures/visual-asset-red.png', import.meta.url))
    });
    plugin.saveVisualProfile({
      profileId: 'visual.asset-profile',
      name: 'Asset profile',
      profile: { card: { types: { minimal: { appearance: { backgroundAssetId: asset.assetId } } } } }
    });

    assert.equal(plugin.visualAssetLibrary.references(asset.assetId).length, 1);
    await assert.rejects(() => plugin.removeVisualAsset(asset.assetId), { code: 'VISUAL_ASSET_IN_USE' });
    await plugin.saveVisualAssets();
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('plugin visual API keeps sound settings when restoring a visual event', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  plugin.visualProfileRegistry.register({ profileId: 'api.warning', name: 'API Warning', profile: {} });
  await plugin.updateEventPresentationSettings({ events: { 'tool.execution.failed': { soundProfileId: 'sound.failure', visualProfileId: 'visual.old', behaviorProfileId: 'stack', behaviorChannelId: 'stack.main' } } });
  plugin.applyVisualProfileToEvents({ profileId: 'api.warning', eventIds: ['tool.execution.failed'] });
  plugin.restoreVisualEventDefault('tool.execution.failed');
  assert.equal(plugin.getEventPresentationSettings().settings.events['tool.execution.failed'].soundProfileId, 'sound.failure');
});

test('parallel visual sample creates minimal, danmaku, and popup cards on isolated channels', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  const calls = [];
  plugin.runtimeHost = {
    state: 'running',
    client: {
      async request(type, payload) {
        calls.push([type, payload]);
        if (type === 'health') return { payload: { result: { workArea: { left: 0, top: 0, width: 1920, height: 1080 }, layout: { direction: 'right', anchor: 'bottom-right', spacing: 12 } } } };
        return { payload: { result: { status: 'accepted', sceneCards: [{ id: payload.id }] } } };
      }
    }
  };
  const result = await plugin.runParallelCardSample({ count: 1, createCards: true });
  assert.deepEqual(result.cardTypes, ['minimal', 'minimal', 'minimal']);
  assert.deepEqual(Object.keys(result.channels), ['stack.main', 'ticker.main', 'popup.main']);
  assert.equal(result.generated, 3);
  const creates = calls.filter(([type]) => type === 'scene.create').map(([, payload]) => payload);
  assert.equal(creates.length, 3);
  assert.deepEqual(creates.map((card) => [card.visual.cardType, card.behavior.behaviorChannelId]), [
    ['minimal', 'stack.main'],
    ['minimal', 'ticker.main'],
    ['minimal', 'popup.main']
  ]);
  assert.equal(new Set(creates.map((card) => card.id)).size, 3);
  assert.equal(creates.every((card) => card.width > 0 && card.height > 0), true);
});
