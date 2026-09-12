import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const runtimePath = process.argv[2]
  ?? process.env.NOTIFICATION_HUB_RUNTIME_PATH
  ?? path.join(root, 'build', 'debug-vs2026', 'runtime', 'Release', 'notification-hub-runtime.exe');

if (!existsSync(runtimePath)) {
  console.error(`Runtime integration gate failed: executable not found at ${runtimePath}`);
  console.error('Build notification-hub-runtime or pass its path as an argument / NOTIFICATION_HUB_RUNTIME_PATH.');
  process.exit(2);
}

console.log(`Runtime integration gate: ${runtimePath}`);
const result = spawnSync(process.execPath, [
  '--test',
  path.join(root, 'tests', 'node', 'runtime-process-manager-smoke.test.mjs')
], {
  cwd: root,
  env: {
    ...process.env,
    NOTIFICATION_HUB_REQUIRE_RUNTIME: '1',
    NOTIFICATION_HUB_RUNTIME_PATH: runtimePath
  },
  stdio: 'inherit',
  windowsHide: true
});

if (result.error) {
  console.error(`Runtime integration gate could not start: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
