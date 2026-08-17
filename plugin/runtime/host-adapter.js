import { EventEmitter } from 'node:events';
import path from 'node:path';

import { PipeClient } from './pipe-client.js';
import { loadRecoveryPlan } from './recovery-plan.js';
import { RuntimeProcessManager } from './process-manager.js';
import { createSceneStatePersistenceFromHostContext } from './scene-state-config.js';

function hostError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

const LIFECYCLE_MESSAGES = Object.freeze({
  starting: 'Runtime 正在启动',
  running: 'Runtime 正常运行',
  reconnecting: 'Runtime 正在重连',
  stopping: 'Runtime 正在停止',
  stopped: 'Runtime 已停止',
  crashed: 'Runtime 异常退出',
  'stop-failed': 'Runtime 停止失败',
  failed: 'Runtime 启动或恢复失败'
});

function errorRecord(error, stage, timestamp = new Date().toISOString()) {
  const code = error?.code ?? 'RUNTIME_HOST_ERROR';
  const intentional = code === 'RUNTIME_CLIENT_CLOSED'
    || code === 'RUNTIME_STOP_REQUESTED'
    || code === 'TRANSPORT_CLIENT_CLOSED';
  const transport = typeof code === 'string' && code.startsWith('TRANSPORT_');
  const crashed = code === 'RUNTIME_EXITED' || code === 'RUNTIME_RESTART_EXHAUSTED';
  const reason = intentional
    ? 'intentional-stop'
    : (crashed ? 'runtime-exited' : (transport ? 'transport-disconnected' : 'runtime-error'));
  return {
    code,
    message: error?.message ?? String(error),
    stage,
    timestamp,
    category: intentional ? 'intentional-stop' : (crashed ? 'runtime-crash' : (transport ? 'transport' : 'runtime')),
    reason,
    recoverable: !intentional,
    userAction: intentional ? 'none' : (transport || crashed ? 'retry' : 'inspect'),
    notifyUser: !intentional,
    details: { ...(error?.details ?? {}) }
  };
}

function isDiagnosticError(code) {
  return typeof code === 'string' && (
    code.startsWith('TRANSPORT_')
    || /(?:FAILED|ERROR|EXITED|DISCONNECTED|EXHAUSTED|TIMEOUT|INVALID|MISSING|ROLLBACK)/.test(code)
  );
}

export class RuntimeHostAdapter extends EventEmitter {
  constructor({
    context,
    runtimePath,
    pipeName,
    runtimeArgs = [],
    restartRuntimeArgs,
    recoverySnapshotPath,
    sceneStatePersistence,
    persistenceOptions,
    runtimeOptions = {},
    clientOptions = {},
    managerFactory = (options) => new RuntimeProcessManager(options),
    clientFactory = (options) => new PipeClient(options),
    loadPlan = loadRecoveryPlan
  } = {}) {
    super();
    if (typeof runtimePath !== 'string' || runtimePath.length === 0) {
      throw hostError('RUNTIME_PATH_INVALID', 'runtimePath must be a non-empty string');
    }
    if (typeof pipeName !== 'string' || pipeName.length === 0) {
      throw hostError('TRANSPORT_PIPE_NAME_INVALID', 'pipeName must be a non-empty string');
    }
    if (!context || typeof context !== 'object') {
      throw hostError('RUNTIME_HOST_CONTEXT_INVALID', 'Runtime host context must be an object');
    }
    this.context = context;
    this.runtimePath = runtimePath;
    this.pipeName = pipeName;
    this.runtimeArgs = [...runtimeArgs];
    this.restartRuntimeArgs = restartRuntimeArgs;
    this.recoverySnapshotPath = recoverySnapshotPath
      ?? path.resolve(context.dataDir ?? '.', 'recovery.json');
    this.sceneStatePersistence = sceneStatePersistence
      ?? createSceneStatePersistenceFromHostContext(context, persistenceOptions);
    this.runtimeOptions = { ...runtimeOptions };
    this.clientOptions = { ...clientOptions };
    this.managerFactory = managerFactory;
    this.clientFactory = clientFactory;
    this.loadPlan = loadPlan;
    this.manager = null;
    this.client = null;
    this.state = 'stopped';
    this.lastError = null;
    this.startPromise = null;
    this.lifecycleGeneration = 0;
    this.runtimeRestartInProgress = false;
  }

  getRuntimeStatus() {
    return {
      state: this.state,
      message: LIFECYCLE_MESSAGES[this.state] ?? 'Runtime 状态未知',
      lastError: this.lastError ? { ...this.lastError } : null,
      connected: this.client?.connected === true,
      clientState: this.client?.state ?? null
    };
  }

  setLastError(error, stage, timestamp) {
    this.lastError = errorRecord(error, stage, timestamp);
    return this.lastError;
  }

  handleForwardedEvent(event, payload, sourceName) {
    if (event === 'state') {
      if (sourceName === 'client' && payload?.state === 'connected') {
        if (this.state === 'reconnecting' && !this.runtimeRestartInProgress && this.state !== 'stopping') this.setState('running');
        return;
      }
      if (payload?.state === 'crashed') {
        this.setState('crashed');
        this.setLastError(
          { code: 'RUNTIME_EXITED', message: 'Runtime 异常退出' },
          'runtime-process',
          payload.timestamp
        );
      } else if (payload?.state === 'stopping') {
        this.setState('stopping');
      } else if (payload?.state === 'reconnecting') {
        this.setState('reconnecting');
      } else if (payload?.state === 'running' && this.state !== 'stopping'
        && this.state !== 'starting' && this.state !== 'reconnecting') {
        this.setState('running');
      }
      return;
    }
    if (event === 'exit' && payload?.intentional !== true && this.state !== 'stopping') {
      this.setState('crashed');
      this.setLastError(
        {
          code: 'RUNTIME_EXITED',
          message: 'Runtime 异常退出',
          details: {
            exitCode: payload?.code ?? null,
            signal: payload?.signal ?? null,
            intentional: payload?.intentional === true
          }
        },
        'runtime-process'
      );
      return;
    }
    if (event === 'diagnostic') {
      const code = payload?.code;
      if (code === 'RUNTIME_RESTART_SCHEDULED') this.runtimeRestartInProgress = true;
      if (code === 'RUNTIME_RESTART_SCHEDULED'
        || code === 'TRANSPORT_RECONNECT_RETRY'
        || (typeof code === 'string' && code.startsWith('TRANSPORT_') && code !== 'TRANSPORT_CLIENT_CLOSED')) {
        this.setState('reconnecting');
      }
      if (isDiagnosticError(code)) {
        this.setLastError(payload, sourceName === 'client' ? 'transport' : 'runtime', payload.timestamp);
      }
      if (code === 'RUNTIME_RESTART_EXHAUSTED') this.setState('crashed');
      return;
    }
    if (event === 'restarted' && this.state !== 'stopping') {
      this.runtimeRestartInProgress = false;
      this.setState('running');
    }
  }

  async start() {
    if (this.state === 'running') return this;
    if (this.startPromise) return this.startPromise;
    const generation = ++this.lifecycleGeneration;
    this.startPromise = this.startInternal(generation).finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  async startInternal(generation) {
    const isCurrentStart = () => generation === this.lifecycleGeneration && this.state !== 'stopping';
    const assertCurrentStart = () => {
      if (!isCurrentStart()) {
        throw hostError('RUNTIME_HOST_START_CANCELLED', 'Runtime host start was cancelled');
      }
    };
    this.setState('starting');
    let plan;
    try {
      plan = await this.loadPlan({
        sceneStatePath: this.sceneStatePersistence?.filePath,
        recoverySnapshotPath: this.recoverySnapshotPath,
        allowEmpty: true
      });
      assertCurrentStart();
      this.emitPlanDiagnostics(plan);

      const client = this.clientFactory({
        ...this.clientOptions,
        pipeName: this.pipeName
      });
      const manager = this.managerFactory({
        ...this.runtimeOptions,
        runtimePath: this.runtimePath,
        pipeName: this.pipeName,
        runtimeArgs: this.runtimeArgs,
        ...(this.restartRuntimeArgs === undefined ? {} : { restartRuntimeArgs: this.restartRuntimeArgs }),
        sceneStatePersistence: this.sceneStatePersistence,
        recoverySnapshot: plan.snapshot,
        recoveryClient: client
      });
      this.client = client;
      this.manager = manager;
      this.forwardEvents(manager, 'manager');
      this.forwardEvents(client, 'client');

      await manager.start();
      assertCurrentStart();
      const hello = await client.request('hello', { clientVersion: 'notification-hub-host' });
      assertCurrentStart();
      this.emit('hello', hello);
      await manager.restoreRecoverySnapshot(client);
      assertCurrentStart();
      const health = await client.request('health');
      assertCurrentStart();
      this.emit('health', health);
      manager.startSceneStateSync?.();
      this.setState('running');
      this.emit('started', { source: plan.source, health });
      return this;
    } catch (error) {
      if (error.code !== 'RUNTIME_HOST_START_CANCELLED') {
        this.setState('failed');
        this.setLastError(error, 'host-start');
      }
      await this.cleanupAfterStartFailure();
      if (error.code !== 'RUNTIME_HOST_START_CANCELLED') {
        this.setState('failed');
        this.setLastError(error, 'host-start');
      }
      throw error;
    }
  }

  async stop() {
    if (this.state === 'stopped' && !this.startPromise) return;
    if (this.state === 'failed' && !this.startPromise && !this.manager && !this.client) return;
    this.lifecycleGeneration += 1;
    this.setState('stopping');
    let firstError = null;
    const pendingStart = this.startPromise;
    const manager = this.manager;
    const client = this.client;
    try {
      await manager?.stop();
    } catch (error) {
      firstError = error;
    }
    try {
      await client?.close();
    } catch (error) {
      firstError ??= error;
    }
    if (pendingStart) {
      await Promise.allSettled([pendingStart]);
    }
    this.manager = null;
    this.client = null;
    if (firstError) {
      this.setLastError(firstError, 'host-stop');
      this.setState('stop-failed');
      throw firstError;
    }
    this.setState('stopped');
  }

  async cleanupAfterStartFailure() {
    try {
      await this.manager?.stop();
    } catch (error) {
      this.emitDiagnostic(error.code ?? 'RUNTIME_HOST_CLEANUP_FAILED', error.message, error.details);
    }
    try {
      await this.client?.close();
    } catch (error) {
      this.emitDiagnostic(error.code ?? 'RUNTIME_HOST_CLEANUP_FAILED', error.message, error.details);
    }
    this.manager = null;
    this.client = null;
  }

  emitPlanDiagnostics(plan) {
    for (const diagnostic of plan?.diagnostics ?? []) {
      this.emitDiagnostic(diagnostic.code, diagnostic.message, diagnostic);
    }
  }

  forwardEvents(source, sourceName) {
    if (!source?.on) return;
    for (const event of ['diagnostic', 'state', 'stdout', 'stderr', 'exit', 'restarted', 'scene.changed']) {
      source.on(event, (payload) => {
        this.handleForwardedEvent(event, payload, sourceName);
        this.emit(event, { source: sourceName, payload });
      });
    }
  }

  setState(state) {
    if (this.state === state) return;
    const previous = this.state;
    this.state = state;
    this.emit('state', { previous, state, timestamp: new Date().toISOString() });
  }

  emitDiagnostic(code, message, details = {}) {
    this.emit('diagnostic', {
      code,
      message,
      details,
      timestamp: new Date().toISOString()
    });
  }
}
