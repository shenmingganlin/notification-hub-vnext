import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeRuntimeDiagnostic,
  projectCurrentRuntimeError,
  projectDiagnosticRecords,
  sanitizeDiagnosticDetails,
  summarizeRuntimeDebugPayload
} from '../../plugin/runtime/diagnostics-projection.js';

test('sanitizeDiagnosticDetails recursively removes sensitive evidence and preserves safe values', () => {
  const details = sanitizeDiagnosticDetails({
    attempt: 2,
    stdout: 'raw stdout',
    nested: {
      stderr: 'raw stderr',
      path: 'C:\\private\\runtime.exe',
      safe: 'kept'
    },
    entries: [{ body: 'notification body', code: 'RUNTIME_RESTART_SCHEDULED' }]
  });

  assert.deepEqual(details, {
    attempt: 2,
    nested: { safe: 'kept' },
    entries: [{ code: 'RUNTIME_RESTART_SCHEDULED' }]
  });
});

test('summarizeRuntimeDebugPayload drops scene cards so debug logs cannot keep card bodies', () => {
  const summarized = summarizeRuntimeDebugPayload('scene.changed', {
    source: 'health-sync',
    payload: {
      snapshot: {
        updatedAt: '2026-09-14T00:00:00.000Z',
        cards: [{ id: 'c1', title: '工具执行完成', body: 'HUGE-BODY'.repeat(200) }]
      },
      change: { reason: 'scene.ticker-exit', target: 'card', targetId: 'c1' }
    }
  });
  const text = JSON.stringify(summarized);
  assert.equal(summarized.payload.snapshot.cards, undefined);
  assert.equal(text.includes('HUGE-BODY'), false);
  assert.equal(summarized.payload.change.reason, 'scene.ticker-exit');
});

test('summarizeRuntimeDebugPayload redacts stdout and stderr', () => {
  assert.equal(summarizeRuntimeDebugPayload('stdout', 'raw'), '[redacted]');
  assert.equal(summarizeRuntimeDebugPayload('stderr', 'raw'), '[redacted]');
});

test('normalizeRuntimeDiagnostic applies stable defaults without exposing raw fields', () => {
  const normalized = normalizeRuntimeDiagnostic({
    code: 'RUNTIME_START_FAILED',
    message: 'Runtime failed',
    details: { stdout: 'hidden', cause: 'ENOENT' },
    timestamp: '2026-08-01T00:00:00.000Z'
  }, 'runtime');

  assert.deepEqual(normalized, {
    code: 'RUNTIME_START_FAILED',
    message: 'Runtime failed',
    stage: 'runtime',
    severity: 'error',
    recoverable: false,
    details: { cause: 'ENOENT' },
    timestamp: '2026-08-01T00:00:00.000Z',
    source: 'runtime'
  });
});

test('projectDiagnosticRecords normalizes all sources, sorts newest first, and counts the same records', () => {
  const result = projectDiagnosticRecords({
    runtime: [{ code: 'RUNTIME_RESTART_SCHEDULED', message: 'retry', recoverable: true, timestamp: '2026-08-01T00:00:01.000Z' }],
    settings: [{ code: 'SETTINGS_INVALID', message: 'bad setting', timestamp: '2026-08-01T00:00:03.000Z' }],
    notifications: [{ code: 'NOTIFICATION_ACCEPTED', message: 'accepted', severity: 'info', timestamp: '2026-08-01T00:00:02.000Z' }]
  });

  assert.deepEqual(result.diagnostics.map((event) => event.code), [
    'SETTINGS_INVALID',
    'NOTIFICATION_ACCEPTED',
    'RUNTIME_RESTART_SCHEDULED'
  ]);
  assert.deepEqual(result.summary, { total: 3, errors: 1, warnings: 1, recoverable: 1 });
});

test('projectCurrentRuntimeError hides a connected recovery error but preserves it as a notice', () => {
  const lastError = { code: 'TRANSPORT_DISCONNECTED', message: 'Pipe disconnected' };
  assert.deepEqual(projectCurrentRuntimeError({ connected: true, lastError }), {
    currentError: null,
    recoveryNotice: lastError
  });
});

test('projectCurrentRuntimeError keeps non-recovery failures current and falls back in order', () => {
  const lastError = { code: 'RUNTIME_EXITED' };
  const requestError = { code: 'TRANSPORT_REQUEST_FAILED' };
  assert.deepEqual(projectCurrentRuntimeError({ connected: true, lastError, requestError }), {
    currentError: lastError,
    recoveryNotice: null
  });
  assert.deepEqual(projectCurrentRuntimeError({ connected: false, requestError }), {
    currentError: requestError,
    recoveryNotice: null
  });
});
