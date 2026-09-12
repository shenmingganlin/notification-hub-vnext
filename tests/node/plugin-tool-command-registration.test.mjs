import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as tool from '../../plugin/tools/notification-hub-run-test.js';
import * as command from '../../plugin/commands/notification-hub-run-test.js';

test('notification test tool is declared as a static manifest contribution', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../plugin');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.contributes.tools, ['./tools/notification-hub-run-test.js']);
  assert.equal(typeof command.handler, 'function');
});

test('notification test tool is a bounded static Hana tool and marks tool entry point', async () => {
  const requests = [];
  const result = await tool.execute({ count: 1, createCards: false }, {
    bus: { request: async (type, input) => { requests.push({ type, input }); return { ok: true, entryPoint: input.entryPoint }; } }
  });
  assert.deepEqual(requests, [{ type: 'notification-hub-vnext.run-test', input: { count: 1, createCards: false, playSound: false, events: ['tool_completed'], entryPoint: 'tool' } }]);
  assert.deepEqual(JSON.parse(result), { ok: true, entryPoint: 'tool' });
  assert.equal(tool.parameters.properties.count.maximum, 100);
  assert.equal(tool.parameters.properties.intervalMs.maximum, 5000);
});

test('notification test command defaults omitted playSound to false', async () => {
  const requests = [];
  await command.handler({
    args: JSON.stringify({ count: 1 }),
    hub: {
      eventBus: {
        request: async (type, input) => { requests.push({ type, input }); return { ok: true }; }
      }
    }
  });
  assert.equal(requests[0].input.playSound, false);
});

test('notification test command is a separate slash command and marks command entry point', async () => {
  const requests = [];
  const result = await command.handler({
    args: JSON.stringify({ count: 1, playSound: false }),
    hub: {
      eventBus: {
        request: async (type, input) => { requests.push({ type, input }); return { ok: true, entryPoint: input.entryPoint }; }
      }
    }
  });
  assert.deepEqual(requests, [{ type: 'notification-hub-vnext.run-test', input: { count: 1, playSound: false, events: ['tool_completed'], entryPoint: 'command' } }]);
  assert.deepEqual(JSON.parse(result.reply), { ok: true, entryPoint: 'command' });
  assert.equal(command.name, 'notification-hub-vnext_notification-hub-run-test');
});
