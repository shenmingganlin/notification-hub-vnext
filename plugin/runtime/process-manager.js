import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';

import { validateRecoverySnapshot } from './recovery-snapshot.js';
import { selectRecoveryPlan } from './recovery-plan.js';

function processError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

export class RuntimeProcessManager extends EventEmitter {
  constructor({
    runtimePath,
    pipeName,
    runtimeArgs = [],
    restartRuntimeArgs,
    readyTimeoutMs = 3000,
    restartDelayMs = 25,
    maxRestartAttempts = 2,
    autoRestart = true,
    sceneState,
    recoverySnapshot,
    recoveryClient,
    spawnOptions = {}
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
    this.maxRestartAttempts = maxRestartAttempts;
    this.autoRestart = autoRestart;
    this.recoverySource = null;
    this.recoveryDiagnostics = [];
    if (sceneState !== undefined) {
      this.applyRecoveryPlan(selectRecoveryPlan({ sceneState, recoverySnapshot }));
    } else {
      this.recoverySnapshot = recoverySnapshot ? validateRecoverySnapshot(recoverySnapshot) : null;
      this.recoverySource = this.recoverySnapshot ? 'recovery-snapshot' : null;
    }
    this.recoveryClient = recoveryClient ?? null;
    this.spawnOptions = { windowsHide: true, ...spawnOptions };
    this.child = null;
    this.startPromise = null;
    this.restartTimer = null;
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
    this.setState('starting', 'start-requested');
    this.startPromise = new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(
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
        const error = processError('RUNTIME_READY_TIMEOUT', 'Runtime did not announce Named Pipe readiness', {
          stdout: this.stdout,
          stderr: this.stderr
        });
        this.emitDiagnostic(error.code, error.message, error.details);
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
        this.restartAttempts = 0;
        this.setState('running', 'ready');
        finish(resolve);
      });
      child.stderr.on('data', (chunk) => {
        this.stderr += chunk;
        this.emit('stderr', chunk);
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        const wrapped = processError('RUNTIME_START_FAILED', error.message, { cause: error.code });
        this.emitDiagnostic(wrapped.code, wrapped.message, wrapped.details);
        finish(reject, wrapped);
      });
      child.once('exit', (code, signal) => {
        clearTimeout(timer);
        if (this.child === child) this.child = null;
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

  scheduleRestart() {
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
        await this.restoreRecoverySnapshot();
        this.emit('restarted', { attempt });
      } catch (error) {
        this.emitDiagnostic(error.code ?? 'RUNTIME_START_FAILED', error.message, error.details);
      }
    }, this.restartDelayMs);
  }

  setRecoverySnapshot(snapshot) {
    this.recoverySnapshot = validateRecoverySnapshot(snapshot);
    this.recoverySource = 'recovery-snapshot';
    this.recoveryDiagnostics = [];
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
    for (const diagnostic of this.recoveryDiagnostics) {
      this.emitDiagnostic(diagnostic.code, diagnostic.message, diagnostic);
    }
    return this.recoverySnapshot;
  }

  setRecoveryClient(client) {
    this.recoveryClient = client;
    return client;
  }

  async restoreRecoverySnapshot(client = this.recoveryClient) {
    if (!this.recoverySnapshot || this.recoverySnapshot.entries.length === 0) return [];
    if (!client || typeof client.request !== 'function') {
      throw processError('RUNTIME_RECOVERY_CLIENT_MISSING', 'Recovery requires a PipeClient-compatible client');
    }

    const results = [];
    for (const entry of this.recoverySnapshot.entries) {
      try {
        const response = await client.request(entry.type, entry.payload, {
          retryable: true,
          maxAttempts: 2
        });
        results.push({ key: entry.key, type: entry.type, response });
        this.emit('recovery-applied', { key: entry.key, type: entry.type });
      } catch (error) {
        const wrapped = processError(
          'RUNTIME_RECOVERY_FAILED',
          `Recovery entry failed: ${entry.key}`,
          { key: entry.key, type: entry.type, cause: error.code, message: error.message }
        );
        this.emitDiagnostic(wrapped.code, wrapped.message, wrapped.details);
        throw wrapped;
      }
    }
    return results;
  }

  async restart() {
    await this.stop();
    this.restartAttempts = 0;
    await this.start();
    await this.restoreRecoverySnapshot();
    this.emit('restarted', { attempt: 0, manual: true });
  }

  async stop() {
    this.intentionalStop = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null) {
      this.setState('stopped', 'stop-requested');
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
