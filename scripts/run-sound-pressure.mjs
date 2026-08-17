#!/usr/bin/env node
import { createSoundScheduler } from '../plugin/domain/sound-scheduler.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCENARIOS = new Set(['eager', 'duplicate', 'failures', 'mute']);
const MAX_COUNT = 10_000;

function cliError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function parsePressureArgs(argv = []) {
  let scenario = null;
  let count = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--scenario') scenario = argv[++index];
    else if (argument === '--count') count = Number(argv[++index]);
    else if (argument === '--help' || argument === '-h') return Object.freeze({ help: true });
    else throw cliError('PRESSURE_ARGUMENT_INVALID', `unknown argument: ${argument}`);
  }
  if (!scenario) throw cliError('PRESSURE_SCENARIO_REQUIRED', '--scenario is required');
  if (scenario !== 'all' && !SCENARIOS.has(scenario)) throw cliError('PRESSURE_SCENARIO_INVALID', `unsupported scenario: ${scenario}`);
  if (scenario !== 'all' && (!Number.isInteger(count) || count < 1 || count > MAX_COUNT)) {
    throw cliError('PRESSURE_COUNT_INVALID', `--count must be an integer from 1 to ${MAX_COUNT}`);
  }
  return Object.freeze({ scenario, count: scenario === 'all' ? (Number.isInteger(count) && count > 0 ? Math.min(count, MAX_COUNT) : 1000) : count });
}

function controlledPlayer({ muted = false, failureEvery = 0 } = {}) {
  const calls = [];
  const pending = [];
  return {
    calls,
    pending,
    play(input) {
      calls.push(input);
      if (muted) return Promise.resolve({ played: false, reason: 'global-disabled' });
      return new Promise((resolve, reject) => pending.push({ resolve, reject, index: calls.length }));
    },
    settle() {
      while (pending.length) {
        const item = pending.shift();
        if (failureEvery > 0 && item.index % failureEvery === 0) item.reject(new Error('pressure-failure'));
        else item.resolve({ played: true });
      }
    }
  };
}

async function runScenario(scenario, count) {
  const started = performance.now();
  const player = controlledPlayer({ muted: scenario === 'mute', failureEvery: scenario === 'failures' ? 10 : 0 });
  const scheduler = createSoundScheduler({ play: player.play.bind(player) });
  const requests = Array.from({ length: count }, (_, index) => {
    const duplicate = scenario === 'duplicate';
    const muted = scenario === 'mute';
    return scheduler.schedule({
      play: !muted,
      cue: duplicate ? 'chat-incoming' : (index % 2 ? 'warning' : 'tool-complete'),
      volume: 1,
      importance: 'normal',
      suppressDuplicates: duplicate,
      reason: muted ? 'global-disabled' : 'allowed'
    }, { stableKey: `cli-pressure-${scenario}-${index}` });
  });
  await new Promise((resolve) => setImmediate(resolve));
  player.settle();
  const results = await Promise.all(requests);
  const stats = {
    scenario,
    count,
    played: results.filter((entry) => entry.status === 'played').length,
    merged: results.filter((entry) => entry.status === 'merged').length,
    failed: results.filter((entry) => entry.status === 'failed').length,
    skipped: results.filter((entry) => entry.status === 'skipped').length,
    dropped: results.filter((entry) => entry.status === 'dropped').length,
    settled: results.length,
    durationMs: Math.round(performance.now() - started)
  };
  return stats;
}

export async function runPressureCommand(argv = []) {
  const options = parsePressureArgs(argv);
  if (options.help) return { help: true, usage: 'npm run pressure -- --scenario eager|duplicate|failures|mute|all --count N' };
  const scenarios = options.scenario === 'all' ? [...SCENARIOS] : [options.scenario];
  const results = [];
  for (const scenario of scenarios) results.push(await runScenario(scenario, options.count));
  return options.scenario === 'all' ? { scenario: 'all', results } : results[0];
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const result = await runPressureCommand(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.code ?? 'PRESSURE_FAILED'}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
