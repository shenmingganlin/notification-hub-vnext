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
