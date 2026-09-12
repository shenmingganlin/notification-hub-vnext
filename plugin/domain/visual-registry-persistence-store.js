import { dirname, resolve } from 'node:path';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { VISUAL_REGISTRY_SNAPSHOT_VERSION } from './visual-registry-persistence.js';

function storeError(code, message, details = {}) { return Object.assign(new Error(message), { code, details }); }
function validatePath(filePath) { if (typeof filePath !== 'string' || !filePath.trim()) throw storeError('VISUAL_REGISTRY_PATH_INVALID', 'Visual registry filePath must be a non-empty string'); }
function validateSnapshot(snapshot) { if (!snapshot || snapshot.version !== VISUAL_REGISTRY_SNAPSHOT_VERSION || !Array.isArray(snapshot.profiles) || !Array.isArray(snapshot.bindings)) throw storeError('VISUAL_REGISTRY_SNAPSHOT_INVALID', 'Visual registry snapshot is invalid'); return snapshot; }
const queues = new Map();
function enqueue(filePath, task) { const key = resolve(filePath); const current = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(task); queues.set(key, current); return current.finally(() => { if (queues.get(key) === current) queues.delete(key); }); }
export async function saveVisualRegistrySnapshot(snapshot, filePath) {
  validatePath(filePath); validateSnapshot(snapshot); const serialized = `${JSON.stringify(snapshot)}\n`;
  return enqueue(filePath, async () => { const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`; const backupPath = `${filePath}.bak-${process.pid}-${Date.now()}-${randomUUID()}`; let backedUp = false; try { await mkdir(dirname(filePath), { recursive: true }); await writeFile(temporaryPath, serialized, { encoding: 'utf8', flag: 'wx' }); try { await rename(filePath, backupPath); backedUp = true; } catch (error) { if (error.code !== 'ENOENT') throw error; } try { await rename(temporaryPath, filePath); } catch (error) { if (backedUp) await rename(backupPath, filePath).catch(() => {}); throw error; } if (backedUp) await rm(backupPath, { force: true }); return filePath; } catch (cause) { await rm(temporaryPath, { force: true }).catch(() => {}); throw cause.code?.startsWith('VISUAL_REGISTRY_') ? cause : storeError('VISUAL_REGISTRY_PERSIST_FAILED', 'Failed to persist visual registry snapshot', { path: filePath, cause: cause.message }); } });
}
export async function loadVisualRegistrySnapshot(filePath) {
  validatePath(filePath); try { const value = JSON.parse(await readFile(filePath, 'utf8')); return validateSnapshot(value); } catch (cause) { if (cause.code === 'ENOENT') return null; if (cause.code?.startsWith('VISUAL_REGISTRY_')) throw cause; throw storeError('VISUAL_REGISTRY_LOAD_FAILED', 'Failed to load visual registry snapshot', { path: filePath, cause: cause.message }); } }
