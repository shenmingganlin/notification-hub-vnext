import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import NotificationHubVNextPlugin, { RUNTIME_NOTIFICATION_CARD_PREFIX } from '../../plugin/index.js';

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
  const create = calls.find(([type]) => type === 'scene.create');
  assert.equal(create[0], 'scene.create');
  assert.deepEqual(create[1].visual.appearance, { size: 'medium', aspectRatio: 'default', backgroundColor: '#123456', backgroundFit: 'fill', backgroundPadding: 0, borderRadius: 28, opacity: 0.72 });
  const updated = await plugin.updateVisualWorkbenchCard({ phase: 'hold', draft: updatedDraft });
  const update = calls.find(([type]) => type === 'scene.update');
  assert.equal(updated.card.id, opened.card.id);
  assert.equal(update[0], 'scene.update');
  assert.equal(update[1].id, create[1].id);
  assert.deepEqual(update[1].visual.appearance, { size: 'medium', aspectRatio: 'default', backgroundColor: '#654321', backgroundFit: 'fill', backgroundPadding: 0, borderRadius: 8, opacity: 0.48 });
  assert.deepEqual(update[1] && { x: update[1].x, y: update[1].y, width: update[1].width, height: update[1].height }, { x: create[1].x, y: create[1].y, width: create[1].width, height: create[1].height });
  assert.notEqual(plugin.visualSettingsStore.getSnapshot().settings.profile.card.types.minimal.appearance.backgroundColor, '#654321');
  const closed = await plugin.closeVisualWorkbenchCard();
  const dismiss = calls.find(([type]) => type === 'scene.dismiss');
  assert.equal(closed.closed, true);
  assert.equal(dismiss[0], 'scene.dismiss');
  assert.equal(plugin.notificationStore.size, 0);
});

test('workbench card follows the draft behavior instead of hardcoded stack', async () => {
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
  await plugin.openVisualWorkbenchCard({
    phase: 'enter',
    draft: { global: { enabled: true }, behaviorId: 'ticker', ticker: { speedPxPerSec: 400, band: 'top', bandRatio: 0.28, trackCount: 3, minGapPx: 64 } }
  });
  const create = calls.find(([type]) => type === 'scene.create')[1];
  assert.equal(create.behavior.behaviorProfileId, 'ticker');
  assert.equal(create.behavior.behaviorChannelId, 'visual.event.ticker');
  assert.equal(create.visual.ticker.trackCount, 3);
  assert.equal(create.visual.ticker.trackGapPx, 8);
});

test('clearVisualStudioCards dismisses studio cards without touching notification history', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  const dismissed = [];
  plugin.runtimeHost = {
    state: 'running',
    client: {
      async request(type, payload) {
        if (type === 'health') {
          return {
            payload: {
              result: {
                workArea: { left: 0, top: 0, width: 1920, height: 1080 },
                layout: { direction: 'right', anchor: 'bottom-left', spacing: 12 },
                sceneCards: [
                  { id: 'nh-visual-try-aaa' },
                  { id: 'nh-visual-preview-bbb' },
                  { id: 'nh-visual-event-test-ccc' },
                  { id: 'nh-vnext-notification-keep' }
                ]
              }
            }
          };
        }
        if (type === 'scene.dismiss') dismissed.push(payload.id);
        return { payload: { result: { status: 'accepted' } } };
      }
    }
  };
  const result = await plugin.clearVisualStudioCards();
  assert.deepEqual(result.dismissed, ['nh-visual-try-aaa', 'nh-visual-preview-bbb', 'nh-visual-event-test-ccc']);
  assert.equal(result.count, 3);
  assert.equal(result.historyWritten, false);
  assert.equal(plugin.notificationStore.size, 0);
  assert.equal(dismissed.includes('nh-vnext-notification-keep'), false);
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
  assert.equal(updateResult.updated, false);
  assert.equal(updateResult.recreated, true);
  assert.notEqual(updateResult.cardId, opened.card.id);
  assert.match(updateResult.draftFingerprint, /^[a-f0-9]{16}$/);
  assert.match(updateResult.nativeVisualFingerprint, /^[a-f0-9]{16}$/);
  assert.equal(updateResult.nativeVisualFingerprint, updateResult.draftFingerprint);
  assert.equal('title' in updateResult, false);
  assert.equal(calls.filter(([type]) => type === 'scene.dismiss').length, 1);
  const recreated = calls.filter(([type]) => type === 'scene.create')[1][1];
  assert.equal(recreated.visual.appearance.backgroundColor, '#abcdef');
  assert.equal(recreated.visual.appearance.borderRadius, 8);
  assert.equal(recreated.visual.appearance.opacity, 0.48);
  assert.equal(plugin.visualSettingsStore.getSnapshot().settings.profile.card.types.minimal.appearance.backgroundColor, '#0e1916');
  assert.equal(plugin.visualSettingsStore.getSnapshot().settings.profile.card.types.minimal.appearance.borderRadius, 16);
  assert.equal(plugin.visualSettingsStore.getSnapshot().settings.profile.card.types.minimal.appearance.opacity, 0.96);

  const sameDraft = await plugin.updateVisualPreviewCard({ draft: updatedDraft });
  assert.equal(sameDraft.recreated, false);
  assert.equal(sameDraft.updated, true);
  const secondUpdate = calls.filter(([type]) => type === 'scene.update')[0][1];
  assert.equal(secondUpdate.id, updateResult.cardId);
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
    if (type === 'scene.create' || type === 'scene.update') assert.equal(payload.visual.behavior.layout, 'simple');
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
  const second = await plugin.openVisualPreviewCard({ draft: { global: { enabled: true } } });
  assert.equal(second.card.id, first.card.id);
  assert.equal(calls.filter(([type]) => type === 'scene.create').length, 1);
  assert.equal(calls.filter(([type]) => type === 'scene.update').length, 1);
  const third = await plugin.openVisualPreviewCard({ draft: { global: { enabled: true }, behaviorId: 'ticker', ticker: { speedPxPerSec: 520, band: 'bottom', trackCount: 4 } } });
  assert.equal(third.recreated, true);
  assert.notEqual(third.card.id, first.card.id);
  assert.equal(calls.filter(([type]) => type === 'scene.dismiss').length, 1);
  assert.equal(calls.filter(([type]) => type === 'scene.create').length, 2);
});

test('visual draft sample uses the current draft without event binding', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  const calls = [];
  plugin.runtimeHost = { state: 'running', client: { async request(type, payload) { calls.push([type, payload]); if (type === 'health') return { payload: { result: { workArea: { left: 0, top: 0, width: 1920, height: 1080 }, layout: { direction: 'right', anchor: 'bottom-left', spacing: 12 } } } }; return { payload: { result: { status: 'accepted' } } }; } } };
  const result = await plugin.runVisualDraftSample({
    draft: {
      global: { enabled: true },
      behaviorId: 'ticker',
      ticker: { speedPxPerSec: 520, band: 'bottom', bandRatio: 0.4, trackCount: 3, minGapPx: 48 },
      card: { activeType: 'minimal', types: { minimal: { appearance: { width: 360, height: 88, backgroundColor: '#123456' } } } }
    }
  });
  assert.equal(result.generated, 1);
  assert.equal(result.receivedDraft, true);
  assert.equal(result.behaviorId, 'ticker');
  assert.equal(result.historyWritten, false);
  assert.equal(result.soundPlayed, false);
  assert.equal(plugin.notificationStore.size, 0);
  assert.equal(plugin.visualBindingRegistry.list().length, 0);
  const create = calls.find(([type]) => type === 'scene.create')[1];
  assert.equal(create.behavior.behaviorProfileId, 'ticker');
  assert.equal(create.behavior.behaviorChannelId, 'visual.try-one.ticker');
  assert.equal(create.visual.ticker.speedPxPerSec, 520);
  assert.equal(create.visual.ticker.clickThrough, true);
  assert.equal(create.visual.ticker.band, 'bottom');
  assert.equal(create.visual.appearance.backgroundColor, '#123456');
  assert.equal(create.width, 360);
  assert.equal(create.height, 88);
  assert.match(create.title, /试一条/);
  assert.doesNotMatch(create.title, /chat\.assistant_reply/);
});

test('visual draft sample keeps stack off the ticker channel and size', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  const calls = [];
  plugin.runtimeHost = { state: 'running', client: { async request(type, payload) { calls.push([type, payload]); if (type === 'health') return { payload: { result: { workArea: { left: 0, top: 0, width: 1920, height: 1080 }, layout: { direction: 'right', anchor: 'bottom-left', spacing: 12 } } } }; return { payload: { result: { status: 'accepted' } } }; } } };
  const result = await plugin.runVisualDraftSample({
    draft: {
      global: { enabled: true },
      behaviorId: 'stack',
      ticker: { speedPxPerSec: 800, band: 'top', bandRatio: 0.28, trackCount: 10, minGapPx: 64 },
      card: { activeType: 'minimal', types: { minimal: { appearance: { size: 'medium', backgroundColor: '#123456' } } } }
    }
  });
  assert.equal(result.behaviorId, 'stack');
  const create = calls.find(([type]) => type === 'scene.create')[1];
  assert.equal(create.behavior.behaviorProfileId, 'stack');
  assert.equal(create.behavior.behaviorChannelId, 'visual.try-one.stack');
  assert.equal('ticker' in create.visual, false);
  assert.equal(create.width, 420);
  assert.equal(create.height, 220);
});

test('visual draft sample rolls ticker speed when speedRandom is on', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  const calls = [];
  plugin.runtimeHost = { state: 'running', client: { async request(type, payload) { calls.push([type, payload]); if (type === 'health') return { payload: { result: { workArea: { left: 0, top: 0, width: 1920, height: 1080 }, layout: { direction: 'right', anchor: 'bottom-left', spacing: 12 } } } }; return { payload: { result: { status: 'accepted' } } }; } } };
  const result = await plugin.runVisualDraftSample({
    draft: {
      global: { enabled: true },
      behaviorId: 'ticker',
      ticker: { speedPxPerSec: 400, band: 'top', bandRatio: 0.28, trackCount: 0, minGapPx: 64, speedRandom: true }
    }
  });
  assert.equal(result.receivedDraft, true);
  const create = calls.find(([type]) => type === 'scene.create')[1];
  assert.equal(create.behavior.behaviorProfileId, 'ticker');
  assert.equal('speedRandom' in create.visual.ticker, false);
  assert.ok(Number.isInteger(create.visual.ticker.speedPxPerSec));
  assert.ok(create.visual.ticker.speedPxPerSec >= 150 && create.visual.ticker.speedPxPerSec <= 800);
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

test('overwriting a bound profile updates event experiment close mode without re-applying', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  plugin.saveVisualProfile({
    profileId: 'visual.bound',
    name: 'Bound',
    profile: {
      global: { enabled: true, preset: 'minimal' },
      behaviorId: 'stack',
      card: { activeType: 'minimal', types: { minimal: { properties: { interaction: { dismissMode: 'closeButton' } } } } }
    }
  });
  plugin.applyVisualProfileToEvents({ profileId: 'visual.bound', eventIds: ['tool.execution.succeeded'] });
  plugin.saveVisualProfile({
    profileId: 'visual.bound',
    name: 'Bound',
    profile: {
      global: { enabled: true, preset: 'accent' },
      behaviorId: 'stack',
      card: { activeType: 'minimal', types: { minimal: { properties: { interaction: { dismissMode: 'anywhere' } } } } }
    }
  });
  const calls = [];
  plugin.runtimeHost = { state: 'running', client: { async request(type, payload) { calls.push([type, payload]); if (type === 'health') return { payload: { result: { workArea: { left: 0, top: 0, width: 1920, height: 1080 }, layout: { direction: 'right', anchor: 'bottom-left', spacing: 12 } } } }; return { payload: { result: { status: 'accepted' } } }; } } };
  const result = await plugin.runVisualEventExperiment({ eventId: 'tool.execution.succeeded', count: 1, intervalMs: 0 });
  assert.equal(result.visualProfileId, 'visual.bound');
  const create = calls.find(([type]) => type === 'scene.create')[1];
  assert.equal(create.visual.preset, 'accent');
  assert.equal(create.visual.interaction.dismissMode, 'anywhere');
  assert.equal(Array.isArray(create.parts) && create.parts.some((part) => part.id === 'close' || part.kind === 'close'), false);
});

test('ticker try-one paints title fill onto the part tree', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  const calls = [];
  plugin.runtimeHost = { state: 'running', client: { async request(type, payload) { calls.push([type, payload]); if (type === 'health') return { payload: { result: { workArea: { left: 0, top: 0, width: 1920, height: 1080 }, layout: { direction: 'right', anchor: 'bottom-left', spacing: 12 } } } }; return { payload: { result: { status: 'accepted' } } }; } } };
  await plugin.runVisualDraftSample({
    draft: {
      global: { enabled: true },
      behaviorId: 'ticker',
      ticker: { speedPxPerSec: 400, band: 'top', bandRatio: 0.28, trackCount: 1, minGapPx: 64 },
      card: { activeType: 'minimal', types: { minimal: { parts: { title: { fill: '#ff2244' } } } } }
    }
  });
  const create = calls.find(([type]) => type === 'scene.create')[1];
  const title = create.parts.find((part) => part.id === 'title');
  assert.equal(title.kind, 'text');
  assert.equal(title.fill, '#ff2244');
});

test('ticker event experiment omits hidden body from the part tree', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  plugin.saveVisualProfile({
    profileId: 'visual.body-off',
    name: 'Body off',
    profile: {
      global: { enabled: true, preset: 'minimal' },
      behaviorId: 'ticker',
      card: { activeType: 'minimal', types: { minimal: { parts: { body: { show: false } } } } }
    }
  });
  plugin.applyVisualProfileToEvents({ profileId: 'visual.body-off', eventIds: ['tool.execution.succeeded'] });
  const calls = [];
  plugin.runtimeHost = { state: 'running', client: { async request(type, payload) { calls.push([type, payload]); if (type === 'health') return { payload: { result: { workArea: { left: 0, top: 0, width: 1920, height: 1080 }, layout: { direction: 'right', anchor: 'bottom-left', spacing: 12 } } } }; return { payload: { result: { status: 'accepted' } } }; } } };
  await plugin.runVisualEventExperiment({ eventId: 'tool.execution.succeeded', count: 1, intervalMs: 0 });
  const create = calls.find(([type]) => type === 'scene.create')[1];
  assert.equal(Array.isArray(create.parts) && create.parts.some((part) => part.id === 'body'), false);
  assert.equal(create.parts.some((part) => part.id === 'title'), true);
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

function fakeRuntime() {
  const calls = [];
  return {
    calls,
    host: {
      state: 'running',
      client: {
        async request(type, payload) {
          calls.push([type, payload]);
          if (type === 'health') {
            return { payload: { result: { workArea: { left: 0, top: 0, width: 1920, height: 1080 }, layout: { direction: 'right', anchor: 'bottom-left', spacing: 12 }, sceneCards: [] } } };
          }
          return { payload: { result: { status: 'accepted' } } };
        }
      }
    }
  };
}

function createChatRecord(plugin, notificationId) {
  return plugin.notificationApi.createNotification({
    notificationId,
    traceId: `trace-${notificationId}`,
    type: 'chat_message',
    source: 'test',
    title: '助手回复',
    content: 'body'
  });
}

test('unbound real notifications do not create a desktop card', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  const { calls, host } = fakeRuntime();
  plugin.runtimeHost = host;
  const record = createChatRecord(plugin, 'n-unbound');
  const shown = await plugin.showNotificationScene(record);
  plugin.enqueueNotificationScene(record);
  await plugin.waitForNotificationSceneQueues();
  assert.equal(shown.skipped, true);
  assert.equal(calls.filter(([type]) => type === 'scene.create').length, 0);
  assert.equal(plugin.visualBindingRegistry.list().length, 0);
});

test('saving the visual studio does not bind events or start showing cards', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  const { calls, host } = fakeRuntime();
  plugin.runtimeHost = host;
  await plugin.updateVisualSettings({ profile: { behaviorId: 'ticker' } });
  assert.equal(plugin.visualBindingRegistry.list().length, 0);
  assert.equal(plugin.visualProfileRegistry.get('visual.default').profile.behaviorId, 'ticker');
  await plugin.showNotificationScene(createChatRecord(plugin, 'n-studio-save'));
  assert.equal(calls.filter(([type]) => type === 'scene.create').length, 0);
});

test('bound ticker profile flies on visual.event.ticker', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  plugin.saveVisualProfile({
    profileId: 'visual.ticker',
    name: '弹幕方案',
    profile: { behaviorId: 'ticker', ticker: { speedPxPerSec: 520, band: 'bottom' } }
  });
  plugin.applyVisualProfileToEvents({ profileId: 'visual.ticker', eventIds: ['chat.assistant_reply.completed'] });
  assert.equal(plugin.getEventPresentationSettings().settings.events['chat.assistant_reply.completed'].behaviorProfileId, 'ticker');
  assert.equal(plugin.visualBindingRegistry.get('chat.assistant_reply.completed').behaviorChannelId, 'visual.event.ticker');
  const { calls, host } = fakeRuntime();
  plugin.runtimeHost = host;
  await plugin.showNotificationScene(createChatRecord(plugin, 'n-ticker-bound'));
  const create = calls.find(([type]) => type === 'scene.create')[1];
  assert.equal(create.behavior.behaviorProfileId, 'ticker');
  assert.equal(create.behavior.behaviorChannelId, 'visual.event.ticker');
  assert.equal(create.visual.ticker.speedPxPerSec, 520);
});

test('real ticker cards do not evict flying cards with leftover stack shelf math', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  plugin.saveVisualProfile({
    profileId: 'visual.ticker',
    name: '弹幕方案',
    profile: { behaviorId: 'ticker', ticker: { speedPxPerSec: 400, band: 'top' } }
  });
  plugin.applyVisualProfileToEvents({ profileId: 'visual.ticker', eventIds: ['chat.assistant_reply.completed'] });
  const existing = Array.from({ length: 6 }, (_, index) => ({
    id: `${RUNTIME_NOTIFICATION_CARD_PREFIX}old-${index + 1}`,
    width: 480,
    height: 76,
    behavior: { behaviorProfileId: 'ticker', behaviorChannelId: 'visual.event.ticker' }
  }));
  const calls = [];
  plugin.runtimeHost = {
    state: 'running',
    client: {
      async request(type, payload) {
        calls.push([type, payload]);
        if (type === 'health') {
          return { payload: { result: { workArea: { left: 0, top: 0, width: 1920, height: 1080 }, layout: { direction: 'right', anchor: 'bottom-left', spacing: 12 }, sceneCards: existing } } };
        }
        return { payload: { result: { status: 'accepted' } } };
      }
    }
  };
  await plugin.showNotificationScene(createChatRecord(plugin, 'n-ticker-keep-flying'));
  assert.equal(calls.filter(([type]) => type === 'scene.dismiss').length, 0);
  assert.equal(calls.filter(([type]) => type === 'scene.create').length, 1);
});

test('bound stack profile stacks on visual.event.stack', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  plugin.saveVisualProfile({ profileId: 'visual.stack', name: '堆叠方案', profile: { behaviorId: 'stack' } });
  plugin.applyVisualProfileToEvents({ profileId: 'visual.stack', eventIds: ['chat.assistant_reply.completed'] });
  assert.equal(plugin.getEventPresentationSettings().settings.events['chat.assistant_reply.completed'].behaviorProfileId, 'stack');
  const { calls, host } = fakeRuntime();
  plugin.runtimeHost = host;
  await plugin.showNotificationScene(createChatRecord(plugin, 'n-stack-bound'));
  const create = calls.find(([type]) => type === 'scene.create')[1];
  assert.equal(create.behavior.behaviorProfileId, 'stack');
  assert.equal(create.behavior.behaviorChannelId, 'visual.event.stack');
});

test('broken visual binding skips the desktop card instead of falling back to the studio draft', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  plugin.saveVisualProfile({ profileId: 'visual.gone', name: '将丢失', profile: { behaviorId: 'ticker' } });
  plugin.applyVisualProfileToEvents({ profileId: 'visual.gone', eventIds: ['chat.assistant_reply.completed'] });
  plugin.visualProfileRegistry.removeReference('visual.gone', 'chat.assistant_reply.completed');
  plugin.visualProfileRegistry.remove('visual.gone');
  const { calls, host } = fakeRuntime();
  plugin.runtimeHost = host;
  const shown = await plugin.showNotificationScene(createChatRecord(plugin, 'n-broken-binding'));
  assert.equal(shown.skipped, true);
  assert.equal(calls.filter(([type]) => type === 'scene.create').length, 0);
  assert.ok(plugin.getVisualSettingsStatus().visualDiagnostics.some((entry) => entry.code === 'VISUAL_EVENT_BINDING_PROFILE_MISSING'));
});

test('plugin visual API keeps sound settings when restoring a visual event', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  plugin.visualProfileRegistry.register({ profileId: 'api.warning', name: 'API Warning', profile: {} });
  await plugin.updateEventPresentationSettings({ events: { 'tool.execution.failed': { soundProfileId: 'sound.failure', visualProfileId: 'visual.old', behaviorProfileId: 'stack', behaviorChannelId: 'stack.main' } } });
  plugin.applyVisualProfileToEvents({ profileId: 'api.warning', eventIds: ['tool.execution.failed'] });
  plugin.restoreVisualEventDefault('tool.execution.failed');
  assert.equal(plugin.getEventPresentationSettings().settings.events['tool.execution.failed'].soundProfileId, 'sound.failure');
});

test('parallel visual sample creates stack and ticker cards on try-one channels', async () => {
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
  const result = await plugin.runParallelCardSample({ count: 1, intervalMs: 0, createCards: true });
  assert.deepEqual(result.cardTypes, ['minimal', 'minimal']);
  assert.deepEqual(result.behaviors, ['stack', 'ticker']);
  assert.deepEqual(Object.keys(result.channels), ['visual.try-one.stack', 'visual.try-one.ticker']);
  assert.equal(result.generated, 2);
  const creates = calls.filter(([type]) => type === 'scene.create').map(([, payload]) => payload);
  assert.equal(creates.length, 2);
  assert.deepEqual(creates.map((card) => [card.title, card.behavior.behaviorChannelId]), [
    ['堆叠', 'visual.try-one.stack'],
    ['弹幕', 'visual.try-one.ticker']
  ]);
  assert.equal(new Set(creates.map((card) => card.id)).size, 2);
  assert.equal(creates.every((card) => card.width > 0 && card.height > 0), true);
  assert.equal(creates.some((card) => card.behavior.behaviorChannelId === 'popup.main'), false);
});

test('unbound defaultMode stack and ticker create cards without writing bindings', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  const { calls, host } = fakeRuntime();
  plugin.runtimeHost = host;
  await plugin.updateVisualSettings({ profile: { global: { enabled: true, defaultMode: 'stack' }, behaviorId: 'ticker' } });
  assert.equal(plugin.visualBindingRegistry.list().length, 0);
  const stacked = await plugin.showNotificationScene(createChatRecord(plugin, 'n-default-stack'));
  assert.equal(stacked.skipped, undefined);
  const stackCreate = calls.find(([type]) => type === 'scene.create');
  assert.ok(stackCreate);
  assert.equal(stackCreate[1].behavior.behaviorProfileId, 'stack');
  assert.equal(plugin.visualBindingRegistry.list().length, 0);
  calls.length = 0;
  await plugin.updateVisualSettings({ profile: { global: { enabled: true, defaultMode: 'ticker' } } });
  await plugin.showNotificationScene(createChatRecord(plugin, 'n-default-ticker'));
  const tickerCreate = calls.find(([type]) => type === 'scene.create');
  assert.equal(tickerCreate[1].behavior.behaviorProfileId, 'ticker');
});

test('global visual switch blocks bound real cards', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  plugin.saveVisualProfile({ profileId: 'visual.bound', name: 'Bound', profile: { behaviorId: 'stack' } });
  plugin.applyVisualProfileToEvents({ profileId: 'visual.bound', eventIds: ['chat.assistant_reply.completed'] });
  await plugin.updateVisualSettings({ profile: { global: { enabled: false, defaultMode: 'stack' } } });
  const { calls, host } = fakeRuntime();
  plugin.runtimeHost = host;
  const shown = await plugin.showNotificationScene(createChatRecord(plugin, 'n-global-off'));
  assert.equal(shown.skipped, true);
  assert.equal(plugin.resolveVisualEventCardIntent(createChatRecord(plugin, 'n-global-off-2')).reason, 'global-disabled');
  assert.equal(calls.filter(([type]) => type === 'scene.create').length, 0);
});

test('removing an in-use visual profile unbinds events first', () => {
  const plugin = new NotificationHubVNextPlugin(context());
  plugin.saveVisualProfile({ profileId: 'visual.in-use', name: '占用', profile: { behaviorId: 'stack' } });
  plugin.applyVisualProfileToEvents({ profileId: 'visual.in-use', eventIds: ['chat.assistant_reply.completed', 'tool.execution.succeeded'] });
  assert.equal(plugin.listCustomVisualEvents()[0].label, '助手回复完成');
  const removed = plugin.removeVisualProfile('visual.in-use');
  assert.equal(removed.removed, true);
  assert.deepEqual(removed.unboundEventIds.sort(), ['chat.assistant_reply.completed', 'tool.execution.succeeded']);
  assert.equal(plugin.visualBindingRegistry.get('chat.assistant_reply.completed'), null);
  assert.equal(plugin.listCustomVisualEvents().length, 0);
});

function stackPreviewDraft(anchor, appearance = {}) {
  return {
    global: { enabled: true },
    behaviorId: 'stack',
    card: {
      activeType: 'minimal',
      types: {
        minimal: {
          properties: { space: { anchor, marginLeft: 24, marginRight: 24, marginTop: 24, marginBottom: 24 } },
          appearance
        }
      }
    }
  };
}

function previewRuntime(calls, geometry = { x: 100, y: 200, width: 420, height: 220 }) {
  let createdId = null;
  return {
    state: 'running',
    client: {
      async request(type, payload) {
        calls.push([type, payload]);
        if (type === 'health') {
          return { payload: { result: {
            workArea: { left: 0, top: 0, width: 1920, height: 1080 },
            layout: { direction: 'right', anchor: 'bottom-left', spacing: 12 },
            sceneCards: createdId ? [{ id: createdId, ...geometry }] : []
          } } };
        }
        if (type === 'scene.create') {
          createdId = payload.id;
          return { payload: { result: { sceneCards: [{ id: payload.id, ...geometry }] } } };
        }
        return { payload: { result: { status: 'accepted' } } };
      }
    }
  };
}

test('realtime preview docks stack cards to the selected corner', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  const calls = [];
  plugin.runtimeHost = previewRuntime(calls);
  await plugin.openVisualPreviewCard({ draft: stackPreviewDraft('top-left') });
  const topLeft = calls.find(([type]) => type === 'scene.create')[1];
  await plugin.closeVisualPreviewCard();
  calls.length = 0;
  await plugin.openVisualPreviewCard({ draft: stackPreviewDraft('bottom-right') });
  const bottomRight = calls.find(([type]) => type === 'scene.create')[1];
  assert.ok(topLeft.x < bottomRight.x);
  assert.ok(topLeft.y < bottomRight.y);
});

test('changing stack dock recreates preview at the new corner', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  const calls = [];
  plugin.runtimeHost = previewRuntime(calls);
  await plugin.openVisualPreviewCard({ draft: stackPreviewDraft('bottom-right') });
  const first = calls.find(([type]) => type === 'scene.create')[1];
  const updated = await plugin.updateVisualPreviewCard({ draft: stackPreviewDraft('top-left') });
  assert.equal(updated.recreated, true);
  const second = calls.filter(([type]) => type === 'scene.create')[1][1];
  assert.ok(second.x < first.x);
  assert.ok(second.y < first.y);
});

test('paint overflow update keeps the hit-box origin', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  const calls = [];
  plugin.runtimeHost = previewRuntime(calls);
  await plugin.openVisualPreviewCard({ draft: stackPreviewDraft('bottom-right') });
  const result = await plugin.updateVisualPreviewCard({ draft: stackPreviewDraft('bottom-right', { paintOverflow: 12 }) });
  assert.equal(result.recreated, false);
  const update = calls.find(([type]) => type === 'scene.update')[1];
  assert.equal(update.x, 100);
  assert.equal(update.y, 200);
  assert.equal(update.visual.appearance.paintOverflow, 12);
});

test('visual diagnostics carry level for problems versus ok operations', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  plugin.runtimeHost = fakeRuntime().host;
  await plugin.openVisualPreviewCard({ draft: { global: { enabled: true } } });
  const ok = plugin.getVisualSettingsStatus().visualDiagnostics.find((entry) => entry.code === 'VISUAL_PREVIEW_CREATED');
  assert.equal(ok.level, 'ok');
  assert.ok(ok.details.cardId);
  plugin.saveVisualProfile({ profileId: 'visual.gone', name: '将丢失', profile: {} });
  plugin.applyVisualProfileToEvents({ profileId: 'visual.gone', eventIds: ['chat.assistant_reply.completed'] });
  plugin.visualProfileRegistry.removeReference('visual.gone', 'chat.assistant_reply.completed');
  plugin.visualProfileRegistry.remove('visual.gone');
  await plugin.showNotificationScene(createChatRecord(plugin, 'n-diag-missing'));
  const error = plugin.getVisualSettingsStatus().visualDiagnostics.find((entry) => entry.code === 'VISUAL_EVENT_BINDING_PROFILE_MISSING');
  assert.equal(error.level, 'error');
  assert.equal(error.details.eventId, 'chat.assistant_reply.completed');
});

function assertStackSetModeBeforeCreate(calls, { anchor, direction, spacing, marginLeft = 18, marginRight = 18, marginTop = 18, marginBottom = 18 }) {
  const modeIndex = calls.findIndex(([type]) => type === 'scene.set-mode');
  const createIndex = calls.findIndex(([type]) => type === 'scene.create');
  assert.ok(modeIndex >= 0 && createIndex > modeIndex);
  const payload = calls[modeIndex][1];
  assert.equal(payload.layout, 'stack');
  assert.equal(payload.anchor, anchor);
  assert.equal(payload.direction, direction);
  assert.equal(payload.spacing, spacing);
  assert.equal(payload.marginLeft, marginLeft);
  assert.equal(payload.marginRight, marginRight);
  assert.equal(payload.marginTop, marginTop);
  assert.equal(payload.marginBottom, marginBottom);
  assert.equal('workAreaWidth' in payload, false);
  assert.equal('workAreaHeight' in payload, false);
  assert.equal('dpiScale' in payload, false);
}

test('stack try-one and preview send set-mode before create; ticker try-one does not', async () => {
  const plugin = new NotificationHubVNextPlugin(context());
  const tryCalls = [];
  plugin.runtimeHost = { state: 'running', client: { async request(type, payload) { tryCalls.push([type, payload]); if (type === 'health') return { payload: { result: { workArea: { left: 0, top: 0, width: 1920, height: 1080 }, layout: { direction: 'right', anchor: 'bottom-left', spacing: 12 } } } }; return { payload: { result: { status: 'accepted' } } }; } } };
  await plugin.runVisualDraftSample({
    draft: {
      global: { enabled: true },
      behaviorId: 'stack',
      card: { activeType: 'minimal', types: { minimal: { properties: { space: { anchor: 'top-left', gap: 16 } } } } }
    }
  });
  assertStackSetModeBeforeCreate(tryCalls, { anchor: 'top-left', direction: 'up', spacing: 16, marginLeft: 18, marginRight: 0, marginTop: 18, marginBottom: 0 });

  tryCalls.length = 0;
  await plugin.runVisualDraftSample({
    draft: {
      global: { enabled: true },
      behaviorId: 'ticker',
      ticker: { speedPxPerSec: 400, band: 'top', bandRatio: 0.28, trackCount: 3, minGapPx: 64 }
    }
  });
  assert.equal(tryCalls.some(([type]) => type === 'scene.set-mode'), false);
  assert.ok(tryCalls.some(([type]) => type === 'scene.create'));

  const previewCalls = [];
  plugin.runtimeHost = previewRuntime(previewCalls);
  await plugin.openVisualPreviewCard({ draft: stackPreviewDraft('bottom-right') });
  assertStackSetModeBeforeCreate(previewCalls, { anchor: 'bottom-right', direction: 'down', spacing: 8, marginLeft: 0, marginRight: 24, marginTop: 0, marginBottom: 24 });
});
