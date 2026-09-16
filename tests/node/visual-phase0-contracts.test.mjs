import assert from 'node:assert/strict';
import test from 'node:test';

import {
  VISUAL_PACKAGE_FORMAT,
  createVisualPackageManifest,
  validateVisualPackageEntries
} from '../../plugin/domain/visual-package-manifest.js';
import {
  VISUAL_DIAGNOSTIC_CODES,
  VISUAL_DIAGNOSTIC_STAGES,
  createVisualDiagnostic
} from '../../plugin/domain/visual-diagnostic-contract.js';

test('visual package manifest accepts declaration-only package metadata and entries', () => {
  const manifest = createVisualPackageManifest({
    packageId: 'deepseek-maid',
    packageName: 'DeepSeek Maid',
    version: '1.0.0',
    runtimeMinVersion: '0.1.0',
    capabilities: ['behavior', 'channel', 'skin', 'asset'],
    entries: [
      'manifest.json',
      'settings/channels.json',
      'behaviors/stack.json',
      'skins/mint.json',
      'assets/mint-star.png',
      'preview/cover.webp'
    ]
  });

  assert.equal(manifest.format, VISUAL_PACKAGE_FORMAT);
  assert.equal(manifest.packageId, 'deepseek-maid');
  assert.deepEqual(manifest.entries, [
    'manifest.json',
    'settings/channels.json',
    'behaviors/stack.json',
    'skins/mint.json',
    'assets/mint-star.png',
    'preview/cover.webp'
  ]);
  assert.ok(Object.isFrozen(manifest));
});

test('visual package manifest rejects executable files, traversal and shell commands', () => {
  for (const entries of [
    ['manifest.json', '../outside.json'],
    ['manifest.json', 'behaviors/custom.js'],
    ['manifest.json', 'runtime/node.exe'],
    ['manifest.json', 'scripts/run.json'],
    ['manifest.json', 'settings/run.json; powershell.exe']
  ]) {
    assert.throws(
      () => createVisualPackageManifest({ packageId: 'bad', packageName: 'Bad', version: '1.0.0', entries }),
      (error) => error.code === 'VISUAL_PACKAGE_INVALID_ENTRY'
    );
  }
});

test('visual package entry validation returns a stable report without executing content', () => {
  const report = validateVisualPackageEntries(['manifest.json', 'assets/a.png', 'bad.dll']);
  assert.equal(report.valid, false);
  assert.deepEqual(report.invalidEntries, ['bad.dll']);
  assert.ok(report.errors.every((entry) => entry.code === 'VISUAL_PACKAGE_INVALID_ENTRY'));
});

test('visual diagnostic contract creates a frozen, traceable and recoverable error', () => {
  const diagnostic = createVisualDiagnostic({
    code: 'VISUAL_EFFECT_ASSET_MISSING',
    message: '特效引用的图片素材不存在',
    userMessage: '“星光消散”缺少图片素材“mint-star”',
    stage: 'EFFECT_RUN',
    severity: 'error',
    recoverable: true,
    source: { packageId: 'deepseek-maid', profileId: 'maid-default', effectId: 'soft-dissolve', assetId: 'mint-star' },
    impact: { affected: ['exitParticles'], unaffected: ['notificationRecord', 'sound', 'eventIngestion'] },
    details: { suggestedActions: ['重新导入素材', '关闭消失粒子'] },
    traceId: 'visual-run-123'
  });

  assert.equal(diagnostic.code, 'VISUAL_EFFECT_ASSET_MISSING');
  assert.equal(diagnostic.stage, 'EFFECT_RUN');
  assert.equal(diagnostic.traceId, 'visual-run-123');
  assert.equal(diagnostic.recoverable, true);
  assert.deepEqual(diagnostic.impact.unaffected, ['notificationRecord', 'sound', 'eventIngestion']);
  assert.ok(Object.isFrozen(diagnostic));
  assert.ok(Object.isFrozen(diagnostic.source));
});

test('visual diagnostic contract rejects unknown stages, codes and unsafe source fields', () => {
  assert.ok(VISUAL_DIAGNOSTIC_STAGES.includes('PACKAGE_VALIDATE'));
  assert.ok(VISUAL_DIAGNOSTIC_CODES.includes('VISUAL_PROFILE_INVALID'));
  assert.ok(VISUAL_DIAGNOSTIC_CODES.includes('FLIGHT_LAYOUT_FAILED'));
  assert.ok(VISUAL_DIAGNOSTIC_STAGES.includes('FLIGHT_LAYOUT'));
  assert.throws(
    () => createVisualDiagnostic({ code: 'NOT_A_VISUAL_CODE', stage: 'EFFECT_RUN', message: 'bad', traceId: 't-1' }),
    (error) => error.code === 'VISUAL_DIAGNOSTIC_CODE_INVALID'
  );
  assert.throws(
    () => createVisualDiagnostic({ code: 'VISUAL_PROFILE_INVALID', stage: 'NOT_A_STAGE', message: 'bad', traceId: 't-1' }),
    (error) => error.code === 'VISUAL_DIAGNOSTIC_STAGE_INVALID'
  );
  assert.throws(
    () => createVisualDiagnostic({ code: 'VISUAL_PROFILE_INVALID', stage: 'CONFIG_RESOLVE', message: 'bad', traceId: 't-1', source: { path: 'C:\\secret\\file.js' } }),
    (error) => error.code === 'VISUAL_DIAGNOSTIC_SOURCE_INVALID'
  );
});
