import assert from 'node:assert/strict';
import test from 'node:test';
import NotificationHubVNextPlugin from '../../plugin/index.js';

function makePlugin() {
  const requests = [];
  const plugin = new NotificationHubVNextPlugin({ config: { visualRuntimeShadowEnabled: true }, dataDir: '', pluginDir: process.cwd() });
  plugin.runtimeHost = { state: 'running', client: { requests, async request(type, payload) { requests.push({ type, payload }); if (type === 'health') return { payload: { result: { sceneCards: [], layout: { spacing: 12, direction: 'right', anchor: 'bottom-left' }, workArea: { left: 0, top: 0, width: 1920, height: 1080 } } } }; return { payload: { result: {} } }; } } };
  return { plugin, requests };
}

test('production scene path shadow-enqueues the resolved selector without changing Native payload', async () => {
  const { plugin, requests } = makePlugin();
  plugin.stopNotificationSceneSubscription();
  const record = plugin.notificationApi.createNotification({ notificationId: 'shadow-notification', type: 'tool_completed', source: 'test', title: 'Tool', content: 'body' });
  await plugin.showNotificationScene(record);
  const create = requests.find((item) => item.type === 'scene.create');
  assert.ok(create);
  assert.equal(create.payload.presentation.eventId, 'tool.execution.succeeded');
  const status = plugin.getVisualRuntimeShadowStatus();
  assert.equal(status.enabled, true);
  assert.equal(status.mode, 'shadow');
  assert.deepEqual(status.channels, ['tool.main']);
  assert.equal(status.metrics.activeCardCount, 1);
  assert.equal(status.parity.observations, 1);
});

test('shadow runtime keeps different behavior channels isolated and reports parity observations', async () => {
  const { plugin } = makePlugin();
  plugin.stopNotificationSceneSubscription();
  for (const [notificationId, type] of [['shadow-tool', 'tool_completed'], ['shadow-chat', 'assistant_message']]) {
    const record = plugin.notificationApi.createNotification({ notificationId, type, source: 'test', title: notificationId, content: 'body' });
    await plugin.showNotificationScene(record);
  }
  const status = plugin.getVisualRuntimeShadowStatus();
  assert.deepEqual(status.channels.sort(), ['chat.main', 'tool.main']);
  assert.equal(status.metrics.channelCount, 2);
  assert.equal(status.parity.observations, 2);
  assert.equal(status.parity.mismatches, 0);
});

test('shadow overflow metrics expose allow, queue, and drop-oldest without touching Native', () => {
  const { plugin, requests } = makePlugin();
  const cases = [
    ['allow', { maxVisible: 2, overflow: 'allow' }, { visibleCardCount: 3, queuedCardCount: 0, suppressedCardCount: 0 }],
    ['queue', { maxVisible: 2, overflow: 'queue' }, { visibleCardCount: 2, queuedCardCount: 1, suppressedCardCount: 0 }],
    ['drop-oldest', { maxVisible: 2, overflow: 'drop-oldest' }, { visibleCardCount: 2, queuedCardCount: 0, suppressedCardCount: 1 }]
  ];
  for (const [name, policy, expected] of cases) {
    const channelId = `overflow.${name}`;
    const channel = plugin.visualRuntimeShadowRegistry.getOrCreateChannel({ channelId, behaviorId: 'stack', policy });
    for (let index = 0; index < 3; index += 1) { channel.enqueue({ cardId: `${name}-${index}`, notificationId: `${name}-${index}`, eventId: 'tool.execution.succeeded', width: 100, height: 80 }); channel.start(`${name}-${index}`); }
    const metrics = channel.metrics();
    assert.equal(metrics.channelCount, 1);
    assert.equal(metrics.activeCardCount, name === 'allow' || name === 'queue' ? 3 : 2);
    assert.equal(metrics.visibleCardCount, expected.visibleCardCount);
    assert.equal(metrics.queuedCardCount, expected.queuedCardCount);
    assert.equal(metrics.suppressedCardCount, expected.suppressedCardCount);
    assert.ok(metrics.layoutRecomputeCount >= 5 && metrics.layoutRecomputeCount <= 6);
  }
  assert.equal(requests.length, 0);
});

test('takeover mode uses the controlled adapter and remains visible in mode status', async () => {
  const { plugin, requests } = makePlugin();
  plugin.ctx.config.visualRuntimeMode = 'takeover';
  plugin.visualRuntimeModeController.setMode('takeover', { declaration: 'test' });
  plugin.stopNotificationSceneSubscription();
  const record = plugin.notificationApi.createNotification({ notificationId: 'takeover-notification', type: 'tool_completed', source: 'test', title: 'Tool', content: 'body' });
  await plugin.showNotificationScene(record);
  assert.equal(requests.filter((item) => item.type === 'scene.create').length, 1);
  assert.equal(plugin.getVisualRuntimeModeStatus().mode, 'takeover');
});

test('plugin exposes a legacy default mode contract with bounded takeover metrics', () => {
  const plugin = new NotificationHubVNextPlugin({ config: {}, dataDir: '', pluginDir: process.cwd() });
  const status = plugin.getVisualRuntimeModeStatus();
  assert.equal(status.mode, 'legacy');
  assert.equal(status.rollback, null);
  assert.equal(status.metrics.soundPathHealthy, true);
});

test('shadow runtime is disabled by default and does not allocate channels', () => {
  const plugin = new NotificationHubVNextPlugin({ config: {}, dataDir: '', pluginDir: process.cwd() });
  const status = plugin.getVisualRuntimeShadowStatus();
  assert.equal(status.enabled, false);
  assert.deepEqual(status.channels, []);
});
