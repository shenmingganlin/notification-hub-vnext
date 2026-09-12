import assert from 'node:assert/strict';
import test from 'node:test';
import { createVisualRuntimeTakeoverAdapter } from '../../plugin/domain/visual-runtime-takeover-adapter.js';

test('takeover adapter accepts only comparable Stack policies', () => {
  const adapter = createVisualRuntimeTakeoverAdapter();
  assert.equal(adapter.canTakeover({ behaviorId: 'stack', policy: { overflow: 'queue', suppression: 'off' } }).ok, true);
  assert.equal(adapter.canTakeover({ behaviorId: 'ticker', policy: { overflow: 'allow', suppression: 'off' } }).ok, false);
  assert.equal(adapter.canTakeover({ behaviorId: 'stack', policy: { overflow: 'aggregate', suppression: 'off' } }).ok, false);
  assert.equal(adapter.canTakeover({ behaviorId: 'stack', policy: { overflow: 'allow', suppression: 'aggressive' } }).ok, false);
});

test('takeover adapter projects a runtime card without changing sound or notification state', async () => {
  const requests = [];
  const adapter = createVisualRuntimeTakeoverAdapter({ request: async (type, payload) => { requests.push({ type, payload }); return { result: { status: 'created' } }; } });
  const result = await adapter.create({ channelId: 'stack.tool', behaviorId: 'stack', policy: { overflow: 'allow', suppression: 'off' }, card: { cardId: 'takeover-1', notificationId: 'notification-1', eventId: 'tool.execution.succeeded', visualProfileId: 'visual.tool' }, nativePayload: { id: 'native-1', title: 'Tool', body: 'body' } });
  assert.equal(result.status, 'created');
  assert.equal(requests[0].type, 'scene.create');
  assert.equal(requests[0].payload.id, 'native-1');
  assert.equal(requests[0].payload.behavior.behaviorChannelId, 'stack.tool');
});

test('takeover adapter returns rollback decision on policy or Native failure', async () => {
  const adapter = createVisualRuntimeTakeoverAdapter({ request: async () => { throw Object.assign(new Error('native unavailable'), { code: 'RUNTIME_DOWN' }); } });
  const blocked = await adapter.create({ channelId: 'stack.tool', behaviorId: 'ticker', policy: { overflow: 'allow', suppression: 'off' }, card: { cardId: 'x', notificationId: 'n', eventId: 'tool.execution.succeeded' }, nativePayload: { id: 'native-x' } });
  assert.equal(blocked.decision, 'rollback');
  assert.equal(blocked.code, 'VISUAL_RUNTIME_TAKEOVER_POLICY_UNSUPPORTED');
  const failed = await adapter.create({ channelId: 'stack.tool', behaviorId: 'stack', policy: { overflow: 'allow', suppression: 'off' }, card: { cardId: 'x', notificationId: 'n', eventId: 'tool.execution.succeeded' }, nativePayload: { id: 'native-x' } });
  assert.equal(failed.decision, 'rollback');
  assert.equal(failed.code, 'RUNTIME_DOWN');
});
