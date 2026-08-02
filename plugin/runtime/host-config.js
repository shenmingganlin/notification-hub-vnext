import crypto from 'node:crypto';
import path from 'node:path';

import { RuntimeHostAdapter } from './host-adapter.js';

export const VNEXT_RUNTIME_DEFAULTS = Object.freeze({
  runtimeRelativePath: path.join('runtime', 'notification-hub-runtime.exe'),
  pipePrefix: 'notification-hub-vnext'
});

function hostConfigError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function readConfig(config) {
  try {
    if (config?.getAll) return config.getAll() || {};
    if (config?.get) return config.get() || {};
  } catch (error) {
    throw hostConfigError(
      'RUNTIME_HOST_CONFIG_READ_FAILED',
      'Failed to read Notification Hub vNext runtime configuration',
      { cause: error.message }
    );
  }
  return config && typeof config === 'object' ? config : {};
}

function requirePluginDir(context) {
  if (typeof context?.pluginDir !== 'string' || context.pluginDir.trim().length === 0) {
    throw hostConfigError(
      'RUNTIME_HOST_PLUGIN_DIR_INVALID',
      'A non-empty pluginDir is required to locate the bundled Native Runtime'
    );
  }
  return context.pluginDir;
}

export function createIsolatedPipeName({ processId = process.pid, randomBytes = crypto.randomBytes } = {}) {
  if (!Number.isInteger(processId) || processId < 0) {
    throw hostConfigError('TRANSPORT_PIPE_PROCESS_ID_INVALID', 'processId must be a non-negative integer');
  }
  const nonce = randomBytes(6).toString('hex');
  return `\\\\.\\pipe\\${VNEXT_RUNTIME_DEFAULTS.pipePrefix}-${processId}-${nonce}`;
}

export function resolveRuntimeHostOptions(context, {
  runtimePath,
  pipeName,
  runtimeOptions = {},
  clientOptions = {},
  persistenceOptions,
  randomBytes
} = {}) {
  const config = readConfig(context?.config);
  const pluginDir = requirePluginDir(context);
  const configuredRuntimePath = runtimePath
    ?? config.runtimePath
    ?? VNEXT_RUNTIME_DEFAULTS.runtimeRelativePath;
  if (typeof configuredRuntimePath !== 'string' || configuredRuntimePath.length === 0) {
    throw hostConfigError('RUNTIME_PATH_INVALID', 'runtimePath must be a non-empty string');
  }
  const resolvedRuntimePath = path.isAbsolute(configuredRuntimePath)
    ? path.normalize(configuredRuntimePath)
    : path.resolve(pluginDir, configuredRuntimePath);
  const resolvedPipeName = pipeName
    ?? config.runtimePipeName
    ?? createIsolatedPipeName({ randomBytes });
  if (typeof resolvedPipeName !== 'string' || resolvedPipeName.length === 0) {
    throw hostConfigError('TRANSPORT_PIPE_NAME_INVALID', 'pipeName must be a non-empty string');
  }
  return {
    context,
    runtimePath: resolvedRuntimePath,
    pipeName: resolvedPipeName,
    runtimeOptions: { autoRestart: true, ...runtimeOptions },
    clientOptions,
    persistenceOptions
  };
}

export function createRuntimeHostAdapter(context, options = {}) {
  return new RuntimeHostAdapter(resolveRuntimeHostOptions(context, options));
}
