const DIAGNOSTIC_SEVERITIES = new Set(['trace', 'info', 'warning', 'error', 'fatal']);

const DIAGNOSTIC_HIDDEN_KEYS = new Set([
  'stdout',
  'stderr',
  'sceneCards',
  'cards',
  'path',
  'filePath',
  'soundPath',
  'audioPath',
  'executablePath',
  'script',
  'body',
  'notification',
  'content',
  'payload_json'
]);

const RUNTIME_RECOVERY_CODES = new Set([
  'TRANSPORT_RECONNECT_RETRY',
  'TRANSPORT_DISCONNECTED',
  'RUNTIME_RESTART_SCHEDULED'
]);

export function isRuntimeRecoveryDiagnostic(diagnostic) {
  return RUNTIME_RECOVERY_CODES.has(diagnostic?.code);
}

export function sanitizeDiagnosticDetails(value) {
  if (Array.isArray(value)) return value.map(sanitizeDiagnosticDetails);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !DIAGNOSTIC_HIDDEN_KEYS.has(key))
    .map(([key, entry]) => [key, sanitizeDiagnosticDetails(entry)]));
}

export function normalizeRuntimeDiagnostic(diagnostic, source = 'runtime') {
  const code = typeof diagnostic?.code === 'string' && diagnostic.code.trim()
    ? diagnostic.code
    : 'RUNTIME_DIAGNOSTIC';
  const message = typeof diagnostic?.message === 'string' && diagnostic.message.trim()
    ? diagnostic.message
    : 'Runtime 产生了一条诊断记录。';
  const severity = DIAGNOSTIC_SEVERITIES.has(diagnostic?.severity)
    ? diagnostic.severity
    : (diagnostic?.recoverable
      ? 'warning'
      : (source === 'runtime'
        ? (/(FAILED|ERROR|CRASH|EXITED|EXHAUSTED|INVALID)/.test(code) ? 'error' : 'info')
        : 'error'));
  return {
    code,
    message,
    stage: typeof diagnostic?.stage === 'string' ? diagnostic.stage : source,
    severity,
    recoverable: Boolean(diagnostic?.recoverable),
    ...(typeof diagnostic?.traceId === 'string' ? { traceId: diagnostic.traceId } : {}),
    details: sanitizeDiagnosticDetails(diagnostic?.details ?? {}),
    timestamp: typeof diagnostic?.timestamp === 'string' ? diagnostic.timestamp : new Date().toISOString(),
    source
  };
}

export function projectDiagnosticRecords({ runtime = [], settings = [], notifications = [] } = {}) {
  const diagnostics = [
    ...runtime.map((event) => normalizeRuntimeDiagnostic(event, event.source ?? 'runtime')),
    ...settings.map((event) => normalizeRuntimeDiagnostic(event, 'settings')),
    ...notifications.map((event) => normalizeRuntimeDiagnostic(event, event.stage ?? 'notification'))
  ].sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));

  return {
    diagnostics,
    summary: {
      total: diagnostics.length,
      errors: diagnostics.filter((event) => event.severity === 'error' || event.severity === 'fatal').length,
      warnings: diagnostics.filter((event) => event.severity === 'warning').length,
      recoverable: diagnostics.filter((event) => event.recoverable).length
    }
  };
}

export function projectCurrentRuntimeError({ connected, lastError, requestError, runtimeError } = {}) {
  const recoveryNotice = connected === true && isRuntimeRecoveryDiagnostic(lastError)
    ? { ...lastError }
    : null;
  return {
    currentError: recoveryNotice ? null : lastError || requestError || runtimeError || null,
    recoveryNotice
  };
}
