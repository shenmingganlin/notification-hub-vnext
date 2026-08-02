import { createRuntimeHostAdapter } from './runtime/host-config.js';

export const pluginVersion = '0.1.0-alpha.1';
export const pluginName = 'notification-hub-vnext';

export default class NotificationHubVNextPlugin {
  constructor(ctx = {}, { adapterFactory = createRuntimeHostAdapter } = {}) {
    this.ctx = ctx;
    this.adapterFactory = adapterFactory;
    this.runtimeHost = null;
    this.runtimeError = null;
  }

  toJSON() {
    return {
      pluginName,
      pluginVersion
    };
  }

  async onload() {
    const runtimeEnabled = this.readRuntimeEnabled();
    if (!runtimeEnabled) {
      this.ctx.log?.info?.('[notification-hub-vnext] Native Runtime disabled by configuration');
      return;
    }

    try {
      this.runtimeHost = this.adapterFactory(this.ctx);
      this.forwardRuntimeEvents(this.runtimeHost);
      await this.runtimeHost.start();
      this.ctx.log?.info?.(
        `[notification-hub-vnext] Native Runtime started: pipe=${this.runtimeHost.pipeName}`
      );
    } catch (error) {
      this.runtimeError = error;
      this.ctx.log?.error?.(
        `[notification-hub-vnext] Native Runtime unavailable: ${error.code ?? 'RUNTIME_START_FAILED'} ${error.message}`,
        error.details
      );
      await this.stopRuntimeAfterFailure();
    }
  }

  async onunload() {
    await this.stopRuntimeAfterFailure();
  }

  readRuntimeEnabled() {
    const config = this.ctx.config;
    try {
      const values = config?.getAll?.() ?? config?.get?.() ?? config;
      if (values && typeof values.runtimeEnabled === 'boolean') return values.runtimeEnabled;
    } catch (error) {
      this.ctx.log?.warn?.('[notification-hub-vnext] Failed to read runtimeEnabled', error);
    }
    return true;
  }

  forwardRuntimeEvents(adapter) {
    for (const event of ['diagnostic', 'stderr', 'stdout', 'exit', 'restarted']) {
      adapter.on(event, (payload) => {
        this.ctx.log?.debug?.(`[notification-hub-vnext] runtime:${event}`, payload);
      });
    }
  }

  async stopRuntimeAfterFailure() {
    const adapter = this.runtimeHost;
    this.runtimeHost = null;
    if (!adapter) return;
    try {
      await adapter.stop();
    } catch (error) {
      this.ctx.log?.warn?.(
        `[notification-hub-vnext] Native Runtime stop failed: ${error.code ?? 'RUNTIME_STOP_FAILED'} ${error.message}`,
        error.details
      );
    }
  }
}

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
export * from './runtime/host-config.js';
