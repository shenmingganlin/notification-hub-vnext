import { readFile } from 'node:fs/promises';

import {
  createRecoverySnapshot,
  parseRecoverySnapshot,
  validateRecoverySnapshot
} from './recovery-snapshot.js';
import { parseSceneState } from './scene-state.js';
import { sceneStateToRecoveryEntries } from './scene-state-recovery.js';

function recoveryPlanError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function fallbackDiagnostic(attempt) {
  return {
    code: 'RUNTIME_SCENE_STATE_RECOVERY_FALLBACK',
    source: attempt.source,
    kind: attempt.kind,
    cause: attempt.cause ?? 'UNKNOWN',
    message: attempt.message ?? 'Recovery source was unavailable or invalid'
  };
}

function trySceneState(sceneState, attempts) {
  if (sceneState === undefined || sceneState === null) return null;
  try {
    const parsed = typeof sceneState === 'string' ? parseSceneState(sceneState) : sceneState;
    return createRecoverySnapshot({ entries: sceneStateToRecoveryEntries(parsed) });
  } catch (error) {
    attempts.push({ source: 'scene-state', kind: 'invalid', cause: error.code, message: error.message });
    return null;
  }
}

function tryLegacySnapshot(recoverySnapshot, attempts) {
  if (recoverySnapshot === undefined || recoverySnapshot === null) return null;
  try {
    return validateRecoverySnapshot(recoverySnapshot);
  } catch (error) {
    attempts.push({ source: 'recovery-snapshot', kind: 'invalid', cause: error.code, message: error.message });
    return null;
  }
}

export function selectRecoveryPlan({ sceneState, recoverySnapshot } = {}) {
  const attempts = [];
  const scenePlan = trySceneState(sceneState, attempts);
  if (scenePlan) {
    return { source: 'scene-state', snapshot: scenePlan, diagnostics: [] };
  }

  const legacyPlan = tryLegacySnapshot(recoverySnapshot, attempts);
  if (legacyPlan) {
    return {
      source: 'recovery-snapshot',
      snapshot: legacyPlan,
      diagnostics: attempts.map(fallbackDiagnostic)
    };
  }

  throw recoveryPlanError(
    'RUNTIME_RECOVERY_NO_VALID_SOURCE',
    'No valid SceneState or recovery snapshot is available',
    { attempts }
  );
}

async function readSource(filePath, parser, source, attempts) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) return null;
  try {
    return parser(await readFile(filePath, 'utf8'));
  } catch (error) {
    const kind = error.code === 'ENOENT' ? 'missing' : 'invalid';
    attempts.push({ source, kind, cause: error.code, message: error.message, path: filePath });
    return null;
  }
}

export async function loadRecoveryPlan({ sceneStatePath, recoverySnapshotPath, allowEmpty = false } = {}) {
  const attempts = [];
  const sceneState = await readSource(sceneStatePath, parseSceneState, 'scene-state', attempts);
  const scenePlan = trySceneState(sceneState, attempts);
  if (scenePlan) {
    return { source: 'scene-state', snapshot: scenePlan, diagnostics: [] };
  }

  const recoverySnapshot = await readSource(
    recoverySnapshotPath,
    parseRecoverySnapshot,
    'recovery-snapshot',
    attempts
  );
  const legacyPlan = tryLegacySnapshot(recoverySnapshot, attempts);
  if (legacyPlan) {
    return {
      source: 'recovery-snapshot',
      snapshot: legacyPlan,
      diagnostics: attempts.map(fallbackDiagnostic)
    };
  }

  if (allowEmpty && (attempts.length === 0 || attempts.every((attempt) => attempt.kind === 'missing' || attempt.kind === 'invalid'))) {
    return {
      source: 'empty',
      snapshot: createRecoverySnapshot(),
      diagnostics: [{
        code: 'RUNTIME_RECOVERY_EMPTY_INITIAL_STATE',
        message: 'No persisted recovery source is available; starting with an empty SceneState',
        attempts
      }]
    };
  }

  throw recoveryPlanError(
    'RUNTIME_RECOVERY_NO_VALID_SOURCE',
    'No valid SceneState or recovery snapshot file is available',
    { attempts }
  );
}
