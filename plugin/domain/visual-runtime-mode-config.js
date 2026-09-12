import { VISUAL_RUNTIME_MODES } from './visual-runtime-mode-contract.js';

export const VISUAL_RUNTIME_TAKEOVER_DECLARATION = 'operator-approved';

function valuesOf(config) {
  if (!config || typeof config !== 'object') return {};
  try { return config.getAll?.() ?? config.get?.() ?? config; } catch { return {}; }
}

export function resolveVisualRuntimeModeConfig(config) {
  const values = valuesOf(config);
  const hasExplicitMode = VISUAL_RUNTIME_MODES.includes(values.visualRuntimeMode);
  const shadowEnabled = values.visualRuntimeShadowEnabled === true;
  const requestedMode = hasExplicitMode ? values.visualRuntimeMode : (shadowEnabled ? 'shadow' : 'legacy');
  const takeoverEnabled = values.visualRuntimeTakeoverEnabled === true;
  const declaration = typeof values.visualRuntimeTakeoverDeclaration === 'string' ? values.visualRuntimeTakeoverDeclaration.trim() : '';
  if (requestedMode === 'takeover' && (!takeoverEnabled || declaration !== VISUAL_RUNTIME_TAKEOVER_DECLARATION)) {
    return Object.freeze({ requestedMode, mode: 'legacy', shadowEnabled, takeoverEnabled, declarationPresent: Boolean(declaration), allowed: false, reason: !takeoverEnabled ? 'takeover-disabled' : 'declaration-required' });
  }
  if (requestedMode === 'shadow' && !shadowEnabled) {
    return Object.freeze({ requestedMode, mode: 'legacy', shadowEnabled, takeoverEnabled, declarationPresent: Boolean(declaration), allowed: false, reason: 'shadow-disabled' });
  }
  return Object.freeze({ requestedMode, mode: requestedMode, shadowEnabled, takeoverEnabled, declarationPresent: Boolean(declaration), allowed: true, reason: null });
}
