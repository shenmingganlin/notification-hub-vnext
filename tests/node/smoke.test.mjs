import assert from 'node:assert/strict';
import test from 'node:test';

import { pluginName, pluginVersion } from '../../plugin/index.js';

test('package identity is available', () => {
  assert.equal(pluginName, 'notification-hub-vnext');
  assert.equal(pluginVersion, '0.1.0');
});
