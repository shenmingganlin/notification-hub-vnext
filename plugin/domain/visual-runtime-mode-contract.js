export const VISUAL_RUNTIME_MODES = Object.freeze(['legacy', 'shadow', 'takeover']);
const METRIC_KEYS = Object.freeze(['legacyVisibleCount', 'shadowVisibleCount', 'nativeSceneCardCount', 'shadowQueuedCount', 'shadowSuppressedCount', 'lifecycleMismatches', 'channelIsolationPassed', 'soundPathHealthy', 'notificationStatusHealthy']);
function contractError(code, message, field) { return Object.assign(new Error(message), { code, details: field ? { field } : {} }); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function validateMode(mode) { if (!VISUAL_RUNTIME_MODES.includes(mode)) throw contractError('VISUAL_RUNTIME_MODE_INVALID', `Unsupported visual runtime mode: ${mode}`, 'mode'); return mode; }
export function createVisualRuntimeMetrics(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw contractError('VISUAL_RUNTIME_METRICS_INVALID', 'metrics must be an object');
  for (const key of Object.keys(input)) if (!METRIC_KEYS.includes(key)) throw contractError('VISUAL_RUNTIME_METRICS_INVALID', `Unsupported metric: ${key}`, key);
  const result = {};
  for (const key of METRIC_KEYS) {
    const value = input[key] ?? (key.endsWith('Passed') || key.endsWith('Healthy') ? false : 0);
    if (typeof value === 'boolean') result[key] = value;
    else if (Number.isInteger(value) && value >= 0 && value <= 1_000_000) result[key] = value;
    else throw contractError('VISUAL_RUNTIME_METRICS_INVALID', `Invalid metric: ${key}`, key);
  }
  return freeze(result);
}
export function validateVisualRuntimeMetrics(metrics) { createVisualRuntimeMetrics(metrics); return true; }
export function createVisualRuntimeModeController({ mode = 'legacy' } = {}) {
  validateMode(mode); let currentMode = mode; let rollback = null; let changedAt = new Date().toISOString();
  return {
    mode() { return currentMode; },
    setMode(nextMode, { declaration = null } = {}) { validateMode(nextMode); if (nextMode === 'takeover' && typeof declaration !== 'string' || nextMode === 'takeover' && !declaration.trim()) throw contractError('VISUAL_RUNTIME_TAKEOVER_DECLARATION_REQUIRED', 'takeover requires an explicit declaration', 'declaration'); currentMode = nextMode; rollback = null; changedAt = new Date().toISOString(); return this.snapshot(); },
    rollback(code, { declaration = null } = {}) { if (typeof code !== 'string' || !code.trim()) throw contractError('VISUAL_RUNTIME_ROLLBACK_INVALID', 'rollback code is required', 'code'); currentMode = 'legacy'; rollback = freeze({ code: code.trim(), declaration: typeof declaration === 'string' && declaration.trim() ? declaration.trim() : null, at: new Date().toISOString() }); changedAt = rollback.at; return this.snapshot(); },
    snapshot() { return freeze({ mode: currentMode, changedAt, rollback: rollback ? clone(rollback) : null }); }
  };
}
