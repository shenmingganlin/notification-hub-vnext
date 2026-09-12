import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VISUAL_RUNTIME_MODES,
  createVisualRuntimeModeController,
  createVisualRuntimeMetrics,
  validateVisualRuntimeMetrics
} from '../../plugin/domain/visual-runtime-mode-contract.js';

test('visual runtime mode defaults to legacy and allows explicit shadow mode', () => {
  const controller = createVisualRuntimeModeController();
  assert.equal(controller.mode(), 'legacy');
  assert.deepEqual(VISUAL_RUNTIME_MODES, ['legacy', 'shadow', 'takeover']);
  assert.equal(controller.setMode('shadow').mode, 'shadow');
  assert.equal(controller.snapshot().rollback, null);
});

test('takeover requires explicit mode and records a safe rollback', () => {
  const controller = createVisualRuntimeModeController({ mode: 'shadow' });
  assert.equal(controller.setMode('takeover', { declaration: 'operator-approved' }).mode, 'takeover');
  const rollback = controller.rollback('NATIVE_SCENE_CREATE_FAILED', { declaration: 'automatic-safety-gate' });
  assert.equal(rollback.mode, 'legacy');
  assert.equal(rollback.rollback.code, 'NATIVE_SCENE_CREATE_FAILED');
  assert.equal(controller.snapshot().rollback.code, 'NATIVE_SCENE_CREATE_FAILED');
});

test('metrics are bounded, serializable and reject sensitive fields', () => {
  const metrics = createVisualRuntimeMetrics({
    legacyVisibleCount: 2,
    shadowVisibleCount: 2,
    nativeSceneCardCount: 2,
    shadowQueuedCount: 1,
    shadowSuppressedCount: 0,
    lifecycleMismatches: 0,
    channelIsolationPassed: true,
    soundPathHealthy: true,
    notificationStatusHealthy: true
  });
  assert.equal(validateVisualRuntimeMetrics(metrics), true);
  assert.ok(Object.isFrozen(metrics));
  assert.throws(() => createVisualRuntimeMetrics({ filePath: 'C:\\secret\\payload.json' }), (error) => error.code === 'VISUAL_RUNTIME_METRICS_INVALID');
});
