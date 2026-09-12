const FORMAT = 'notification-hub-visual-package-import-diagnostics';
const VERSION = 1;
const REPORT_FIELDS = Object.freeze([
  'packageId', 'packageName', 'packageVersion', 'strategy', 'failed', 'rolledBack',
  'failedStage', 'rollbackReason', 'error', 'profiles', 'assets', 'bindings',
  'bindingCount', 'issues', 'issueSummary', 'visualRevision'
]);

function diagnosticError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (plain(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}
function text(value, field, fallback = '') {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string' || !value.trim()) throw diagnosticError('VISUAL_PACKAGE_DIAGNOSTIC_INVALID', `${field} must be a non-empty string`, { field });
  return value.trim();
}
function normalizeIssues(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((issue) => !plain(issue))) throw diagnosticError('VISUAL_PACKAGE_DIAGNOSTIC_INVALID', 'issues must be an array of objects', { field: 'issues' });
  return value.map((issue) => clone(issue));
}

export const VISUAL_PACKAGE_DIAGNOSTIC_FORMAT = FORMAT;
export const VISUAL_PACKAGE_DIAGNOSTIC_VERSION = VERSION;

export function createVisualPackageDiagnosticReport({ report, exportedAt = new Date().toISOString() } = {}) {
  if (!plain(report)) throw diagnosticError('VISUAL_PACKAGE_DIAGNOSTIC_INVALID', 'import report is required', { field: 'report' });
  if (typeof exportedAt !== 'string' || Number.isNaN(Date.parse(exportedAt))) throw diagnosticError('VISUAL_PACKAGE_DIAGNOSTIC_INVALID', 'exportedAt must be an ISO date-time', { field: 'exportedAt' });

  const result = { format: FORMAT, version: VERSION, exportedAt };
  for (const field of REPORT_FIELDS) {
    if (report[field] !== undefined) result[field] = clone(report[field]);
  }
  result.packageId = text(report.packageId, 'packageId', 'unknown');
  result.packageName = text(report.packageName, 'packageName', result.packageId);
  result.packageVersion = text(report.version, 'version', 'unknown');
  result.strategy = text(report.strategy, 'strategy', 'unknown');
  result.issues = normalizeIssues(report.issues);
  result.issueSummary = plain(report.issueSummary) ? clone(report.issueSummary) : { total: result.issues.length, warnings: 0, errors: result.issues.length };
  return result;
}

export function serializeVisualPackageDiagnosticReport(input = {}) {
  return `${JSON.stringify(createVisualPackageDiagnosticReport(input), null, 2)}\n`;
}

export function getVisualPackageDiagnosticFields() {
  return [...REPORT_FIELDS];
}
