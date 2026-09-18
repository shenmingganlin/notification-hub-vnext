import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { createHello } from '../../plugin/protocol/index.js';
import { PLUGIN_VERSION } from '../../plugin/version.js';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(read(relativePath));
const canonicalVersion = read('VERSION').trim();

const packageJson = readJson('package.json');
const packageLock = readJson('package-lock.json');
const manifest = readJson('plugin/manifest.json');
const cmake = read('CMakeLists.txt');
const runtimeCmake = read('runtime/CMakeLists.txt');
const protocol = read('plugin/protocol/index.js');
const releaseScript = read('scripts/package-release.ps1');
const runtimeSmokeScript = read('scripts/run-runtime-integration.mjs');
const runtimeMain = read('runtime/app/main.cpp');

function assertVersion(label, actual) {
  assert.equal(actual, canonicalVersion, `${label} must match VERSION`);
}

test('VERSION is the canonical release version for Node/package metadata', () => {
  assert.match(canonicalVersion, /^0\.1\.8$/);
  assertVersion('package.json', packageJson.version);
  assertVersion('package-lock.json root', packageLock.version);
  assertVersion('package-lock.json package entry', packageLock.packages[''].version);
  assertVersion('plugin manifest', manifest.version);
  assertVersion('generated plugin version', PLUGIN_VERSION);
});

test('CMake and protocol use the current release version without runtime workspace reads', () => {
  assert.match(cmake, /file\(READ [^\n]+VERSION/);
  assert.match(cmake, /project\(notification_hub_vnext VERSION \$\{NOTIFICATION_HUB_VERSION\}/);
  assert.match(runtimeCmake, /NOTIFICATION_HUB_VERSION="\$\{PROJECT_VERSION\}"/);
  assert.match(protocol, /clientVersion: options\.clientVersion \?\? PLUGIN_VERSION/);
  assert.doesNotMatch(protocol, /0\.1\.0-alpha\.2/);
  assert.equal(createHello({ requestId: 'req-version', traceId: 'trace-version' }).payload.clientVersion, canonicalVersion);
});

test('README documents the trial version and excludes historical diagnostics', () => {
  const readme = read('README.md');
  assert.match(readme, /试用版/);
  assert.match(readme, /0\.1\.8/);
  assert.match(readme, /VERSION/);
  assert.match(readme, /历史诊断/);
  assert.doesNotMatch(readme, /Current stable baseline/);
  assert.doesNotMatch(readme, /Current stable version/);
});

test('release script rejects historical path discovery and emits an audit manifest', () => {
  assert.match(releaseScript, /RuntimePath/);
  assert.match(releaseScript, /AudioEnginePath/);
  assert.match(releaseScript, /debug-vs2026/);
  assert.doesNotMatch(releaseScript, /vs2022-debug|native-audio/);
  assert.match(releaseScript, /LastWriteTimeUtc/);
  assert.match(releaseScript, /release-manifest\.json/);
  assert.match(releaseScript, /runtime.*audio|audio.*runtime/i);
  assert.match(releaseScript, /Invoke-StagingRuntimeSmoke/);
  assert.match(releaseScript, /SkipStagingRuntimeSmoke/);
  assert.match(releaseScript, /stagingVerification/);
  assert.match(releaseScript, /VERSION/);
});

test('test entry points and Runtime smoke have explicit gate semantics', () => {
  assert.equal(packageJson.scripts['test:unit'], 'node --test tests/node/*.test.mjs');
  assert.equal(packageJson.scripts['test:integration'], 'node scripts/run-runtime-integration.mjs');
  assert.equal(packageJson.scripts['test:all'], 'npm run test:unit && npm run test:integration');
  assert.match(runtimeSmokeScript, /Runtime integration gate failed/);
  assert.match(runtimeSmokeScript, /NOTIFICATION_HUB_REQUIRE_RUNTIME/);
  assert.match(runtimeMain, /protocol_self_test\(\)/);
  assert.match(runtimeMain, /transport_self_test\(\)/);
  assert.match(runtimeMain, /return passed \? 0 : 1/);
});

test('native test assertions remain active and unavailable audio is a CTest skip', () => {
  assert.match(runtimeCmake, /notification_hub_enable_test_assertions/);
  assert.match(runtimeCmake, /SKIP_RETURN_CODE 77/);
  const deviceTest = read('tests/native/audio-engine-device-output.test.cpp');
  assert.match(deviceTest, /ENVIRONMENT_UNAVAILABLE/);
  assert.match(deviceTest, /kEnvironmentUnavailable/);
});

test('historical diagnostic fixtures remain unchanged and are excluded from release checks', () => {
  for (const relativePath of [
    'diagnostic-2026-08-16T09-49-09-959Z.json',
    'tmp-diagnostics.json',
    'tmp-diagnostics-card.json'
  ]) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), true, `${relativePath} must remain an explicit historical artifact`);
  }
  assert.match(read('README.md'), /Historical diagnostic JSON|历史诊断/i);
});
