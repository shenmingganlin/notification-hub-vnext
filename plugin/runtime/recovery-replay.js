function replayError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

function isDefinitivelyUnrecoverableRecoveryError(error) {
  const code = error?.code;
  return typeof code === 'string' && (
    code.startsWith('RUNTIME_RECOVERY_INVALID_')
    || code === 'RUNTIME_RECOVERY_TYPE_UNSUPPORTED'
    || code === 'RUNTIME_RECOVERY_KEY_INVALID'
    || code === 'PROTOCOL_UNKNOWN_TYPE'
    || code === 'PROTOCOL_INVALID_PAYLOAD'
    || code === 'RUNTIME_SCENE_STATE_INVALID'
    || code === 'RUNTIME_SCENE_CARD_INVALID'
  );
}

export class RecoveryReplayCoordinator {
  constructor({ snapshot, attempts = new Map(), diagnostics = [] } = {}) {
    if (!snapshot || !Array.isArray(snapshot.entries)) {
      throw replayError('RUNTIME_RECOVERY_REPLAY_INVALID', 'Recovery replay requires a valid snapshot');
    }
    if (!(attempts instanceof Map) || !Array.isArray(diagnostics)) {
      throw replayError('RUNTIME_RECOVERY_REPLAY_INVALID', 'Recovery replay state must use a Map and diagnostics array');
    }
    this.snapshot = snapshot;
    this.attempts = attempts;
    this.diagnostics = diagnostics;
  }

  setSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.entries)) {
      throw replayError('RUNTIME_RECOVERY_REPLAY_INVALID', 'Recovery replay requires a valid snapshot');
    }
    this.snapshot = snapshot;
    return snapshot;
  }

  async replay(client, { onApplied, onSkipped, onDiagnostic } = {}) {
    if (!client || typeof client.request !== 'function') {
      throw replayError('RUNTIME_RECOVERY_CLIENT_MISSING', 'Recovery requires a PipeClient-compatible client');
    }

    const results = [];
    for (const entry of [...this.snapshot.entries]) {
      try {
        const response = await client.request(entry.type, entry.payload, {
          retryable: true,
          maxAttempts: 2,
          idempotencyKey: `recovery:${this.snapshot.updatedAt}:${entry.key}`
        });
        const result = { key: entry.key, type: entry.type, response };
        results.push(result);
        onApplied?.(result);
      } catch (error) {
        const attempt = (this.attempts.get(entry.key) ?? 0) + 1;
        this.attempts.set(entry.key, attempt);
        const unrecoverable = isDefinitivelyUnrecoverableRecoveryError(error);
        const wrapped = replayError(
          'RUNTIME_RECOVERY_ENTRY_SKIPPED',
          `Recovery entry skipped: ${entry.key}`,
          {
            key: entry.key,
            type: entry.type,
            attempt,
            status: unrecoverable ? 'removed' : 'retained',
            cause: error.code,
            message: error.message,
            lastError: { code: error.code, message: error.message }
          }
        );
        const diagnostic = {
          code: wrapped.code,
          message: wrapped.message,
          ...wrapped.details
        };
        this.diagnostics.push(diagnostic);
        if (unrecoverable) {
          const failedIndex = this.snapshot.entries.findIndex((candidate) => candidate.key === entry.key);
          if (failedIndex >= 0) this.snapshot.entries.splice(failedIndex, 1);
        }
        onDiagnostic?.(wrapped);
        const skipped = { key: entry.key, type: entry.type, skipped: true, error: wrapped };
        results.push(skipped);
        onSkipped?.(wrapped.details);
      }
    }
    return results;
  }
}

export { isDefinitivelyUnrecoverableRecoveryError };
