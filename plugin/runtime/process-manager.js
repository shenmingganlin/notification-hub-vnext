import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';

import { validateRecoverySnapshot } from './recovery-snapshot.js';
import { selectRecoveryPlan } from './recovery-plan.js';
import { RecoveryReplayCoordinator } from './recovery-replay.js';

function processError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

export function sceneStateFingerprint(snapshot) {
  if (snapshot === null || typeof snapshot !== 'object') return null;
  try {
    return JSON.stringify(snapshot, (key, value) => (key === 'updatedAt' ? undefined : value));
  } catch {
    return null;
  }
}

export function sceneStateSyncDelayMs({ intervalMs, cardCount } = {}) {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return intervalMs;
  if (cardCount === 0 && intervalMs >= 500) return Math.max(intervalMs, 2000);
  return intervalMs;
}

export class RuntimeProcessManager extends EventEmitter {
  constructor({
    runtimePath,
    pipeName,
    runtimeArgs = [],
    restartRuntimeArgs,
    readyTimeoutMs = 3000,
    restartDelayMs = 25,
    stabilityWindowMs = 1000,
    maxRestartAttempts = 2,
    autoRestart = true,
    sceneStateSyncIntervalMs = 500,
    sceneState,
    recoverySnapshot,
    recoveryClient,
    sceneStatePersistence,
    clientVersion = 'notification-hub-host',
    spawnOptions = {},
    spawnProcess = spawn
  } = {}) {
    super();
    if (typeof runtimePath !== 'string' || runtimePath.length === 0) {
      throw processError('RUNTIME_PATH_INVALID', 'runtimePath must be a non-empty string');
    }
    if (typeof pipeName !== 'string' || pipeName.length === 0) {
      throw processError('TRANSPORT_PIPE_NAME_INVALID', 'pipeName must be a non-empty string');
    }
    if (!Array.isArray(runtimeArgs)) {
      throw processError('RUNTIME_ARGS_INVALID', 'runtimeArgs must be an array');
    }
    this.runtimePath = runtimePath;
    this.pipeName = pipeName;
    this.runtimeArgs = [...runtimeArgs];
    this.restartRuntimeArgs = restartRuntimeArgs === undefined ? [...runtimeArgs] : [...restartRuntimeArgs];
    this.readyTimeoutMs = readyTimeoutMs;
    this.restartDelayMs = restartDelayMs;
    this.stabilityWindowMs = stabilityWindowMs;
    this.maxRestartAttempts = maxRestartAttempts;
    this.autoRestart = autoRestart;
    if (!Number.isFinite(sceneStateSyncIntervalMs) || sceneStateSyncIntervalMs < 0) {
      throw processError(
        'RUNTIME_SCENE_STATE_SYNC_INTERVAL_INVALID',
        'sceneStateSyncIntervalMs must be a non-negative finite number'
      );
    }
    this.sceneStateSyncIntervalMs = sceneStateSyncIntervalMs;
    this.clientVersion = clientVersion;
    this.recoverySource = null;
    this.recoveryDiagnostics = [];
    if (sceneState !== undefined) {
      this.applyRecoveryPlan(selectRecoveryPlan({ sceneState, recoverySnapshot }));
    } else {
      this.recoverySnapshot = recoverySnapshot ? validateRecoverySnapshot(recoverySnapshot) : null;
      this.recoverySource = this.recoverySnapshot ? 'recovery-snapshot' : null;
    }
    this.recoveryClient = null;
    this.sceneStatePersistence = null;
    this.persistenceResponseHandler = null;
    this.persistenceEventHandler = null;
    this.persistenceDiagnosticHandler = null;
    this.persistenceDiagnosticSource = null;
    this.spawnOptions = { windowsHide: true, ...spawnOptions };
    this.spawnProcess = spawnProcess;
    if (sceneStatePersistence !== undefined) this.setSceneStatePersistence(sceneStatePersistence);
    if (recoveryClient !== undefined) this.setRecoveryClient(recoveryClient);
    this.child = null;
    this.startPromise = null;
    this.startGeneration = 0;
    this.restartTimer = null;
    this.stabilityTimer = null;
    this.sceneStateSyncTimer = null;
    this.sceneStateSyncInFlight = false;
    this.sceneStateSyncGeneration = 0;
    this.lastSceneStateFingerprint = null;
    this.lastSceneStateSyncAt = 0;
    this.lastObservedCardCount = 0;
    this.recoveryInProgress = false;
    this.recoveryAttempts = new Map();
    this.recoveryReplay = new RecoveryReplayCoordinator({
      snapshot: this.recoverySnapshot ?? { entries: [] },
      attempts: this.recoveryAttempts,
      diagnostics: this.recoveryDiagnostics
    });
    this.intentionalStop = false;
    this.restartAttempts = 0;
    this.state = 'stopped';
    this.stdout = '';
    this.stderr = '';
  }

  get running() {
    return this.child !== null && this.child.exitCode === null && !this.child.killed;
  }

  async start() {
    if (this.state === 'stopped' && this.running) return;
    if (this.startPromise) return this.startPromise;
    if (this.running) return;

    this.intentionalStop = false;
    this.startGeneration += 1;
    const generation = this.startGeneration;
    const isCurrentStart = () => generation === this.startGeneration && !this.intentionalStop;
    this.setState('starting', 'start-requested');
    this.startPromise = new Promise((resolve, reject) => {
      let child;
      try {
        child = this.spawnProcess(
          this.runtimePath,
          [
            '--pipe-server',
            this.pipeName,
            ...(this.restartAttempts === 0 ? this.runtimeArgs : this.restartRuntimeArgs)
          ],
          { ...this.spawnOptions, stdio: ['ignore', 'pipe', 'pipe'] }
        );
      } catch (error) {
        reject(processError('RUNTIME_START_FAILED', error.message));
        return;
      }
      this.child = child;
      this.stdout = '';
      this.stderr = '';
      let settled = false;
      const finish = (action, value) => {
        if (settled) return;
        settled = true;
        action(value);
      };
      const timer = setTimeout(() => {
        const error = isCurrentStart()
          ? processError('RUNTIME_READY_TIMEOUT', 'Runtime did not announce Named Pipe readiness', {
            stdout: this.stdout,
            stderr: this.stderr
          })
          : processError('RUNTIME_START_CANCELLED', 'Runtime start was cancelled');
        if (error.code !== 'RUNTIME_START_CANCELLED') {
          this.emitDiagnostic(error.code, error.message, error.details);
        }
        child.kill();
        finish(reject, error);
      }, this.readyTimeoutMs);

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        this.stdout += chunk;
        this.emit('stdout', chunk);
        if (!this.stdout.includes('named pipe ready:')) return;
        clearTimeout(timer);
        if (!isCurrentStart()) {
          child.kill();
          finish(reject, processError('RUNTIME_START_CANCELLED', 'Runtime start was cancelled'));
          return;
        }
        this.armStabilityWindow(child);
        this.setState('running', 'ready');
        finish(resolve);
      });
      child.stderr.on('data', (chunk) => {
        this.stderr += chunk;
        this.emit('stderr', chunk);
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        const wrapped = isCurrentStart()
          ? processError('RUNTIME_START_FAILED', error.message, { cause: error.code })
          : processError('RUNTIME_START_CANCELLED', 'Runtime start was cancelled', { cause: error.code });
        if (wrapped.code !== 'RUNTIME_START_CANCELLED') {
          this.emitDiagnostic(wrapped.code, wrapped.message, wrapped.details);
        }
        finish(reject, wrapped);
      });
      child.once('exit', (code, signal) => {
        clearTimeout(timer);
        if (this.child === child) this.child = null;
        if (!isCurrentStart()) {
          if (!settled) finish(reject, processError('RUNTIME_START_CANCELLED', 'Runtime start was cancelled', { code, signal }));
          return;
        }
        this.clearStabilityWindow();
        this.setState(this.intentionalStop ? 'stopped' : 'crashed', 'process-exit');
        this.emit('exit', { code, signal, intentional: this.intentionalStop });
        if (!settled) {
          finish(reject, processError('RUNTIME_EXITED_BEFORE_READY', 'Runtime exited before readiness', {
            code,
            signal,
            stderr: this.stderr
          }));
        }
        if (!this.intentionalStop && this.autoRestart) this.scheduleRestart();
      });
    }).finally(() => {
      this.startPromise = null;
    });

    return this.startPromise;
  }

  armStabilityWindow(child) {
    if (this.stabilityTimer) clearTimeout(this.stabilityTimer);
    this.stabilityTimer = setTimeout(() => {
      this.stabilityTimer = null;
      if (this.child === child && this.state === 'running' && !this.intentionalStop) {
        this.restartAttempts = 0;
      }
    }, this.stabilityWindowMs);
    this.stabilityTimer.unref?.();
  }

  clearStabilityWindow() {
    if (this.stabilityTimer) clearTimeout(this.stabilityTimer);
    this.stabilityTimer = null;
  }

  scheduleRestart() {
    this.clearStabilityWindow();
    if (this.restartTimer || this.intentionalStop || this.restartAttempts >= this.maxRestartAttempts) {
      if (this.restartAttempts >= this.maxRestartAttempts) {
        this.emitDiagnostic('RUNTIME_RESTART_EXHAUSTED', 'Runtime restart attempts exhausted', {
          maxRestartAttempts: this.maxRestartAttempts
        });
      }
      return;
    }
    this.restartAttempts += 1;
    const attempt = this.restartAttempts;
    this.emitDiagnostic('RUNTIME_RESTART_SCHEDULED', 'Runtime restart scheduled', {
      attempt,
      maxRestartAttempts: this.maxRestartAttempts
    });
    this.restartTimer = setTimeout(async () => {
      this.restartTimer = null;
      try {
        await this.start();
        await this.reconnectRuntimeClient();
        this.emit('restarted', { attempt });
      } catch (error) {
        this.emitDiagnostic(error.code ?? 'RUNTIME_START_FAILED', error.message, error.details);
      }
    }, this.restartDelayMs);
  }

  async reconnectRuntimeClient() {
    if (!this.recoveryClient?.request) return this.restoreRecoverySnapshot();

    // Reconnect even when there is no recovery entry so the host keeps ownership of the pipe.
    await this.recoveryClient.request('hello', { clientVersion: this.clientVersion }, {
      retryable: true,
      maxAttempts: 2
    });
    await this.restoreRecoverySnapshot(this.recoveryClient);
    return this.recoveryClient.request('health', {}, {
      retryable: true,
      maxAttempts: 2
    });
  }

  setRecoverySnapshot(snapshot) {
    this.recoverySnapshot = validateRecoverySnapshot(snapshot);
    this.recoverySource = 'recovery-snapshot';
    this.recoveryDiagnostics = [];
    this.recoveryReplay.setSnapshot(this.recoverySnapshot);
    this.recoveryReplay.diagnostics = this.recoveryDiagnostics;
    return this.recoverySnapshot;
  }

  setRecoveryState({ sceneState, recoverySnapshot } = {}) {
    const plan = selectRecoveryPlan({ sceneState, recoverySnapshot });
    this.applyRecoveryPlan(plan);
    return plan;
  }

  applyRecoveryPlan(plan) {
    if (!plan || typeof plan !== 'object' || !plan.snapshot) {
      throw processError('RUNTIME_RECOVERY_PLAN_INVALID', 'Recovery plan must include a snapshot');
    }
    this.recoverySnapshot = validateRecoverySnapshot(plan.snapshot);
    this.recoverySource = plan.source ?? 'recovery-snapshot';
    this.recoveryDiagnostics = Array.isArray(plan.diagnostics) ? [...plan.diagnostics] : [];
    this.recoveryReplay?.setSnapshot(this.recoverySnapshot);
    if (this.recoveryReplay) this.recoveryReplay.diagnostics = this.recoveryDiagnostics;
    for (const diagnostic of this.recoveryDiagnostics) {
      this.emitDiagnostic(diagnostic.code, diagnostic.message, diagnostic);
    }
    return this.recoverySnapshot;
  }

  setRecoveryClient(client) {
    if (this.recoveryClient && this.persistenceResponseHandler) {
      this.recoveryClient.off?.('response', this.persistenceResponseHandler);
    }
    if (this.recoveryClient && this.persistenceEventHandler) {
      this.recoveryClient.off?.('event', this.persistenceEventHandler);
    }
    this.recoveryClient = client;
    if (client?.on) {
      this.persistenceResponseHandler = (message) => this.observeSceneStateResponse(message);
      if (this.sceneStatePersistence) client.on('response', this.persistenceResponseHandler);
      this.persistenceEventHandler = (message) => this.observeSceneStateEvent(message);
      client.on('event', this.persistenceEventHandler);
    } else {
      this.persistenceResponseHandler = null;
      this.persistenceEventHandler = null;
    }
    return client;
  }

  setSceneStatePersistence(persistence) {
    if (persistence !== null
      && (typeof persistence.observe !== 'function' || typeof persistence.flush !== 'function')) {
      throw processError(
        'RUNTIME_SCENE_STATE_PERSISTENCE_INVALID',
        'SceneState persistence must expose observe() and flush()'
      );
    }
    if (this.persistenceDiagnosticSource && this.persistenceDiagnosticHandler) {
      this.persistenceDiagnosticSource.off?.('diagnostic', this.persistenceDiagnosticHandler);
    }
    this.sceneStatePersistence = persistence;
    this.persistenceDiagnosticSource = persistence?.on ? persistence : null;
    this.persistenceDiagnosticHandler = this.persistenceDiagnosticSource
      ? (diagnostic) => this.emit('diagnostic', diagnostic)
      : null;
    if (this.persistenceDiagnosticSource && this.persistenceDiagnosticHandler) {
      this.persistenceDiagnosticSource.on('diagnostic', this.persistenceDiagnosticHandler);
    }
    if (this.recoveryClient) this.setRecoveryClient(this.recoveryClient);
    return persistence;
  }

  observeSceneStateResponse(message) {
    if (this.recoveryInProgress) return null;
    if (this.sceneStateSyncInFlight && message?.payload?.requestType === 'health') return null;
    const snapshot = message?.payload?.result?.sceneStateSnapshot;
    if (!snapshot) {
      if (message?.type === 'ack' && message?.payload?.requestType === 'health') {
        this.emitDiagnostic(
          'RUNTIME_SCENE_STATE_RESPONSE_MISSING',
          'Runtime health response did not include a sceneStateSnapshot',
          { requestId: message.requestId, traceId: message.traceId }
        );
      }
      return null;
    }
    const updateRecovery = message?.payload?.requestType !== 'health';
    return this.observeSceneStateSnapshot(snapshot, { updateRecovery });
  }

  observeSceneStateEvent(message) {
    if (this.recoveryInProgress) return null;
    if (message?.type !== 'event') return null;
    if (message?.payload?.eventType !== 'scene.changed') {
      this.emitDiagnostic(
        'RUNTIME_SCENE_EVENT_IGNORED',
        'Ignored Runtime event with an unsupported event type',
        { eventType: message?.payload?.eventType, requestId: message.requestId }
      );
      return null;
    }
    const snapshot = message?.payload?.result?.sceneStateSnapshot;
    if (!snapshot) {
      this.emitDiagnostic(
        'RUNTIME_SCENE_EVENT_INVALID',
        'Runtime scene.changed event did not include a sceneStateSnapshot',
        { requestId: message.requestId, traceId: message.traceId }
      );
      return null;
    }
    const observed = this.observeSceneStateSnapshot(snapshot, { updateRecovery: true });
    if (observed) {
      this.emit('scene.changed', {
        source: 'event',
        requestId: message.requestId,
        traceId: message.traceId,
        snapshot: observed,
        change: message.payload.result.change ?? null
      });
      this.emitDiagnostic(
        'RUNTIME_SCENE_EVENT_ACCEPTED',
        'Runtime scene.changed event was accepted',
        {
          requestId: message.requestId,
          traceId: message.traceId,
          updatedAt: snapshot.updatedAt,
          cardCount: Array.isArray(snapshot.cards) ? snapshot.cards.length : null
        }
      );
    }
    return observed;
  }

  startSceneStateSync() {
    this.stopSceneStateSync();
    if (this.sceneStateSyncIntervalMs <= 0
      || !this.sceneStatePersistence
      || !this.recoveryClient?.request) {
      return false;
    }
    const generation = this.sceneStateSyncGeneration;

    const poll = async () => {
      if (generation !== this.sceneStateSyncGeneration
        || this.intentionalStop
        || this.state !== 'running'
        || this.sceneStateSyncInFlight) return;
      const now = Date.now();
      const delayMs = sceneStateSyncDelayMs({
        intervalMs: this.sceneStateSyncIntervalMs,
        cardCount: this.lastObservedCardCount
      });
      if (this.lastSceneStateSyncAt > 0 && now - this.lastSceneStateSyncAt < delayMs) return;
      this.sceneStateSyncInFlight = true;
      try {
        const response = await this.recoveryClient.request('health', {}, {
          retryable: true,
          maxAttempts: 2
        });
        if (generation !== this.sceneStateSyncGeneration || this.intentionalStop) return;
        const snapshot = response?.payload?.result?.sceneStateSnapshot;
        this.lastSceneStateSyncAt = Date.now();
        if (!snapshot) {
          this.emitDiagnostic(
            'RUNTIME_SCENE_STATE_SYNC_EMPTY',
            'Periodic Runtime health sync returned no sceneStateSnapshot',
            { requestId: response?.requestId, traceId: response?.traceId }
          );
          return;
        }
        this.lastObservedCardCount = Array.isArray(snapshot.cards) ? snapshot.cards.length : 0;
        const observed = this.observeSceneStateSnapshot(snapshot, { updateRecovery: true });
        if (observed) {
          this.emit('scene.changed', {
            source: 'health-sync',
            requestId: response.requestId,
            traceId: response.traceId,
            snapshot: observed
          });
          this.emitDiagnostic(
            'RUNTIME_SCENE_STATE_SYNC_ACCEPTED',
            'Periodic Runtime health snapshot was accepted',
            {
              requestId: response.requestId,
              traceId: response.traceId,
              updatedAt: snapshot.updatedAt,
              cardCount: Array.isArray(snapshot.cards) ? snapshot.cards.length : null
            }
          );
        }
      } catch (error) {
        if (!this.intentionalStop) {
          this.emitDiagnostic(
            error.code ?? 'RUNTIME_SCENE_STATE_SYNC_FAILED',
            error.message,
            { ...(error.details ?? {}), source: 'health-sync' }
          );
        }
      } finally {
        if (generation === this.sceneStateSyncGeneration) this.sceneStateSyncInFlight = false;
      }
    };

    this.sceneStateSyncTimer = setInterval(() => { void poll(); }, this.sceneStateSyncIntervalMs);
    this.sceneStateSyncTimer.unref?.();
    return true;
  }

  stopSceneStateSync() {
    this.sceneStateSyncGeneration += 1;
    if (this.sceneStateSyncTimer) clearInterval(this.sceneStateSyncTimer);
    this.sceneStateSyncTimer = null;
    this.sceneStateSyncInFlight = false;
  }

  observeSceneStateSnapshot(snapshot, { updateRecovery = false } = {}) {
    if (this.intentionalStop) return null;
    const fingerprint = sceneStateFingerprint(snapshot);
    if (fingerprint !== null && fingerprint === this.lastSceneStateFingerprint) return null;
    if (updateRecovery) {
      try {
        this.applyRecoveryPlan(selectRecoveryPlan({
          sceneState: snapshot,
          recoverySnapshot: this.recoverySnapshot
        }));
      } catch (error) {
        this.emitDiagnostic(
          error.code ?? 'RUNTIME_SCENE_STATE_SYNC_FAILED',
          error.message,
          error.details
        );
        return null;
      }
    }
    if (!this.sceneStatePersistence) {
      this.lastSceneStateFingerprint = fingerprint;
      return snapshot;
    }
    try {
      const observed = this.sceneStatePersistence.observe(snapshot);
      this.lastSceneStateFingerprint = fingerprint;
      return observed;
    } catch (error) {
      this.emitDiagnostic(
        error.code ?? 'RUNTIME_SCENE_STATE_PERSIST_FAILED',
        error.message,
        error.details
      );
      return null;
    }
  }

  async flushSceneStatePersistence() {
    if (!this.sceneStatePersistence) return null;
    try {
      return await this.sceneStatePersistence.flush();
    } catch (error) {
      if (typeof this.sceneStatePersistence.emit !== 'function') {
        this.emitDiagnostic(
          error.code ?? 'RUNTIME_SCENE_STATE_PERSIST_FAILED',
          error.message,
          error.details
        );
      }
      throw error;
    }
  }

  async restoreRecoverySnapshot(client = this.recoveryClient) {
    if (!this.recoverySnapshot || this.recoverySnapshot.entries.length === 0) return [];
    if (!client || typeof client.request !== 'function') {
      throw processError('RUNTIME_RECOVERY_CLIENT_MISSING', 'Recovery requires a PipeClient-compatible client');
    }

    const previousRecoveryState = this.recoveryInProgress;
    this.recoveryInProgress = true;
    try {
      return await this.recoveryReplay.replay(client, {
        onApplied: ({ key, type }) => this.emit('recovery-applied', { key, type }),
        onDiagnostic: (error) => this.emitDiagnostic(error.code, error.message, error.details),
        onSkipped: (details) => this.emit('recovery-skipped', details)
      });
    } finally {
      this.recoveryInProgress = previousRecoveryState;
    }
  }

  async restart() {
    await this.stop();
    this.clearStabilityWindow();
    this.restartAttempts = 0;
    await this.start();
    await this.restoreRecoverySnapshot();
    this.startSceneStateSync();
    this.emit('restarted', { attempt: 0, manual: true });
  }

  async stop() {
    this.intentionalStop = true;
    this.clearStabilityWindow();
    this.startGeneration += 1;
    this.stopSceneStateSync();
    let persistenceError = null;
    try {
      await this.flushSceneStatePersistence();
    } catch (error) {
      persistenceError = error;
    }
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const pendingStart = this.startPromise;
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null) {
      if (pendingStart) await Promise.allSettled([pendingStart]);
      this.setState('stopped', 'stop-requested');
      if (persistenceError) throw persistenceError;
      return;
    }
    this.setState('stopping', 'stop-requested');
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve();
      }, 500);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill();
    });
    this.setState('stopped', 'stopped');
    if (persistenceError) throw persistenceError;
  }

  setState(nextState, reason) {
    if (this.state === nextState) return;
    const previous = this.state;
    this.state = nextState;
    this.emit('state', { previous, state: nextState, reason, timestamp: new Date().toISOString() });
  }

  emitDiagnostic(code, message, details = {}) {
    this.emit('diagnostic', { code, message, details, timestamp: new Date().toISOString() });
  }
}

export { processError };
