import { EventEmitter } from 'node:events';
import path from 'node:path';

import { PipeClient } from './pipe-client.js';
import { loadRecoveryPlan } from './recovery-plan.js';
import { RuntimeProcessManager } from './process-manager.js';
import { createSceneStatePersistenceFromHostContext } from './scene-state-config.js';

function hostError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
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
    this.startPromise = null;
  }

  async start() {
    if (this.state === 'running') return this;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startInternal().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  async startInternal() {
    this.setState('starting');
    let plan;
    try {
      plan = await this.loadPlan({
        sceneStatePath: this.sceneStatePersistence?.filePath,
        recoverySnapshotPath: this.recoverySnapshotPath,
        allowEmpty: true
      });
      this.emitPlanDiagnostics(plan);

      this.client = this.clientFactory({
        ...this.clientOptions,
        pipeName: this.pipeName
      });
      this.manager = this.managerFactory({
        ...this.runtimeOptions,
        runtimePath: this.runtimePath,
        pipeName: this.pipeName,
        runtimeArgs: this.runtimeArgs,
        ...(this.restartRuntimeArgs === undefined ? {} : { restartRuntimeArgs: this.restartRuntimeArgs }),
        sceneStatePersistence: this.sceneStatePersistence,
        recoverySnapshot: plan.snapshot,
        recoveryClient: this.client
      });
      this.forwardEvents(this.manager, 'manager');
      this.forwardEvents(this.client, 'client');

      await this.manager.start();
      const hello = await this.client.request('hello', { clientVersion: 'notification-hub-host' });
      this.emit('hello', hello);
      await this.manager.restoreRecoverySnapshot(this.client);
      const health = await this.client.request('health');
      this.emit('health', health);
      this.manager.startSceneStateSync?.();
      this.setState('running');
      this.emit('started', { source: plan.source, health });
      return this;
    } catch (error) {
      this.setState('failed');
      await this.cleanupAfterStartFailure();
      throw error;
    }
  }

  async stop() {
    if (this.state === 'stopped') return;
    this.setState('stopping');
    let firstError = null;
    try {
      await this.manager?.stop();
    } catch (error) {
      firstError = error;
    }
    try {
      await this.client?.close();
    } catch (error) {
      firstError ??= error;
    }
    this.manager = null;
    this.client = null;
    this.setState('stopped');
    if (firstError) throw firstError;
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
      source.on(event, (payload) => this.emit(event, { source: sourceName, payload }));
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
