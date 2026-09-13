import assert from 'node:assert/strict';
import test from 'node:test';

import { createVisualProfileRegistry } from '../../plugin/domain/visual-profile-registry.js';
import { createEventBindingRegistry } from '../../plugin/domain/event-binding-registry.js';
import {
  createVisualRegistrySnapshot,
  restoreVisualRegistrySnapshot,
  projectVisualRegistryToEventSettings
} from '../../plugin/domain/visual-registry-persistence.js';
import { createEventPresentationSettings } from '../../plugin/domain/event-presentation-settings.js';

test('visual registry snapshot is versioned, frozen and preserves references', () => {
  const profiles = createVisualProfileRegistry();
  profiles.register({ profileId: 'stack.message', name: 'Stack Message', profile: {} });
  const bindings = createEventBindingRegistry({ profileRegistry: profiles });
  bindings.apply({ profileId: 'stack.message', eventIds: ['tool.execution.succeeded'] });
  const snapshot = createVisualRegistrySnapshot({ profileRegistry: profiles, bindingRegistry: bindings, revision: 3 });

  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.revision, 3);
  assert.equal(snapshot.profiles[0].profileId, 'stack.message');
  assert.equal(snapshot.bindings[0].eventId, 'tool.execution.succeeded');
  assert.ok(Object.isFrozen(snapshot));
});

test('registry snapshot restores into fresh registries and rejects stale/invalid snapshots', () => {
  const sourceProfiles = createVisualProfileRegistry();
  sourceProfiles.register({ profileId: 'safe', name: 'Safe', profile: {} });
  const sourceBindings = createEventBindingRegistry({ profileRegistry: sourceProfiles });
  sourceBindings.apply({ profileId: 'safe', eventIds: ['chat.assistant_reply.completed'] });
  const snapshot = createVisualRegistrySnapshot({ profileRegistry: sourceProfiles, bindingRegistry: sourceBindings, revision: 2 });

  const targetProfiles = createVisualProfileRegistry();
  const targetBindings = createEventBindingRegistry({ profileRegistry: targetProfiles });
  restoreVisualRegistrySnapshot(snapshot, { profileRegistry: targetProfiles, bindingRegistry: targetBindings });
  assert.equal(targetBindings.get('chat.assistant_reply.completed').visualProfileId, 'safe');
  assert.throws(() => restoreVisualRegistrySnapshot({ ...snapshot, version: 99 }, { profileRegistry: createVisualProfileRegistry(), bindingRegistry: createEventBindingRegistry({ profileRegistry: createVisualProfileRegistry() }) }), (error) => error.code === 'VISUAL_REGISTRY_SNAPSHOT_VERSION_INVALID');
});

test('projection preserves legacy sound fields and only writes visual event bindings', () => {
  const profiles = createVisualProfileRegistry();
  profiles.register({ profileId: 'tool.stack', name: 'Tool Stack', profile: {} });
  const bindings = createEventBindingRegistry({ profileRegistry: profiles });
  bindings.apply({ profileId: 'tool.stack', eventIds: ['tool.execution.succeeded'], behaviorChannelId: 'stack.tool' });
  const legacy = createEventPresentationSettings({ events: { 'tool.execution.succeeded': { soundProfileId: 'sound.custom', visualProfileId: 'visual.old', behaviorProfileId: 'stack', behaviorChannelId: 'stack.old' } } });
  const projected = projectVisualRegistryToEventSettings({ settings: legacy, bindingRegistry: bindings });
  assert.equal(projected.events['tool.execution.succeeded'].soundProfileId, 'sound.custom');
  assert.equal(projected.events['tool.execution.succeeded'].visualProfileId, 'tool.stack');
  assert.equal(projected.events['tool.execution.succeeded'].behaviorChannelId, 'stack.tool');
  assert.equal(projected.events['tool.execution.succeeded'].behaviorProfileId, 'stack');
});

test('projection aligns behaviorProfileId to a ticker visual profile', () => {
  const profiles = createVisualProfileRegistry();
  profiles.register({ profileId: 'chat.ticker', name: 'Chat Ticker', profile: { behaviorId: 'ticker' } });
  const bindings = createEventBindingRegistry({ profileRegistry: profiles });
  bindings.apply({ profileId: 'chat.ticker', eventIds: ['chat.assistant_reply.completed'] });
  const projected = projectVisualRegistryToEventSettings({
    settings: createEventPresentationSettings({
      events: { 'chat.assistant_reply.completed': { soundProfileId: 'sound.default', visualProfileId: 'visual.old', behaviorProfileId: 'stack', behaviorChannelId: 'stack.main' } }
    }),
    bindingRegistry: bindings,
    profileRegistry: profiles
  });
  assert.equal(projected.events['chat.assistant_reply.completed'].behaviorProfileId, 'ticker');
  assert.equal(projected.events['chat.assistant_reply.completed'].soundProfileId, 'sound.default');
});
