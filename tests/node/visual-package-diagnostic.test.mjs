import assert from 'node:assert/strict';
import test from 'node:test';

import {
  VISUAL_PACKAGE_DIAGNOSTIC_FORMAT,
  VISUAL_PACKAGE_DIAGNOSTIC_VERSION,
  createVisualPackageDiagnosticReport,
  serializeVisualPackageDiagnosticReport
} from '../../plugin/domain/visual-package-diagnostic.js';

test('visual package diagnostic report keeps import metadata and issues without binary data', () => {
  const report = createVisualPackageDiagnosticReport({
    report: {
      packageId: 'visual-package-test',
      packageName: 'Test Package',
      version: '1.0.0',
      strategy: 'copy',
      failed: true,
      rolledBack: true,
      failedStage: 'bindings',
      rollbackReason: 'import-failed-after-state-restore',
      issues: [{ scope: 'binding', code: 'BINDING_EVENT_INVALID', severity: 'error', id: 'unknown.event', message: 'invalid', details: { cause: 'not found' } }],
      issueSummary: { total: 1, warnings: 0, errors: 1 },
      assets: { imported: [{ assetId: 'a', format: 'png' }] }
    },
    exportedAt: '2026-08-20T12:00:00.000Z'
  });

  assert.equal(report.format, VISUAL_PACKAGE_DIAGNOSTIC_FORMAT);
  assert.equal(report.version, VISUAL_PACKAGE_DIAGNOSTIC_VERSION);
  assert.equal(report.packageVersion, '1.0.0');
  assert.equal(report.failedStage, 'bindings');
  assert.equal(report.issues[0].id, 'unknown.event');
  assert.equal(report.assets.imported[0].assetId, 'a');
  assert.doesNotMatch(JSON.stringify(report), /buffer/i);
});

test('visual package diagnostic report serializes as readable JSON', () => {
  const content = serializeVisualPackageDiagnosticReport({
    report: { packageId: 'visual-package-test', packageName: 'Test Package', version: '1.0.0', strategy: 'skip', issues: [] },
    exportedAt: '2026-08-20T12:00:00.000Z'
  });
  const parsed = JSON.parse(content);
  assert.equal(parsed.format, VISUAL_PACKAGE_DIAGNOSTIC_FORMAT);
  assert.equal(parsed.packageId, 'visual-package-test');
  assert.match(content, /\n  "format"/);
});

test('visual package diagnostic report rejects a missing import report', () => {
  assert.throws(() => createVisualPackageDiagnosticReport(), { code: 'VISUAL_PACKAGE_DIAGNOSTIC_INVALID' });
});
