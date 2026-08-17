import assert from 'node:assert/strict';
import test from 'node:test';

import NotificationHubVNextPlugin from '../../plugin/index.js';

test('sound effective preview returns one explainable decision for structured input', () => {
  const plugin = new NotificationHubVNextPlugin({ config: { notificationPersistenceEnabled: false, soundSettingsPersistenceEnabled: false } });
  const result = plugin.previewSoundSettings({
    eventId: 'tool.execution.failed',
    labels: ['tool'],
    producer: { kind: 'api', id: 'download-plugin' },
    event: 'failed',
    importance: 'normal'
  });
  assert.equal(result.decision.cue, 'tool-failed');
  assert.equal(result.decision.play, false);
  assert.equal(result.decision.matchedBy, 'global');
  assert.equal(result.decision.reason, 'policy-disabled');
  assert.equal(Object.isFrozen(result.decision), true);
});

test('sound effective preview rejects unstructured or invalid input safely', () => {
  const plugin = new NotificationHubVNextPlugin({ config: { notificationPersistenceEnabled: false, soundSettingsPersistenceEnabled: false } });
  assert.throws(
    () => plugin.previewSoundSettings({ labels: ['tool'], event: '', importance: 'high' }),
    (error) => error.code === 'SOUND_SETTINGS_PREVIEW_INPUT_INVALID'
  );
  assert.throws(
    () => plugin.previewSoundSettings({ labels: ['unknown'], event: 'unsupported' }),
    (error) => error.code === 'SOUND_SETTINGS_PREVIEW_INPUT_INVALID'
  );
});
