export const VISUAL_PACKAGE_FORMAT = 'notification-hub-visual-package';
export const VISUAL_PACKAGE_CAPABILITIES = Object.freeze([
  'behavior', 'card-type', 'properties', 'skin', 'effect', 'channel', 'profile', 'event-binding', 'asset'
]);

const ROOT_FIELDS = Object.freeze(['format', 'packageId', 'packageName', 'version', 'runtimeMinVersion', 'createdAt', 'capabilities', 'entries']);
const ENTRY_ROOTS = Object.freeze(['settings/', 'behaviors/', 'card-types/', 'properties/', 'skins/', 'effects/', 'assets/', 'preview/']);
const JSON_ROOTS = Object.freeze(['settings/', 'behaviors/', 'card-types/', 'properties/', 'skins/', 'effects/']);
const IMAGE_EXTENSIONS = Object.freeze(['.png', '.webp', '.jpg', '.jpeg']);
const EXECUTABLE_EXTENSIONS = /\.(?:js|mjs|cjs|node|dll|exe|bat|cmd|ps1|psm1|com|scr|vbs|wsf)$/i;
const SHELL_MARKERS = /(?:^|[;&|<>`$])\s*(?:powershell|pwsh|cmd(?:\.exe)?|bash|sh)\b/i;

function packageError(code, message, field) { return Object.assign(new Error(message), { code, details: field ? { field } : {} }); }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function text(field, value) { if (typeof value !== 'string' || !value.trim()) throw packageError('VISUAL_PACKAGE_FIELD_INVALID', `${field} must be a non-empty string`, field); return value.trim(); }
function version(field, value) { const result = text(field, value); if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(result)) throw packageError('VISUAL_PACKAGE_VERSION_INVALID', `${field} must use semantic version syntax`, field); return result; }
function normalizeEntry(entry) {
  if (typeof entry !== 'string' || !entry.trim()) return null;
  const value = entry.trim().replaceAll('\\', '/');
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value) || value.includes('..') || value.includes('\0') || SHELL_MARKERS.test(value) || EXECUTABLE_EXTENSIONS.test(value)) return null;
  if (value !== 'manifest.json' && !ENTRY_ROOTS.some((root) => value.startsWith(root))) return null;
  if (value.endsWith('/') || value.includes('//')) return null;
  if (value !== 'manifest.json') {
    const root = ENTRY_ROOTS.find((candidate) => value.startsWith(candidate));
    const allowed = JSON_ROOTS.includes(root) || root === 'preview/' || root === 'assets/';
    const extension = value.slice(value.lastIndexOf('.')).toLowerCase();
    if (!allowed || (root === 'preview/' && !IMAGE_EXTENSIONS.includes(extension)) || (root === 'assets/' && !IMAGE_EXTENSIONS.includes(extension)) || (JSON_ROOTS.includes(root) && extension !== '.json')) return null;
  }
  return value;
}

export function validateVisualPackageEntries(entries = []) {
  if (!Array.isArray(entries)) return { valid: false, invalidEntries: [], errors: [{ code: 'VISUAL_PACKAGE_INVALID_ENTRY', message: 'entries must be an array' }] };
  const invalidEntries = [];
  const errors = [];
  for (const entry of entries) {
    if (!normalizeEntry(entry)) {
      invalidEntries.push(entry);
      errors.push({ code: 'VISUAL_PACKAGE_INVALID_ENTRY', message: 'Package entry is not an allowed declaration-only file', entry });
    }
  }
  if (!entries.includes('manifest.json')) {
    invalidEntries.push('manifest.json');
    errors.push({ code: 'VISUAL_PACKAGE_INVALID_ENTRY', message: 'manifest.json is required', entry: 'manifest.json' });
  }
  return { valid: invalidEntries.length === 0, invalidEntries, errors };
}

export function createVisualPackageManifest(input = {}) {
  if (!plain(input)) throw packageError('VISUAL_PACKAGE_INVALID_MANIFEST', 'manifest must be a plain object', 'manifest');
  for (const key of Object.keys(input)) if (!ROOT_FIELDS.includes(key)) throw packageError('VISUAL_PACKAGE_INVALID_MANIFEST', `Unknown manifest field: ${key}`, key);
  if ('format' in input && input.format !== VISUAL_PACKAGE_FORMAT) throw packageError('VISUAL_PACKAGE_FORMAT_UNSUPPORTED', `Unsupported package format: ${input.format}`, 'format');
  const packageId = text('packageId', input.packageId);
  if (!/^[a-z0-9][a-z0-9._-]{1,79}$/i.test(packageId)) throw packageError('VISUAL_PACKAGE_ID_INVALID', 'packageId contains unsupported characters', 'packageId');
  const entries = Array.isArray(input.entries) ? [...new Set(input.entries.map((entry) => typeof entry === 'string' ? entry.trim().replaceAll('\\', '/') : entry))] : ['manifest.json'];
  const report = validateVisualPackageEntries(entries);
  if (!report.valid) throw packageError('VISUAL_PACKAGE_INVALID_ENTRY', 'manifest contains unsupported package entries', 'entries');
  const capabilities = input.capabilities ?? [];
  if (!Array.isArray(capabilities) || capabilities.some((value) => !VISUAL_PACKAGE_CAPABILITIES.includes(value))) throw packageError('VISUAL_PACKAGE_CAPABILITY_INVALID', 'manifest contains unsupported capabilities', 'capabilities');
  return freeze({
    format: VISUAL_PACKAGE_FORMAT,
    packageId,
    packageName: text('packageName', input.packageName),
    version: version('version', input.version),
    runtimeMinVersion: version('runtimeMinVersion', input.runtimeMinVersion ?? '0.1.0'),
    ...(input.createdAt === undefined ? {} : { createdAt: text('createdAt', input.createdAt) }),
    capabilities: [...new Set(capabilities)],
    entries
  });
}
