import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveVisualRuntimeModeConfig, VISUAL_RUNTIME_TAKEOVER_DECLARATION } from '../../plugin/domain/visual-runtime-mode-config.js';

test('visual runtime config defaults to legacy and refuses takeover without both gates', () => {
  assert.equal(resolveVisualRuntimeModeConfig({}).mode, 'legacy');
  assert.equal(resolveVisualRuntimeModeConfig({ visualRuntimeMode: 'takeover', visualRuntimeTakeoverEnabled: true }).reason, 'declaration-required');
  assert.equal(resolveVisualRuntimeModeConfig({ visualRuntimeMode: 'takeover', visualRuntimeTakeoverDeclaration: VISUAL_RUNTIME_TAKEOVER_DECLARATION }).reason, 'takeover-disabled');
});

test('visual runtime config allows only explicitly enabled shadow and takeover', () => {
  assert.equal(resolveVisualRuntimeModeConfig({ visualRuntimeMode: 'shadow' }).mode, 'legacy');
  assert.equal(resolveVisualRuntimeModeConfig({ visualRuntimeMode: 'shadow', visualRuntimeShadowEnabled: true }).mode, 'shadow');
  assert.equal(resolveVisualRuntimeModeConfig({ visualRuntimeMode: 'takeover', visualRuntimeTakeoverEnabled: true, visualRuntimeTakeoverDeclaration: VISUAL_RUNTIME_TAKEOVER_DECLARATION }).mode, 'takeover');
});

test('visual runtime config exposes only bounded diagnostic facts', () => {
  const result = resolveVisualRuntimeModeConfig({ visualRuntimeMode: 'takeover', visualRuntimeTakeoverEnabled: true, visualRuntimeTakeoverDeclaration: 'wrong' });
  assert.equal(result.declarationPresent, true);
  assert.equal('visualRuntimeTakeoverDeclaration' in result, false);
});
