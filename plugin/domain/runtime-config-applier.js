import { EventEmitter } from 'node:events';

import { createRuntimeConfigUpdate } from './runtime-config.js';

function applierError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

export class RuntimeConfigApplier extends EventEmitter {
  constructor({ store, client } = {}) {
    super();
    if (!store || typeof store.getSnapshot !== 'function'
      || typeof store.markApplied !== 'function'
      || typeof store.markApplyFailed !== 'function') {
      throw applierError('RUNTIME_CONFIG_APPLIER_INVALID', 'Runtime config applier requires a compatible SettingsStore');
    }
    if (!client || typeof client.request !== 'function') {
      throw applierError('RUNTIME_CONFIG_APPLIER_INVALID', 'Runtime config applier requires a compatible Runtime client');
    }
    this.store = store;
    this.client = client;
  }

  async applyCurrent() {
    const snapshot = this.store.getSnapshot();
    const payload = createRuntimeConfigUpdate(snapshot);
    try {
      const response = await this.client.request('config.update', payload, { retryable: false });
      const result = response?.payload?.result;
      if (!result || result.applied !== true || result.revision !== snapshot.revision) {
        throw applierError('RUNTIME_CONFIG_ACK_INVALID', 'Runtime returned an invalid config.update ACK', {
          expectedRevision: snapshot.revision,
          result
        });
      }
      this.store.markApplied(snapshot.revision);
      return { applied: true, revision: snapshot.revision, result };
    } catch (error) {
      const current = this.store.getSnapshot();
      if (current.revision !== snapshot.revision) {
        throw applierError('SETTINGS_STORE_REVISION_STALE', 'Settings changed while Runtime config was applying', {
          expectedRevision: current.revision,
          revision: snapshot.revision,
          cause: error.code
        });
      }
      const normalized = {
        code: error.code ?? 'RUNTIME_CONFIG_APPLY_FAILED',
        message: error.message ?? 'Runtime config apply failed'
      };
      this.store.markApplyFailed(snapshot.revision, normalized);
      const diagnostic = {
        code: 'RUNTIME_CONFIG_APPLY_FAILED',
        message: normalized.message,
        details: { revision: snapshot.revision, cause: normalized.code },
        timestamp: new Date().toISOString()
      };
      this.emit('diagnostic', diagnostic);
      return { applied: false, revision: snapshot.revision, error: normalized };
    }
  }
}
