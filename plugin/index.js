/**
 * Notification Hub vNext plugin entry point.
 *
 * Phase 2 exposes transport-independent protocol and diagnostic contracts.
 * Named Pipe I/O and native runtime integration remain separate layers.
 */

export const pluginVersion = '0.1.0-alpha.1';
export const pluginName = 'notification-hub-vnext';

export * from './protocol/index.js';
export * from './diagnostics/index.js';
export * from './diagnostics/error-codes.js';
export * from './runtime/pipe-client.js';
export * from './runtime/process-manager.js';
export * from './runtime/recovery-snapshot.js';
export * from './runtime/scene-state.js';
export * from './runtime/scene-state-recovery.js';
export * from './runtime/recovery-plan.js';
export * from './runtime/scene-state-store.js';
export * from './runtime/scene-state-persistence.js';
export * from './runtime/scene-state-config.js';
export * from './runtime/host-adapter.js';
