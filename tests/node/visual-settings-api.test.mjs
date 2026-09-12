import assert from 'node:assert/strict';
import test from 'node:test';

import { EventPresentationSettingsStore } from '../../plugin/domain/event-presentation-settings-store.js';
import { createVisualProfileRegistry } from '../../plugin/domain/visual-profile-registry.js';
import { createEventBindingRegistry } from '../../plugin/domain/event-binding-registry.js';
import { createVisualEventSettingsApi } from '../../plugin/domain/visual-event-settings-api.js';

test('visual settings API applies a profile through the existing event settings store without changing sound', () => {
  const store = new EventPresentationSettingsStore({ initialSettings: { events: {
    'tool.execution.succeeded': { soundProfileId: 'sound.custom', visualProfileId: 'visual.old', behaviorProfileId: 'stack', behaviorChannelId: 'stack.old' }
  } } });
  const profiles = createVisualProfileRegistry();
  profiles.register({ profileId: 'tool.stack', name: 'Tool Stack', profile: {} });
  const bindings = createEventBindingRegistry({ profileRegistry: profiles });
  const api = createVisualEventSettingsApi({ store, profileRegistry: profiles, bindingRegistry: bindings });

  api.apply({ profileId: 'tool.stack', eventIds: ['tool.execution.succeeded'], behaviorChannelId: 'stack.tool' });
  const settings = store.getSnapshot().settings;
  assert.equal(settings.events['tool.execution.succeeded'].soundProfileId, 'sound.custom');
  assert.equal(settings.events['tool.execution.succeeded'].visualProfileId, 'tool.stack');
  assert.equal(settings.events['tool.execution.succeeded'].behaviorChannelId, 'stack.tool');
});

test('visual settings API lists only explicit custom event bindings', () => {
  const store = new EventPresentationSettingsStore();
  const profiles = createVisualProfileRegistry();
  profiles.register({ profileId: 'chat.stack', name: 'Chat Stack', profile: {} });
  const bindings = createEventBindingRegistry({ profileRegistry: profiles });
  const api = createVisualEventSettingsApi({ store, profileRegistry: profiles, bindingRegistry: bindings });
  bindings.apply({ profileId: 'chat.stack', eventIds: ['chat.assistant_reply.completed'] });

  const rows = api.listCustomEvents();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].eventId, 'chat.assistant_reply.completed');
  assert.equal(rows[0].visualProfileId, 'chat.stack');
  assert.equal(rows[0].source, 'local');
});

test('visual settings API previews replacement and restores only visual event override', () => {
  const store = new EventPresentationSettingsStore({ initialSettings: { events: {
    'tool.execution.failed': { soundProfileId: 'sound.failure', visualProfileId: 'visual.old', behaviorProfileId: 'stack', behaviorChannelId: 'stack.old' }
  } } });
  const profiles = createVisualProfileRegistry();
  profiles.register({ profileId: 'warning', name: 'Warning', profile: {} });
  const bindings = createEventBindingRegistry({ profileRegistry: profiles });
  const api = createVisualEventSettingsApi({ store, profileRegistry: profiles, bindingRegistry: bindings });

  const preview = api.previewApply({ profileId: 'warning', eventIds: ['tool.execution.failed'] });
  assert.deepEqual(preview, { added: 0, replaced: 1, unchanged: 0, missing: [] });
  api.apply({ profileId: 'warning', eventIds: ['tool.execution.failed'] });
  api.restoreDefault('tool.execution.failed');
  const binding = store.getSnapshot().settings.events['tool.execution.failed'];
  assert.equal(binding.soundProfileId, 'sound.failure');
  assert.equal(binding.visualProfileId, 'visual.old');
});
