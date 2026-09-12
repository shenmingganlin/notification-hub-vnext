import assert from 'node:assert/strict';
import test from 'node:test';

import { OPEN_DIALOG_SCRIPT } from '../../plugin/domain/windows-visual-file-picker.js';

test('visual asset picker enables per-monitor DPI before opening the dialog', () => {
  assert.match(OPEN_DIALOG_SCRIPT, /SetThreadDpiAwarenessContext/);
  assert.match(OPEN_DIALOG_SCRIPT, /PerMonitor|\(-4\)/);
});
