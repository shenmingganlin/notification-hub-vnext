import assert from 'node:assert/strict';
import test from 'node:test';

import { parsePressureArgs, runPressureCommand } from '../../scripts/run-sound-pressure.mjs';

test('pressure CLI parses bounded scenarios', () => {
  assert.deepEqual(parsePressureArgs(['--scenario', 'eager', '--count', '12']), { scenario: 'eager', count: 12 });
  assert.deepEqual(parsePressureArgs(['--scenario', 'all']), { scenario: 'all', count: 1000 });
  assert.deepEqual(parsePressureArgs(['--help']), { help: true });
});

test('pressure CLI rejects invalid or unbounded input', () => {
  assert.throws(() => parsePressureArgs([]), (error) => error.code === 'PRESSURE_SCENARIO_REQUIRED');
  assert.throws(() => parsePressureArgs(['--scenario', 'unknown', '--count', '1']), (error) => error.code === 'PRESSURE_SCENARIO_INVALID');
  assert.throws(() => parsePressureArgs(['--scenario', 'eager', '--count', '10001']), (error) => error.code === 'PRESSURE_COUNT_INVALID');
});

test('pressure CLI returns machine-readable eager and duplicate results', async () => {
  const eager = await runPressureCommand(['--scenario', 'eager', '--count', '20']);
  assert.deepEqual({ ...eager, durationMs: 0 }, { scenario: 'eager', count: 20, played: 20, merged: 0, failed: 0, skipped: 0, dropped: 0, settled: 20, durationMs: 0 });
  const duplicate = await runPressureCommand(['--scenario', 'duplicate', '--count', '20']);
  assert.equal(duplicate.scenario, 'duplicate');
  assert.equal(duplicate.count, 20);
  assert.equal(duplicate.played, 1);
  assert.equal(duplicate.merged, 19);
  assert.equal(duplicate.settled, 20);
});
