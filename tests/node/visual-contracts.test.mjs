import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BEHAVIOR_IDS,
  createVisualBehaviorContract
} from '../../plugin/domain/visual-behavior-contract.js';
import {
  CHANNEL_VISIBILITIES,
  createVisualChannelContract
} from '../../plugin/domain/visual-channel-contract.js';
import {
  CARD_TYPE_IDS,
  createCardCompositionContract
} from '../../plugin/domain/card-composition-contract.js';

test('behavior contract separates behavior identity from lifecycle and properties', () => {
  const behavior = createVisualBehaviorContract({
    behaviorId: 'stack',
    displayName: 'Stack',
    lifecycle: { enter: true, idle: true, exit: true },
    properties: { durationMs: 4200, gap: 12 }
  });

  assert.equal(behavior.behaviorId, 'stack');
  assert.equal(behavior.lifecycle.enter, true);
  assert.equal(behavior.properties.durationMs, 4200);
  assert.ok(BEHAVIOR_IDS.includes('stack'));
  assert.ok(Object.isFrozen(behavior));
  assert.ok(Object.isFrozen(behavior.lifecycle));
});

test('behavior contract rejects implementation code and unknown behavior ids', () => {
  assert.throws(
    () => createVisualBehaviorContract({ behaviorId: 'custom' }),
    (error) => error.code === 'VISUAL_BEHAVIOR_ID_INVALID'
  );
  assert.throws(
    () => createVisualBehaviorContract({ behaviorId: 'stack', renderer: 'renderer.js' }),
    (error) => error.code === 'VISUAL_BEHAVIOR_FIELD_UNKNOWN'
  );
});

test('channel contract owns behavior composition and resource limits', () => {
  const channel = createVisualChannelContract({
    channelId: 'deepseek-maid',
    owner: { kind: 'user', id: 'ganlin' },
    visibility: 'private',
    behaviorId: 'stack',
    cardTypeId: 'minimal',
    propertiesId: 'minimal.default',
    skinId: 'mint',
    effectConfigId: 'clean',
    policy: {
      suppression: 'off',
      maxVisible: 1000,
      maxActive: 1000,
      maxParticles: 0,
      maxAnimationInstances: 1000,
      overflow: 'allow'
    }
  });

  assert.equal(channel.channelId, 'deepseek-maid');
  assert.deepEqual(channel.owner, { kind: 'user', id: 'ganlin' });
  assert.equal(channel.visibility, 'private');
  assert.equal(channel.policy.maxActive, 1000);
  assert.equal(channel.policy.maxParticles, 0);
  assert.ok(Object.isFrozen(channel));
});

test('channel contract accepts legacy channel fields through safe defaults', () => {
  const channel = createVisualChannelContract({
    channelId: 'stack.reply',
    behaviorProfileId: 'stack',
    visualProfileId: 'visual.default',
    policy: { suppression: 'off', maxVisible: 8, overflow: 'allow' }
  });

  assert.equal(channel.behaviorId, 'stack');
  assert.equal(channel.cardTypeId, 'minimal');
  assert.equal(channel.visibility, 'private');
  assert.equal(channel.owner.kind, 'system');
});

test('composition contract keeps content, properties, skin and effects as references', () => {
  const composition = createCardCompositionContract({
    cardTypeId: 'message',
    contentSlots: { assistantName: true, avatar: true, title: true, body: true },
    propertiesId: 'message.default',
    skinId: 'mint-terminal',
    effectConfigId: 'fade-scale'
  });

  assert.equal(composition.cardTypeId, 'message');
  assert.equal(composition.contentSlots.body, true);
  assert.equal(composition.propertiesId, 'message.default');
  assert.equal(composition.skinId, 'mint-terminal');
  assert.equal(composition.effectConfigId, 'fade-scale');
  assert.ok(CARD_TYPE_IDS.includes('message'));
  assert.ok(Object.isFrozen(composition));
});

test('composition contract rejects executable or arbitrary style payloads', () => {
  assert.throws(
    () => createCardCompositionContract({ cardTypeId: 'minimal', renderer: 'custom.js' }),
    (error) => error.code === 'CARD_COMPOSITION_FIELD_UNKNOWN'
  );
  assert.throws(
    () => createCardCompositionContract({ cardTypeId: 'minimal', style: { cssText: 'body{}' } }),
    (error) => error.code === 'CARD_COMPOSITION_FIELD_UNKNOWN'
  );
  assert.deepEqual(CHANNEL_VISIBILITIES, ['private', 'shared', 'public']);
});
