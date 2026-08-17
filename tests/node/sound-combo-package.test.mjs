import assert from 'node:assert/strict';
import test from 'node:test';
import { createSoundComboPackage, parseSoundComboPackage, serializeSoundComboPackage } from '../../plugin/domain/sound-combo-package.js';

test('sound combo package round-trips event bindings without embedded audio', () => {
  const combo = createSoundComboPackage({ name: '工具提醒', profile: { version: 1, soundOverrides: [{ eventId: 'tool.execution.failed', soundId: 'custom.alert', volume: 0.8 }] } });
  const parsed = parseSoundComboPackage(serializeSoundComboPackage(combo));
  assert.equal(parsed.format, 'notification-hub-sound-combo-package');
  assert.equal(parsed.version, 2);
  assert.equal(parsed.profile.soundOverrides[0].eventId, 'tool.execution.failed');
  assert.deepEqual(parsed.assets, []);
});

test('sound combo package rejects embedded audio and old binding dimensions', () => {
  assert.throws(() => createSoundComboPackage({ name: 'bad', profile: { soundOverrides: [{ category: 'tool', event: 'tool_error', importance: 'high', soundId: 'custom.alert' }] } }), /unknown|eventId|importance/i);
  assert.throws(() => parseSoundComboPackage(JSON.stringify({ format: 'notification-hub-sound-combo-package', version: 2, name: 'bad', profile: { version: 1, soundOverrides: [] }, assets: [{ soundId: 'custom.alert' }] })), /assets|audio|forbidden/i);
});
