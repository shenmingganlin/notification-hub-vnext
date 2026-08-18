import { createRuntimeHostAdapter } from './runtime/host-config.js';
import { NotificationApi } from './api/notification-api.js';
import { NotificationStore } from './domain/notification-store.js';
import {
  createNotificationPersistenceFromHostContext,
  resolveNotificationPersistenceConfig
} from './domain/notification-persistence-config.js';
import { resolveGlobalSoundConfig } from './domain/sound-config.js';
import { resolveSoundRule } from './domain/sound-policy.js';
import { SoundSettingsStore } from './domain/sound-settings-store.js';
import {
  createSoundSettingsPersistenceFromHostContext,
  resolveSoundSettingsPersistenceConfig
} from './domain/sound-settings-persistence-config.js';
import { createSoundScheduler } from './domain/sound-scheduler.js';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { createWindowsAudioBackend, playNotificationSound, resolveSoundPlaybackKey } from './domain/audio-adapter.js';
import { createAudioEngineHost } from './domain/audio-engine-host.js';
import { createAudioEngineBackend } from './domain/audio-engine-backend.js';
import { createSoundAssetRegistry } from './domain/sound-asset-registry.js';
import { createSoundDiagnostic } from './domain/sound-diagnostic.js';
import { createSoundRuleExplanation } from './domain/sound-rule-explanation.js';
import { loadSoundAssetRegistry, saveSoundAssetRegistry } from './domain/sound-asset-persistence.js';
import { exportSoundPackage } from './domain/sound-package-exporter.js';
import { importSoundPackage } from './domain/sound-package-importer.js';
import { exportSoundComboPackage } from './domain/sound-combo-package-exporter.js';
import { importSoundComboPackage } from './domain/sound-combo-package-importer.js';
import { importSoundAsset } from './domain/sound-asset-importer.js';
import { collectSoundAssetReferences, normalizeSoundBindingInput, removeSoundBinding, removeSoundBindingRules, upsertSoundBindingRule } from './domain/sound-binding.js';
import { createWindowsSaveFilePicker, safeFilename } from './domain/windows-file-picker.js';
import { SettingsStore } from './domain/settings-store.js';
import {
  createSettingsPersistenceFromHostContext,
  resolveSettingsPersistenceConfig
} from './domain/settings-persistence-config.js';
import { SettingsRuntimeSync } from './domain/settings-runtime-sync.js';
import { createShelfLayout } from './domain/runtime-layout.js';
import { createNotificationEventAdapter } from './events/notification-event-adapter.js';
import { createNotificationWidgetViewModel } from './domain/notification-widget-view-model.js';
import {
  createNotificationDisplaySettings,
  resolveNotificationDisplayLimit
} from './domain/notification-display-settings.js';
import { createNotificationDisplaySettingsPersistence } from './domain/notification-display-settings-persistence.js';
import {
  createSidebarDisplaySettings,
  resolveSidebarDisplayLimit
} from './domain/sidebar-display-settings.js';
import { createSidebarDisplaySettingsPersistence } from './domain/sidebar-display-settings-persistence.js';
import { VisualSettingsStore } from './domain/visual-settings-store.js';
import { createVisualProfile } from './domain/visual-settings.js';
import { createBehaviorManager } from './domain/notification-behavior-manager.js';
import { createBehaviorProfile } from './domain/notification-behavior.js';
import { createSceneDismissQueue } from './domain/scene-dismiss-queue.js';

async function renameWithRetry(source, destination, { attempts = 4, delayMs = 120 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      lastError = error;
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error?.code) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }
  throw lastError;
}
import { projectNotificationCategories } from './domain/notification-classification.js';
import { createNotificationPresentationInput } from './domain/notification-presentation-plan.js';
import { resolveVisualRuleSafe } from './domain/visual-rule-resolver.js';
import { createVisualSettingsPersistenceFromHostContext, resolveVisualSettingsPersistenceConfig } from './domain/visual-settings-persistence-config.js';
import { createNotificationTestNotifications, normalizeNotificationTestInput, NOTIFICATION_TEST_EVENTS } from './domain/notification-test-generator.js';
import { EventPresentationSettingsStore } from './domain/event-presentation-settings-store.js';
import {
  createEventPresentationSettingsPersistenceFromHostContext,
  resolveEventPresentationSettingsPersistenceConfig
} from './domain/event-presentation-settings-persistence-config.js';
import { createPresentationProfileFromSettings, listEventPresentationRows } from './domain/event-presentation-settings.js';
import { listEffectRuleTargets } from './domain/effect-rules.js';
import { createSceneBehaviorDiagnostics } from './domain/scene-behavior-diagnostics.js';

export * from './api/notification-api.js';
export * from './domain/notification-record.js';
export * from './domain/notification-store.js';
export * from './domain/notification-store-snapshot.js';
export * from './domain/notification-store-store.js';
export * from './domain/notification-store-persistence.js';

export const pluginVersion = '0.1.0-alpha.16';
export const pluginName = 'notification-hub-vnext';
export const RUNTIME_TEST_CARD_PREFIX = 'nh-vnext-test-';
export const RUNTIME_NOTIFICATION_CARD_PREFIX = 'nh-vnext-notification-';
const RUNTIME_TEST_CARD_SIZE = Object.freeze({ width: 360, height: 180 });
const RUNTIME_NOTIFICATION_CARD_SIZE = Object.freeze({ width: 420, height: 220 });
const RUNTIME_TEST_CARD_GAP = 20;
const RUNTIME_NOTIFICATION_CARD_GAP = 12;
const RUNTIME_NOTIFICATION_MAX_VISIBLE = 8;
const RUNTIME_SCENE_DISMISS_TIMEOUT_MS = 10000;
function runtimeErrorPayload(error) {
  if (!error) return null;
  return {
    code: error.code ?? 'RUNTIME_TEST_API_FAILED',
    message: error.message ?? String(error)
  };
}

const DIAGNOSTIC_HIDDEN_KEYS = new Set(['stdout', 'stderr', 'sceneCards', 'cards']);
const RUNTIME_RECOVERY_CODES = new Set([
  'TRANSPORT_RECONNECT_RETRY',
  'TRANSPORT_DISCONNECTED',
  'RUNTIME_RESTART_SCHEDULED'
]);

function isRuntimeRecoveryDiagnostic(diagnostic) {
  return RUNTIME_RECOVERY_CODES.has(diagnostic?.code);
}

function sanitizeDiagnosticDetails(value) {
  if (Array.isArray(value)) return value.map(sanitizeDiagnosticDetails);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !DIAGNOSTIC_HIDDEN_KEYS.has(key))
    .map(([key, entry]) => [key, sanitizeDiagnosticDetails(entry)]));
}

function normalizeSoundPreviewInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw Object.assign(new Error('Sound preview input must be an object'), { code: 'SOUND_SETTINGS_PREVIEW_INPUT_INVALID' });
  }
  const eventAliases = { arrived: 'chat.assistant_reply.completed', tool_completed: 'tool.execution.succeeded', tool_success: 'tool.execution.succeeded', tool_error: 'tool.execution.failed', timeout: 'tool.execution.timed_out', failed: 'tool.execution.failed', error: 'session.persistence.failed', model_service_error: 'model_service.request.failed' };
  const eventId = typeof input.eventId === 'string' && input.eventId.trim() ? input.eventId.trim() : eventAliases[input.event];
  if (!eventId) throw Object.assign(new Error('Sound preview eventId is invalid'), { code: 'SOUND_SETTINGS_PREVIEW_INPUT_INVALID' });
  const labels = Array.isArray(input.labels) ? [...new Set(input.labels)] : [];
  const importance = 'normal';
  const event = typeof input.event === 'string' && input.event.trim() ? input.event.trim() : eventId.split('.').slice(1).join('.');
  const soundId = input.soundId == null ? null : (typeof input.soundId === 'string' ? input.soundId.trim() || null : null);
  if (input.soundId != null && !soundId) {
    throw Object.assign(new Error('Sound preview soundId is invalid'), { code: 'SOUND_SETTINGS_PREVIEW_INPUT_INVALID' });
  }
  const volume = input.volume == null ? null : Number(input.volume);
  if (volume != null && (!Number.isFinite(volume) || volume < 0 || volume > 1)) {
    throw Object.assign(new Error('Sound preview volume is invalid'), { code: 'SOUND_SETTINGS_PREVIEW_INPUT_INVALID' });
  }
  const producer = input.producer == null ? null : { ...input.producer };
  if (producer && (!['hana', 'api'].includes(producer.kind) || (producer.kind === 'api' && typeof producer.id !== 'string'))) {
    throw Object.assign(new Error('Sound preview producer is invalid'), { code: 'SOUND_SETTINGS_PREVIEW_INPUT_INVALID' });
  }
  return Object.freeze({
    labels: Object.freeze(labels),
    eventId,
    event,
    importance,
    soundId,
    volume,
    producer: producer ? Object.freeze(producer) : null,
    source: typeof input.source === 'string' ? input.source.trim() || null : null,
    channel: typeof input.channel === 'string' ? input.channel.trim() || null : null
  });
}

function normalizeRuntimeDiagnostic(diagnostic, source = 'runtime') {
  const code = typeof diagnostic?.code === 'string' && diagnostic.code.trim()
    ? diagnostic.code
    : 'RUNTIME_DIAGNOSTIC';
  const message = typeof diagnostic?.message === 'string' && diagnostic.message.trim()
    ? diagnostic.message
    : 'Runtime 产生了一条诊断记录。';
  const severity = ['trace', 'info', 'warning', 'error', 'fatal'].includes(diagnostic?.severity)
    ? diagnostic.severity
    : (diagnostic?.recoverable
      ? 'warning'
      : (source === 'runtime'
        ? (/(FAILED|ERROR|CRASH|EXITED|EXHAUSTED|INVALID)/.test(code) ? 'error' : 'info')
        : 'error'));
  return {
    code,
    message,
    stage: typeof diagnostic?.stage === 'string' ? diagnostic.stage : source,
    severity,
    recoverable: Boolean(diagnostic?.recoverable),
    ...(typeof diagnostic?.traceId === 'string' ? { traceId: diagnostic.traceId } : {}),
    details: sanitizeDiagnosticDetails(diagnostic?.details ?? {}),
    timestamp: typeof diagnostic?.timestamp === 'string' ? diagnostic.timestamp : new Date().toISOString(),
    source
  };
}

function nonEmptyText(value, fallback, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, maxLength);
}

function validateShelfLayout(input = {}, errorCode) {
  return createShelfLayout(input, { errorCode });
}

function cardRect(card) {
  if (!card || !Number.isFinite(card.x) || !Number.isFinite(card.y)) return null;
  const width = Number.isFinite(card.width) && card.width > 0 ? card.width : RUNTIME_TEST_CARD_SIZE.width;
  const height = Number.isFinite(card.height) && card.height > 0 ? card.height : RUNTIME_TEST_CARD_SIZE.height;
  return { x: card.x, y: card.y, width, height };
}

function overlaps(left, right) {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

function nextRuntimeTestCardPosition(cards, workArea) {
  const area = {
    left: Number.isFinite(workArea?.left) ? workArea.left : 0,
    top: Number.isFinite(workArea?.top) ? workArea.top : 0,
    width: Number.isFinite(workArea?.width) && workArea.width > 0 ? workArea.width : 2560,
    height: Number.isFinite(workArea?.height) && workArea.height > 0 ? workArea.height : 1528
  };
  const occupied = (Array.isArray(cards) ? cards : []).map(cardRect).filter(Boolean);
  const startX = area.left + 80;
  const startY = area.top + 80;
  const stepX = RUNTIME_TEST_CARD_SIZE.width + RUNTIME_TEST_CARD_GAP;
  const stepY = RUNTIME_TEST_CARD_SIZE.height + RUNTIME_TEST_CARD_GAP;
  const columns = Math.max(1, Math.floor((area.width - 160 + RUNTIME_TEST_CARD_GAP) / stepX));
  const rows = Math.max(1, Math.floor((area.height - 160 + RUNTIME_TEST_CARD_GAP) / stepY));
  const candidates = columns * rows;

  for (let index = 0; index < candidates; index += 1) {
    const candidate = {
      x: startX + (index % columns) * stepX,
      y: startY + Math.floor(index / columns) * stepY,
      ...RUNTIME_TEST_CARD_SIZE
    };
    if (!occupied.some((card) => overlaps(candidate, card))) {
      return { x: candidate.x, y: candidate.y };
    }
  }

  const fallbackIndex = Array.isArray(cards) ? cards.length : 0;
  return {
    x: startX + (fallbackIndex % columns) * stepX,
    y: startY + Math.floor(fallbackIndex / columns) * stepY
  };
}

function notificationCardId(notificationId) {
  return `${RUNTIME_NOTIFICATION_CARD_PREFIX}${encodeURIComponent(notificationId)}`;
}

function notificationIdFromCardId(cardId) {
  if (typeof cardId !== 'string' || !cardId.startsWith(RUNTIME_NOTIFICATION_CARD_PREFIX)) return null;
  try {
    return decodeURIComponent(cardId.slice(RUNTIME_NOTIFICATION_CARD_PREFIX.length));
  } catch {
    return null;
  }
}

function notificationCardText(value, fallback, maxLength) {
  return nonEmptyText(value, fallback, maxLength);
}

function notificationCardDimensions(appearance = {}) {
  const sizes = { small: { width: 360, height: 180 }, medium: { width: 420, height: 220 }, large: { width: 500, height: 260 } };
  const base = sizes[appearance.size] ?? sizes.medium;
  if (appearance.aspectRatio === 'square') return { width: base.width, height: base.width };
  if (appearance.aspectRatio === 'wide') return { width: base.width, height: Math.max(160, Math.round(base.width * 0.48)) };
  return { ...base };
}

function notificationCardPosition(index, workArea, layout, dimensions = RUNTIME_NOTIFICATION_CARD_SIZE) {
  const area = {
    left: Number.isFinite(workArea?.left) ? workArea.left : 0,
    top: Number.isFinite(workArea?.top) ? workArea.top : 0,
    width: Number.isFinite(workArea?.width) && workArea.width > 0 ? workArea.width : 2560,
    height: Number.isFinite(workArea?.height) && workArea.height > 0 ? workArea.height : 1528
  };
  const spacing = Number.isInteger(layout?.spacing) && layout.spacing >= 0 ? layout.spacing : 12;
  const stepX = dimensions.width + spacing;
  const stepY = dimensions.height + spacing;
  const columns = Math.max(1, Math.floor((area.width - 80 + spacing) / stepX));
  const rows = Math.max(1, Math.floor((area.height - 80 + spacing) / stepY));
  const safeIndex = Math.max(0, index % Math.max(1, columns * rows));
  const column = safeIndex % columns;
  const row = Math.floor(safeIndex / columns);
  const direction = layout?.direction === 'left' ? -1 : 1;
  const x = layout?.anchor?.includes('right')
    ? area.left + area.width - dimensions.width - column * stepX
    : area.left + column * stepX;
  const y = layout?.anchor?.includes('top')
    ? area.top + row * stepY
    : area.top + area.height - dimensions.height - row * stepY;
  return { x: Math.round(direction < 0 ? x : x), y: Math.round(y) };
}

function notificationCardPayload(record, index, workArea, layout, visual, presentation = null, behavior = null) {
  const dimensions = notificationCardDimensions(visual?.appearance);
  const position = notificationCardPosition(index, workArea, layout, dimensions);
  return {
    id: notificationCardId(record.notificationId),
    title: notificationCardText(record.title, '新通知', 120),
    body: notificationCardText(record.content, record.summary || '', 2000),
    visual,
    ...(presentation ? { presentation } : {}),
    ...(behavior ? { behavior } : {}),
    ...position,
    ...dimensions
  };
}

function cardWidthForShelf(card) {
  return Number.isFinite(card?.width) && card.width > 0
    ? card.width
    : (notificationIdFromCardId(card?.id) ? RUNTIME_NOTIFICATION_CARD_SIZE.width : RUNTIME_TEST_CARD_SIZE.width);
}

function shelfExtent(cards, spacing) {
  const widths = cards.map(cardWidthForShelf);
  return widths.reduce((total, width) => total + width, 0)
    + Math.max(0, widths.length - 1) * spacing;
}

export default class NotificationHubVNextPlugin {
  constructor(ctx = {}, {
    adapterFactory = createRuntimeHostAdapter,
    notificationPersistenceFactory = createNotificationPersistenceFromHostContext,
    settingsPersistenceFactory = createSettingsPersistenceFromHostContext,
    soundSettingsPersistenceFactory = createSoundSettingsPersistenceFromHostContext,
    soundBackendFactory = (options) => createWindowsAudioBackend(options),
    soundPreviewBackendFactory = soundBackendFactory,
    soundFilePickerFactory = createWindowsSaveFilePicker,
    soundSchedulerFactory = createSoundScheduler,
    settingsSyncFactory = (options) => new SettingsRuntimeSync(options),
    notificationDisplaySettingsPersistenceFactory = createNotificationDisplaySettingsPersistence,
    sidebarDisplaySettingsPersistenceFactory = createSidebarDisplaySettingsPersistence,
    visualSettingsPersistenceFactory = createVisualSettingsPersistenceFromHostContext,
    eventPresentationSettingsPersistenceFactory = createEventPresentationSettingsPersistenceFromHostContext,
    audioEngineHostFactory = (options) => createAudioEngineHost(options),
    audioEngineBackendFactory = (options) => createAudioEngineBackend(options),
    useAudioEngineBackend = true
  } = {}) {
    this.ctx = ctx;
    this.adapterFactory = adapterFactory;
    this.notificationPersistenceFactory = notificationPersistenceFactory;
    this.settingsPersistenceFactory = settingsPersistenceFactory;
    this.soundSettingsPersistenceFactory = soundSettingsPersistenceFactory;
    this.soundBackendFactory = soundBackendFactory;
    this.soundPreviewBackendFactory = soundPreviewBackendFactory;
    this.soundFilePickerFactory = soundFilePickerFactory;
    this.soundSchedulerFactory = soundSchedulerFactory;
    this.settingsSyncFactory = settingsSyncFactory;
    this.notificationDisplaySettingsPersistenceFactory = notificationDisplaySettingsPersistenceFactory;
    this.sidebarDisplaySettingsPersistenceFactory = sidebarDisplaySettingsPersistenceFactory;
    this.visualSettingsPersistenceFactory = visualSettingsPersistenceFactory;
    this.eventPresentationSettingsPersistenceFactory = eventPresentationSettingsPersistenceFactory;
    this.audioEngineHostFactory = audioEngineHostFactory;
    this.audioEngineBackendFactory = audioEngineBackendFactory;
    this.useAudioEngineBackend = useAudioEngineBackend === true;
    this.audioEngineHost = null;
    this.audioEngineStatus = { state: 'disabled', reason: 'engine-binary-not-present' };
    this.runtimeHost = null;
    this.notificationStore = new NotificationStore();
    this.settingsStore = new SettingsStore();
    this.soundSettingsStore = new SoundSettingsStore();
    this.soundAssetRegistry = createSoundAssetRegistry();
    this.soundAssetMutationQueue = Promise.resolve();
    this.soundFilePicker = this.soundFilePickerFactory({ platform: process.platform });
    this.soundAssetRoot = path.resolve(ctx?.dataDir || process.cwd(), 'sound-assets');
    this.soundAssetRegistryPath = path.resolve(ctx?.dataDir || process.cwd(), 'sound-assets.json');
    this.soundAssetDiagnostics = [];
    this.visualSettingsStore = new VisualSettingsStore();
    this.eventPresentationSettingsStore = new EventPresentationSettingsStore();
    this.settingsPersistence = null;
    this.soundSettingsPersistence = null;
    this.visualSettingsPersistence = null;
    this.eventPresentationSettingsPersistence = null;
    this.settingsRuntimeSync = null;
    this.notificationTestToolCleanup = null;
    this.notificationTestCapabilityCleanup = null;
    this.notificationPersistence = null;
    this.notificationDisplaySettingsPersistence = null;
    this.sidebarDisplaySettingsPersistence = null;
    this.sidebarDisplaySettings = createSidebarDisplaySettings();
    this.notificationDisplaySettings = createNotificationDisplaySettings();
    this.soundConfig = resolveGlobalSoundConfig({ config: ctx.config });
    // Settings tests intentionally share the production scheduler and backend.
    // This keeps active duplicate suppression, physical resource keys, global
    // mute, and lifecycle cleanup identical to real notifications.
    this.soundBackend = this.soundBackendFactory({
      platform: process.platform,
      executablePath: path.resolve(ctx?.pluginDir || process.cwd(), 'runtime', 'notification-hub-audio-service.exe'),
      context: ctx
    });
    this.soundScheduler = this.soundSchedulerFactory({
      keyOf: resolveSoundPlaybackKey,
      play: ({ decision }) => playNotificationSound({
        decision,
        backend: this.soundBackend,
        options: { assetRegistry: this.soundAssetRegistry, soundAssetRoot: this.soundAssetRoot }
      })
    });
    this.notificationApi = new NotificationApi({
      store: this.notificationStore,
      soundConfig: this.soundConfig,
      soundProfile: this.soundSettingsStore.getSnapshot().settings.profile,
      // Keep legacy sound behavior until an event-presentation snapshot is restored
      // or the user explicitly applies event bindings. The settings UI may still
      // show catalog defaults without silently changing existing sound rules.
      presentationProfile: null,
      soundScheduler: this.soundScheduler,
      onSoundDiagnostic: (payload) => this.recordSoundDiagnosticEvent(payload)
    });
    this.notificationUnsubscribe = null;
    this.notificationSceneUnsubscribe = null;
    this.notificationSceneTimers = new Map();
    this.notificationSceneVisibleIds = new Set();
    this.notificationSceneCardChannels = new Map();
    this.notificationBehaviorManagers = new Map();
    this.notificationSceneQueues = new Map();
    this.notificationSceneDrainPromises = new Map();
    this.notificationSceneDismissQueue = createSceneDismissQueue({
      execute: (job) => this.performNotificationSceneDismiss(job.notificationId, job.status)
    });
    this.notificationEventAdapter = null;
    this.notificationEventUnsubscribe = null;
    this.notificationDiagnostics = [];
    this.soundDiagnostics = [];
    this.soundDiagnosticSequence = 0;
    this.settingsDiagnostics = [];
    this.runtimeDiagnostics = [];
    this.runtimeError = null;
    this.layoutStatus = {
      status: 'saved',
      requested: null,
      applied: null,
      error: null
    };
    this.runtimeStatus = {
      state: 'stopped',
      message: 'Runtime 已停止',
      lastError: null,
      connected: false,
      clientState: null
    };
    this.runtimeTestApi = {
      getNotificationWidgetStatus: this.getNotificationWidgetStatus.bind(this),
      getRuntimeTestStatus: this.getRuntimeTestStatus.bind(this),
      getRuntimePageStatus: this.getRuntimePageStatus.bind(this),
      getDiagnosticsPageStatus: this.getDiagnosticsPageStatus.bind(this),
      exportDiagnostics: this.exportDiagnostics.bind(this),
      retryRuntime: this.retryRuntime.bind(this),
      createRuntimeTestCard: this.createRuntimeTestCard.bind(this),
      clearRuntimeTestCards: this.clearRuntimeTestCards.bind(this),
      applyRuntimeTestLayout: this.applyRuntimeTestLayout.bind(this),
      updateLayoutSettings: this.updateLayoutSettings.bind(this),
      getSettingsStatus: this.getSettingsStatus.bind(this),
      getSoundSettingsStatus: this.getSoundSettingsStatus.bind(this),
      getAudioEngineStatus: this.getAudioEngineStatus.bind(this),
      clearSoundDiagnostics: this.clearSoundDiagnostics.bind(this),
      exportSoundDiagnostics: this.exportSoundDiagnostics.bind(this),
      getSoundAssetStatus: this.getSoundAssetStatus.bind(this),
      importSoundPackage: this.importSoundPackage.bind(this),
      importSoundAsset: this.importSoundAsset.bind(this),
      updateSoundAssetConfiguration: this.updateSoundAssetConfiguration.bind(this),
      removeSoundBindingConfiguration: this.removeSoundBindingConfiguration.bind(this),
      deleteSoundAsset: this.deleteSoundAsset.bind(this),
      exportSoundPackage: this.exportSoundPackage.bind(this),
      exportSoundComboPackage: this.exportSoundComboPackage.bind(this),
      importSoundComboPackage: this.importSoundComboPackage.bind(this),
      testSoundAsset: this.testSoundAsset.bind(this),
      updateSoundSettings: this.updateSoundSettings.bind(this),
      previewSoundSettings: this.previewSoundSettings.bind(this),
      explainSoundSettings: this.explainSoundSettings.bind(this),
      testSoundSettings: this.testSoundSettings.bind(this),
      runSoundWorkbench: this.runSoundWorkbench.bind(this),
      getVisualSettingsStatus: this.getVisualSettingsStatus.bind(this),
      updateVisualSettings: this.updateVisualSettings.bind(this),
      getEventPresentationSettings: this.getEventPresentationSettings.bind(this),
      updateEventPresentationSettings: this.updateEventPresentationSettings.bind(this),
      getEffectRules: this.getEffectRules.bind(this),
      upsertEffectRule: this.upsertEffectRule.bind(this),
      removeEffectRule: this.removeEffectRule.bind(this),
      listEventPresentationRows: this.listEventPresentationRows.bind(this),
      previewVisualSettings: this.previewVisualSettings.bind(this),
      updateSettings: this.updateSettings.bind(this),
      retrySettingsApply: this.retrySettingsApply.bind(this),
      getNotificationDisplaySettings: this.getNotificationDisplaySettings.bind(this),
      updateNotificationDisplaySettings: this.updateNotificationDisplaySettings.bind(this),
      removeNotification: this.removeNotificationFromHistory.bind(this),
      removeNotifications: this.removeNotificationsFromHistory.bind(this),
      getSidebarDisplaySettings: this.getSidebarDisplaySettings.bind(this),
      updateSidebarDisplaySettings: this.updateSidebarDisplaySettings.bind(this),
      runNotificationTest: this.runNotificationTest.bind(this)
    };
    if (ctx && typeof ctx === 'object') {
      ctx._notificationHubVNextPlugin = this.runtimeTestApi;
      ctx._notificationHubVNextRuntimeApi = this.runtimeTestApi;
      ctx._notificationHubVNextNotificationApi = this.notificationApi;
    }
  }

  toJSON() {
    return {
      pluginName,
      pluginVersion
    };
  }

  getAudioEngineStatus() {
    return {
      ...this.audioEngineStatus,
      host: this.audioEngineHost?.getStatus?.() ?? null
    };
  }

  async startAudioEngineHost() {
    if (process.platform !== 'win32') {
      this.audioEngineStatus = { state: 'disabled', reason: 'unsupported-platform' };
      return this.audioEngineStatus;
    }
    const executablePath = path.resolve(this.ctx?.pluginDir || process.cwd(), 'runtime', 'notification-hub-audio-engine.exe');
    if (!existsSync(executablePath)) {
      this.audioEngineStatus = { state: 'disabled', reason: 'engine-binary-not-present', executablePath };
      return this.audioEngineStatus;
    }
    try {
      this.audioEngineHost = this.audioEngineHostFactory({ executablePath, pluginDir: this.ctx?.pluginDir || process.cwd() });
      this.audioEngineHost.on?.('diagnostic', (diagnostic) => this.recordSoundDiagnostic({ code: diagnostic.code, message: diagnostic.message, details: diagnostic.details }, 'audio-engine'));
      await this.audioEngineHost.start();
      this.audioEngineStatus = { state: 'ready', executablePath, health: this.audioEngineHost.getStatus().health };
    } catch (error) {
      this.audioEngineStatus = { state: 'failed', executablePath, code: error.code ?? 'AUDIO_ENGINE_START_FAILED', message: error.message, details: error.details ?? {} };
      this.recordSoundDiagnostic(error, 'audio-engine-start');
    }
    return this.audioEngineStatus;
  }

  async activateAudioEngineBackend() {
    if (!this.audioEngineHost) throw Object.assign(new Error('Audio Engine Host is unavailable'), { code: 'AUDIO_ENGINE_NOT_READY' });
    const previous = this.soundBackend;
    this.soundBackend = this.audioEngineBackendFactory({ host: this.audioEngineHost, client: this.audioEngineHost.client, platform: process.platform });
    await this.soundBackend.warmup?.();
    if (previous && previous !== this.soundBackend) await previous.dispose?.();
    return this.soundBackend;
  }

  async stopAudioEngineHost() {
    if (!this.audioEngineHost) return;
    await this.audioEngineHost.dispose().catch((error) => this.recordSoundDiagnostic(error, 'audio-engine-stop'));
    this.audioEngineHost = null;
    this.audioEngineStatus = { state: 'stopped' };
  }

  async onload() {
    this.ctx._notificationHubVNextPlugin = this.runtimeTestApi;
    this.ctx._notificationHubVNextRuntimeApi = this.runtimeTestApi;
    this.ctx._notificationHubVNextNotificationApi = this.notificationApi;
    this.ctx._notificationHubVNextSettingsStore = this.settingsStore;
    this.ctx._notificationHubVNextSoundSettingsStore = this.soundSettingsStore;
    this.ctx._notificationHubVNextEventPresentationSettingsStore = this.eventPresentationSettingsStore;
    this.ctx._notificationHubVNextSettingsApi = this.runtimeTestApi;
    this.runtimeError = null;
    await this.startAudioEngineHost();
    if (this.useAudioEngineBackend && this.audioEngineStatus.state === 'ready') {
      await this.activateAudioEngineBackend();
    }
    await this.restoreSoundAssets();
    await this.restoreSoundSettings();
    await this.restoreVisualSettings();
    await this.restoreEventPresentationSettings();
    // Start the resident Audio Engine before the first notification. This is
    // deliberately best-effort: an unavailable audio device must not block cards.
    void Promise.resolve(this.soundBackend?.warmup?.()).catch((error) => {
      this.recordSoundDiagnostic(error, 'native-service-start');
    });
    await this.startNotificationPersistence();
    await this.restoreNotificationDisplaySettings();
    await this.restoreSidebarDisplaySettings();
    this.startNotificationSceneSubscription();
    this.startNotificationEventSubscription();
    this.registerNotificationTestCapability();
    this.registerNotificationTestTool();
    this.runtimeStatus = {
      state: 'stopped',
      message: 'Runtime 已停止',
      lastError: null,
      connected: false,
      clientState: null
    };
    this.settingsPersistence = this.createSettingsPersistence();
    this.settingsRuntimeSync = this.settingsSyncFactory({
      store: this.settingsStore,
      persistence: this.settingsPersistence,
      host: null
    });
    this.settingsRuntimeSync.on('diagnostic', (diagnostic) => this.recordSettingsDiagnostic(diagnostic));
    await this.settingsRuntimeSync.start();

    const runtimeEnabled = this.readRuntimeEnabled();
    if (!runtimeEnabled) {
      this.ctx.log?.info?.('[notification-hub-vnext] Native Runtime disabled by configuration');
      return;
    }

    try {
      await this.startRuntimeHost();
    } catch (error) {
      this.runtimeError = error;
      this.recordRuntimeDiagnostic({
        code: error.code ?? 'RUNTIME_START_FAILED',
        message: error.message,
        stage: 'host-start',
        recoverable: true,
        details: error.details
      }, 'runtime');
      this.ctx.log?.error?.(
        `[notification-hub-vnext] Native Runtime unavailable: ${error.code ?? 'RUNTIME_START_FAILED'} ${error.message}`,
        error.details
      );
      await this.stopRuntimeAfterFailure();
      this.runtimeStatus = {
        state: 'failed',
        message: 'Runtime 启动或恢复失败',
        lastError: {
          code: error.code ?? 'RUNTIME_START_FAILED',
          message: error.message,
          stage: 'host-start',
          timestamp: new Date().toISOString()
        },
        connected: false,
        clientState: null
      };
    }
  }

  async onunload() {
    const notificationApi = this.notificationApi;
    this.stopNotificationEventSubscription();
    this.stopNotificationSceneSubscription();
    await this.stopNotificationPersistence();
    try { await this.saveSoundAssets(); } catch (error) { this.recordSoundDiagnostic(error, 'asset-save'); }
    await this.stopSoundSettingsPersistence();
    await this.stopVisualSettingsPersistence();
    await this.stopEventPresentationSettingsPersistence();
    await this.stopNotificationDisplaySettingsPersistence();
    await this.stopSidebarDisplaySettingsPersistence();
    await this.stopSettingsRuntimeSync();
    await this.soundBackend?.dispose?.();
    await this.stopAudioEngineHost();
    this.notificationTestToolCleanup?.();
    this.notificationTestToolCleanup = null;
    this.notificationTestCapabilityCleanup?.();
    this.notificationTestCapabilityCleanup = null;
    await this.stopRuntimeAfterFailure();
    if (this.ctx._notificationHubVNextPlugin === this.runtimeTestApi) delete this.ctx._notificationHubVNextPlugin;
    if (this.ctx._notificationHubVNextRuntimeApi === this.runtimeTestApi) {
      delete this.ctx._notificationHubVNextRuntimeApi;
    }
    if (this.ctx._notificationHubVNextNotificationApi === notificationApi) {
      delete this.ctx._notificationHubVNextNotificationApi;
    }
    if (this.ctx._notificationHubVNextSettingsApi === this.runtimeTestApi) {
      delete this.ctx._notificationHubVNextSettingsApi;
    }
  }

  createNotificationDisplaySettingsPersistence() {
    try {
      return this.notificationDisplaySettingsPersistenceFactory(this.ctx);
    } catch (error) {
      this.recordNotificationDiagnostic(error, 'display-settings-persistence-config');
      return null;
    }
  }

  async restoreNotificationDisplaySettings() {
    this.notificationDisplaySettingsPersistence = this.createNotificationDisplaySettingsPersistence();
    if (!this.notificationDisplaySettingsPersistence) return this.notificationDisplaySettings;
    try {
      const restored = await this.notificationDisplaySettingsPersistence.restore();
      if (restored) this.notificationDisplaySettings = createNotificationDisplaySettings(restored);
    } catch (error) {
      this.recordNotificationDiagnostic(error, 'display-settings-restore');
    }
    return this.notificationDisplaySettings;
  }

  async stopNotificationDisplaySettingsPersistence() {
    this.notificationDisplaySettingsPersistence = null;
  }

  createSidebarDisplaySettingsPersistence() {
    try {
      return this.sidebarDisplaySettingsPersistenceFactory(this.ctx);
    } catch (error) {
      this.recordNotificationDiagnostic(error, 'sidebar-display-settings-persistence-config');
      return null;
    }
  }

  async restoreSidebarDisplaySettings() {
    this.sidebarDisplaySettingsPersistence = this.createSidebarDisplaySettingsPersistence();
    if (!this.sidebarDisplaySettingsPersistence) return this.sidebarDisplaySettings;
    try {
      const restored = await this.sidebarDisplaySettingsPersistence.restore();
      if (restored) this.sidebarDisplaySettings = createSidebarDisplaySettings(restored);
    } catch (error) {
      this.recordNotificationDiagnostic(error, 'sidebar-display-settings-restore');
    }
    return this.sidebarDisplaySettings;
  }

  async stopSidebarDisplaySettingsPersistence() {
    this.sidebarDisplaySettingsPersistence = null;
  }

  getSidebarDisplaySettings() {
    return {
      settings: this.sidebarDisplaySettings,
      limit: resolveSidebarDisplayLimit(this.sidebarDisplaySettings)
    };
  }

  async updateSidebarDisplaySettings(patch = {}) {
    const next = createSidebarDisplaySettings(patch);
    if (this.sidebarDisplaySettingsPersistence) {
      await this.sidebarDisplaySettingsPersistence.save(next);
    }
    this.sidebarDisplaySettings = next;
    return this.getSidebarDisplaySettings();
  }

  getNotificationDisplaySettings() {
    return {
      settings: this.notificationDisplaySettings,
      limit: resolveNotificationDisplayLimit(this.notificationDisplaySettings),
      cardLifetimeSeconds: this.notificationDisplaySettings.cardLifetimeSeconds,
      persistence: this.notificationDisplaySettingsPersistence
        ? { enabled: true, filePath: this.notificationDisplaySettingsPersistence.filePath }
        : { enabled: false, filePath: null }
    };
  }

  async updateNotificationDisplaySettings(patch = {}) {
    const current = this.notificationDisplaySettings;
    const next = createNotificationDisplaySettings({ ...current, ...patch });
    if (this.notificationDisplaySettingsPersistence) {
      await this.notificationDisplaySettingsPersistence.save(next);
    }
    this.notificationDisplaySettings = next;
    return this.getNotificationDisplaySettings();
  }

  async removeNotificationFromHistory(notificationId) {
    if (this.notificationSceneVisibleIds.has(notificationId)) {
      await this.dismissNotificationScene(notificationId, 'dismissed').catch((error) => {
        this.recordNotificationDiagnostic(error, 'history-remove-scene-dismiss');
      });
    }
    return this.notificationApi.removeNotification(notificationId);
  }

  async removeNotificationsFromHistory(notificationIds = []) {
    const ids = [...new Set(notificationIds)];
    await Promise.all(ids
      .filter((notificationId) => this.notificationSceneVisibleIds.has(notificationId))
      .map((notificationId) => this.dismissNotificationScene(notificationId, 'dismissed').catch((error) => {
        this.recordNotificationDiagnostic(error, 'history-remove-scene-dismiss');
      })));
    return this.notificationApi.removeNotifications(ids);
  }

  createVisualSettingsPersistence() {
    try {
      const resolved = resolveVisualSettingsPersistenceConfig({
        dataDir: this.ctx.dataDir,
        config: this.ctx.config
      });
      if (!resolved.enabled) return null;
      return this.visualSettingsPersistenceFactory(this.ctx, {
        store: this.visualSettingsStore
      });
    } catch (error) {
      this.ctx.log?.warn?.(`[notification-hub-vnext] Visual settings persistence unavailable: ${error.message}`);
      return null;
    }
  }

  async restoreVisualSettings() {
    this.visualSettingsPersistence = this.createVisualSettingsPersistence();
    try {
      await this.visualSettingsPersistence?.restore?.();
    } catch (error) {
      this.ctx.log?.warn?.(`[notification-hub-vnext] Visual settings restore failed: ${error.message}`);
    }
    this.visualSettingsPersistence?.observe?.();
    return this.visualSettingsStore.getSnapshot();
  }

  async stopVisualSettingsPersistence() {
    const persistence = this.visualSettingsPersistence;
    this.visualSettingsPersistence = null;
    try {
      await persistence?.flush?.();
    } catch (error) {
      this.ctx.log?.warn?.(`[notification-hub-vnext] Visual settings flush failed: ${error.message}`);
    } finally {
      persistence?.dispose?.();
    }
  }

  getVisualSettingsStatus() {
    const snapshot = this.visualSettingsStore.getSnapshot();
    const persistence = this.visualSettingsPersistence;
    return {
      settings: snapshot.settings,
      profile: snapshot.settings.profile,
      revision: snapshot.revision,
      savedRevision: snapshot.savedRevision,
      appliedRevision: snapshot.appliedRevision,
      status: snapshot.status,
      applyError: snapshot.applyError,
      persistence: persistence
        ? { enabled: true, pending: persistence.pendingSnapshot !== null }
        : { enabled: false, pending: false },
      effectRules: this.eventPresentationSettingsStore.getSnapshot().settings.visualRules,
      effectRuleTargets: listEffectRuleTargets()
    };
  }

  async updateVisualSettings(patch = {}) {
    const snapshot = this.visualSettingsStore.updateVisualSettings(patch);
    this.visualSettingsStore.markApplied(snapshot.revision);
    return this.getVisualSettingsStatus();
  }

  createEventPresentationSettingsPersistence() {
    try {
      const resolved = resolveEventPresentationSettingsPersistenceConfig({
        dataDir: this.ctx.dataDir,
        config: this.ctx.config
      });
      if (!resolved.enabled) return null;
      return this.eventPresentationSettingsPersistenceFactory(this.ctx, {
        store: this.eventPresentationSettingsStore
      });
    } catch (error) {
      this.recordNotificationDiagnostic(error, 'event-presentation-settings-persistence-config');
      return null;
    }
  }

  async restoreEventPresentationSettings() {
    this.eventPresentationSettingsPersistence = this.createEventPresentationSettingsPersistence();
    try {
      const restored = await this.eventPresentationSettingsPersistence?.restore?.();
      if (restored) {
        this.notificationApi.setPresentationProfile(createPresentationProfileFromSettings(restored.settings));
        this.eventPresentationSettingsStore.markApplied(this.eventPresentationSettingsStore.getSnapshot().revision);
      }
    } catch (error) {
      this.recordNotificationDiagnostic(error, 'event-presentation-settings-restore');
    }
    this.eventPresentationSettingsPersistence?.on?.('diagnostic', (diagnostic) => {
      this.recordNotificationDiagnostic(diagnostic, 'event-presentation-settings-persistence');
    });
    this.eventPresentationSettingsPersistence?.observe?.();
    return this.eventPresentationSettingsStore.getSnapshot();
  }

  async stopEventPresentationSettingsPersistence() {
    const persistence = this.eventPresentationSettingsPersistence;
    this.eventPresentationSettingsPersistence = null;
    try {
      await persistence?.flush?.();
    } catch (error) {
      this.recordNotificationDiagnostic(error, 'event-presentation-settings-flush');
    } finally {
      persistence?.dispose?.();
    }
  }

  getEventPresentationSettings() {
    const snapshot = this.eventPresentationSettingsStore.getSnapshot();
    return {
      settings: snapshot.settings,
      rows: listEventPresentationRows(snapshot.settings),
      revision: snapshot.revision,
      savedRevision: snapshot.savedRevision,
      appliedRevision: snapshot.appliedRevision,
      status: snapshot.status,
      applyError: snapshot.applyError,
      persistence: this.eventPresentationSettingsPersistence
        ? {
          enabled: true,
          pending: this.eventPresentationSettingsPersistence.pendingSnapshot !== null
        }
        : { enabled: false, pending: false }
    };
  }

  listEventPresentationRows() {
    return listEventPresentationRows(this.eventPresentationSettingsStore.getSnapshot().settings);
  }

  getEffectRules(kind) {
    if (kind !== 'visual') throw Object.assign(new Error('Sound effect rules are removed; use custom sound event bindings'), { code: 'EFFECT_RULE_KIND_REMOVED' });
    const settings = this.eventPresentationSettingsStore.getSnapshot().settings;
    return { kind, rules: settings[`${kind}Rules`] ?? [] };
  }

  async upsertEffectRule(kind, rule) {
    if (kind !== 'visual') throw Object.assign(new Error('Sound effect rules are removed; use custom sound event bindings'), { code: 'EFFECT_RULE_KIND_REMOVED' });
    return this.updateEventPresentationSettings({ [`${kind}Rules`]: [
      ...this.getEffectRules(kind).rules.filter((item) => item.id !== rule?.id),
      rule
    ] });
  }

  async removeEffectRule(kind, ruleId) {
    if (kind !== 'visual') throw Object.assign(new Error('Sound effect rules are removed; use custom sound event bindings'), { code: 'EFFECT_RULE_KIND_REMOVED' });
    return this.updateEventPresentationSettings({ [`${kind}Rules`]: this.getEffectRules(kind).rules.filter((item) => item.id !== ruleId) });
  }

  async updateEventPresentationSettings(patch = {}) {
    const snapshot = this.eventPresentationSettingsStore.updateSettings(patch);
    try {
      this.notificationApi.setPresentationProfile(createPresentationProfileFromSettings(snapshot.settings));
      this.eventPresentationSettingsStore.markApplied(snapshot.revision);
    } catch (error) {
      this.eventPresentationSettingsStore.markApplyFailed(snapshot.revision, error);
      throw error;
    }
    return this.getEventPresentationSettings();
  }

  previewVisualSettings(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw Object.assign(new Error('Visual preview input must be an object'), { code: 'VISUAL_SETTINGS_PREVIEW_INPUT_INVALID' });
    }
    const labels = Array.isArray(input.labels) ? [...new Set(input.labels)] : [];
    const currentProfile = this.visualSettingsStore.getSnapshot().settings.profile;
    const profile = input.profile ? createVisualProfile(input.profile) : currentProfile;
    const visualInput = {
      labels,
      categoryId: typeof input.categoryId === 'string' ? input.categoryId : null,
      visualProfileId: typeof input.visualProfileId === 'string' ? input.visualProfileId : null,
      status: typeof input.status === 'string' && input.status.trim() ? input.status : 'preview',
      importance: ['low', 'normal', 'high', 'critical'].includes(input.importance) ? input.importance : 'normal'
    };
    const decision = resolveVisualRuleSafe({
      visualInput,
      profile,
      context: { globalEnabled: profile.global.enabled }
    });
    return {
      input: Object.freeze({ labels: Object.freeze(labels), importance: visualInput.importance }),
      decision
    };
  }

  createSoundSettingsPersistence() {
    try {
      const resolved = resolveSoundSettingsPersistenceConfig({
        dataDir: this.ctx.dataDir,
        config: this.ctx.config
      });
      if (!resolved.enabled) return null;
      return this.soundSettingsPersistenceFactory(this.ctx, {
        store: this.soundSettingsStore
      });
    } catch (error) {
      this.recordSoundDiagnostic(error, 'persistence-config');
      return null;
    }
  }

  recordSoundDiagnostic(error, stage) {
    const diagnostic = {
      code: error?.code ?? 'SOUND_SETTINGS_FAILED',
      message: error?.message ?? String(error),
      stage,
      details: error?.details ?? {},
      timestamp: new Date().toISOString()
    };
    this.soundDiagnostics.push(diagnostic);
    if (this.soundDiagnostics.length > 20) this.soundDiagnostics.shift();
    this.ctx.log?.warn?.(
      `[notification-hub-vnext] Sound ${diagnostic.code}: ${diagnostic.message}`,
      diagnostic.details
    );
    return diagnostic;
  }

  recordSoundDiagnosticEvent(payload = {}) {
    try {
      const diagnostic = createSoundDiagnostic({
        ...payload,
        id: payload.id ?? `sound-diagnostic-${++this.soundDiagnosticSequence}`
      });
      this.soundDiagnostics.push(diagnostic);
      if (this.soundDiagnostics.length > 30) this.soundDiagnostics.shift();
      return diagnostic;
    } catch (error) {
      this.ctx.log?.warn?.('[notification-hub-vnext] Sound diagnostic recording failed', error);
      return null;
    }
  }

  getRecentSoundDiagnostics() {
    return this.soundDiagnostics.filter((entry) => entry && entry.summary).slice(-30);
  }

  async restoreSoundSettings() {
    this.soundSettingsPersistence = this.createSoundSettingsPersistence();
    if (!this.soundSettingsPersistence) {
      const snapshot = this.soundSettingsStore.getSnapshot();
      this.notificationApi.setSoundEnabled(snapshot.settings.globalSoundEnabled && snapshot.settings.workModeMuted !== true);
      this.notificationApi.setSoundProfile(snapshot.settings.profile);
      return snapshot;
    }
    this.soundSettingsPersistence.on?.('diagnostic', (diagnostic) => this.recordSoundDiagnostic(diagnostic, 'persistence'));
    try {
      await this.soundSettingsPersistence.restore();
    } catch (error) {
      this.recordSoundDiagnostic(error, 'restore');
    }
    this.soundSettingsPersistence.observe?.();
    const snapshot = this.soundSettingsStore.getSnapshot();
    this.notificationApi.setSoundEnabled(snapshot.settings.globalSoundEnabled && snapshot.settings.workModeMuted !== true);
    this.notificationApi.setSoundProfile(snapshot.settings.profile);
    return snapshot;
  }

  async restoreSoundAssets() {
    try {
      this.soundAssetRegistry = await loadSoundAssetRegistry(this.soundAssetRegistryPath);
    } catch (error) {
      this.soundAssetDiagnostics.push({ code: error.code ?? 'SOUND_ASSET_LOAD_FAILED', message: error.message, details: error.details ?? {}, timestamp: new Date().toISOString() });
      this.ctx.log?.warn?.(`[notification-hub-vnext] Sound asset restore failed: ${error.message}`, error.details);
    }
  }

  async saveSoundAssets() {
    try {
      await saveSoundAssetRegistry(this.soundAssetRegistry, this.soundAssetRegistryPath);
    } catch (error) {
      this.soundAssetDiagnostics.push({ code: error.code ?? 'SOUND_ASSET_SAVE_FAILED', message: error.message, details: error.details ?? {}, timestamp: new Date().toISOString() });
      this.ctx.log?.warn?.(`[notification-hub-vnext] Sound asset save failed: ${error.message}`, error.details);
      throw error;
    }
  }

  async stopSoundSettingsPersistence() {
    const persistence = this.soundSettingsPersistence;
    this.soundSettingsPersistence = null;
    try {
      await persistence?.flush?.();
    } catch (error) {
      this.recordSoundDiagnostic(error, 'flush');
    } finally {
      persistence?.dispose?.();
      this.soundScheduler?.clear?.();
      this.soundBackend?.dispose?.();
    }
  }

  runSoundAssetMutation(task) {
    const result = this.soundAssetMutationQueue.then(task, task);
    this.soundAssetMutationQueue = result.catch(() => {});
    return result;
  }

  getSoundAssetStatus() {
    const profile = this.soundSettingsStore.getSnapshot().settings.profile;
    const assetReferences = Object.fromEntries(this.soundAssetRegistry.list().map((asset) => [asset.soundId, collectSoundAssetReferences(profile, asset.soundId)]));
    return {
      assetRoot: this.soundAssetRoot,
      registryPath: this.soundAssetRegistryPath,
      assets: this.soundAssetRegistry.list(),
      assetReferences,
      diagnostics: this.soundAssetDiagnostics.slice()
    };
  }

  async importSoundPackage(input = {}) {
    return this.runSoundAssetMutation(() => this._importSoundPackage(input));
  }

  async _importSoundPackage({ packageText, conflict = 'reject', conflictBySoundId = {} } = {}) {
    const previousSettings = this.soundSettingsStore.getSnapshot();
    const result = await importSoundPackage({
      packageText,
      assetRoot: this.soundAssetRoot,
      registry: this.soundAssetRegistry,
      conflict,
      conflictBySoundId,
      commit: async (profile) => {
        this.soundSettingsStore.updateSoundSettings({ profile });
        this.notificationApi.setSoundProfile(this.soundSettingsStore.getSnapshot().settings.profile);
        await this.saveSoundAssets();
      },
      rollbackCommit: async () => {
        this.soundSettingsStore.restoreSnapshot({
          version: previousSettings.version,
          revision: previousSettings.revision,
          updatedAt: new Date().toISOString(),
          settings: previousSettings.settings
        });
        this.notificationApi.setSoundProfile(previousSettings.settings.profile);
      }
    });
    return { ...result, assets: this.soundAssetRegistry.list(), assetStatus: this.getSoundAssetStatus() };
  }

  async importSoundAsset(input = {}) {
    return this.runSoundAssetMutation(() => this._importSoundAsset(input));
  }

  async _importSoundAsset({ file, filePath, resource, name, soundId, binding, volume, replaceExisting = false } = {}) {
    let resolvedFilePath = filePath;
    let filename;
    if (resource) {
      if (typeof this.ctx.resources?.materialize !== 'function') {
        throw Object.assign(new Error('Hana resource materialize is unavailable'), { code: 'SOUND_ASSET_RESOURCE_API_UNAVAILABLE' });
      }
      const materialized = await this.ctx.resources.materialize(resource);
      resolvedFilePath = materialized?.filePath;
      filename = materialized?.resource?.displayName || materialized?.resource?.name;
      if (!resolvedFilePath) throw Object.assign(new Error('Selected audio resource has no materialized path'), { code: 'SOUND_ASSET_FILE_READ_FAILED' });
    }
    const previousSoundSettings = this.soundSettingsStore.getSnapshot();
    try {
      const result = await importSoundAsset({
        file,
        filePath: resolvedFilePath,
        filename,
        name,
        soundId,
        binding,
        replaceExisting,
        assetRoot: this.soundAssetRoot,
        registry: this.soundAssetRegistry,
        commit: async (asset) => {
          if (binding) {
            const normalizedBinding = normalizeSoundBindingInput({ ...binding, soundId: asset.soundId, volume });
            const snapshot = this.soundSettingsStore.getSnapshot();
            const profile = upsertSoundBindingRule(snapshot.settings.profile, normalizedBinding);
            const next = this.soundSettingsStore.replaceSoundSettings({ ...snapshot.settings, profile });
            this.notificationApi.setSoundProfile(profile);
            this.soundSettingsStore.markApplied(next.revision);
          }
          await this.saveSoundAssets();
        }
      });
      return { ...result, assets: this.soundAssetRegistry.list(), assetStatus: this.getSoundAssetStatus(), profile: this.soundSettingsStore.getSnapshot().settings.profile };
    } catch (error) {
      if (binding) {
        try {
          const restored = this.soundSettingsStore.replaceSoundSettings(previousSoundSettings.settings);
          this.notificationApi.setSoundProfile(restored.settings.profile);
          this.soundSettingsStore.markApplied(restored.revision);
        } catch {}
      }
      throw error;
    }
  }

  async removeSoundBindingConfiguration({ eventId } = {}) {
    if (!eventId) throw Object.assign(new Error('eventId must be provided'), { code: 'SOUND_BINDING_EVENT_ID_INVALID' });
    const snapshot = this.soundSettingsStore.getSnapshot();
    const profile = removeSoundBinding(snapshot.settings.profile, { eventId });
    const next = this.soundSettingsStore.replaceSoundSettings({ ...snapshot.settings, profile });
    this.notificationApi.setSoundProfile(next.settings.profile);
    this.soundSettingsStore.markApplied(next.revision);
    // A binding removal is user-visible immediately. Flush the debounced
    // coordinator here so a reload or a notification arriving right after the
    // click cannot restore the removed binding from the old snapshot.
    await this.soundSettingsPersistence?.flush?.();
    return this.getSoundSettingsStatus();
  }

  async updateSoundAssetConfiguration({ soundId, eventId, volume } = {}) {
    if (typeof soundId !== 'string' || !soundId.trim()) {
      throw Object.assign(new Error('soundId must be a non-empty string'), { code: 'SOUND_ASSET_ID_INVALID' });
    }
    const asset = this.soundAssetRegistry.get(soundId.trim());
    if (!asset || asset.kind !== 'custom') {
      throw Object.assign(new Error('只能配置已导入的自定义声音'), { code: asset ? 'SOUND_ASSET_BUILTIN_IMMUTABLE' : 'SOUND_ASSET_NOT_FOUND' });
    }
    const snapshot = this.soundSettingsStore.getSnapshot();
    let profile = snapshot.settings.profile;
    if (eventId !== undefined) {
      const normalizedBinding = normalizeSoundBindingInput({ eventId, soundId: asset.soundId, volume });
      profile = upsertSoundBindingRule(profile, normalizedBinding);
    } else {
      throw Object.assign(new Error('eventId must be provided'), { code: 'SOUND_BINDING_EVENT_ID_INVALID' });
    }
    const next = this.soundSettingsStore.replaceSoundSettings({ ...snapshot.settings, profile });
    this.notificationApi.setSoundProfile(next.settings.profile);
    this.soundSettingsStore.markApplied(next.revision);
    return this.getSoundSettingsStatus();
  }

  async deleteSoundAsset(input = {}) {
    return this.runSoundAssetMutation(() => this._deleteSoundAsset(input));
  }

  async _deleteSoundAsset({ soundId } = {}) {
    if (typeof soundId !== 'string' || !soundId.trim()) {
      throw Object.assign(new Error('soundId must be a non-empty string'), { code: 'SOUND_ASSET_ID_INVALID' });
    }
    const asset = this.soundAssetRegistry.get(soundId.trim());
    if (!asset) throw Object.assign(new Error('sound asset is unavailable'), { code: 'SOUND_ASSET_NOT_FOUND' });
    if (asset.kind === 'builtin') throw Object.assign(new Error('内置声音不能删除'), { code: 'SOUND_ASSET_BUILTIN_IMMUTABLE' });
    const root = path.resolve(this.soundAssetRoot);
    const target = path.resolve(root, ...asset.relativePath.split('/'));
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw Object.assign(new Error('sound asset path is invalid'), { code: 'SOUND_ASSET_PATH_INVALID' });
    const backup = `${target}.delete-backup-${process.pid}-${Date.now()}`;
    const previous = this.soundAssetRegistry.list().filter((entry) => entry.kind === 'custom');
    const previousSoundSettings = this.soundSettingsStore.getSnapshot();
    const references = collectSoundAssetReferences(previousSoundSettings.settings.profile, asset.soundId);
    const audioIdle = await this.soundScheduler.waitForIdle?.({ timeoutMs: 5000 });
    if (audioIdle === false) {
      const error = Object.assign(new Error('声音仍在播放，暂时无法删除；请稍后重试'), { code: 'SOUND_ASSET_PLAYBACK_BUSY' });
      error.details = { soundId: asset.soundId, path: target, stage: 'wait-for-playback-idle' };
      throw error;
    }
    let moved = false;
    let settingsChanged = false;
    let stage = 'file-move';
    try {
      if (references.length > 0) {
        const profile = removeSoundBindingRules(previousSoundSettings.settings.profile, asset.soundId);
        const settings = this.soundSettingsStore.replaceSoundSettings({ ...previousSoundSettings.settings, profile });
        this.notificationApi.setSoundProfile(settings.settings.profile);
        this.soundSettingsStore.markApplied(settings.revision);
        settingsChanged = true;
      }
      try {
        await renameWithRetry(target, backup);
        moved = true;
      } catch (cause) {
        if (cause?.code !== 'ENOENT') {
          const error = Object.assign(new Error('声音文件无法删除，可能正在播放或被其他程序占用'), { code: 'SOUND_ASSET_FILE_DELETE_FAILED' });
          error.details = { soundId: asset.soundId, path: target, cause: { code: cause?.code, message: cause?.message } };
          throw error;
        }
        // The file may have been removed outside the plugin. The user still
        // explicitly requested deletion, so clean the stale registry entry.
        this.soundAssetRegistry.remove(asset.soundId);
        try {
          await this.saveSoundAssets();
        } catch (saveError) {
          this.soundAssetRegistry.add(asset);
          throw saveError;
        }
        return {
          soundId: asset.soundId,
          removed: true,
          fileMissing: true,
          assets: this.soundAssetRegistry.list(),
          assetStatus: this.getSoundAssetStatus(),
          profile: this.soundSettingsStore.getSnapshot().settings.profile
        };
      }
      this.soundAssetRegistry.remove(asset.soundId);
      stage = 'registry-save';
      await this.saveSoundAssets();
      // Do not swallow cleanup errors. If the backup cannot be removed,
      // rollback the registry and restore the original file below.
      stage = 'backup-cleanup';
      await rm(backup, { force: true });
      return { soundId: asset.soundId, removed: true, assets: this.soundAssetRegistry.list(), assetStatus: this.getSoundAssetStatus(), profile: this.soundSettingsStore.getSnapshot().settings.profile };
    } catch (cause) {
      if (settingsChanged) {
        try {
          const restored = this.soundSettingsStore.replaceSoundSettings(previousSoundSettings.settings);
          this.notificationApi.setSoundProfile(restored.settings.profile);
          this.soundSettingsStore.markApplied(restored.revision);
        } catch {}
      }
      for (const entry of previous) {
        if (!this.soundAssetRegistry.get(entry.soundId)) this.soundAssetRegistry.add(entry);
      }
      const recoveryErrors = [];
      if (moved) {
        try { await this.saveSoundAssets(); } catch (error) { recoveryErrors.push({ stage: 'registry-restore', error }); }
        try { await renameWithRetry(backup, target); } catch (error) { recoveryErrors.push({ stage: 'file-restore', error }); }
      }
      if (recoveryErrors.length > 0) {
        const recovery = Object.assign(new Error('声音资产删除失败，且自动恢复不完整'), { code: 'SOUND_ASSET_RECOVERY_FAILED' });
        recovery.details = {
          soundId: asset.soundId,
          original: { code: cause?.code, message: cause?.message },
          recovery: recoveryErrors.map(({ stage, error }) => ({ stage, code: error?.code, message: error?.message }))
        };
        throw recovery;
      }
      if (cause?.code?.startsWith('SOUND_ASSET_')) throw cause;
      const error = Object.assign(new Error('声音资产删除失败'), { code: 'SOUND_ASSET_DELETE_FAILED' });
      error.details = { soundId: asset.soundId, stage, cause: { code: cause?.code, message: cause?.message } };
      throw error;
    }
  }

  async exportSoundPackage({ name = 'Notification Hub sounds', destinationDirectory, chooseDestination = false } = {}) {
    const snapshot = this.soundSettingsStore.getSnapshot();
    const result = await exportSoundPackage({
      name,
      profile: snapshot.settings.profile,
      registry: this.soundAssetRegistry,
      assetRoot: this.soundAssetRoot
    });
    const filename = safeFilename(name);
    if (chooseDestination) {
      const saved = await this.soundFilePicker.save({ suggestedName: filename, content: result.packageText });
      return { ...result, savedToFile: saved.cancelled !== true, cancelled: saved.cancelled === true, savedFilename: saved.path || null };
    }
    if (destinationDirectory) {
      if (typeof destinationDirectory !== 'object' || destinationDirectory.kind !== 'local-file' || typeof destinationDirectory.path !== 'string' || !path.isAbsolute(destinationDirectory.path)) {
        throw Object.assign(new Error('请选择 Windows 本地文件夹作为导出位置'), { code: 'SOUND_PACKAGE_DESTINATION_INVALID' });
      }
      if (typeof this.ctx.resources?.write !== 'function') {
        throw Object.assign(new Error('Hana resource write is unavailable'), { code: 'SOUND_PACKAGE_RESOURCE_API_UNAVAILABLE' });
      }
      const targetResource = { kind: 'local-file', path: path.join(destinationDirectory.path, filename) };
      await this.ctx.resources.write(targetResource, result.packageText, { emit: true });
      return { ...result, savedToResource: true, savedFilename: filename };
    }
    const exportRoot = path.resolve(this.ctx?.dataDir || process.cwd(), 'sound-exports');
    await mkdir(exportRoot, { recursive: true });
    const fallbackFilename = `${safeFilename(name).slice(0, -'.nhsound'.length)}-${Date.now()}.nhsound`;
    const filePath = path.join(exportRoot, fallbackFilename);
    await writeFile(filePath, result.packageText, { encoding: 'utf8', flag: 'wx' });
    return { ...result, fileResource: { kind: 'local-file', path: filePath } };
  }

  async exportSoundComboPackage({ name = 'Notification Hub sound combo', destinationDirectory, chooseDestination = false } = {}) {
    const snapshot = this.soundSettingsStore.getSnapshot();
    const result = await exportSoundComboPackage({ name, profile: snapshot.settings.profile, registry: this.soundAssetRegistry, assetRoot: this.soundAssetRoot });
    const filename = `${safeFilename(name).replace(/\.nhsound$/i, '')}.nhcombo`;
    if (chooseDestination) {
      const saved = await this.soundFilePicker.save({
        suggestedName: filename,
        content: result.packageText,
        extension: 'nhcombo',
        title: '导出自定义声音组合包',
        filter: 'Notification Hub sound combo (*.nhcombo)|*.nhcombo|All files (*.*)|*.*'
      });
      return { ...result, savedToFile: saved.cancelled !== true, cancelled: saved.cancelled === true, savedFilename: saved.path || null };
    }
    const exportRoot = path.resolve(this.ctx?.dataDir || process.cwd(), 'sound-exports');
    await mkdir(exportRoot, { recursive: true });
    const filePath = path.join(exportRoot, `${safeFilename(name).replace(/\.nhsound$/i, '')}-${Date.now()}.nhcombo`);
    await writeFile(filePath, result.packageText, { encoding: 'utf8', flag: 'wx' });
    return { ...result, fileResource: { kind: 'local-file', path: filePath } };
  }

  async importSoundComboPackage(input = {}) {
    return this.runSoundAssetMutation(() => this._importSoundComboPackage(input));
  }

  async _importSoundComboPackage({ packageText, conflict = 'reject', bindingConflict = 'reject', bindingConflictByEventId = {} } = {}) {
    const previousSettings = this.soundSettingsStore.getSnapshot();
    const result = await importSoundComboPackage({
      packageText,
      assetRoot: this.soundAssetRoot,
      registry: this.soundAssetRegistry,
      profile: previousSettings.settings.profile,
      conflict,
      bindingConflict,
      bindingConflictByEventId,
      commitProfile: async (profile) => {
        this.soundSettingsStore.updateSoundSettings({ profile });
        this.notificationApi.setSoundProfile(this.soundSettingsStore.getSnapshot().settings.profile);
        await this.saveSoundAssets();
      },
      rollbackProfile: async () => {
        this.soundSettingsStore.restoreSnapshot({ version: previousSettings.version, revision: previousSettings.revision, updatedAt: new Date().toISOString(), settings: previousSettings.settings });
        this.notificationApi.setSoundProfile(previousSettings.settings.profile);
      }
    });
    return { ...result, assets: this.soundAssetRegistry.list(), assetStatus: this.getSoundAssetStatus() };
  }

  async testSoundAsset({ soundId } = {}) {
    if (typeof soundId !== 'string' || !soundId.trim()) {
      throw Object.assign(new Error('soundId must be a non-empty string'), { code: 'SOUND_ASSET_ID_INVALID' });
    }
    const asset = this.soundAssetRegistry.resolvePlayback(soundId.trim());
    if (!asset || ['missing', 'disabled'].includes(asset.kind)) {
      throw Object.assign(new Error('sound asset is unavailable'), { code: asset?.diagnostic ?? 'SOUND_ASSET_NOT_FOUND' });
    }
    const snapshot = this.soundSettingsStore.getSnapshot();
    if (snapshot.settings.globalSoundEnabled === false || snapshot.settings.workModeMuted === true) {
      const reason = snapshot.settings.workModeMuted === true ? 'work-mode-muted' : 'global-disabled';
      this.recordSoundDiagnosticEvent({ source: 'sound-asset-test', decision: { play: false, soundId: asset.soundId, volume: 0, reason }, scheduling: { status: 'skipped', reason } });
      return { soundId: asset.soundId, scheduled: false, playback: null, reason };
    }
    const decision = {
      play: true,
      soundId: asset.soundId,
      cue: asset.kind === 'builtin' ? asset.builtinCue : null,
      volume: snapshot.settings.profile.global.volume,
      priority: 'normal',
      reason: 'sound-asset-test',
      suppressDuplicates: snapshot.settings.profile.global.suppressDuplicates !== false,
      cooldownMs: 0
    };
    const playback = await this.soundScheduler.schedule(decision, {
      stableKey: `sound-asset-test-${asset.soundId}-${Date.now().toString(36)}`,
      source: 'sound-asset-test',
      cooldownMs: 0
    });
    this.recordSoundDiagnosticEvent({ source: 'sound-asset-test', decision, scheduling: playback, playback: playback?.playback ?? null });
    return { soundId: asset.soundId, scheduled: true, decision, playback };
  }

  getSoundSettingsStatus() {
    const snapshot = this.soundSettingsStore.getSnapshot();
    const persistence = this.soundSettingsPersistence;
    return {
      settings: snapshot.settings,
      profile: snapshot.settings.profile,
      revision: snapshot.revision,
      savedRevision: snapshot.savedRevision,
      appliedRevision: snapshot.appliedRevision,
      status: snapshot.status,
      applyError: snapshot.applyError,
      assets: this.soundAssetRegistry.list(),
      assetReferences: this.getSoundAssetStatus().assetReferences,
      diagnostics: this.soundDiagnostics.filter((entry) => entry?.code).slice(),
      soundDiagnostics: this.getRecentSoundDiagnostics(),
      effectRuleTargets: listEffectRuleTargets(),
      persistence: persistence
        ? { enabled: true, pending: persistence.pendingSnapshot !== null }
        : { enabled: false, pending: false },
    };
  }

  clearSoundDiagnostics() {
    this.soundDiagnostics = this.soundDiagnostics.filter((entry) => entry?.code);
    return this.getSoundSettingsStatus();
  }

  async exportSoundDiagnostics({ name = 'notification-hub-sound-status' } = {}) {
    const content = `${JSON.stringify({
      format: 'notification-hub-sound-status',
      version: 1,
      exportedAt: new Date().toISOString(),
      diagnostics: this.getRecentSoundDiagnostics()
    }, null, 2)}\n`;
    const saved = await this.soundFilePicker.save({
      suggestedName: name,
      content,
      extension: 'json',
      title: '导出声音状态',
      filter: 'JSON 声音状态 (*.json)|*.json|All files (*.*)|*.*'
    });
    return { savedToFile: saved.cancelled !== true, cancelled: saved.cancelled === true, savedFilename: saved.path || null, bytes: Buffer.byteLength(content, 'utf8'), format: 'notification-hub-sound-status', version: 1 };
  }

  async updateSoundSettings(patch = {}) {
    const nextPatch = { ...patch };
    if (typeof patch.globalSoundEnabled === 'boolean') {
      nextPatch.profile = {
        ...(patch.profile && typeof patch.profile === 'object' ? patch.profile : {}),
        global: {
          ...(patch.profile?.global && typeof patch.profile.global === 'object' ? patch.profile.global : {}),
          enabled: patch.globalSoundEnabled
        }
      };
    } else if (typeof patch.profile?.global?.enabled === 'boolean') {
      nextPatch.globalSoundEnabled = patch.profile.global.enabled;
    }
    const snapshot = this.soundSettingsStore.updateSoundSettings(nextPatch);
    this.notificationApi.setSoundEnabled(snapshot.settings.globalSoundEnabled && snapshot.settings.workModeMuted !== true);
    this.notificationApi.setSoundProfile(snapshot.settings.profile);
    this.soundSettingsStore.markApplied(snapshot.revision);
    return this.getSoundSettingsStatus();
  }

  previewSoundSettings(input = {}) {
    const soundInput = normalizeSoundPreviewInput(input);
    const snapshot = this.soundSettingsStore.getSnapshot();
    const resolved = resolveSoundRule({
      presentation: { soundInput },
      profile: snapshot.settings.profile,
      context: { globalEnabled: snapshot.settings.globalSoundEnabled && snapshot.settings.workModeMuted !== true }
    });
    let decision = resolved;
    if (soundInput.soundId && resolved.reason !== 'global-disabled') {
      const asset = this.soundAssetRegistry.resolvePlayback(soundInput.soundId);
      if (!asset || ['missing', 'disabled'].includes(asset.kind)) {
        throw Object.assign(new Error('试听声音不存在或已禁用'), { code: asset?.diagnostic ?? 'SOUND_ASSET_NOT_FOUND' });
      }
      const temporaryVolume = soundInput.volume == null ? null : soundInput.volume;
      const volumeLayers = temporaryVolume == null ? resolved.volumeLayers : { ...resolved.volumeLayers, rule: temporaryVolume, final: Math.max(0, Math.min(1, (resolved.volumeLayers.global ?? 1) * (resolved.volumeLayers.category ?? 1) * temporaryVolume)) };
      decision = { ...resolved, soundId: asset.soundId, cue: asset.kind === 'builtin' ? asset.builtinCue : null, volume: volumeLayers.final, volumeLayers, matchedBy: 'temporary-asset', matchedRuleId: null };
    }
    return { input: soundInput, decision };
  }

  explainSoundSettings(input = {}) {
    const preview = this.previewSoundSettings(input);
    return {
      ...preview,
      explanation: createSoundRuleExplanation({ input: preview.input, decision: preview.decision })
    };
  }

  async testSoundSettings(input = {}) {
    const preview = this.previewSoundSettings(input);
    if (preview.decision.reason === 'global-disabled') {
      this.recordSoundDiagnosticEvent({ source: 'settings-test', input: preview.input, decision: preview.decision, scheduling: { status: 'skipped', reason: 'global-disabled' } });
      return { ...preview, scheduled: false, playback: null, testBypassedPolicy: false };
    }
    const testDecision = preview.decision.play
      ? preview.decision
      : { ...preview.decision, play: true, reason: 'settings-test-policy-bypassed', cooldownMs: 0 };
    const playback = await this.soundScheduler.schedule(testDecision, {
      stableKey: `settings-test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      source: 'settings-test',
      cooldownMs: 0
    });
    this.recordSoundDiagnosticEvent({ source: 'settings-test', input: preview.input, decision: testDecision, scheduling: playback, playback: playback?.playback ?? null });
    return { ...preview, decision: testDecision, scheduled: true, playback, testBypassedPolicy: !preview.decision.play };
  }

  async runSoundWorkbench({ input = {}, count = 1, intervalMs = 0 } = {}) {
    if (!Number.isInteger(count) || count < 1 || count > 20) {
      throw Object.assign(new Error('声音实验次数必须是 1 到 20 的整数'), { code: 'SOUND_WORKBENCH_INPUT_INVALID' });
    }
    if (!Number.isInteger(intervalMs) || intervalMs < 0 || intervalMs > 2000) {
      throw Object.assign(new Error('声音实验间隔必须是 0 到 2000 毫秒的整数'), { code: 'SOUND_WORKBENCH_INPUT_INVALID' });
    }
    const normalized = normalizeSoundPreviewInput({
      ...(input && typeof input === 'object' ? input : {}),
      soundId: null,
      volume: null
    });
    const stableKey = `sound-workbench-${normalized.labels.join(',')}-${normalized.event}-${normalized.importance}`;
    const runOne = async (index) => {
      if (intervalMs > 0 && index > 0) await new Promise((resolve) => setTimeout(resolve, intervalMs * index));
      const preview = this.previewSoundSettings(normalized);
      const publicInput = Object.fromEntries(Object.entries(preview.input).filter(([key]) => !['soundId', 'volume'].includes(key)));
      let playback = null;
      let scheduling = { status: 'skipped', reason: preview.decision.reason };
      if (preview.decision.play) {
        playback = await this.soundScheduler.schedule(preview.decision, {
          stableKey,
          source: 'sound-workbench',
          awaitPlayback: false,
          onSettled: (settled) => {
            this.recordSoundDiagnosticEvent({
              source: 'sound-workbench',
              input: publicInput,
              decision: preview.decision,
              scheduling: settled,
              playback: settled?.playback ?? null
            });
          }
        });
        scheduling = playback;
      }
      const diagnostic = this.recordSoundDiagnosticEvent({
        source: 'sound-workbench',
        input: publicInput,
        decision: preview.decision,
        scheduling,
        playback: playback?.playback ?? null
      });
      return {
        index: index + 1,
        input: publicInput,
        decision: preview.decision,
        scheduled: Boolean(preview.decision.play),
        playback,
        explanation: createSoundRuleExplanation({ input: publicInput, decision: preview.decision, diagnostic })
      };
    };
    const runs = await Promise.all(Array.from({ length: count }, (_, index) => runOne(index)));
    return { scenario: 'single-input', count, intervalMs, runs };
  }

  createSettingsPersistence() {
    try {
      return this.settingsPersistenceFactory(this.ctx, { store: this.settingsStore });
    } catch (error) {
      this.recordSettingsDiagnostic({
        code: error.code ?? 'SETTINGS_STORE_CONFIG_INVALID',
        message: error.message,
        details: error.details ?? {},
        timestamp: new Date().toISOString()
      });
      return null;
    }
  }

  recordRuntimeDiagnostic(diagnostic, source = 'runtime') {
    const normalized = normalizeRuntimeDiagnostic(diagnostic, source);
    this.runtimeDiagnostics.push(normalized);
    if (this.runtimeDiagnostics.length > 100) this.runtimeDiagnostics.shift();
    return normalized;
  }

  recordSettingsDiagnostic(diagnostic) {
    const normalized = {
      code: diagnostic?.code ?? 'SETTINGS_RUNTIME_SYNC_FAILED',
      message: diagnostic?.message ?? String(diagnostic),
      details: sanitizeDiagnosticDetails(diagnostic?.details ?? {}),
      timestamp: diagnostic?.timestamp ?? new Date().toISOString()
    };
    this.settingsDiagnostics.push(normalized);
    if (this.settingsDiagnostics.length > 20) this.settingsDiagnostics.shift();
    this.ctx.log?.warn?.(
      `[notification-hub-vnext] Settings ${normalized.code}: ${normalized.message}`,
      normalized.details
    );
    return normalized;
  }

  async stopSettingsRuntimeSync() {
    const sync = this.settingsRuntimeSync;
    this.settingsRuntimeSync = null;
    try {
      await sync?.stop();
    } catch (error) {
      this.recordSettingsDiagnostic({
        code: error.code ?? 'SETTINGS_RUNTIME_SYNC_STOP_FAILED',
        message: error.message,
        details: error.details ?? {},
        timestamp: new Date().toISOString()
      });
    } finally {
      this.settingsPersistence = null;
    }
  }

  recordNotificationDiagnostic(error, stage) {
    const diagnostic = {
      code: error.code ?? 'NOTIFICATION_STORE_PERSIST_FAILED',
      message: error.message ?? String(error),
      stage,
      details: error.details ?? {},
      timestamp: new Date().toISOString()
    };
    this.notificationDiagnostics.push(diagnostic);
    if (this.notificationDiagnostics.length > 20) this.notificationDiagnostics.shift();
    this.ctx.log?.warn?.(
      `[notification-hub-vnext] Notification persistence ${stage} failed: ${diagnostic.code} ${diagnostic.message}`,
      diagnostic.details
    );
    return diagnostic;
  }

  startNotificationEventSubscription() {
    this.stopNotificationEventSubscription();
    if (typeof this.ctx.bus?.subscribe !== 'function') return;

    try {
      this.notificationEventAdapter = createNotificationEventAdapter({
        notificationApi: this.notificationApi,
        log: this.ctx.log
      });
      this.notificationEventUnsubscribe = this.ctx.bus.subscribe((event, sessionPath) => {
        const result = this.notificationEventAdapter?.handle(event, sessionPath);
        if (result?.diagnostic) this.recordNotificationDiagnostic(result.diagnostic, 'event');
      });
      this.ctx.log?.info?.('[DEBUG-NHVNEXT-EVENTBUS-20260810] subscription ready');
    } catch (error) {
      this.notificationEventAdapter?.dispose();
      this.notificationEventAdapter = null;
      this.notificationEventUnsubscribe = null;
      this.recordNotificationDiagnostic(error, 'event-subscribe');
    }
  }

  startNotificationSceneSubscription() {
    this.stopNotificationSceneSubscription();
    this.notificationSceneUnsubscribe = this.notificationStore.subscribe((change) => {
      if (change?.type !== 'add' || !change.record) return;
      if (change.record.metadata?.test === true && change.record.metadata?.testCreateCards === false) return;
      queueMicrotask(() => {
        if (this.notificationSceneUnsubscribe) this.enqueueNotificationScene(change.record);
      });
    });
  }

  stopNotificationSceneSubscription() {
    this.notificationSceneUnsubscribe?.();
    this.notificationSceneUnsubscribe = null;
    for (const timer of this.notificationSceneTimers.values()) clearTimeout(timer);
    this.notificationSceneTimers.clear();
    this.notificationSceneVisibleIds.clear();
    this.notificationSceneCardChannels.clear();
    this.notificationBehaviorManagers.clear();
    this.notificationSceneQueues.clear();
    this.notificationSceneDrainPromises.clear();
    this.notificationSceneDismissQueue.clearPending();
  }

  notificationSceneChannelForRecord(record) {
    try {
      const presentationInput = createNotificationPresentationInput(
        record,
        projectNotificationCategories(record)
      );
      return presentationInput.selector?.behavior?.channelId ?? '__legacy__';
    } catch (error) {
      this.recordNotificationDiagnostic(error, 'scene-channel');
      return '__legacy__';
    }
  }

  enqueueNotificationScene(record) {
    if (!record) return;
    const channelId = this.notificationSceneChannelForRecord(record);
    const queue = this.notificationSceneQueues.get(channelId) ?? [];
    if (queue.some((queued) => queued.notificationId === record.notificationId)) return;
    queue.push(record);
    this.notificationSceneQueues.set(channelId, queue);
    this.drainNotificationSceneQueue(channelId);
  }

  drainNotificationSceneQueue(channelId = null) {
    if (!this.runtimeHost || this.runtimeHost.state !== 'running'
      || typeof this.runtimeHost.client?.request !== 'function') return Promise.resolve();
    const channelIds = channelId === null
      ? [...this.notificationSceneQueues.keys()]
      : [channelId];
    return Promise.all(channelIds.map((currentChannelId) => {
      const existing = this.notificationSceneDrainPromises.get(currentChannelId);
      if (existing) return existing;
      const promise = (async () => {
        const queue = this.notificationSceneQueues.get(currentChannelId);
        if (!queue) return;
        while (queue.length > 0) {
          const record = queue.shift();
          try {
            await this.showNotificationScene(record);
          } catch (error) {
            this.recordNotificationDiagnostic(error, 'scene-create');
          }
        }
      })().finally(() => {
        this.notificationSceneDrainPromises.delete(currentChannelId);
        const queue = this.notificationSceneQueues.get(currentChannelId);
        if (queue?.length === 0) this.notificationSceneQueues.delete(currentChannelId);
      });
      this.notificationSceneDrainPromises.set(currentChannelId, promise);
      return promise;
    }));
  }

  async waitForNotificationSceneQueues() {
    while (true) {
      const pendingPromises = [...this.notificationSceneDrainPromises.values()];
      const hasQueuedRecords = [...this.notificationSceneQueues.values()].some((queue) => queue.length > 0);
      if (pendingPromises.length === 0) {
        if (!hasQueuedRecords) return;
        this.drainNotificationSceneQueue();
        continue;
      }
      await Promise.all(pendingPromises);
    }
  }

  async showNotificationScene(record) {
    const host = this.runtimeHost;
    if (!host || host.state !== 'running' || typeof host.client?.request !== 'function') {
      const error = new Error('Native Runtime is not running; notification scene was not created');
      error.code = 'RUNTIME_NOTIFICATION_SCENE_UNAVAILABLE';
      throw error;
    }
    const healthResponse = await host.client.request('health', {}, { retryable: true, maxAttempts: 2 });
    const health = healthResponse?.payload?.result ?? {};
    const existing = Array.isArray(health.sceneCards) ? health.sceneCards : [];
    const layout = health.layout ?? { direction: 'right', anchor: 'bottom-left', spacing: 12 };
    const visualProfile = this.visualSettingsStore.getSnapshot().settings.profile;
    const projectedVisual = visualProfile.card?.types?.[visualProfile.card.activeType ?? 'minimal'] ?? {};
    const projectedCardDimensions = notificationCardDimensions(projectedVisual.appearance);
    const notificationCards = existing.filter((card) => notificationIdFromCardId(card?.id));
    const workAreaWidth = Number.isFinite(health.workArea?.width) && health.workArea.width > 0
      ? health.workArea.width
      : null;
    const spacing = Number.isInteger(layout.spacing) && layout.spacing >= 0 ? layout.spacing : 12;
    const retainedNotificationCards = [...notificationCards];
    const nonNotificationCards = existing.filter((card) => !notificationIdFromCardId(card?.id));
    const projectedCard = { width: projectedCardDimensions.width };
    while (retainedNotificationCards.length >= RUNTIME_NOTIFICATION_MAX_VISIBLE
      || (workAreaWidth !== null
        && shelfExtent([...nonNotificationCards, ...retainedNotificationCards, projectedCard], spacing) > workAreaWidth)) {
      const oldest = retainedNotificationCards.shift();
      if (!oldest) break;
      const oldestNotificationId = notificationIdFromCardId(oldest.id);
      if (oldestNotificationId) {
        await this.dismissNotificationScene(oldestNotificationId, 'dismissed');
      } else {
        await host.client.request('scene.dismiss', { id: oldest.id }, {
          retryable: false,
          timeoutMs: RUNTIME_SCENE_DISMISS_TIMEOUT_MS
        });
      }
      this.notificationSceneVisibleIds.delete(oldestNotificationId);
      this.removeNotificationBehaviorCard(oldestNotificationId);
      const timer = this.notificationSceneTimers.get(oldestNotificationId);
      if (timer) clearTimeout(timer);
      this.notificationSceneTimers.delete(oldestNotificationId);
      const oldRecord = this.notificationStore.get(oldestNotificationId);
      if (oldRecord?.status === 'shown') {
        try {
          this.notificationStore.setStatus(oldestNotificationId, 'dismissed');
        } catch (error) {
          this.recordNotificationDiagnostic(error, 'scene-evict');
        }
      }
    }
    const presentationInput = createNotificationPresentationInput(record, projectNotificationCategories(record));
    const selector = presentationInput.selector ?? null;
    const behavior = selector ? this.resolveNotificationBehavior(selector, record) : null;
    const visual = resolveVisualRuleSafe({
      visualInput: presentationInput.visualInput,
      profile: visualProfile,
      context: { globalEnabled: visualProfile.global.enabled }
    });
    const visualPayload = {
      enabled: visual.enabled,
      preset: visual.preset,
      intensity: visual.intensity,
      category: visual.category,
      cardType: visual.cardType,
      behavior: visual.behavior,
      appearance: visual.appearance
    };
    const presentation = selector ? {
      eventId: selector.eventId,
      categoryId: selector.categoryId,
      eventTypeId: selector.eventTypeId,
      visualProfileId: selector.visual.visualProfileId
    } : null;
    const card = notificationCardPayload(
      record,
      retainedNotificationCards.length % RUNTIME_NOTIFICATION_MAX_VISIBLE,
      health.workArea,
      layout,
      visualPayload,
      presentation,
      behavior ? {
        behaviorProfileId: behavior.behaviorProfileId,
        behaviorChannelId: behavior.behaviorChannelId
      } : null
    );
    const response = await host.client.request('scene.create', card, {
      retryable: false,
      idempotencyKey: `notification-scene-${record.notificationId}`
    });
    this.notificationSceneVisibleIds.add(record.notificationId);
    if (behavior?.behaviorChannelId) {
      this.notificationSceneCardChannels.set(record.notificationId, behavior.behaviorChannelId);
      this.notificationBehaviorManagers.get(behavior.behaviorChannelId)?.enqueue({
        cardId: record.notificationId,
        notificationId: record.notificationId,
        eventId: behavior.eventId,
        visualProfileId: behavior.visualProfileId,
        payload: { sceneCardId: card.id }
      });
    }
    try {
      this.notificationStore.setStatus(record.notificationId, 'shown');
    } catch (error) {
      this.recordNotificationDiagnostic(error, 'scene-status');
    }
    const configuredLifetimeSeconds = this.notificationDisplaySettings.cardLifetimeSeconds;
    const lifetimeMs = Number.isInteger(configuredLifetimeSeconds)
      ? configuredLifetimeSeconds * 1000
      : (Number.isInteger(record.runtimeHints?.lifetimeMs) && record.runtimeHints.lifetimeMs >= 0
        ? record.runtimeHints.lifetimeMs
        : 120000);
    const timer = setTimeout(() => {
      this.dismissNotificationScene(record.notificationId, 'expired').catch((error) => {
        this.recordNotificationDiagnostic(error, 'scene-expire');
      });
    }, lifetimeMs);
    timer.unref?.();
    this.notificationSceneTimers.set(record.notificationId, timer);
    return { card, response: response?.payload?.result ?? null };
  }

  removeNotificationBehaviorCard(notificationId) {
    const channelId = this.notificationSceneCardChannels.get(notificationId);
    if (!channelId) return;
    const manager = this.notificationBehaviorManagers.get(channelId);
    manager?.remove(notificationId);
    this.notificationSceneCardChannels.delete(notificationId);
    if (manager && manager.snapshot().cards.length === 0) this.notificationBehaviorManagers.delete(channelId);
  }

  resolveNotificationBehavior(selector, record) {
    const behaviorProfileId = selector.behavior.behaviorProfileId;
    const behaviorChannelId = selector.behavior.channelId;
    let manager = this.notificationBehaviorManagers.get(behaviorChannelId);
    if (!manager) {
      manager = createBehaviorManager({
        channelId: behaviorChannelId,
        profile: createBehaviorProfile({ mode: behaviorProfileId, profileId: behaviorProfileId, channelId: behaviorChannelId })
      });
      this.notificationBehaviorManagers.set(behaviorChannelId, manager);
    }
    return Object.freeze({
      behaviorProfileId,
      behaviorChannelId,
      eventId: selector.eventId,
      visualProfileId: selector.visual.visualProfileId,
      notificationId: record.notificationId
    });
  }

  dismissNotificationScene(notificationId, status = 'dismissed') {
    return this.notificationSceneDismissQueue.enqueue({ notificationId, status });
  }

  async performNotificationSceneDismiss(notificationId, status = 'dismissed') {
    const timer = this.notificationSceneTimers.get(notificationId);
    if (timer) clearTimeout(timer);
    this.notificationSceneTimers.delete(notificationId);
    this.removeNotificationBehaviorCard(notificationId);
    const host = this.runtimeHost;
    if (host?.state === 'running' && typeof host.client?.request === 'function') {
      try {
        await host.client.request('scene.dismiss', { id: notificationCardId(notificationId) }, {
          retryable: false,
          timeoutMs: RUNTIME_SCENE_DISMISS_TIMEOUT_MS
        });
      } catch (error) {
        if (error?.code !== 'RUNTIME_SCENE_CARD_NOT_FOUND') throw error;
      }
    }
    const record = this.notificationStore.get(notificationId);
    if (record && record.status === 'shown') this.notificationStore.setStatus(notificationId, status);
    return { notificationId, status };
  }

  handleNativeSceneChanged(payload) {
    const eventPayload = payload?.payload ?? payload;
    const snapshot = eventPayload?.snapshot ?? eventPayload?.result?.sceneStateSnapshot;
    if (!snapshot || !Array.isArray(snapshot.cards)) return;
    const change = eventPayload?.change ?? eventPayload?.result?.change;
    const changedNotificationId = notificationIdFromCardId(change?.targetId);
    if (changedNotificationId && change?.target === 'card') {
      this.notificationSceneVisibleIds.delete(changedNotificationId);
      this.removeNotificationBehaviorCard(changedNotificationId);
      const timer = this.notificationSceneTimers.get(changedNotificationId);
      if (timer) clearTimeout(timer);
      this.notificationSceneTimers.delete(changedNotificationId);
      const record = this.notificationStore.get(changedNotificationId);
      if (record?.status === 'shown') {
        try {
          this.notificationStore.setStatus(changedNotificationId, 'dismissed');
        } catch (error) {
          this.recordNotificationDiagnostic(error, 'scene-dismiss');
        }
      }
      return;
    }
    const visibleIds = new Set(
      snapshot.cards.map((card) => notificationIdFromCardId(card?.id)).filter(Boolean)
    );
    for (const notificationId of this.notificationSceneVisibleIds) {
      if (visibleIds.has(notificationId)) continue;
      this.notificationSceneVisibleIds.delete(notificationId);
      this.removeNotificationBehaviorCard(notificationId);
      const timer = this.notificationSceneTimers.get(notificationId);
      if (timer) clearTimeout(timer);
      this.notificationSceneTimers.delete(notificationId);
      const record = this.notificationStore.get(notificationId);
      if (record?.status === 'shown') {
        try {
          this.notificationStore.setStatus(notificationId, 'dismissed');
        } catch (error) {
          this.recordNotificationDiagnostic(error, 'scene-dismiss');
        }
      }
    }
  }

  stopNotificationEventSubscription() {
    const unsubscribe = this.notificationEventUnsubscribe;
    const adapter = this.notificationEventAdapter;
    this.notificationEventUnsubscribe = null;
    this.notificationEventAdapter = null;
    try {
      unsubscribe?.();
    } catch (error) {
      this.recordNotificationDiagnostic(error, 'event-unsubscribe');
    } finally {
      adapter?.dispose();
    }
  }

  async startNotificationPersistence() {
    this.notificationPersistence = null;
    this.notificationUnsubscribe = null;
    try {
      const resolved = resolveNotificationPersistenceConfig({
        dataDir: this.ctx.dataDir,
        config: this.ctx.config
      });
      if (!resolved.enabled) return;
      this.notificationPersistence = this.notificationPersistenceFactory(this.ctx, {
        store: this.notificationStore
      });
      if (!this.notificationPersistence) return;
      this.notificationApi = new NotificationApi({
        store: this.notificationStore,
        persistence: this.notificationPersistence,
        soundConfig: this.soundConfig,
        soundProfile: this.soundSettingsStore.getSnapshot().settings.profile,
        presentationProfile: createPresentationProfileFromSettings(this.eventPresentationSettingsStore.getSnapshot().settings),
        soundScheduler: this.soundScheduler,
        onSoundDiagnostic: (payload) => this.recordSoundDiagnosticEvent(payload)
      });
      this.ctx._notificationHubVNextNotificationApi = this.notificationApi;
      try {
        await this.notificationApi.restoreNotifications();
      } catch (error) {
        this.recordNotificationDiagnostic(error, 'restore');
        return;
      }
      this.notificationUnsubscribe = this.notificationPersistence.observe();
    } catch (error) {
      this.recordNotificationDiagnostic(error, 'start');
    }
  }

  async stopNotificationPersistence() {
    const persistence = this.notificationPersistence;
    if (!persistence) return;
    if (this.notificationUnsubscribe) {
      this.notificationUnsubscribe();
      this.notificationUnsubscribe = null;
    }
    try {
      await persistence.flush();
    } catch (error) {
      this.recordNotificationDiagnostic(error, 'flush');
    } finally {
      this.notificationPersistence = null;
      this.notificationApi = new NotificationApi({
        store: this.notificationStore,
        soundConfig: this.soundConfig,
        soundProfile: this.soundSettingsStore.getSnapshot().settings.profile,
        presentationProfile: createPresentationProfileFromSettings(this.eventPresentationSettingsStore.getSnapshot().settings),
        soundScheduler: this.soundScheduler,
        onSoundDiagnostic: (payload) => this.recordSoundDiagnosticEvent(payload)
      });
    }
  }

  async getNotificationWidgetStatus() {
    return createNotificationWidgetViewModel(this.notificationApi.listNotifications(), {
      limit: resolveSidebarDisplayLimit(this.sidebarDisplaySettings)
    });
  }

  async getRuntimePageStatus() {
    const runtime = await this.getRuntimeTestStatus();
    const health = runtime.health ?? {};
    const persistence = this.runtimeHost?.sceneStatePersistence ?? null;
    const runtimeStatus = runtime.runtimeStatus ?? {};
    return {
      pluginName,
      pluginVersion,
      runtimeVersion: pluginVersion,
      enabled: runtime.enabled,
      state: runtime.state,
      message: runtime.message,
      connected: runtime.connected,
      clientState: runtime.clientState,
      pipeName: runtime.pipeName,
      health: runtime.health
        ? {
          cardCount: Array.isArray(health.sceneCards) ? health.sceneCards.length : 0,
          layout: health.layout ?? null,
          workArea: health.workArea ?? null,
          sceneStateSnapshot: health.sceneStateSnapshot ?? null
        }
        : null,
      sceneStatePersistence: persistence
        ? { enabled: true, pending: persistence.pendingSnapshot !== null }
        : { enabled: false, pending: false },
      lastError: runtime.connected === true && isRuntimeRecoveryDiagnostic(runtimeStatus.lastError)
        ? null
        : runtimeStatus.lastError ?? runtime.requestError ?? runtime.runtimeError ?? null,
      recoveryNotice: runtime.connected === true && isRuntimeRecoveryDiagnostic(runtimeStatus.lastError)
        ? { ...runtimeStatus.lastError }
        : null
    };
  }

  async exportDiagnostics({ name = 'notification-hub-diagnostics' } = {}) {
    const status = await this.getDiagnosticsPageStatus();
    const content = `${JSON.stringify({
      format: 'notification-hub-diagnostics',
      version: 1,
      exportedAt: new Date().toISOString(),
      status
    }, null, 2)}\n`;
    const saved = await this.soundFilePicker.save({
      suggestedName: name,
      content,
      extension: 'json',
      title: '导出 Notification Hub 诊断记录',
      filter: 'JSON 诊断记录 (*.json)|*.json|All files (*.*)|*.*'
    });
    return {
      savedToFile: saved.cancelled !== true,
      cancelled: saved.cancelled === true,
      savedFilename: saved.path || null,
      bytes: Buffer.byteLength(content, 'utf8'),
      format: 'notification-hub-diagnostics',
      version: 1
    };
  }

  async getDiagnosticsPageStatus() {
    const runtime = await this.getRuntimeTestStatus();
    const health = runtime.health ?? {};
    const runtimeStatus = runtime.runtimeStatus ?? {};
    const runtimeEvents = this.runtimeDiagnostics.map((event) => normalizeRuntimeDiagnostic(event, event.source ?? 'runtime'));
    const settingsEvents = this.settingsDiagnostics.map((event) => normalizeRuntimeDiagnostic(event, 'settings'));
    const notificationEvents = this.notificationDiagnostics.map((event) => normalizeRuntimeDiagnostic(event, event.stage ?? 'notification'));
    const diagnostics = [...runtimeEvents, ...settingsEvents, ...notificationEvents]
      .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
    const currentRuntimeError = runtime.connected === true && isRuntimeRecoveryDiagnostic(runtimeStatus.lastError)
      ? null
      : runtimeStatus.lastError || runtime.requestError || runtime.runtimeError || null;
    const currentFailure = runtime.state === 'failed' || runtime.state === 'crashed' || runtime.state === 'stop-failed'
      || runtime.connected !== true && Boolean(currentRuntimeError);
    return {
      pluginName,
      pluginVersion,
      generatedAt: new Date().toISOString(),
      runtime: {
        state: runtime.state,
        message: runtime.message,
        connected: runtime.connected,
        clientState: runtime.clientState,
        pipeName: runtime.pipeName,
        currentError: currentRuntimeError
          ? normalizeRuntimeDiagnostic(currentRuntimeError, 'runtime')
          : null,
        health: runtime.health
          ? {
            cardCount: health.cardCount ?? (Array.isArray(health.sceneCards) ? health.sceneCards.length : 0),
            layout: health.layout ?? null,
            workArea: health.workArea ?? null,
            sceneStateSnapshot: sanitizeDiagnosticDetails(health.sceneStateSnapshot ?? null),
            sceneBehavior: createSceneBehaviorDiagnostics(health.sceneStateSnapshot ?? null)
          }
          : null,
        sceneStatePersistence: this.runtimeHost?.sceneStatePersistence
          ? { enabled: true, pending: this.runtimeHost.sceneStatePersistence.pendingSnapshot !== null }
          : { enabled: false, pending: false }
      },
      summary: {
        total: diagnostics.length,
        errors: diagnostics.filter((event) => event.severity === 'error' || event.severity === 'fatal').length,
        warnings: diagnostics.filter((event) => event.severity === 'warning').length,
        recoverable: diagnostics.filter((event) => event.recoverable).length,
        currentFailure
      },
      diagnostics
    };
  }

  async retryRuntime() {
    if (!this.readRuntimeEnabled()) {
      this.runtimeStatus = {
        state: 'disabled',
        message: 'Runtime 已被配置关闭',
        lastError: null,
        connected: false,
        clientState: null
      };
      return this.getRuntimePageStatus();
    }
    const currentRuntimeStatus = this.runtimeHost?.getRuntimeStatus?.() ?? {};
    if (this.runtimeHost?.state === 'running'
      && this.runtimeHost.client?.connected === true
      && typeof this.runtimeHost.client?.request === 'function'
      && !isRuntimeRecoveryDiagnostic(currentRuntimeStatus.lastError)) {
      return this.getRuntimePageStatus();
    }
    if (this.runtimeHost) await this.stopRuntimeAfterFailure();
    this.runtimeError = null;
    try {
      await this.startRuntimeHost();
      return this.getRuntimePageStatus();
    } catch (error) {
      this.runtimeError = error;
      this.ctx.log?.error?.(
        `[notification-hub-vnext] Native Runtime retry failed: ${error.code ?? 'RUNTIME_RETRY_FAILED'} ${error.message}`,
        error.details
      );
      await this.stopRuntimeAfterFailure();
      this.runtimeStatus = {
        state: 'failed',
        message: 'Runtime 重试启动失败',
        lastError: {
          code: error.code ?? 'RUNTIME_RETRY_FAILED',
          message: error.message,
          stage: 'host-start',
          recoverable: true,
          userAction: 'retry',
          timestamp: new Date().toISOString()
        },
        connected: false,
        clientState: null
      };
      return this.getRuntimePageStatus();
    }
  }

  async startRuntimeHost() {
    this.runtimeHost = this.adapterFactory(this.ctx);
    this.settingsRuntimeSync.setHost(this.runtimeHost);
    this.forwardRuntimeEvents(this.runtimeHost);
    await this.runtimeHost.start();
    this.settingsRuntimeSync.queueApply();
    await this.settingsRuntimeSync.idle();
    await this.drainNotificationSceneQueue();
    this.ctx.log?.info?.(
      `[notification-hub-vnext] Native Runtime started: pipe=${this.runtimeHost.pipeName}`
    );
    return this.runtimeHost;
  }

  async getRuntimeTestStatus() {
    const host = this.runtimeHost;
    const runtimeStatus = host?.getRuntimeStatus?.() ?? this.runtimeStatus;
    this.runtimeStatus = { ...runtimeStatus };
    const status = {
      pluginName,
      pluginVersion,
      enabled: this.readRuntimeEnabled(),
      state: runtimeStatus.state,
      message: runtimeStatus.message,
      runtimeStatus,
      pipeName: host?.pipeName ?? null,
      clientState: runtimeStatus.clientState ?? host?.client?.state ?? null,
      connected: runtimeStatus.connected === true,
      runtimeError: runtimeErrorPayload(this.runtimeError),
      requestError: null,
      health: null
    };
    if (host?.state !== 'running' || typeof host.client?.request !== 'function') return status;
    try {
      const response = await host.client.request('health', {}, { retryable: true, maxAttempts: 2 });
      status.health = response?.payload?.result ?? null;
    } catch (error) {
      status.requestError = runtimeErrorPayload(error);
    }
    return status;
  }

  async getSettingsStatus() {
    const snapshot = this.settingsStore.getSnapshot();
    const runtime = await this.getRuntimeTestStatus();
    const health = runtime.health;
    const sceneStatePersistence = this.runtimeHost?.sceneStatePersistence ?? null;
    const appliedLayout = this.layoutStatus.applied ?? health?.layout ?? null;
    const projectedLayoutStatus = this.layoutStatus.status === 'saved' && appliedLayout
      ? 'applied'
      : this.layoutStatus.status;
    return {
      settings: snapshot.settings,
      revision: snapshot.revision,
      savedRevision: snapshot.savedRevision,
      appliedRevision: snapshot.appliedRevision,
      status: snapshot.status,
      applyError: snapshot.applyError,
      diagnostics: this.settingsDiagnostics.slice(),
      runtimeStatus: { ...runtime.runtimeStatus },
      runtimeHealth: health ? {
        layout: health.layout ?? null,
        sceneCards: Array.isArray(health.sceneCards) ? health.sceneCards : [],
        cardCount: Array.isArray(health.sceneCards) ? health.sceneCards.length : 0,
        workArea: health.workArea ?? null,
        sceneStateSnapshot: health.sceneStateSnapshot ?? null
      } : null,
      layoutStatus: {
        status: projectedLayoutStatus,
        requested: this.layoutStatus.requested,
        applied: appliedLayout,
        error: this.layoutStatus.error
      },
      sceneStatePersistence: sceneStatePersistence
        ? {
          enabled: true,
          filePath: sceneStatePersistence.filePath,
          debounceMs: sceneStatePersistence.debounceMs,
          pending: sceneStatePersistence.pendingSnapshot !== null
        }
        : { enabled: false, filePath: null, debounceMs: null, pending: false },
      persistence: this.settingsPersistence
        ? { enabled: true, filePath: this.settingsPersistence.filePath }
        : { enabled: false, filePath: null },
      sound: this.getSoundSettingsStatus()
    };
  }

  async updateSettings(patch = {}) {
    this.settingsStore.updateSoundSettings(patch);
    try {
      const normalizedPatch = { ...patch };
      if (typeof patch.globalSoundEnabled === 'boolean') {
        normalizedPatch.profile = {
          ...(patch.profile && typeof patch.profile === 'object' ? patch.profile : {}),
          global: {
            ...(patch.profile?.global && typeof patch.profile.global === 'object' ? patch.profile.global : {}),
            enabled: patch.globalSoundEnabled
          }
        };
      } else if (typeof patch.profile?.global?.enabled === 'boolean') {
        normalizedPatch.globalSoundEnabled = patch.profile.global.enabled;
      }
      const soundSnapshot = this.soundSettingsStore.updateSoundSettings(normalizedPatch);
      this.notificationApi.setSoundEnabled(soundSnapshot.settings.globalSoundEnabled && soundSnapshot.settings.workModeMuted !== true);
      this.notificationApi.setSoundProfile(soundSnapshot.settings.profile);
      this.soundSettingsStore.markApplied(soundSnapshot.revision);
    } catch (error) {
      this.recordSoundDiagnostic(error, 'legacy-settings-bridge');
    }
    this.settingsRuntimeSync?.queueApply();
    await this.settingsRuntimeSync?.idle();
    return this.getSettingsStatus();
  }

  async retrySettingsApply() {
    this.settingsRuntimeSync?.queueApply();
    await this.settingsRuntimeSync?.idle();
    return this.getSettingsStatus();
  }

  registerNotificationTestCapability() {
    this.notificationTestCapabilityCleanup?.();
    this.notificationTestCapabilityCleanup = null;
    if (typeof this.ctx.bus?.handle !== 'function') return null;
    try {
      this.notificationTestCapabilityCleanup = this.ctx.bus.handle(
        'notification-hub-vnext.run-test',
        async (input = {}) => this.runNotificationTest(input)
      );
      return this.notificationTestCapabilityCleanup;
    } catch (error) {
      this.recordNotificationDiagnostic(error, 'test-capability-register');
      this.notificationTestCapabilityCleanup = null;
      return null;
    }
  }

  registerNotificationTestTool() {
    this.notificationTestToolCleanup?.();
    this.notificationTestToolCleanup = null;
    if (typeof this.ctx.registerTool !== 'function') return null;
    try {
      this.notificationTestToolCleanup = this.ctx.registerTool({
        name: 'run-notification-test',
        description: '生成带明确事件语义说明的 Notification Hub 压力测试通知卡片，并可选择播放声音。仅用于开发和验收，不代表真实业务通知。',
        parameters: {
          type: 'object',
          properties: {
            count: { type: 'integer', minimum: 1, maximum: 100, description: '生成数量，默认 5' },
            intervalMs: { type: 'integer', minimum: 0, maximum: 5000, description: '通知间隔毫秒，默认 100' },
            events: { type: 'array', items: { type: 'string', enum: [...NOTIFICATION_TEST_EVENTS] }, description: '测试事件名称列表' },
            createCards: { type: 'boolean', description: '是否生成桌面通知卡片，默认 true' },
            playSound: { type: 'boolean', description: '是否播放声音，默认 true' },
            label: { type: 'string', maxLength: 80, description: '测试批次名称' }
          }
        },
        sessionPermission: { kind: 'external_side_effect' },
        execute: async (input) => this.createNotificationTestToolResult(input)
      });
      return this.notificationTestToolCleanup;
    } catch (error) {
      this.recordNotificationDiagnostic(error, 'test-tool-register');
      this.notificationTestToolCleanup = null;
      return null;
    }
  }

  async createNotificationTestToolResult(input = {}) {
    const details = await this.runNotificationTest(input);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(details)
      }],
      details
    };
  }

  async runNotificationTest(input = {}) {
    const normalized = normalizeNotificationTestInput(input);
    const entryPoint = input?.entryPoint === 'tool' || input?.entryPoint === 'command' ? input.entryPoint : 'internal';
    const notifications = createNotificationTestNotifications(normalized);
    const counts = Object.fromEntries(normalized.events.map((event) => [event, 0]));
    const results = [];
    const playbackPromises = [];
    const startedAt = Date.now();
    for (const item of notifications) {
      const metadata = { ...item.notification.metadata, testCreateCards: normalized.createCards, testEntryPoint: entryPoint };
      let result;
      try {
        if (normalized.playSound) {
          result = this.notificationApi.ingestEvent({
            event: item.event,
            notification: { ...item.notification, metadata },
            profiles: [{ id: 'default' }]
          });
        } else {
          const record = this.notificationApi.createNotification({ ...item.notification, metadata });
          result = { record, sound: { scheduled: false, playback: null, decision: { play: false, reason: 'test-sound-disabled' } } };
        }
        counts[item.eventName] += 1;
        const resultEntry = {
          event: item.eventName,
          notificationId: result.record.notificationId,
          sound: result.sound?.decision?.reason ?? null,
          scheduling: null
        };
        results.push(resultEntry);
        if (result.sound?.playback && typeof result.sound.playback.then === 'function') {
          playbackPromises.push(Promise.resolve(result.sound.playback)
            .then((scheduling) => {
              resultEntry.scheduling = scheduling && typeof scheduling === 'object'
                ? {
                    status: scheduling.status ?? 'unavailable',
                    ...(scheduling.reason ? { reason: scheduling.reason } : {}),
                    ...(scheduling.soundKey ? { soundKey: scheduling.soundKey } : {})
                  }
                : { status: 'unavailable' };
            })
            .catch(() => { resultEntry.scheduling = { status: 'failed', reason: 'scheduler-rejected' }; }));
        }
        if (normalized.intervalMs > 0 && item !== notifications.at(-1)) await new Promise((resolve) => setTimeout(resolve, normalized.intervalMs));
      } catch (error) {
        results.push({ event: item.eventName, notificationId: null, error: error.code ?? 'NOTIFICATION_TEST_EVENT_FAILED' });
      }
    }
    await this.soundScheduler?.waitForIdle?.({ timeoutMs: Math.max(5000, normalized.count * Math.max(100, normalized.intervalMs + 100)) });
    await Promise.all(playbackPromises);
    if (normalized.createCards) await this.waitForNotificationSceneQueues();
    return {
      ok: true,
      label: normalized.label,
      entryPoint,
      count: normalized.count,
      intervalMs: normalized.intervalMs,
      events: normalized.events,
      createCards: normalized.createCards,
      playSound: normalized.playSound,
      historyWritten: true,
      counts,
      generated: results.length,
      failed: results.filter((entry) => entry.error).length,
      durationMs: Date.now() - startedAt,
      results,
      activeSounds: this.soundScheduler?.getStatus?.() ?? null,
      storedNotifications: results.filter((entry) => entry.notificationId !== null).length
    };
  }

  async createRuntimeTestCard(input = {}) {
    const host = this.requireRuntimeTestHost();
    const health = await host.client.request('health', {}, { retryable: true, maxAttempts: 2 });
    const healthResult = health?.payload?.result ?? {};
    const position = nextRuntimeTestCardPosition(healthResult.sceneCards, healthResult.workArea);
    const card = {
      id: `${RUNTIME_TEST_CARD_PREFIX}${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`,
      title: nonEmptyText(input.title, 'vNext 测试卡片', 120),
      body: nonEmptyText(input.body, 'Notification Hub vNext Runtime 测试卡片 ✦ 中文 / emoji', 2000),
      ...position,
      ...RUNTIME_TEST_CARD_SIZE
    };
    const response = await host.client.request('scene.create', card, { retryable: false });
    return { card, response: response?.payload?.result ?? null };
  }

  async clearRuntimeTestCards() {
    const host = this.requireRuntimeTestHost();
    const health = await host.client.request('health', {}, { retryable: true, maxAttempts: 2 });
    const cards = health?.payload?.result?.sceneCards;
    const ids = Array.isArray(cards)
      ? cards.map((card) => card?.id).filter((id) => typeof id === 'string' && id.startsWith(RUNTIME_TEST_CARD_PREFIX))
      : [];
    for (const id of ids) {
      await host.client.request('scene.dismiss', { id }, { retryable: false });
    }
    return { dismissed: ids, status: await this.getRuntimeTestStatus() };
  }

  async applyRuntimeTestLayout(input = {}) {
    const host = this.requireRuntimeTestHost();
    const payload = validateShelfLayout(input, 'RUNTIME_TEST_LAYOUT_INVALID');
    const response = await host.client.request('scene.set-mode', payload, { retryable: false });
    const result = response?.payload?.result ?? {};
    return {
      layout: result.layout ?? { layout: 'shelf' },
      response: result,
      status: await this.getRuntimeTestStatus()
    };
  }

  async updateLayoutSettings(input = {}) {
    const payload = validateShelfLayout(input, 'RUNTIME_LAYOUT_INVALID');
    const host = this.requireLayoutHost();
    this.layoutStatus = {
      ...this.layoutStatus,
      status: 'saved',
      requested: payload,
      error: null
    };
    try {
      const response = await host.client.request('scene.set-mode', payload, { retryable: false });
      this.layoutStatus = {
        status: 'applied',
        requested: payload,
        applied: payload,
        error: null
      };
      return {
        ...(await this.getSettingsStatus()),
        layoutStatus: { ...this.layoutStatus },
        response: response?.payload?.result ?? null
      };
    } catch (error) {
      this.layoutStatus = {
        ...this.layoutStatus,
        status: 'apply-failed',
        requested: payload,
        error: runtimeErrorPayload(error)
      };
      return {
        ...(await this.getSettingsStatus()),
        layoutStatus: { ...this.layoutStatus }
      };
    }
  }

  requireRuntimeTestHost() {
    if (this.runtimeHost?.state !== 'running' || typeof this.runtimeHost.client?.request !== 'function') {
      const error = new Error('Native Runtime is not running');
      error.code = this.runtimeError?.code ?? 'RUNTIME_TEST_RUNTIME_UNAVAILABLE';
      throw error;
    }
    return this.runtimeHost;
  }

  requireLayoutHost() {
    if (this.runtimeHost?.state !== 'running' || typeof this.runtimeHost.client?.request !== 'function') {
      const error = new Error('Native Runtime is not running; layout was not saved');
      error.code = 'RUNTIME_LAYOUT_RUNTIME_UNAVAILABLE';
      throw error;
    }
    return this.runtimeHost;
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
    for (const event of ['diagnostic', 'state', 'stderr', 'stdout', 'exit', 'restarted', 'scene.changed']) {
      adapter.on(event, (payload) => {
        if (event === 'scene.changed') this.handleNativeSceneChanged(payload);
        if (event === 'diagnostic') this.recordRuntimeDiagnostic(payload?.payload ?? payload, 'runtime');
        this.runtimeStatus = adapter.getRuntimeStatus?.() ?? this.runtimeStatus;
        this.runtimeError = this.runtimeStatus.lastError ?? this.runtimeError;
        this.ctx.log?.debug?.(`[notification-hub-vnext] runtime:${event}`, payload);
      });
    }
  }

  async stopRuntimeAfterFailure() {
    const adapter = this.runtimeHost;
    if (!adapter) return;
    try {
      await adapter.stop();
      this.runtimeStatus = adapter.getRuntimeStatus?.() ?? {
        state: 'stopped',
        message: 'Runtime 已停止',
        lastError: null,
        connected: false,
        clientState: null
      };
    } catch (error) {
      this.runtimeStatus = adapter.getRuntimeStatus?.() ?? {
        state: 'stop-failed',
        message: 'Runtime 停止失败',
        lastError: { code: error.code ?? 'RUNTIME_STOP_FAILED', message: error.message, stage: 'host-stop' },
        connected: false,
        clientState: null
      };
      this.runtimeError = error;
      this.ctx.log?.warn?.(
        `[notification-hub-vnext] Native Runtime stop failed: ${error.code ?? 'RUNTIME_STOP_FAILED'} ${error.message}`,
        error.details
      );
    } finally {
      this.runtimeHost = null;
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
export * from './api/notification-api.js';
export * from './domain/notification-persistence-config.js';
export * from './domain/notification-profile.js';
export * from './domain/profile-resolver.js';
export * from './domain/content-formatter.js';
export * from './domain/event-classifier.js';
export * from './domain/notification-event-catalog.js';
export * from './domain/notification-semantics.js';
export * from './domain/notification-importance.js';
export * from './domain/notification-presentation-profile.js';
export * from './domain/notification-presentation-selector.js';
export * from './domain/notification-behavior.js';
export * from './domain/notification-behavior-manager.js';
export * from './domain/event-presentation-settings.js';
export * from './domain/event-presentation-settings-store.js';
export * from './domain/notification-ingestion.js';
export * from './domain/notification-deduplication.js';
export * from './domain/notification-grouping.js';
export * from './domain/notification-aggregation.js';
export * from './domain/notification-aggregation-query.js';
export * from './domain/sound-policy.js';
export * from './domain/sound-config.js';
export * from './domain/sound-settings.js';
export * from './domain/sound-profile.js';
export * from './domain/sound-rule-resolver.js';
export * from './domain/sound-scheduler.js';
export * from './domain/sound-settings-persistence-config.js';
export * from './domain/sound-settings-store.js';
export * from './domain/sound-settings-store-persistence.js';
export * from './domain/custom-sound-asset.js';
export * from './domain/sound-asset-registry.js';
export * from './domain/sound-asset-persistence.js';
export * from './domain/sound-package.js';
export * from './domain/sound-package-importer.js';
export * from './domain/sound-package-exporter.js';
export * from './domain/sound-combo-package.js';
export * from './domain/sound-combo-package-exporter.js';
export * from './domain/sound-combo-package-importer.js';
export * from './domain/sound-asset-importer.js';
export * from './domain/notification-rule-target.js';
export * from './domain/settings-store.js';
export * from './domain/notification-display-settings.js';
export * from './domain/notification-classification.js';
export * from './domain/runtime-config.js';
export * from './domain/runtime-config-applier.js';
export * from './domain/runtime-layout.js';
export * from './domain/settings-persistence-config.js';
export * from './domain/settings-runtime-sync.js';
export * from './domain/settings-store-snapshot.js';
export * from './domain/settings-store-store.js';
export * from './domain/settings-store-persistence.js';
export * from './domain/audio-adapter.js';
