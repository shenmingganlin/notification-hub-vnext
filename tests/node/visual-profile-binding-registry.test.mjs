import assert from 'node:assert/strict';
import test from 'node:test';

import { createVisualProfileRegistry } from '../../plugin/domain/visual-profile-registry.js';
import { createEventBindingRegistry } from '../../plugin/domain/event-binding-registry.js';

test('visual profile registry stores normalized profiles without applying them to events', () => {
  const registry = createVisualProfileRegistry();
  const profile = registry.register({
    profileId: 'stack.message',
    name: 'Stack Message',
    profile: { visualProfiles: { 'stack.message': { preset: 'accent', intensity: 'balanced' } } }
  });

  assert.equal(profile.profileId, 'stack.message');
  assert.equal(profile.name, 'Stack Message');
  assert.equal(profile.profile.visualProfiles['stack.message'].preset, 'accent');
  assert.deepEqual(registry.list(), ['stack.message']);
  assert.deepEqual(registry.references('stack.message'), []);
});

test('visual profile registry rejects duplicate ids and supports copy-on-edit', () => {
  const registry = createVisualProfileRegistry();
  registry.register({ profileId: 'shared', name: 'Shared', profile: {} });
  assert.throws(() => registry.register({ profileId: 'shared', name: 'Again', profile: {} }), (error) => error.code === 'VISUAL_PROFILE_REGISTRY_DUPLICATE');
  const copy = registry.copy('shared', 'event-specific');
  assert.equal(copy.profileId, 'event-specific');
  assert.equal(registry.get('shared').name, 'Shared');
  assert.equal(registry.get('event-specific').name, 'Shared 副本');
});

test('visual profile registry protects referenced profiles during removal', () => {
  const registry = createVisualProfileRegistry();
  registry.register({ profileId: 'custom', name: 'Custom', profile: {} });
  registry.addReference('custom', 'tool.execution.succeeded');
  assert.throws(() => registry.remove('custom'), (error) => error.code === 'VISUAL_PROFILE_REGISTRY_IN_USE');
  registry.removeReference('custom', 'tool.execution.succeeded');
  assert.equal(registry.remove('custom'), true);
});
test('event binding registry applies one profile to selected events and previews changes', () => {
  const profiles = createVisualProfileRegistry();
  profiles.register({ profileId: 'stack.message', name: 'Stack Message', profile: {} });
  const bindings = createEventBindingRegistry({ profileRegistry: profiles });
  const preview = bindings.previewApply({ profileId: 'stack.message', eventIds: ['chat.assistant_reply.completed', 'tool.execution.succeeded'] });
  assert.deepEqual(preview, { added: 2, replaced: 0, unchanged: 0, missing: [] });
  const result = bindings.apply({ profileId: 'stack.message', eventIds: ['chat.assistant_reply.completed', 'tool.execution.succeeded'] });
  assert.deepEqual(result.added, ['chat.assistant_reply.completed', 'tool.execution.succeeded']);
  assert.equal(bindings.get('tool.execution.succeeded').visualProfileId, 'stack.message');
  assert.equal(bindings.get('tool.execution.succeeded').behaviorChannelId, null);
});

test('event binding registry supports category application, shared references and restore default', () => {
  const profiles = createVisualProfileRegistry();
  profiles.register({ profileId: 'tool.stack', name: 'Tool Stack', profile: {} });
  const bindings = createEventBindingRegistry({ profileRegistry: profiles });
  const categoryResult = bindings.apply({ profileId: 'tool.stack', categoryId: 'tool' });
  assert.ok(categoryResult.added.includes('tool.execution.succeeded'));
  assert.equal(bindings.get('tool.execution.failed').visualProfileId, 'tool.stack');
  assert.deepEqual(profiles.references('tool.stack'), categoryResult.added);
  assert.equal(bindings.restoreDefault('tool.execution.failed'), true);
  assert.equal(bindings.get('tool.execution.failed'), null);
});

test('event binding registry rejects ineligible or unknown event targets and never carries sound fields', () => {
  const profiles = createVisualProfileRegistry();
  profiles.register({ profileId: 'safe', name: 'Safe', profile: {} });
  const bindings = createEventBindingRegistry({ profileRegistry: profiles });
  assert.throws(() => bindings.apply({ profileId: 'safe', eventIds: ['tool.execution.started'] }), (error) => error.code === 'VISUAL_EVENT_NOT_ELIGIBLE');
  assert.throws(() => bindings.apply({ profileId: 'safe', eventIds: ['not.real'] }), (error) => error.code === 'VISUAL_EVENT_NOT_FOUND');
  bindings.apply({ profileId: 'safe', eventIds: ['tool.execution.succeeded'], behaviorChannelId: 'stack.tool' });
  assert.deepEqual(Object.keys(bindings.get('tool.execution.succeeded')), ['eventId', 'categoryId', 'visualProfileId', 'behaviorChannelId', 'source']);
});
