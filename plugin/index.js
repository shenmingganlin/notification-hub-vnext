import { createRuntimeHostAdapter } from './runtime/host-config.js';
import { NotificationApi } from './api/notification-api.js';
import { createNotificationServices } from './services/notification-services.js';
import { createNotificationCenterServices } from './services/notification-center-services.js';
import { createSoundSettingsServices } from './services/sound-settings-services.js';
import { createSoundAssetServices } from './services/sound-asset-services.js';
import {
  createNotificationPersistenceFromHostContext,
  resolveNotificationPersistenceConfig
} from './domain/notification-persistence-config.js';
import { resolveSoundRule } from './domain/sound-policy.js';
import { createSoundSettingsPersistenceFromHostContext } from './domain/sound-settings-persistence-config.js';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createWindowsAudioBackend } from './domain/audio-adapter.js';
import { createAudioEngineHost } from './domain/audio-engine-host.js';
import { BUILTIN_CUE_FILES, createAudioEngineBackend } from './domain/audio-engine-backend.js';
import { createSoundScheduler } from './domain/sound-scheduler.js';
import { createSoundDiagnostic } from './domain/sound-diagnostic.js';
import { createSoundRuleExplanation } from './domain/sound-rule-explanation.js';
import { loadSoundAssetRegistry, saveSoundAssetRegistry } from './domain/sound-asset-persistence.js';
import { migrateSoundAssetStorage, resolveSoundAssetStoragePaths } from './domain/sound-asset-storage-path.js';
import { exportSoundPackage } from './domain/sound-package-exporter.js';
import { importSoundPackage } from './domain/sound-package-importer.js';
import { exportSoundComboPackage } from './domain/sound-combo-package-exporter.js';
import { importSoundComboPackage } from './domain/sound-combo-package-importer.js';
import { importSoundAsset } from './domain/sound-asset-importer.js';
import { collectSoundAssetReferences, normalizeSoundBindingInput, removeSoundBinding, removeSoundBindingRules, upsertSoundBindingRule } from './domain/sound-binding.js';
import { createWindowsSaveFilePicker, safeFilename } from './domain/windows-file-picker.js';
import { createWindowsVisualFilePicker } from './domain/windows-visual-file-picker.js';
import { createWindowsFontFilePicker } from './domain/windows-font-file-picker.js';
import { exportVisualPackage as buildVisualPackage, previewImportVisualPackage, importVisualPackage as importVisualPackageData } from './domain/visual-package-io.js';
import { serializeVisualPackageDiagnosticReport } from './domain/visual-package-diagnostic.js';
import {
  createSettingsPersistenceFromHostContext,
  resolveSettingsPersistenceConfig
} from './domain/settings-persistence-config.js';
import { SettingsRuntimeSync } from './domain/settings-runtime-sync.js';
import { createShelfLayout } from './domain/runtime-layout.js';
import { createNotificationEventAdapter } from './events/notification-event-adapter.js';
import { createVisualRuntimePromotionQueue } from './domain/visual-runtime-promotion-queue.js';
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
import { isTickerFlight, splitLegacyTicker, toNativeTickerCharterPayload } from './domain/channel-charter.js';
import { createVisualProfile, resolveTickerMotion } from './domain/visual-settings.js';
import { CARD_ANCHORS, CARD_ASPECT_RATIOS, CARD_BOUNDARIES, CARD_LAYOUTS, CARD_SIZES, MINIMAL_CARD_DEFAULTS, PROPERTIES_DEFAULTS } from './domain/card-visual-settings.js';
import { createBehaviorManager } from './domain/notification-behavior-manager.js';
import { createBehaviorProfile } from './domain/notification-behavior.js';
import { createSceneDismissQueue } from './domain/scene-dismiss-queue.js';
import { createRuntimeRegistry } from './runtime/runtime-registry.js';
import { createVisualRuntimeModeController, createVisualRuntimeMetrics } from './domain/visual-runtime-mode-contract.js';
import { resolveVisualRuntimeModeConfig } from './domain/visual-runtime-mode-config.js';
import { createVisualRuntimeTakeoverAdapter } from './domain/visual-runtime-takeover-adapter.js';

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
import { projectNativeVisualPayload, resolveVisualDraftPayload, spaceToNativeStackLayout } from './domain/native-visual-payload.js';
import { applyAppearanceToRoot, createDefaultTextPartTree, paintPartTree } from './domain/card-part-tree.js';
import {
  agentAvatarAssetId,
  listStudioAgents,
  readAgentIdentity,
  resolveAgentsDir,
  resolveIdentity,
  stageAgentAvatar
} from './domain/agent-identity.js';
import { createVisualSettingsPersistenceFromHostContext } from './domain/visual-settings-persistence-config.js';
import {
  createVisualRegistryPersistence,
  restoreEventPresentationSettings,
  restoreNotificationDisplaySettings,
  restoreSidebarDisplaySettings,
  restoreSoundSettings,
  restoreVisualRegistry,
  restoreVisualSettings,
  stopEventPresentationSettingsPersistence,
  stopNotificationDisplaySettingsPersistence,
  stopSidebarDisplaySettingsPersistence,
  stopSoundSettingsPersistence,
  stopVisualRegistryPersistence,
  stopVisualSettingsPersistence
} from './persistence/host-store-lifecycle.js';
import { createNotificationTestNotifications, createParallelCardSample, normalizeNotificationTestInput, NOTIFICATION_TEST_EVENTS } from './domain/notification-test-generator.js';
import { listEventDefinitions } from './domain/notification-event-catalog.js';
import { EventPresentationSettingsStore } from './domain/event-presentation-settings-store.js';
import { createEventPresentationSettingsPersistenceFromHostContext } from './domain/event-presentation-settings-persistence-config.js';
import { createPresentationProfileFromSettings, listEventPresentationRows } from './domain/event-presentation-settings.js';
import { createPresentationProfile } from './domain/notification-presentation-profile.js';
import { listEffectRuleTargets } from './domain/effect-rules.js';
import { createSceneBehaviorDiagnostics } from './domain/scene-behavior-diagnostics.js';
import { createVisualProfileRegistry } from './domain/visual-profile-registry.js';
import { createEventBindingRegistry } from './domain/event-binding-registry.js';
import { createVisualRegistrySnapshot, projectVisualRegistryToEventSettings } from './domain/visual-registry-persistence.js';
import { createVisualEventSettingsApi } from './domain/visual-event-settings-api.js';
import {
  hasExplicitVisualBinding,
  resolveVisualEventNativeFlight,
  resolveVisualEventCardIntent as resolveVisualEventCardIntentFromState,
  classifyVisualDiagnosticLevel,
  visualPreviewFingerprint,
  TEST_EVENT_PRESENTATION_IDS,
  VISUAL_EVENT_TICKER_CHANNEL
} from './domain/visual-event-native-flight.js';
import { createVisualAssetLibrary } from './domain/visual-asset-library.js';
import { createVisualAssetStorage } from './domain/visual-asset-storage.js';
import { loadVisualAssetSnapshot, saveVisualAssetSnapshot } from './domain/visual-asset-persistence.js';
import { createVisualAssetManifest } from './domain/visual-asset-manifest.js';
import { createFontAssetLibrary } from './domain/font-asset-library.js';
import { createFontAssetStorage } from './domain/font-asset-storage.js';
import { loadFontAssetSnapshot, saveFontAssetSnapshot } from './domain/font-asset-persistence.js';
import { createFontAssetManifest } from './domain/font-asset-manifest.js';
import {
  normalizeRuntimeDiagnostic,
  projectCurrentRuntimeError,
  projectDiagnosticRecords,
  sanitizeDiagnosticDetails,
  summarizeRuntimeDebugPayload,
  isRuntimeRecoveryDiagnostic
} from './runtime/diagnostics-projection.js';

export * from './api/notification-api.js';
export * from './domain/notification-record.js';
export * from './domain/notification-store.js';
export * from './domain/notification-store-snapshot.js';
export * from './domain/notification-store-store.js';
export * from './domain/notification-store-persistence.js';

export const pluginVersion = '0.1.7';
export const pluginName = 'notification-hub-vnext';
export const RUNTIME_TEST_CARD_PREFIX = 'nh-vnext-test-';
export const VISUAL_WORKBENCH_CARD_PREFIX = 'nh-visual-workbench-';
export const VISUAL_PREVIEW_CARD_PREFIX = 'nh-visual-preview-';
export const VISUAL_TRY_CARD_PREFIX = 'nh-visual-try-';
export const VISUAL_EVENT_TEST_CARD_PREFIX = 'nh-visual-event-test-';
export const RUNTIME_NOTIFICATION_CARD_PREFIX = 'nh-vnext-notification-';
const RUNTIME_TEST_CARD_SIZE = Object.freeze({ width: 360, height: 180 });
const RUNTIME_NOTIFICATION_CARD_SIZE = Object.freeze({ width: 420, height: 220 });
const RUNTIME_TEST_CARD_GAP = 20;

function isPlainPreviewRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeVisualPreviewProfile(input) {
  const source = isPlainPreviewRecord(input) ? input : {};
  const sourceCard = isPlainPreviewRecord(source.card) ? source.card : {};
  const activeType = sourceCard.activeType ?? 'minimal';
  const sourceTypes = isPlainPreviewRecord(sourceCard.types) ? sourceCard.types : {};

  // Preview compatibility is intentionally narrower than the persisted/profile contract.
  if (activeType !== 'minimal') return source;

  const sourceType = isPlainPreviewRecord(sourceTypes[activeType]) ? sourceTypes[activeType] : {};
  const sourceProperties = isPlainPreviewRecord(sourceType.properties) ? sourceType.properties : {};
  const sourceSpace = isPlainPreviewRecord(sourceProperties.space) ? sourceProperties.space : {};
  const defaultSpace = PROPERTIES_DEFAULTS.space;
  const space = {
    ...sourceSpace,
    size: CARD_SIZES.includes(sourceSpace.size) ? sourceSpace.size : defaultSpace.size,
    aspectRatio: CARD_ASPECT_RATIOS.includes(sourceSpace.aspectRatio) ? sourceSpace.aspectRatio : defaultSpace.aspectRatio,
    layout: CARD_LAYOUTS.includes(sourceSpace.layout) ? sourceSpace.layout : 'simple',
    anchor: CARD_ANCHORS.includes(sourceSpace.anchor) ? sourceSpace.anchor : defaultSpace.anchor,
    gap: Number.isInteger(sourceSpace.gap) && sourceSpace.gap >= 0 ? sourceSpace.gap : defaultSpace.gap,
    margin: Number.isInteger(sourceSpace.margin) && sourceSpace.margin >= 0 && sourceSpace.margin <= 96 ? sourceSpace.margin : defaultSpace.margin
  };
  // 出现方式已不在卡片种类里；丢弃遗留的 behavior stub，几何只保留 properties.space。
  const { behavior: _legacyBehavior, ...typeRest } = sourceType;

  return {
    ...source,
    card: {
      ...sourceCard,
      activeType,
      types: { ...sourceTypes, [activeType]: { ...typeRest, properties: { ...sourceProperties, space } } }
    }
  };
}
const RUNTIME_NOTIFICATION_CARD_GAP = 12;
const RUNTIME_SCENE_DISMISS_TIMEOUT_MS = 10000;
const RUNTIME_SCENE_CREATE_TIMEOUT_MS = 10000;
function sceneCreateOptions(extra = {}) {
  return { retryable: false, timeoutMs: RUNTIME_SCENE_CREATE_TIMEOUT_MS, ...extra };
}
function runtimeHostReady(host) {
  return Boolean(
    host
    && typeof host.client?.request === 'function'
    && (host.state === 'running' || host.state === 'reconnecting')
  );
}
function runtimeErrorPayload(error) {
  if (!error) return null;
  return {
    code: error.code ?? 'RUNTIME_TEST_API_FAILED',
    message: error.message ?? String(error)
  };
}

function collectVisualProfileAssetReferences(profile) {
  const minimal = profile?.card?.types?.minimal;
  if (!minimal || typeof minimal !== 'object') return [];
  const references = [];
  const add = (assetId, slot) => {
    if (typeof assetId === 'string' && assetId.trim()) references.push({ assetId, slot });
  };
  add(minimal.appearance?.backgroundAssetId, 'card.minimal.appearance.background');
  add(minimal.skin?.background?.assetId, 'card.minimal.skin.background');
  for (const [slot, value] of Object.entries(minimal.effects?.slots ?? {})) add(value?.assetId, `card.minimal.effects.${slot}`);
  return references;
}

function collectVisualProfileFontReferences(profile) {
  const parts = profile?.card?.types?.minimal?.parts;
  if (!parts || typeof parts !== 'object') return [];
  const references = [];
  const add = (assetId, slot) => {
    if (typeof assetId === 'string' && assetId.trim()) references.push({ assetId, slot });
  };
  add(parts.title?.fontAssetId, 'card.minimal.parts.title.font');
  add(parts.body?.fontAssetId, 'card.minimal.parts.body.font');
  return references;
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

function notificationCardDimensions(appearance = {}, cardType = 'minimal', behaviorId = 'stack') {
  // 弹幕默认 480×76，不复用堆叠的 420×220，也不被 wide 抬到 160。
  if (isTickerFlight(behaviorId)) {
    const width = Number.isInteger(appearance.width) ? Math.max(1, Math.min(1920, appearance.width)) : 480;
    const height = Number.isInteger(appearance.height) ? Math.max(1, Math.min(1080, appearance.height)) : 76;
    return { width, height };
  }
  const sizeSets = {
    minimal: { small: { width: 360, height: 180 }, medium: { width: 420, height: 220 }, large: { width: 500, height: 260 } },
    danmaku: { small: { width: 520, height: 96 }, medium: { width: 520, height: 96 }, large: { width: 520, height: 96 } },
    popup: { small: { width: 500, height: 280 }, medium: { width: 500, height: 280 }, large: { width: 500, height: 280 } }
  };
  const typeSizes = sizeSets[cardType] ?? sizeSets.minimal;
  const base = typeSizes[appearance.size] ?? typeSizes.medium;
  const hasExplicitWidth = Number.isInteger(appearance.width);
  const hasExplicitHeight = Number.isInteger(appearance.height);
  const width = hasExplicitWidth ? Math.max(1, Math.min(1920, appearance.width)) : base.width;
  const height = hasExplicitHeight ? Math.max(1, Math.min(1080, appearance.height)) : base.height;
  if (hasExplicitWidth && hasExplicitHeight) return { width, height };
  if (appearance.aspectRatio === 'square') return { width, height: width };
  if (appearance.aspectRatio === 'wide') return { width, height: Math.max(160, Math.round(width * 0.48)) };
  return { width, height };
}

function notificationCardPosition(index, workArea, layout, dimensions = RUNTIME_NOTIFICATION_CARD_SIZE, cardType = 'minimal') {
  const area = {
    left: Number.isFinite(workArea?.left) ? workArea.left : 0,
    top: Number.isFinite(workArea?.top) ? workArea.top : 0,
    width: Number.isFinite(workArea?.width) && workArea.width > 0 ? workArea.width : 2560,
    height: Number.isFinite(workArea?.height) && workArea.height > 0 ? workArea.height : 1528
  };
  const spacing = Number.isInteger(dimensions.gap) && dimensions.gap >= 0 ? dimensions.gap : (Number.isInteger(layout?.spacing) && layout.spacing >= 0 ? layout.spacing : 12);
  const legacyMargin = Number.isInteger(dimensions.margin) ? dimensions.margin : 18;
  const marginLeft = Number.isInteger(dimensions.marginLeft) ? dimensions.marginLeft : legacyMargin;
  const marginRight = Number.isInteger(dimensions.marginRight) ? dimensions.marginRight : legacyMargin;
  const marginTop = Number.isInteger(dimensions.marginTop) ? dimensions.marginTop : legacyMargin;
  const marginBottom = Number.isInteger(dimensions.marginBottom) ? dimensions.marginBottom : legacyMargin;
  const anchor = dimensions.anchor ?? layout?.anchor ?? (cardType === 'danmaku' ? 'top-right' : 'bottom-right');
  const horizontalPosition = anchor.includes('right')
    ? area.left + area.width - dimensions.width - marginRight
    : area.left + marginLeft;
  const verticalPosition = anchor.includes('bottom')
    ? area.top + area.height - dimensions.height - marginBottom
    : area.top + marginTop;
  if (cardType === 'danmaku') {
    return { x: Math.round(horizontalPosition), y: Math.round(verticalPosition + (index % 3) * (dimensions.height + spacing)) };
  }
  if (cardType === 'popup') {
    return { x: Math.round(area.left + (area.width - dimensions.width) / 2), y: Math.round(verticalPosition) };
  }
  const stepX = dimensions.width + spacing;
  const stepY = dimensions.height + spacing;
  const columns = Math.max(1, Math.floor((area.width - 80 + spacing) / stepX));
  const rows = Math.max(1, Math.floor((area.height - 80 + spacing) / stepY));
  const safeIndex = Math.max(0, index % Math.max(1, columns * rows));
  const column = safeIndex % columns;
  const row = Math.floor(safeIndex / columns);
  const x = anchor.includes('right')
    ? horizontalPosition - column * stepX
    : horizontalPosition + column * stepX;
  const y = anchor.includes('bottom')
    ? verticalPosition - row * stepY
    : verticalPosition + row * stepY;
  return { x: Math.round(x), y: Math.round(y) };
}

function sceneCardGeometryFromResult(result, cardId) {
  const candidates = [
    ...(Array.isArray(result?.sceneCards) ? result.sceneCards : []),
    ...(Array.isArray(result?.sceneStateSnapshot?.cards) ? result.sceneStateSnapshot.cards : [])
  ];
  const card = candidates.find((item) => item?.id === cardId);
  const geometry = card?.geometry && typeof card.geometry === 'object' ? card.geometry : card;
  if (!geometry || ![geometry.x, geometry.y, geometry.width, geometry.height].every(Number.isFinite)) return null;
  return { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height };
}

function visualFingerprint(visual) {
  const projected = projectNativeVisualPayload(visual);
  const controlled = {
    enabled: projected.enabled,
    preset: projected.preset,
    intensity: projected.intensity,
    category: projected.category,
    cardType: projected.cardType,
    behavior: projected.behavior,
    appearance: projected.appearance
  };
  return createHash('sha256').update(JSON.stringify(controlled)).digest('hex').slice(0, 16);
}

function visualPlacementFingerprint(profile = {}) {
  return visualPreviewFingerprint(profile);
}

function visualPreviewHandshake({ receivedDraft, updated, recreated, cardId, draft, nativeVisual }) {
  return {
    receivedDraft: receivedDraft === true,
    updated: updated === true,
    recreated: recreated === true,
    cardId: typeof cardId === 'string' ? cardId : null,
    draftFingerprint: visualFingerprint(draft),
    nativeVisualFingerprint: visualFingerprint(nativeVisual)
  };
}

function sampleAgentFromInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  if (!id) return null;
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : id;
  return { id, name };
}

function notificationIdentity(record, ctx = null) {
  return resolveIdentity({
    record,
    sessionPath: record?.session,
    event: record,
    ctx: ctx ?? {}
  });
}

function notificationCardPayload(record, index, workArea, layout, visual, presentation = null, behavior = null, ctx = null) {
  const cardType = visual?.cardType ?? 'minimal';
  const behaviorId = isTickerFlight(visual?.behaviorId) || isTickerFlight(behavior?.behaviorProfileId)
    ? 'ticker'
    : (visual?.behaviorId ?? 'stack');
  const space = visual?.space ?? {};
  const dimensions = {
    ...notificationCardDimensions(visual?.appearance, cardType, behaviorId),
    gap: space.gap,
    margin: space.margin,
    marginLeft: space.marginLeft,
    marginRight: space.marginRight,
    marginTop: space.marginTop,
    marginBottom: space.marginBottom,
    anchor: space.anchor ?? 'bottom-right'
  };
  const position = notificationCardPosition(index, workArea, layout, dimensions, cardType);
  const visualForNative = isTickerFlight(behaviorId) && visual?.ticker
    ? { ...visual, ticker: resolveTickerMotion(visual.ticker) }
    : (visual?.ticker ? (({ ticker, ...rest }) => rest)(visual) : visual);
  const showIcon = visual?.parts?.icon?.show === true;
  const showAssistantName = visual?.parts?.assistantName?.show === true;
  const identity = notificationIdentity(record, ctx);
  let parts = paintPartTree(
    applyAppearanceToRoot(
      createDefaultTextPartTree({
        width: dimensions.width,
        height: dimensions.height,
        ticker: isTickerFlight(behaviorId),
        popup: cardType === 'popup',
        close: !isTickerFlight(behaviorId) && (visual?.interaction?.dismissMode ?? 'closeButton') !== 'anywhere',
        title: visual?.parts?.title?.show !== false,
        body: visual?.parts?.body?.show !== false,
        icon: showIcon,
        assistantName: showAssistantName
      }),
      visual?.appearance
    ),
    visual?.parts,
    visual?.glossary
  );
  if (showIcon && identity?.id && visual?.parts?.icon?.source !== 'custom') {
    const assetId = agentAvatarAssetId(identity.id);
    if (assetId) {
      parts = parts.map((part) => (part.id === 'icon'
        ? { ...part, backgroundAssetId: assetId, backgroundFit: part.backgroundFit || 'cover' }
        : part));
    }
  }
  return {
    id: notificationCardId(record.notificationId),
    title: notificationCardText(record.title, '新通知', 120),
    body: notificationCardText(record.content, record.summary || '', 2000),
    visual: projectNativeVisualPayload(visualForNative),
    parts,
    ...(identity?.name ? { assistantName: notificationCardText(identity.name, identity.id, 80) } : {}),
    ...(presentation ? { presentation } : {}),
    ...(behavior ? { behavior } : {}),
    ...position,
    width: dimensions.width,
    height: dimensions.height
  };
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
    visualFilePickerFactory = createWindowsVisualFilePicker,
    fontFilePickerFactory = createWindowsFontFilePicker,
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
    this.visualFilePicker = visualFilePickerFactory({ platform: process.platform });
    this.fontFilePicker = fontFilePickerFactory({ platform: process.platform });
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
    this.lifecycleState = 'stopped';
    this.lifecycleLoadPromise = null;
    this.lifecycleUnloadPromise = null;
    this.lifecycleCleanupPromise = null;
    this.runtimeHost = null;
    const notificationServices = createNotificationServices({
      ctx,
      soundBackendFactory: this.soundBackendFactory,
      soundSchedulerFactory: this.soundSchedulerFactory,
      onSoundDiagnostic: (payload) => this.recordSoundDiagnosticEvent(payload)
    });
    this.notificationStore = notificationServices.notificationStore;
    this.settingsStore = notificationServices.settingsStore;
    this.soundSettingsStore = notificationServices.soundSettingsStore;
    this.soundAssetRegistry = notificationServices.soundAssetRegistry;
    this.soundBackend = notificationServices.soundBackend;
    this.setSoundBackend = notificationServices.setSoundBackend;
    this.soundScheduler = notificationServices.soundScheduler;
    this.notificationApi = notificationServices.notificationApi;
    this.soundConfig = notificationServices.soundConfig;
    this.soundAssetMutationQueue = Promise.resolve();
    this.soundFilePicker = this.soundFilePickerFactory({ platform: process.platform });
    this.soundAssetStorage = notificationServices.soundAssetStorage ?? resolveSoundAssetStoragePaths({
      dataDir: ctx?.dataDir,
      persistentDataDir: ctx?.soundAssetDataDir,
      userDataDir: ctx?.userDataDir
    });
    this.soundAssetRoot = this.soundAssetStorage.assetRoot;
    this.soundAssetRegistryPath = this.soundAssetStorage.registryPath;
    this.soundAssetDiagnostics = [];
    this.visualSettingsStore = new VisualSettingsStore();
    this.eventPresentationSettingsStore = new EventPresentationSettingsStore();
    this.visualProfileRegistry = createVisualProfileRegistry();
    this.visualProfileRegistry.register({ profileId: 'visual.default', name: '默认视觉方案', profile: this.visualSettingsStore.getSnapshot().settings.profile, source: 'builtin' });
    this.visualBindingRegistry = createEventBindingRegistry({ profileRegistry: this.visualProfileRegistry });
    this.visualRegistryRevision = 1;
    this.visualEventSettingsApi = createVisualEventSettingsApi({
      store: this.eventPresentationSettingsStore,
      profileRegistry: this.visualProfileRegistry,
      bindingRegistry: this.visualBindingRegistry
    });
    this.visualRegistryPersistence = null;
    this.visualRegistryPersistencePath = path.resolve(ctx?.dataDir || process.cwd(), 'visual-registry.json');
    this.visualAssetStorage = createVisualAssetStorage(path.resolve(ctx?.dataDir || process.cwd(), 'visual-assets'));
    this.visualAssetLibrary = createVisualAssetLibrary({ storage: this.visualAssetStorage });
    this.lastVisualPackageReport = null;
    this.visualAssetSnapshotPath = path.resolve(ctx?.dataDir || process.cwd(), 'visual-assets.json');
    this.fontAssetStorage = createFontAssetStorage(path.resolve(ctx?.dataDir || process.cwd(), 'font-assets'));
    this.fontAssetLibrary = createFontAssetLibrary({ storage: this.fontAssetStorage });
    this.fontAssetSnapshotPath = path.resolve(ctx?.dataDir || process.cwd(), 'font-assets.json');
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
    this.notificationUnsubscribe = null;
    this.notificationSceneUnsubscribe = null;
    this.notificationSceneTimers = new Map();
    this.notificationSceneVisibleIds = new Set();
    this.notificationSceneCardChannels = new Map();
    this.notificationSceneReconciledIds = new Set();
    this.notificationBehaviorManagers = new Map();
    this.visualRuntimeModeConfig = resolveVisualRuntimeModeConfig(this.ctx.config);
    this.visualRuntimeShadowEnabled = this.visualRuntimeModeConfig.shadowEnabled || this.visualRuntimeModeConfig.mode === 'shadow' || this.visualRuntimeModeConfig.mode === 'takeover';
    this.visualRuntimeModeController = createVisualRuntimeModeController({ mode: this.visualRuntimeModeConfig.mode });
    this.visualRuntimeTakeoverAdapter = createVisualRuntimeTakeoverAdapter({ request: (...args) => this.runtimeHost?.client?.request?.(...args) });
    this.visualRuntimeShadowRegistry = createRuntimeRegistry();
    this.visualRuntimeShadowCards = new Map();
    this.visualRuntimeShadowParity = { observations: 0, comparable: 0, incomparable: 0, legacyAccepted: 0, shadowAccepted: 0, mismatches: 0 };
    this.notificationSceneQueues = new Map();
    this.notificationSceneDrainPromises = new Map();
    this.notificationSceneDismissQueue = createSceneDismissQueue({
      execute: (job) => this.performNotificationSceneDismiss(job.notificationId, job.status)
    });
    this.notificationPromotionQueue = createVisualRuntimePromotionQueue({
      execute: ({ record, promotedCard, channelId }) => this.promoteNotificationScene(record, promotedCard, channelId)
    });
    this.notificationEventAdapter = null;
    this.notificationEventUnsubscribe = null;
    this.notificationDiagnostics = [];
    this.visualDiagnostics = [];
    this.visualWorkbenchCardId = null;
    this.visualPreviewCardId = null;
    this.visualPreviewCardGeometry = null;
    this.visualPreviewPlacementFingerprint = null;
    this.visualPreviewClosedExplicitly = false;
    this.visualPreviewSessionGeneration = 0;
    this.notificationTestSceneFailures = new Map();
    this.notificationLifecycleTrace = [];
    this.soundDiagnostics = [];
    this.soundDiagnosticSequence = 0;
    this.settingsDiagnostics = [];
    this.runtimeDiagnostics = [];
    this.runtimeLog = [];
    this.runtimeLogSequence = 0;
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
      getRuntimeLog: this.getRuntimeLog.bind(this),
      clearRuntimeLog: this.clearRuntimeLog.bind(this),
      exportRuntimeLog: this.exportRuntimeLog.bind(this),
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
      readAgentAvatarFile: this.readAgentAvatarFile.bind(this),
      clearVisualDiagnostics: this.clearVisualDiagnostics.bind(this),
      exportVisualDiagnostics: this.exportVisualDiagnostics.bind(this),
      openVisualWorkbenchCard: this.openVisualWorkbenchCard.bind(this),
      updateVisualWorkbenchCard: this.updateVisualWorkbenchCard.bind(this),
      closeVisualWorkbenchCard: this.closeVisualWorkbenchCard.bind(this),
      openVisualPreviewCard: this.openVisualPreviewCard.bind(this),
      updateVisualPreviewCard: this.updateVisualPreviewCard.bind(this),
      closeVisualPreviewCard: this.closeVisualPreviewCard.bind(this),
      runVisualDraftSample: this.runVisualDraftSample.bind(this),
      runVisualEventExperiment: this.runVisualEventExperiment.bind(this),
      clearVisualStudioCards: this.clearVisualStudioCards.bind(this),
      listVisualProfiles: this.listVisualProfiles.bind(this),
      saveVisualProfile: this.saveVisualProfile.bind(this),
      removeVisualProfile: this.removeVisualProfile.bind(this),
      listVisualAssets: this.listVisualAssets.bind(this),
      getVisualAsset: this.getVisualAsset.bind(this),
      readVisualAssetFile: this.readVisualAssetFile.bind(this),
      importVisualAsset: this.importVisualAsset.bind(this),
      importVisualAssetFromPicker: this.importVisualAssetFromPicker.bind(this),
      removeVisualAsset: this.removeVisualAsset.bind(this),
      listFontAssets: this.listFontAssets.bind(this),
      getFontAsset: this.getFontAsset.bind(this),
      readFontAssetFile: this.readFontAssetFile.bind(this),
      importFontAsset: this.importFontAsset.bind(this),
      importFontAssetFromPicker: this.importFontAssetFromPicker.bind(this),
      removeFontAsset: this.removeFontAsset.bind(this),
      getFontAssetManifest: this.getFontAssetManifest.bind(this),
      exportVisualPackageToPicker: this.exportVisualPackageToPicker.bind(this),
      previewVisualPackage: this.previewVisualPackage.bind(this),
      importVisualPackage: this.importVisualPackage.bind(this),
      exportVisualPackageDiagnostics: this.exportVisualPackageDiagnostics.bind(this),
      getVisualAssetManifest: this.getVisualAssetManifest.bind(this),
      updateVisualSettings: this.updateVisualSettings.bind(this),
      getEventPresentationSettings: this.getEventPresentationSettings.bind(this),
      updateEventPresentationSettings: this.updateEventPresentationSettings.bind(this),
      getVisualRegistrySnapshot: this.getVisualRegistrySnapshot.bind(this),
      getVisualRegistryPersistenceStatus: this.getVisualRegistryPersistenceStatus.bind(this),
      listCustomVisualEvents: this.listCustomVisualEvents.bind(this),
      previewApplyVisualProfile: this.previewApplyVisualProfile.bind(this),
      applyVisualProfileToEvents: this.applyVisualProfileToEvents.bind(this),
      restoreVisualEventDefault: this.restoreVisualEventDefault.bind(this),
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
      runNotificationTest: this.runNotificationTest.bind(this),
      runParallelCardSample: this.runParallelCardSample.bind(this),
      getVisualRuntimeShadowStatus: this.getVisualRuntimeShadowStatus.bind(this),
      getVisualRuntimeModeStatus: this.getVisualRuntimeModeStatus.bind(this),
      getNotificationLifecycleTrace: this.getNotificationLifecycleTrace.bind(this)
    };
    this.notificationCenterServices = createNotificationCenterServices({
      notificationApi: this.notificationApi,
      settingsApi: this.runtimeTestApi
    });
    this.soundSettingsServices = createSoundSettingsServices({ settingsApi: this.runtimeTestApi });
    this.soundAssetServices = createSoundAssetServices({ settingsApi: this.runtimeTestApi });
    if (ctx && typeof ctx === 'object') {
      ctx._notificationHubVNextPlugin = this.runtimeTestApi;
      ctx._notificationHubVNextRuntimeApi = this.runtimeTestApi;
      ctx._notificationHubVNextNotificationApi = this.notificationApi;
      ctx._notificationHubVNextNotificationCenterServices = this.notificationCenterServices;
      ctx._notificationHubVNextSoundSettingsServices = this.soundSettingsServices;
      ctx._notificationHubVNextSoundAssetServices = this.soundAssetServices;
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
      host: this.audioEngineHost?.getStatus?.() ?? null,
      diagnostics: this.soundDiagnostics.filter((entry) => entry?.code).slice(-20)
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
    const legacyBackend = this.soundBackend;
    const globalSoundPolicy = this.soundSettingsStore.getSnapshot().settings.profile?.global ?? {};
    const warmupCue = globalSoundPolicy.soundId ? null : globalSoundPolicy.cue;
    const warmupFilename = warmupCue ? BUILTIN_CUE_FILES[warmupCue] : null;
    const warmupPath = warmupFilename && process.env.WINDIR
      ? `${process.env.WINDIR}\\Media\\${warmupFilename}`
      : null;
    const preload = warmupCue && warmupPath
      ? [{ soundId: `builtin.${warmupCue}`, path: warmupPath, fingerprint: warmupPath }]
      : [];
    const engineBackend = this.audioEngineBackendFactory({
      host: this.audioEngineHost,
      client: this.audioEngineHost.client,
      platform: process.platform,
      preload
    });
    const activeBackend = Object.freeze({
      playCue: async (options) => {
        try {
          return await engineBackend.playCue(options);
        } catch (error) {
          this.recordSoundDiagnostic(error, 'audio-engine-media-fallback');
          return legacyBackend.playCue(options);
        }
      },
      playFile: async (options) => {
        try {
          return await engineBackend.playFile(options);
        } catch (error) {
          this.recordSoundDiagnostic(error, 'audio-engine-media-fallback');
          return legacyBackend.playFile(options);
        }
      },
      load: (soundId, filePath, fingerprint) => engineBackend.load(soundId, filePath, fingerprint),
      unload: (soundId) => engineBackend.unload(soundId),
      warmup: () => engineBackend.warmup?.(),
      dispose: async () => {
        await engineBackend.dispose?.();
        await legacyBackend?.dispose?.();
      }
    });
    this.soundBackend = this.setSoundBackend(activeBackend);
    return this.soundBackend;
  }

  async stopAudioEngineHost() {
    if (!this.audioEngineHost) return;
    await this.audioEngineHost.dispose().catch((error) => this.recordSoundDiagnostic(error, 'audio-engine-stop'));
    this.audioEngineHost = null;
    this.audioEngineStatus = { state: 'stopped' };
  }

  onload() {
    if (this.lifecycleState === 'starting' || this.lifecycleState === 'loaded') return this.lifecycleLoadPromise;
    if (this.lifecycleState === 'unloading') return this.lifecycleUnloadPromise.then(() => this.onload());
    this.lifecycleState = 'starting';
    this.lifecycleLoadPromise = (async () => {
      try {
        await this._performLoad();
        this.lifecycleState = 'loaded';
      } catch (error) {
        this.lifecycleState = 'failed';
        try {
          await this._cleanupLifecycle();
        } catch (cleanupError) {
          this.ctx.log?.error?.('[notification-hub-vnext] Lifecycle rollback failed', cleanupError);
        }
        throw error;
      }
    })();
    return this.lifecycleLoadPromise;
  }

  async _performLoad() {
    this.ctx._notificationHubVNextPlugin = this.runtimeTestApi;
    this.ctx._notificationHubVNextRuntimeApi = this.runtimeTestApi;
    this.ctx._notificationHubVNextNotificationApi = this.notificationApi;
    this.ctx._notificationHubVNextNotificationCenterServices = this.notificationCenterServices;
    this.ctx._notificationHubVNextSettingsStore = this.settingsStore;
    this.ctx._notificationHubVNextSoundSettingsStore = this.soundSettingsStore;
    this.ctx._notificationHubVNextEventPresentationSettingsStore = this.eventPresentationSettingsStore;
    this.ctx._notificationHubVNextSettingsApi = this.runtimeTestApi;
    this.soundSettingsServices = createSoundSettingsServices({ settingsApi: this.runtimeTestApi });
    this.soundAssetServices = createSoundAssetServices({ settingsApi: this.runtimeTestApi });
    this.ctx._notificationHubVNextSoundSettingsServices = this.soundSettingsServices;
    this.ctx._notificationHubVNextSoundAssetServices = this.soundAssetServices;
    this.runtimeError = null;
    await this.startAudioEngineHost();
    await this.restoreSoundAssets();
    await restoreSoundSettings(this);
    if (this.useAudioEngineBackend && this.audioEngineStatus.state === 'ready') {
      try {
        await this.activateAudioEngineBackend();
      } catch (error) {
        this.audioEngineStatus = {
          state: 'degraded',
          reason: 'backend-activation-failed',
          fallback: 'legacy',
          code: error.code ?? 'AUDIO_ENGINE_BACKEND_ACTIVATION_FAILED',
          message: error.message,
          details: error.details ?? {}
        };
        this.recordSoundDiagnostic(error, 'audio-engine-backend-activation');
      }
    }
    await restoreVisualSettings(this);
    await restoreEventPresentationSettings(this);
    await restoreVisualRegistry(this);
    await this.restoreVisualAssets();
    await this.restoreFontAssets();
    // Warmup is deliberately detached from lifecycle startup. Playback can load
    // lazily through the backend if this best-effort hint is unavailable.
    void Promise.resolve().then(() => this.soundBackend?.warmup?.()).then((result) => {
      if (result === false || result?.loaded === false) {
        const error = Object.assign(new Error('Audio Engine warmup did not load all preloaded sounds'), {
          code: 'AUDIO_ENGINE_WARMUP_NOT_LOADED',
          details: { result }
        });
        this.recordSoundDiagnostic(error, 'audio-engine-warmup');
      }
    }).catch((error) => {
      this.recordSoundDiagnostic(error, 'audio-engine-warmup');
    });
    await this.startNotificationPersistence();
    await restoreNotificationDisplaySettings(this);
    await restoreSidebarDisplaySettings(this);
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
      await this.applyVisualAssetManifest();
      await this.applyFontAssetManifest();
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

  onunload() {
    if (this.lifecycleUnloadPromise) return this.lifecycleUnloadPromise;
    const waitForLoad = this.lifecycleLoadPromise && this.lifecycleState === 'starting'
      ? this.lifecycleLoadPromise.catch(() => {})
      : Promise.resolve();
    this.lifecycleUnloadPromise = waitForLoad.then(() => this._cleanupLifecycle());
    return this.lifecycleUnloadPromise;
  }

  _cleanupLifecycle() {
    if (this.lifecycleCleanupPromise) return this.lifecycleCleanupPromise;
    this.lifecycleState = 'unloading';
    this.lifecycleCleanupPromise = (async () => {
      await this._performUnload();
      this.lifecycleState = 'stopped';
    })();
    return this.lifecycleCleanupPromise;
  }

  async _performUnload() {
    const notificationApi = this.notificationApi;
    this.stopNotificationEventSubscription();
    this.stopNotificationSceneSubscription();
    this.notificationPromotionQueue.close();
    await this.stopNotificationPersistence();
    try { await this.saveSoundAssets(); } catch (error) { this.recordSoundDiagnostic(error, 'asset-save'); }
    await stopSoundSettingsPersistence(this);
    await stopVisualSettingsPersistence(this);
    await stopEventPresentationSettingsPersistence(this);
    await stopVisualRegistryPersistence(this);
    await this.saveVisualAssets();
    await stopNotificationDisplaySettingsPersistence(this);
    await stopSidebarDisplaySettingsPersistence(this);
    await this.stopSettingsRuntimeSync();
    try {
      await this.soundBackend?.dispose?.();
    } catch (error) {
      this.recordSoundDiagnostic(error, 'audio-backend-stop');
    }
    await this.stopAudioEngineHost();
    this.notificationTestToolCleanup?.();
    this.notificationTestToolCleanup = null;
    this.notificationTestCapabilityCleanup?.();
    this.notificationTestCapabilityCleanup = null;
    await this.closeVisualWorkbenchCard().catch(() => {});
    await this.closeVisualPreviewCard().catch(() => {});
    await this.stopRuntimeAfterFailure();
    if (this.ctx._notificationHubVNextPlugin === this.runtimeTestApi) delete this.ctx._notificationHubVNextPlugin;
    if (this.ctx._notificationHubVNextRuntimeApi === this.runtimeTestApi) {
      delete this.ctx._notificationHubVNextRuntimeApi;
    }
    if (this.ctx._notificationHubVNextNotificationApi === notificationApi
      || this.ctx._notificationHubVNextNotificationApi === this.notificationApi) {
      delete this.ctx._notificationHubVNextNotificationApi;
    }
    if (this.ctx._notificationHubVNextSettingsApi === this.runtimeTestApi) {
      delete this.ctx._notificationHubVNextSettingsApi;
    }
    if (this.ctx._notificationHubVNextNotificationCenterServices === this.notificationCenterServices) {
      delete this.ctx._notificationHubVNextNotificationCenterServices;
    }
    if (this.ctx._notificationHubVNextSoundSettingsServices === this.soundSettingsServices) {
      delete this.ctx._notificationHubVNextSoundSettingsServices;
    }
    if (this.ctx._notificationHubVNextSoundAssetServices === this.soundAssetServices) {
      delete this.ctx._notificationHubVNextSoundAssetServices;
    }
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

  recordVisualDiagnostic(error, stage, details = {}) {
    const diagnostic = {
      code: error?.code ?? 'VISUAL_OPERATION_FAILED',
      message: error?.message ?? String(error),
      stage,
      level: classifyVisualDiagnosticLevel(error, stage),
      details: { ...(error?.details ?? {}), ...details },
      timestamp: new Date().toISOString()
    };
    this.visualDiagnostics.push(diagnostic);
    if (this.visualDiagnostics.length > 30) this.visualDiagnostics.shift();
    return diagnostic;
  }

  clearVisualDiagnostics() {
    this.visualDiagnostics = [];
    return this.getVisualSettingsStatus();
  }

  async exportVisualDiagnostics({ name = 'notification-hub-visual-status' } = {}) {
    const content = `${JSON.stringify({ format: 'notification-hub-visual-status', version: 1, exportedAt: new Date().toISOString(), diagnostics: this.visualDiagnostics.slice(-30) }, null, 2)}\n`;
    const saved = await this.soundFilePicker.save({ suggestedName: name, content, extension: 'json', title: '导出视觉状态', filter: 'JSON 视觉状态 (*.json)|*.json|All files (*.*)|*.*' });
    return { savedToFile: saved.cancelled !== true, cancelled: saved.cancelled === true, savedFilename: saved.path || null, bytes: Buffer.byteLength(content, 'utf8'), format: 'notification-hub-visual-status', version: 1 };
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
      visualDiagnostics: this.visualDiagnostics.slice(-30).reverse(),
      persistence: persistence
        ? { enabled: true, pending: persistence.pendingSnapshot !== null }
        : { enabled: false, pending: false },
      effectRules: this.eventPresentationSettingsStore.getSnapshot().settings.visualRules,
      effectRuleTargets: listEffectRuleTargets(),
      assets: this.listVisualAssets(),
      fonts: this.listFontAssets(),
      profiles: this.listVisualProfiles(),
      events: listEventDefinitions({ presentationEligible: true }).map(({ eventId, categoryId, eventTypeId, label }) => ({ eventId, categoryId, eventTypeId, label })),
      studioAgents: listStudioAgents(this.ctx)
    };
  }

  async readAgentAvatarFile(agentId) {
    const identity = readAgentIdentity(resolveAgentsDir(this.ctx), agentId, this.ctx);
    if (!identity?.avatarPath) return null;
    const staged = stageAgentAvatar(this.ctx?.dataDir || this.ctx?.userDataDir, identity);
    const filePath = staged?.cachePath || identity.avatarPath;
    const buffer = await readFile(filePath);
    const format = staged?.format || String(path.extname(identity.avatarPath).slice(1) || 'png').toLowerCase();
    return { id: identity.id, format, buffer };
  }

  async applyAgentAvatarManifestForRecord(record) {
    if (this.runtimeHost?.state !== 'running' || typeof this.runtimeHost.client?.request !== 'function') {
      return { applied: false, reason: 'runtime-unavailable' };
    }
    const agentsDir = resolveAgentsDir(this.ctx);
    const identities = [];
    const seen = new Set();
    const pushIdentity = (identity) => {
      if (!identity?.id || seen.has(identity.id)) return;
      seen.add(identity.id);
      identities.push(identity);
    };
    pushIdentity(notificationIdentity(record, this.ctx));
    for (const item of listStudioAgents(this.ctx)) {
      if (!item.hasAvatar) continue;
      pushIdentity(readAgentIdentity(agentsDir, item.id, this.ctx));
    }
    const items = [];
    let cacheDir = null;
    for (const identity of identities) {
      const staged = stageAgentAvatar(this.ctx?.dataDir || this.ctx?.userDataDir, identity);
      if (!staged) continue;
      cacheDir = staged.cacheDir;
      items.push({
        id: staged.assetId,
        format: staged.format === 'jpeg' ? 'jpeg' : staged.format,
        relativePath: staged.relativePath,
        sha256: staged.sha256,
        enabled: true
      });
    }
    if (!cacheDir || items.length === 0) return { applied: false, reason: 'no-avatar' };
    const fingerprint = items.map((item) => `${item.id}:${item.sha256}`).sort().join('|');
    if (this.agentAvatarManifestFingerprint === fingerprint) return { applied: true, deduplicated: true, assetCount: items.length };
    const manifest = { version: 1, rootDir: cacheDir, items };
    try {
      const response = await this.runtimeHost.client.request('agent-avatars.configure', manifest, {
        retryable: false,
        idempotencyKey: `agent-avatars-${fingerprint.slice(0, 24)}`
      });
      const result = response?.payload?.result;
      if (!result?.applied) throw Object.assign(new Error('Native returned an invalid agent avatar manifest ACK'), { code: 'AGENT_AVATAR_MANIFEST_ACK_INVALID', details: { result } });
      this.agentAvatarManifestFingerprint = fingerprint;
      return result;
    } catch (error) {
      this.recordNotificationDiagnostic(error, 'agent-avatars-configure');
      return { applied: false, error: { code: error.code ?? 'AGENT_AVATAR_MANIFEST_APPLY_FAILED', message: error.message } };
    }
  }

  async updateVisualSettings(patch = {}) {
    const previousProfile = this.visualSettingsStore.getSnapshot().settings.profile;
    const previous = previousProfile.card?.types?.minimal?.appearance?.backgroundAssetId ?? null;
    const next = patch?.profile?.card?.types?.minimal?.appearance?.backgroundAssetId;
    const nextAssetId = next === undefined ? previous : next;
    if (nextAssetId && !this.visualAssetLibrary.get(nextAssetId)) throw Object.assign(new Error(`Unknown visual asset: ${nextAssetId}`), { code: 'VISUAL_ASSET_NOT_FOUND', details: { assetId: nextAssetId } });
    const nextFontReferences = collectVisualProfileFontReferences(patch?.profile ?? previousProfile);
    for (const reference of nextFontReferences) {
      if (!this.fontAssetLibrary.get(reference.assetId)) throw Object.assign(new Error(`Unknown font asset: ${reference.assetId}`), { code: 'FONT_ASSET_NOT_FOUND', details: { assetId: reference.assetId } });
    }
    if (nextAssetId && nextAssetId !== previous) await this.visualAssetLibrary.addReference(nextAssetId, { ownerType: 'profile', ownerId: 'visual.default', slot: 'card.minimal.background' });
    try {
      const snapshot = this.visualSettingsStore.updateVisualSettings(patch);
      this.visualSettingsStore.markApplied(snapshot.revision);
      const defaultRecord = this.visualProfileRegistry.get('visual.default');
      if (defaultRecord) {
        this.visualProfileRegistry.replace('visual.default', {
          name: defaultRecord.name,
          profile: snapshot.settings.profile,
          source: defaultRecord.source ?? 'builtin'
        });
      }
      if (previous && previous !== nextAssetId) this.visualAssetLibrary.removeReference(previous, { ownerType: 'profile', ownerId: 'visual.default', slot: 'card.minimal.background' });
      for (const reference of collectVisualProfileFontReferences(previousProfile)) {
        this.fontAssetLibrary.removeReference(reference.assetId, { ownerType: 'profile', ownerId: 'visual.default', slot: reference.slot });
      }
      for (const reference of collectVisualProfileFontReferences(snapshot.settings.profile)) {
        await this.fontAssetLibrary.addReference(reference.assetId, { ownerType: 'profile', ownerId: 'visual.default', slot: reference.slot });
      }
      await this.saveVisualAssets();
      await this.saveFontAssets();
      return this.getVisualSettingsStatus();
    } catch (error) {
      this.recordVisualDiagnostic(error, 'CONFIG_RESOLVE');
      if (nextAssetId && nextAssetId !== previous) this.visualAssetLibrary.removeReference(nextAssetId, { ownerType: 'profile', ownerId: 'visual.default', slot: 'card.minimal.background' });
      throw error;
    }
  }

  getEventPresentationSettings() {
    const snapshot = this.eventPresentationSettingsStore.getSnapshot();
    return {
      settings: snapshot.settings,
      rows: listEventPresentationRows(snapshot.settings),
      visualProfiles: this.listVisualProfiles(),
      testEvents: [...NOTIFICATION_TEST_EVENTS],
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
        : { enabled: false, pending: false },
      visualRegistryPersistence: this.getVisualRegistryPersistenceStatus()
    };
  }

  listEventPresentationRows() {
    return listEventPresentationRows(this.eventPresentationSettingsStore.getSnapshot().settings);
  }

  getVisualRegistrySnapshot() {
    return createVisualRegistrySnapshot({
      profileRegistry: this.visualProfileRegistry,
      bindingRegistry: this.visualBindingRegistry,
      revision: this.visualRegistryRevision
    });
  }


  getVisualRegistryPersistenceStatus() {
    return this.visualRegistryPersistence?.getStatus?.() ?? { enabled: false, pending: false, revision: this.visualRegistryRevision, status: 'disabled' };
  }

  listVisualAssets(query = {}) { return this.visualAssetLibrary.list(query); }
  getVisualAssetManifest() { return { ...createVisualAssetManifest(this.listVisualAssets().map((asset) => ({ assetId: asset.assetId, format: asset.format, sha256: asset.sha256, enabled: true })), { root: 'visual-assets' }), rootDir: path.dirname(this.visualAssetStorage.rootDir) }; }
  async applyVisualAssetManifest() {
    if (this.runtimeHost?.state !== 'running' || typeof this.runtimeHost.client?.request !== 'function') return { applied: false, reason: 'runtime-unavailable' };
    try {
      const manifest = this.getVisualAssetManifest();
      const fingerprint = createHash('sha256').update(JSON.stringify(manifest.assets.map((asset) => [asset.assetId, asset.sha256, asset.enabled]))).digest('hex').slice(0, 16);
      const response = await this.runtimeHost.client.request('visual-assets.configure', manifest, { retryable: false, idempotencyKey: `visual-assets-manifest-${fingerprint}` });
      const result = response?.payload?.result;
      if (!result?.applied || result.assetCount !== manifest.assets.length) throw Object.assign(new Error('Native returned an invalid visual asset manifest ACK'), { code: 'VISUAL_ASSET_MANIFEST_ACK_INVALID', details: { result } });
      return result;
    } catch (error) {
      this.recordNotificationDiagnostic(error, 'visual-assets-configure');
      return { applied: false, error: { code: error.code ?? 'VISUAL_ASSET_MANIFEST_APPLY_FAILED', message: error.message } };
    }
  }
  getVisualAsset(assetId) { return this.visualAssetLibrary.get(assetId); }
  async readVisualAssetFile(assetId) {
    const asset = this.visualAssetLibrary.get(assetId);
    if (!asset) return null;
    const buffer = await this.visualAssetStorage.read(asset.assetId, asset.format);
    return { assetId: asset.assetId, format: asset.format, buffer };
  }
  async importVisualAsset(input = {}) { const source = input.filePath ? { ...input, buffer: await readFile(input.filePath), name: input.name || path.basename(input.filePath) } : input; const asset = await this.visualAssetLibrary.importBuffer(source); await this.saveVisualAssets(); await this.applyVisualAssetManifest(); return asset; }
  async importVisualAssetFromPicker({ kind = 'decoration', tags = [] } = {}) { const selected = await this.visualFilePicker.open(); if (selected?.cancelled) return { cancelled: true }; const asset = await this.importVisualAsset({ filePath: selected.path, name: path.basename(selected.path), kind, tags }); return { cancelled: false, asset }; }

  async readVisualPackageBuffer({ file, zipBuffer } = {}) {
    if (Buffer.isBuffer(zipBuffer)) return zipBuffer;
    if (!file || typeof file.arrayBuffer !== 'function') throw Object.assign(new Error('视觉配置包文件不能为空'), { code: 'VISUAL_PACKAGE_FILE_INVALID' });
    try { return Buffer.from(await file.arrayBuffer()); } catch (error) { throw Object.assign(new Error('视觉配置包文件无法读取'), { code: 'VISUAL_PACKAGE_FILE_INVALID', details: { cause: error.message } }); }
  }

  async exportVisualPackageToPicker({ profileIds = null, meta = {} } = {}) {
    const zipBuffer = await buildVisualPackage({
      profileRegistry: this.visualProfileRegistry,
      bindingRegistry: this.visualBindingRegistry,
      assetLibrary: this.visualAssetLibrary,
      storage: this.visualAssetStorage,
      profileIds,
      meta
    });
    const packageName = typeof meta.packageName === 'string' && meta.packageName.trim() ? meta.packageName.trim() : 'Notification Hub visual package';
    const saved = await this.soundFilePicker.save({
      suggestedName: packageName,
      content: zipBuffer,
      extension: 'nhvisual',
      title: '导出 Notification Hub 视觉配置包',
      filter: 'Notification Hub visual package (*.nhvisual)|*.nhvisual|ZIP package (*.zip)|*.zip|All files (*.*)|*.*'
    });
    return { savedToFile: saved.cancelled !== true, cancelled: saved.cancelled === true, savedFilename: saved.path || null, bytes: zipBuffer.length, format: 'notification-hub-visual-package', version: 1 };
  }

  async previewVisualPackage(input = {}) {
    const zipBuffer = await this.readVisualPackageBuffer(input);
    return previewImportVisualPackage({ zipBuffer, profileRegistry: this.visualProfileRegistry, assetLibrary: this.visualAssetLibrary });
  }

  async importVisualPackage(input = {}) {
    const zipBuffer = await this.readVisualPackageBuffer(input);
    const previousProfileAssetReferences = new Map(this.visualProfileRegistry.list().map((profileId) => [profileId, collectVisualProfileAssetReferences(this.visualProfileRegistry.get(profileId)?.profile)]));
    const report = await importVisualPackageData({
      zipBuffer,
      profileRegistry: this.visualProfileRegistry,
      bindingRegistry: this.visualBindingRegistry,
      assetLibrary: this.visualAssetLibrary,
      storage: this.visualAssetStorage,
      strategy: input.strategy ?? 'copy'
    });
    const changed = report.profiles.registered.length > 0 || report.assets.imported.length > 0 || report.bindings.imported.length > 0;
    let profileAssetReferencesChanged = false;
    for (const imported of report.profiles.registered) {
      const record = this.visualProfileRegistry.get(imported.effectiveId);
      for (const reference of previousProfileAssetReferences.get(imported.effectiveId) ?? []) {
        this.visualAssetLibrary.removeReference(reference.assetId, { ownerType: 'profile', ownerId: imported.effectiveId, slot: reference.slot });
      }
      for (const reference of collectVisualProfileAssetReferences(record?.profile)) {
        this.visualAssetLibrary.addReference(reference.assetId, { ownerType: 'profile', ownerId: imported.effectiveId, slot: reference.slot });
        profileAssetReferencesChanged = true;
      }
    }
    if (report.assets.imported.length > 0 || profileAssetReferencesChanged) {
      await this.saveVisualAssets();
      await this.applyVisualAssetManifest();
    }
    if (report.bindings.imported.length > 0) {
      const projected = projectVisualRegistryToEventSettings({ settings: this.eventPresentationSettingsStore.getSnapshot().settings, bindingRegistry: this.visualBindingRegistry, profileRegistry: this.visualProfileRegistry });
      const snapshot = this.eventPresentationSettingsStore.updateSettings({ events: projected.events });
      this.notificationApi.setPresentationProfile(createPresentationProfileFromSettings(snapshot.settings));
      this.eventPresentationSettingsStore.markApplied(snapshot.revision);
    }
    if (changed) {
      this.visualRegistryRevision += 1;
      this.queueVisualRegistryPersistence();
    }
    const finalReport = { ...report, visualRevision: this.visualRegistryRevision };
    this.lastVisualPackageReport = finalReport;
    return finalReport;
  }

  async exportVisualPackageDiagnostics({ name = 'notification-hub-visual-import-diagnostics' } = {}) {
    if (!this.lastVisualPackageReport) throw Object.assign(new Error('没有可导出的视觉配置包导入记录'), { code: 'VISUAL_PACKAGE_DIAGNOSTIC_NOT_FOUND' });
    const content = serializeVisualPackageDiagnosticReport({ report: this.lastVisualPackageReport });
    const saved = await this.soundFilePicker.save({
      suggestedName: name,
      content,
      extension: 'json',
      title: '导出视觉配置包导入诊断',
      filter: 'JSON 视觉导入诊断 (*.json)|*.json|All files (*.*)|*.*'
    });
    return {
      savedToFile: saved.cancelled !== true,
      cancelled: saved.cancelled === true,
      savedFilename: saved.path || null,
      bytes: Buffer.byteLength(content, 'utf8'),
      format: 'notification-hub-visual-package-import-diagnostics',
      version: 1
    };
  }

  async removeVisualAsset(assetId) { const removed = await this.visualAssetLibrary.remove(assetId); await this.saveVisualAssets(); return removed; }
  async restoreVisualAssets() { try { const snapshot = await loadVisualAssetSnapshot(this.visualAssetSnapshotPath); if (snapshot) this.visualAssetLibrary.restoreSnapshot(snapshot); return snapshot; } catch (error) { this.recordNotificationDiagnostic(error, 'visual-assets-restore'); return null; } }
  async saveVisualAssets() { try { return await saveVisualAssetSnapshot(this.visualAssetLibrary.snapshot(), this.visualAssetSnapshotPath); } catch (error) { this.recordNotificationDiagnostic(error, 'visual-assets-save'); return null; } }
  listFontAssets(query = {}) { return this.fontAssetLibrary.list(query); }
  getFontAssetManifest() { return { ...createFontAssetManifest(this.listFontAssets().map((asset) => ({ assetId: asset.assetId, format: asset.format, sha256: asset.sha256, enabled: true })), { root: 'font-assets' }), rootDir: path.dirname(this.fontAssetStorage.rootDir) }; }
  async applyFontAssetManifest() {
    if (this.runtimeHost?.state !== 'running' || typeof this.runtimeHost.client?.request !== 'function') return { applied: false, reason: 'runtime-unavailable' };
    try {
      const manifest = this.getFontAssetManifest();
      const fingerprint = createHash('sha256').update(JSON.stringify(manifest.assets.map((asset) => [asset.assetId, asset.sha256, asset.enabled]))).digest('hex').slice(0, 16);
      const response = await this.runtimeHost.client.request('font-assets.configure', manifest, { retryable: false, idempotencyKey: `font-assets-manifest-${fingerprint}` });
      const result = response?.payload?.result;
      if (!result?.applied || result.assetCount !== manifest.assets.length) throw Object.assign(new Error('Native returned an invalid font asset manifest ACK'), { code: 'FONT_ASSET_MANIFEST_ACK_INVALID', details: { result } });
      return result;
    } catch (error) {
      this.recordNotificationDiagnostic(error, 'font-assets-configure');
      return { applied: false, error: { code: error.code ?? 'FONT_ASSET_MANIFEST_APPLY_FAILED', message: error.message } };
    }
  }
  getFontAsset(assetId) { return this.fontAssetLibrary.get(assetId); }
  async readFontAssetFile(assetId) {
    const asset = this.fontAssetLibrary.get(assetId);
    if (!asset) return null;
    const buffer = await this.fontAssetStorage.read(asset.assetId, asset.format);
    return { assetId: asset.assetId, format: asset.format, buffer };
  }
  async importFontAsset(input = {}) { const source = input.filePath ? { ...input, buffer: await readFile(input.filePath), name: input.name || path.basename(input.filePath) } : input; const asset = await this.fontAssetLibrary.importBuffer(source); await this.saveFontAssets(); await this.applyFontAssetManifest(); return asset; }
  async importFontAssetFromPicker() { const selected = await this.fontFilePicker.open(); if (selected?.cancelled) return { cancelled: true }; const asset = await this.importFontAsset({ filePath: selected.path, name: path.basename(selected.path) }); return { cancelled: false, asset }; }
  async removeFontAsset(assetId) { const removed = await this.fontAssetLibrary.remove(assetId); await this.saveFontAssets(); return removed; }
  async restoreFontAssets() { try { const snapshot = await loadFontAssetSnapshot(this.fontAssetSnapshotPath); if (snapshot) this.fontAssetLibrary.restoreSnapshot(snapshot); return snapshot; } catch (error) { this.recordNotificationDiagnostic(error, 'font-assets-restore'); return null; } }
  async saveFontAssets() { try { return await saveFontAssetSnapshot(this.fontAssetLibrary.snapshot(), this.fontAssetSnapshotPath); } catch (error) { this.recordNotificationDiagnostic(error, 'font-assets-save'); return null; } }

  queueVisualRegistryPersistence() {
    // Registry writes belong to a loaded Plugin instance. Keeping pre-load API
    // unit tests in memory prevents a fake cwd registry from contaminating later
    // lifecycle tests or an unrelated installation.
    if (this.ctx?._notificationHubVNextPlugin !== this.runtimeTestApi) return;
    createVisualRegistryPersistence(this)?.queueCurrentSnapshot();
  }

  listVisualProfiles() {
    return this.visualProfileRegistry.list().map((profileId) => {
      const record = this.visualProfileRegistry.get(profileId);
      return {
        profileId: record.profileId,
        name: record.name,
        source: record.source,
        references: this.visualProfileRegistry.references(profileId)
      };
    });
  }

  saveVisualProfile({ profileId, name, profile = null, source = 'local' } = {}) {
    try {
      const nextProfile = profile ?? this.visualSettingsStore.getSnapshot().settings.profile;
      const nextAssetReferences = collectVisualProfileAssetReferences(nextProfile);
      const nextFontReferences = collectVisualProfileFontReferences(nextProfile);
      for (const reference of nextAssetReferences) {
        if (!this.visualAssetLibrary.get(reference.assetId)) {
          throw Object.assign(new Error(`Unknown visual asset: ${reference.assetId}`), { code: 'VISUAL_ASSET_NOT_FOUND', details: { assetId: reference.assetId, profileId } });
        }
      }
      for (const reference of nextFontReferences) {
        if (!this.fontAssetLibrary.get(reference.assetId)) {
          throw Object.assign(new Error(`Unknown font asset: ${reference.assetId}`), { code: 'FONT_ASSET_NOT_FOUND', details: { assetId: reference.assetId, profileId } });
        }
      }
      const previous = this.visualProfileRegistry.get(profileId);
      const record = previous
        ? this.visualProfileRegistry.replace(profileId, { name, profile: nextProfile, source })
        : this.visualProfileRegistry.register({ profileId, name, profile: nextProfile, source });
      for (const reference of collectVisualProfileAssetReferences(previous?.profile)) {
        this.visualAssetLibrary.removeReference(reference.assetId, { ownerType: 'profile', ownerId: record.profileId, slot: reference.slot });
      }
      for (const reference of nextAssetReferences) {
        this.visualAssetLibrary.addReference(reference.assetId, { ownerType: 'profile', ownerId: record.profileId, slot: reference.slot });
      }
      for (const reference of collectVisualProfileFontReferences(previous?.profile)) {
        this.fontAssetLibrary.removeReference(reference.assetId, { ownerType: 'profile', ownerId: record.profileId, slot: reference.slot });
      }
      for (const reference of nextFontReferences) {
        this.fontAssetLibrary.addReference(reference.assetId, { ownerType: 'profile', ownerId: record.profileId, slot: reference.slot });
      }
      void this.saveVisualAssets();
      void this.saveFontAssets();
      this.visualRegistryRevision += 1;
      this.queueVisualRegistryPersistence();
      return {
        profileId: record.profileId,
        name: record.name,
        source: record.source,
        profile: record.profile,
        references: this.visualProfileRegistry.references(record.profileId),
        visualRevision: this.visualRegistryRevision
      };
    } catch (error) {
      this.recordVisualDiagnostic(error, 'CONFIG_RESOLVE', { profileId: profileId ?? null });
      throw error;
    }
  }

  removeVisualProfile(profileId) {
    try {
      if (profileId === 'visual.default') throw Object.assign(new Error('默认视觉方案不可删除'), { code: 'VISUAL_PROFILE_REGISTRY_PROTECTED' });
      const record = this.visualProfileRegistry.get(profileId);
      if (!record) throw Object.assign(new Error(`Unknown profile: ${profileId}`), { code: 'VISUAL_PROFILE_REGISTRY_NOT_FOUND' });
      const unboundEventIds = [...this.visualProfileRegistry.references(profileId)];
      for (const eventId of unboundEventIds) this.visualEventSettingsApi.restoreDefault(eventId);
      const removed = this.visualProfileRegistry.remove(profileId);
      if (!removed) throw Object.assign(new Error(`Unknown profile: ${profileId}`), { code: 'VISUAL_PROFILE_REGISTRY_NOT_FOUND' });
      for (const reference of collectVisualProfileAssetReferences(record?.profile)) {
        this.visualAssetLibrary.removeReference(reference.assetId, { ownerType: 'profile', ownerId: profileId, slot: reference.slot });
      }
      for (const reference of collectVisualProfileFontReferences(record?.profile)) {
        this.fontAssetLibrary.removeReference(reference.assetId, { ownerType: 'profile', ownerId: profileId, slot: reference.slot });
      }
      void this.saveVisualAssets();
      void this.saveFontAssets();
      this.visualRegistryRevision += 1;
      const snapshot = this.eventPresentationSettingsStore.getSnapshot();
      this.notificationApi.setPresentationProfile(createPresentationProfileFromSettings(snapshot.settings));
      this.eventPresentationSettingsStore.markApplied(snapshot.revision);
      this.queueVisualRegistryPersistence();
      return { removed: true, unboundEventIds, visualRevision: this.visualRegistryRevision };
    } catch (error) {
      this.recordVisualDiagnostic(error, 'CONFIG_RESOLVE', { profileId: profileId ?? null });
      throw error;
    }
  }

  listCustomVisualEvents() {
    return this.visualEventSettingsApi.listCustomEvents();
  }

  previewApplyVisualProfile(input = {}) {
    return this.visualEventSettingsApi.previewApply(input);
  }

  applyVisualProfileToEvents(input = {}) {
    const result = this.visualEventSettingsApi.apply(input);
    this.visualRegistryRevision += 1;
    const snapshot = this.eventPresentationSettingsStore.getSnapshot();
    this.notificationApi.setPresentationProfile(createPresentationProfileFromSettings(snapshot.settings));
    this.eventPresentationSettingsStore.markApplied(snapshot.revision);
    this.queueVisualRegistryPersistence();
    return { ...result, visualRevision: this.visualRegistryRevision };
  }

  restoreVisualEventDefault(eventId) {
    const restored = this.visualEventSettingsApi.restoreDefault(eventId);
    if (!restored) return { restored: false, visualRevision: this.visualRegistryRevision };
    this.visualRegistryRevision += 1;
    const snapshot = this.eventPresentationSettingsStore.getSnapshot();
    this.notificationApi.setPresentationProfile(createPresentationProfileFromSettings(snapshot.settings));
    this.eventPresentationSettingsStore.markApplied(snapshot.revision);
    this.queueVisualRegistryPersistence();
    return { restored: true, visualRevision: this.visualRegistryRevision };
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

  async restoreSoundAssets() {
    try {
      const migration = await migrateSoundAssetStorage(this.soundAssetStorage);
      if (migration.migrated) {
        this.ctx.log?.info?.(`[notification-hub-vnext] Migrated sound assets to stable user storage: ${migration.to}`);
      }
      const restoredRegistry = await loadSoundAssetRegistry(this.soundAssetRegistryPath);
      for (const asset of this.soundAssetRegistry.list()) {
        if (asset.kind === 'custom') this.soundAssetRegistry.remove(asset.soundId);
      }
      for (const asset of restoredRegistry.list()) {
        if (asset.kind === 'custom') this.soundAssetRegistry.add(asset);
      }
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
      const diagnostic = !preview.decision.play || playback?.status === 'merged'
        ? this.recordSoundDiagnosticEvent({
            source: 'sound-workbench',
            input: publicInput,
            decision: preview.decision,
            scheduling,
            playback: playback?.playback ?? null
          })
        : null;
      const explanationDiagnostic = diagnostic ?? { scheduling, playback: playback?.playback ?? null };
      return {
        index: index + 1,
        input: publicInput,
        decision: preview.decision,
        scheduled: Boolean(preview.decision.play),
        playback,
        explanation: createSoundRuleExplanation({ input: publicInput, decision: preview.decision, diagnostic: explanationDiagnostic })
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

  recordRuntimeLog(event, payload = {}, source = 'runtime') {
    try {
      const value = payload && typeof payload === 'object' ? payload : {};
      const details = value.details && typeof value.details === 'object' ? value.details : {};
      const entry = Object.freeze({
        sequence: ++this.runtimeLogSequence,
        timestamp: typeof value.timestamp === 'string' ? value.timestamp : new Date().toISOString(),
        event: typeof event === 'string' && event.trim() ? event.trim() : 'runtime.event',
        source: typeof source === 'string' && source.trim() ? source.trim() : 'runtime',
        ...(typeof value.requestId === 'string' ? { requestId: value.requestId.slice(0, 160) } : {}),
        ...(typeof value.traceId === 'string' ? { traceId: value.traceId.slice(0, 160) } : {}),
        ...(typeof value.code === 'string' ? { code: value.code.slice(0, 120) } : {}),
        ...(typeof value.state === 'string' ? { state: value.state.slice(0, 64) } : {}),
        ...(typeof value.message === 'string' ? { message: value.message.slice(0, 300) } : {}),
        details: sanitizeDiagnosticDetails(details)
      });
      this.runtimeLog.push(entry);
      if (this.runtimeLog.length > 500) this.runtimeLog.shift();
      return entry;
    } catch (error) {
      this.ctx.log?.warn?.('[notification-hub-vnext] Runtime log recording failed', error);
      return null;
    }
  }

  recordRuntimeDiagnostic(diagnostic, source = 'runtime') {
    const normalized = normalizeRuntimeDiagnostic(diagnostic, source);
    this.recordRuntimeLog('diagnostic', normalized, source);
    this.runtimeDiagnostics.push(normalized);
    if (this.runtimeDiagnostics.length > 100) this.runtimeDiagnostics.shift();
    return normalized;
  }

  getRuntimeLog() {
    return this.runtimeLog.slice(-500);
  }

  clearRuntimeLog() {
    const cleared = this.runtimeLog.length;
    this.runtimeLog = [];
    return { cleared };
  }

  async exportRuntimeLog({ name = 'notification-hub-runtime-log' } = {}) {
    const content = `${JSON.stringify({
      format: 'notification-hub-runtime-log',
      version: 1,
      exportedAt: new Date().toISOString(),
      entries: this.getRuntimeLog()
    }, null, 2)}\n`;
    const saved = await this.soundFilePicker.save({
      suggestedName: name,
      content,
      extension: 'json',
      title: '导出 Notification Hub Runtime 日志',
      filter: 'JSON Runtime 日志 (*.json)|*.json|All files (*.*)|*.*'
    });
    return {
      savedToFile: saved.cancelled !== true,
      cancelled: saved.cancelled === true,
      savedFilename: saved.path || null,
      bytes: Buffer.byteLength(content, 'utf8'),
      format: 'notification-hub-runtime-log',
      version: 1,
      count: this.runtimeLog.length
    };
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

  recordNotificationLifecycle(notificationId, event, details = {}) {
    if (typeof notificationId !== 'string' || !notificationId.trim()) return;
    this.notificationLifecycleTrace.push({ notificationId, event, details: { channelId: details.channelId ?? null, reason: details.reason ?? null, outcome: details.outcome ?? null }, timestamp: new Date().toISOString() });
    if (this.notificationLifecycleTrace.length > 100) this.notificationLifecycleTrace.shift();
  }

  getNotificationLifecycleTrace(notificationId = null) {
    const entries = notificationId ? this.notificationLifecycleTrace.filter((item) => item.notificationId === notificationId) : this.notificationLifecycleTrace;
    return entries.slice(-100).map((item) => ({ ...item, details: { ...item.details } }));
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
    this.recordRuntimeLog('diagnostic', {
      code: diagnostic.code,
      message: diagnostic.message,
      timestamp: diagnostic.timestamp,
      details: { stage, ...diagnostic.details }
    }, 'notification');
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
        log: this.ctx.log,
        ctx: this.ctx
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
    this.notificationSceneReconciledIds.clear();
    this.notificationBehaviorManagers.clear();
    this.notificationSceneQueues.clear();
    this.notificationSceneDrainPromises.clear();
    this.notificationSceneDismissQueue.clearPending();
    this.visualRuntimeShadowCards.clear();
    this.visualRuntimeShadowRegistry.forEach((channel, channelId) => this.visualRuntimeShadowRegistry.removeChannel(channelId));
  }

  readVisualRuntimeMode() { return this.visualRuntimeModeConfig?.mode ?? 'legacy'; }

  readVisualRuntimeShadowEnabled() { return this.visualRuntimeModeConfig?.shadowEnabled === true; }

  getVisualRuntimeShadowStatus() {
    return { enabled: this.visualRuntimeShadowEnabled, mode: this.visualRuntimeModeController.mode(), modeContract: this.visualRuntimeModeController.snapshot(), metrics: this.visualRuntimeShadowRegistry.metrics(), channels: this.visualRuntimeShadowRegistry.listChannelIds(), parity: { ...this.visualRuntimeShadowParity } };
  }

  getVisualRuntimeModeStatus() {
    const shadow = this.getVisualRuntimeShadowStatus();
    return { ...this.visualRuntimeModeController.snapshot(), config: { requestedMode: this.visualRuntimeModeConfig.requestedMode, mode: this.visualRuntimeModeConfig.mode, shadowEnabled: this.visualRuntimeModeConfig.shadowEnabled, takeoverEnabled: this.visualRuntimeModeConfig.takeoverEnabled, declarationPresent: this.visualRuntimeModeConfig.declarationPresent, allowed: this.visualRuntimeModeConfig.allowed, reason: this.visualRuntimeModeConfig.reason }, metrics: createVisualRuntimeMetrics({ legacyVisibleCount: this.notificationBehaviorManagers.size, shadowVisibleCount: shadow.metrics.visibleCardCount, nativeSceneCardCount: this.notificationSceneVisibleIds.size, shadowQueuedCount: shadow.metrics.queuedCardCount, shadowSuppressedCount: shadow.metrics.suppressedCardCount, lifecycleMismatches: shadow.parity.mismatches, channelIsolationPassed: shadow.metrics.channelCount <= 1 || shadow.parity.mismatches === 0, soundPathHealthy: true, notificationStatusHealthy: true }) };
  }

  shadowEnqueueVisualRuntime(record, selector, projectedVisual) {
    if (!this.visualRuntimeShadowEnabled || !selector) return;
    try {
      const channel = this.visualRuntimeShadowRegistry.getOrCreateChannel({ channelId: selector.behavior.channelId, behaviorId: selector.behavior.behaviorProfileId, policy: selector.behavior.channelPolicy });
      const cardId = `shadow-${record.notificationId}`;
      const shadowCard = channel.enqueue({ cardId, notificationId: record.notificationId, eventId: selector.eventId, width: projectedVisual.appearance?.width ?? RUNTIME_NOTIFICATION_CARD_SIZE.width, height: projectedVisual.appearance?.height ?? RUNTIME_NOTIFICATION_CARD_SIZE.height, createdAt: Date.parse(record.createdAt) || Date.now(), properties: { visualProfileId: selector.visual.visualProfileId } });
      if (shadowCard?.state === 'created') channel.start(cardId, Date.now());
      const legacyManager = this.notificationBehaviorManagers.get(selector.behavior.channelId);
      const legacySnapshot = legacyManager?.snapshot?.();
      const comparable = Boolean(legacySnapshot && ['allow', 'queue', 'drop-oldest'].includes(selector.behavior.channelPolicy?.overflow ?? 'allow') && selector.behavior.channelPolicy?.suppression !== 'aggressive');
      this.visualRuntimeShadowParity.observations += 1;
      if (comparable) {
        this.visualRuntimeShadowParity.comparable += 1;
        if (legacySnapshot.metrics.visibleCardCount > 0) this.visualRuntimeShadowParity.legacyAccepted += 1;
        if (shadowCard?.state === 'active' || shadowCard?.state === 'created') this.visualRuntimeShadowParity.shadowAccepted += 1;
        if (Boolean(legacySnapshot.metrics.visibleCardCount > 0) !== Boolean(shadowCard)) this.visualRuntimeShadowParity.mismatches += 1;
      } else this.visualRuntimeShadowParity.incomparable += 1;
      if (shadowCard) this.visualRuntimeShadowCards.set(record.notificationId, selector.behavior.channelId);
    } catch (error) {
      this.recordNotificationDiagnostic(error, 'visual-runtime-shadow-enqueue');
    }
  }

  resolveNotificationEventId(record) {
    let eventId = record?.presentation?.eventId
      ?? record?.metadata?.semantic?.eventId
      ?? TEST_EVENT_PRESENTATION_IDS[record?.metadata?.testEvent]
      ?? TEST_EVENT_PRESENTATION_IDS[record?.type]
      ?? null;
    if (!eventId) {
      try {
        eventId = createNotificationPresentationInput(record, projectNotificationCategories(record), null).selector?.eventId ?? null;
      } catch {
        eventId = null;
      }
    }
    return eventId;
  }

  resolveVisualEventCardIntent(record) {
    const eventId = this.resolveNotificationEventId(record);
    const storeProfile = this.visualSettingsStore.getSnapshot().settings.profile;
    const binding = hasExplicitVisualBinding(this.visualBindingRegistry, eventId)
      ? this.visualBindingRegistry.get(eventId)
      : null;
    const boundProfile = binding ? (this.visualProfileRegistry.get(binding.visualProfileId)?.profile ?? null) : null;
    const intent = resolveVisualEventCardIntentFromState({
      eventId,
      globalEnabled: storeProfile?.global?.enabled !== false,
      defaultMode: storeProfile?.global?.defaultMode ?? 'off',
      binding,
      boundProfile,
      storeProfile
    });
    if (intent.reason === 'missing-profile' && binding) {
      this.recordVisualDiagnostic(
        Object.assign(new Error(`绑定配置包不存在：${binding.visualProfileId}`), { code: 'VISUAL_EVENT_BINDING_PROFILE_MISSING' }),
        'EVENT_CARD',
        { eventId, visualProfileId: binding.visualProfileId, profileId: binding.visualProfileId }
      );
    }
    if (intent.showCard && intent.reason === 'default-mode') {
      try {
        intent.visualProfile = createVisualProfile({
          ...intent.visualProfile,
          behaviorId: storeProfile?.global?.defaultMode,
          ...(storeProfile?.global?.defaultMode === 'ticker' ? { ticker: storeProfile.ticker ?? intent.visualProfile?.ticker ?? {} } : {})
        });
        intent.nativeBehavior = resolveVisualEventNativeFlight(intent.visualProfile);
      } catch {
        /* keep the unfrozen default-mode profile if studio draft is incomplete */
      }
    }
    return intent;
  }

  presentationProfileForRecord(record) {
    const intent = this.resolveVisualEventCardIntent(record);
    if (!intent.showCard) return null;
    if (!intent.binding) return null;
    return createPresentationProfileFromSettings(this.eventPresentationSettingsStore.getSnapshot().settings);
  }

  notificationSceneChannelForRecord(record) {
    const intent = this.resolveVisualEventCardIntent(record);
    if (!intent.showCard) return '__legacy__';
    return intent.nativeBehavior.behaviorChannelId;
  }

  enqueueNotificationScene(record, options = {}) {
    if (!record) return;
    if (!this.resolveVisualEventCardIntent(record).showCard) return;
    const channelId = this.notificationSceneChannelForRecord(record);
    const queue = this.notificationSceneQueues.get(channelId) ?? [];
    if (queue.some((queued) => queued.notificationId === record.notificationId)) return;
    queue.push(record);
    this.notificationSceneQueues.set(channelId, queue);
    this.drainNotificationSceneQueue(channelId, options);
  }

  drainNotificationSceneQueue(channelId = null, { onSceneError = null } = {}) {
    if (!runtimeHostReady(this.runtimeHost)) return Promise.resolve();
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
            const diagnostic = this.recordNotificationDiagnostic(error, 'scene-create');
            if (record.metadata?.test === true) this.notificationTestSceneFailures.set(record.notificationId, diagnostic);
            if (typeof onSceneError === 'function') onSceneError({ record, error, diagnostic });
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

  async waitForNotificationSceneQueues(options = {}) {
    while (true) {
      const pendingPromises = [...this.notificationSceneDrainPromises.values()];
      const hasQueuedRecords = [...this.notificationSceneQueues.values()].some((queue) => queue.length > 0);
      if (pendingPromises.length === 0) {
        if (!hasQueuedRecords) return;
        this.drainNotificationSceneQueue(null, options);
        continue;
      }
      await Promise.all(pendingPromises);
    }
  }

  async retryNotificationPromotions() {
    return this.notificationPromotionQueue.retry();
  }

  buildNotificationScenePayload({ record, health, layout, retainedNotificationCards, visualPayload, presentation, behavior } = {}) {
    const tickerFlight = isTickerFlight(visualPayload?.behaviorId) || isTickerFlight(behavior?.behaviorProfileId);
    return notificationCardPayload(
      record,
      tickerFlight ? 0 : retainedNotificationCards.length,
      health.workArea,
      layout,
      visualPayload,
      presentation,
      behavior ? {
        behaviorProfileId: behavior.behaviorProfileId,
        behaviorChannelId: behavior.behaviorChannelId
      } : null,
      this.ctx
    );
  }

  async ensureNativeFlightCharter(host, visual) {
    if (!host?.client?.request) return;
    if (isTickerFlight(visual?.behaviorId)) {
      await host.client.request(
        'scene.set-charter',
        toNativeTickerCharterPayload(splitLegacyTicker(visual?.ticker ?? {}).charter, VISUAL_EVENT_TICKER_CHANNEL),
        { retryable: false }
      );
      return;
    }
    await host.client.request('scene.set-mode', spaceToNativeStackLayout(visual?.space), { retryable: false });
  }

  async ensureNativeStackLayout(host, visual) {
    return this.ensureNativeFlightCharter(host, visual);
  }

  async createNotificationSceneNative({ record, card, selector, behavior, visual } = {}) {
    const host = this.runtimeHost;
    await this.ensureNativeStackLayout(host, visual ?? {
      behaviorId: behavior?.behaviorProfileId ?? card?.behavior?.behaviorProfileId,
      space: visual?.space,
      ticker: visual?.ticker
    });
    await this.applyAgentAvatarManifestForRecord(record);
    try {
      if (this.visualRuntimeModeController.mode() === 'takeover' && selector && behavior) {
        const takeover = await this.visualRuntimeTakeoverAdapter.create({
          channelId: behavior.behaviorChannelId,
          behaviorId: behavior.behaviorProfileId,
          policy: selector.behavior.channelPolicy,
          card: { cardId: record.notificationId, notificationId: record.notificationId, eventId: selector.eventId, visualProfileId: selector.visual.visualProfileId },
          nativePayload: card
        });
        if (takeover.decision === 'created') return { payload: { result: takeover.response } };
        this.visualRuntimeModeController.rollback(takeover.code ?? 'VISUAL_RUNTIME_TAKEOVER_FAILED', { declaration: 'automatic-safety-gate' });
        return host.client.request('scene.create', card, sceneCreateOptions({ idempotencyKey: `notification-scene-${record.notificationId}` }));
      }
      return host.client.request('scene.create', card, sceneCreateOptions({ idempotencyKey: `notification-scene-${record.notificationId}` }));
    } catch (error) {
      if (this.visualRuntimeModeController.mode() === 'takeover') this.visualRuntimeModeController.rollback(error.code ?? 'VISUAL_RUNTIME_TAKEOVER_FAILED', { declaration: 'automatic-safety-gate' });
      throw error;
    }
  }

  async promoteNotificationScene(record, promotedCard, channelId, { commit = true } = {}) {
    const intent = this.resolveVisualEventCardIntent(record);
    if (!intent.showCard) return { card: null, response: null, skipped: true, channelId, promotedCard, record };
    const host = this.runtimeHost;
    if (!runtimeHostReady(host)) {
      const error = new Error('Native Runtime is not running; promoted notification scene was not created');
      error.code = 'RUNTIME_PROMOTION_NATIVE_UNAVAILABLE';
      throw error;
    }
    const healthResponse = await host.client.request('health', {}, { retryable: true, maxAttempts: 2 });
    const health = healthResponse?.payload?.result ?? {};
    const layout = health.layout ?? { direction: 'right', anchor: 'bottom-left', spacing: 12 };
    const existing = Array.isArray(health.sceneCards) ? health.sceneCards : [];
    const retainedNotificationCards = existing.filter((card) => notificationIdFromCardId(card?.id));
    const draftVisualProfile = this.visualSettingsStore.getSnapshot().settings.profile;
    const projectedVisual = draftVisualProfile.card?.types?.[draftVisualProfile.card.activeType ?? 'minimal'] ?? {};
    const projectedCardDimensions = notificationCardDimensions(projectedVisual.appearance, draftVisualProfile.card?.activeType ?? 'minimal', draftVisualProfile.behaviorId);
    const presentationProfile = this.presentationProfileForRecord(record);
    const presentationInput = createNotificationPresentationInput(record, projectNotificationCategories(record), presentationProfile);
    const selector = presentationInput.selector ?? null;
    const behavior = this.resolveNotificationBehavior(selector, record, intent.nativeBehavior);
    const visualProfile = intent.visualProfile;
    const visual = resolveVisualRuleSafe({ visualInput: presentationInput.visualInput, profile: visualProfile, context: { globalEnabled: visualProfile.global.enabled } });
    const visualPayload = { enabled: visual.enabled, preset: visual.preset, intensity: visual.intensity, category: visual.category, cardType: visual.cardType, behaviorId: visual.behaviorId, space: visual.space, appearance: visual.appearance, ...(visual.interaction ? { interaction: visual.interaction } : {}), ...(intent.visualProfile?.card?.types?.[intent.visualProfile.card.activeType ?? 'minimal']?.properties?.interaction && !visual.interaction ? { interaction: intent.visualProfile.card.types[intent.visualProfile.card.activeType ?? 'minimal'].properties.interaction } : {}), ...(visual.ticker ? { ticker: visual.ticker } : {}), ...(visual.parts ? { parts: visual.parts } : {}), ...(visual.glossary ? { glossary: visual.glossary } : {}) };
    const presentation = selector ? { eventId: selector.eventId, categoryId: selector.categoryId, eventTypeId: selector.eventTypeId, visualProfileId: selector.visual.visualProfileId } : {
      eventId: intent.eventId,
      categoryId: intent.binding?.categoryId ?? 'chat',
      eventTypeId: intent.eventId,
      visualProfileId: intent.binding?.visualProfileId ?? 'visual.default'
    };
    const card = this.buildNotificationScenePayload({ record, health, layout, retainedNotificationCards, visualPayload, presentation, behavior });
    this.recordNotificationLifecycle(record.notificationId, 'scene.create.request', { channelId: behavior?.behaviorChannelId, reason: 'promotion' });
    const response = await this.createNotificationSceneNative({ record, card, selector, behavior, visual: visualPayload });
    if (commit) this.commitNotificationSceneShown(record, behavior);
    return { card, response: response?.payload?.result ?? null, channelId, promotedCard, record, behavior };
  }

  commitNotificationSceneShown(record, behavior) {
    this.notificationSceneVisibleIds.add(record.notificationId);
    if (behavior?.behaviorChannelId) this.notificationSceneCardChannels.set(record.notificationId, behavior.behaviorChannelId);
    try {
      this.notificationStore.setStatus(record.notificationId, 'shown');
    } catch (error) {
      this.recordNotificationDiagnostic(error, 'scene-status');
    }
    return { notificationId: record.notificationId, lifetimeMs: null, timerArmed: false };
  }

  async showNotificationScene(record) {
    const intent = this.resolveVisualEventCardIntent(record);
    if (!intent.showCard) return { card: null, response: null, skipped: true };
    const host = this.runtimeHost;
    if (!runtimeHostReady(host)) {
      const error = new Error('Native Runtime is not running; notification scene was not created');
      error.code = 'RUNTIME_NOTIFICATION_SCENE_UNAVAILABLE';
      throw error;
    }
    const healthResponse = await host.client.request('health', {}, { retryable: true, maxAttempts: 2 });
    const health = healthResponse?.payload?.result ?? {};
    const existing = Array.isArray(health.sceneCards) ? health.sceneCards : [];
    const layout = health.layout ?? { direction: 'right', anchor: 'bottom-left', spacing: 12 };
    const notificationCards = existing.filter((card) => notificationIdFromCardId(card?.id));
    const presentationProfile = this.presentationProfileForRecord(record);
    const presentationInput = createNotificationPresentationInput(record, projectNotificationCategories(record), presentationProfile);
    const selector = presentationInput.selector ?? null;
    const behavior = this.resolveNotificationBehavior(selector, record, intent.nativeBehavior);
    const visualProfile = intent.visualProfile;
    const behaviorBefore = behavior?.manager?.snapshot?.() ?? null;
    const behaviorPolicy = selector?.behavior?.channelPolicy ?? null;
    const oldestBehaviorCard = behaviorBefore?.cards?.[0] ?? null;
    if (behavior && behaviorPolicy?.overflow === 'drop-oldest'
      && Number.isInteger(behaviorPolicy.maxVisible)
      && behaviorBefore.cards.length >= behaviorPolicy.maxVisible
      && oldestBehaviorCard?.notificationId) {
      await this.dismissNotificationScene(oldestBehaviorCard.notificationId, 'dismissed');
    }
    const behaviorCard = behavior?.manager?.enqueue({
      cardId: record.notificationId,
      notificationId: record.notificationId,
      eventId: behavior.eventId,
      visualProfileId: behavior.visualProfileId,
      payload: { policyId: behavior.channelPolicyId }
    });
    if (behavior && !behaviorCard) return { card: null, response: null, suppressed: true };
    const behaviorAfter = behavior?.manager?.snapshot?.() ?? null;
    const queuedByBehavior = Boolean(behaviorAfter?.pending?.some((item) => item.cardId === record.notificationId));
    if (queuedByBehavior) return { card: null, response: null, queued: true };
    const visual = resolveVisualRuleSafe({
      visualInput: presentationInput.visualInput,
      profile: visualProfile,
      context: { globalEnabled: visualProfile.global.enabled }
    });
    const typeInteraction = visualProfile?.card?.types?.[visualProfile.card?.activeType ?? 'minimal']?.properties?.interaction;
    const visualPayload = {
      enabled: visual.enabled,
      preset: visual.preset,
      intensity: visual.intensity,
      category: visual.category,
      cardType: visual.cardType,
      behaviorId: visual.behaviorId,
      space: visual.space,
      appearance: visual.appearance,
      ...(visual.interaction ?? typeInteraction ? { interaction: visual.interaction ?? typeInteraction } : {}),
      ...(visual.ticker ? { ticker: visual.ticker } : {}),
      ...(visual.parts ? { parts: visual.parts } : {}),
      ...(visual.glossary ? { glossary: visual.glossary } : {})
    };
    const channelId = behavior?.behaviorChannelId ?? '__legacy__';
    const retainedNotificationCards = notificationCards.filter((card) => !isTickerFlight(card?.behavior?.behaviorProfileId));
    this.shadowEnqueueVisualRuntime(record, selector, visualPayload);
    const presentation = selector ? {
      eventId: selector.eventId,
      categoryId: selector.categoryId,
      eventTypeId: selector.eventTypeId,
      visualProfileId: selector.visual.visualProfileId
    } : {
      eventId: intent.eventId,
      categoryId: intent.binding?.categoryId ?? 'chat',
      eventTypeId: intent.eventId,
      visualProfileId: intent.binding?.visualProfileId ?? 'visual.default'
    };
    const tickerFlight = isTickerFlight(visualPayload?.behaviorId) || isTickerFlight(behavior?.behaviorProfileId);
    let liveHealth = health;
    let liveLayout = layout;
    let liveRetained = retainedNotificationCards;
    let card = this.buildNotificationScenePayload({
      record,
      health: liveHealth,
      layout: liveLayout,
      retainedNotificationCards: liveRetained,
      visualPayload,
      presentation,
      behavior
    });
    this.recordNotificationLifecycle(record.notificationId, 'scene.create.request', { channelId: behavior?.behaviorChannelId });
    let response;
    for (let attempt = 0; attempt < 64; attempt += 1) {
      try {
        response = await this.createNotificationSceneNative({ record, card, selector, behavior, visual: visualPayload });
        break;
      } catch (error) {
        const outOfBounds = error.code === 'LAYOUT_BEHAVIOR_CHANNEL_OUT_OF_BOUNDS'
          || error.code === 'LAYOUT_CARD_OUT_OF_BOUNDS';
        if (tickerFlight || !outOfBounds) {
          behavior?.manager?.remove(record.notificationId);
          throw error;
        }
        const oldest = liveRetained.find((item) => {
          const id = notificationIdFromCardId(item?.id);
          return id && id !== record.notificationId;
        });
        const oldestId = notificationIdFromCardId(oldest?.id);
        if (!oldestId) {
          behavior?.manager?.remove(record.notificationId);
          throw error;
        }
        await this.dismissNotificationScene(oldestId, 'dismissed');
        const healthAgain = (await host.client.request('health', {}, { retryable: true, maxAttempts: 2 }))?.payload?.result ?? {};
        liveHealth = healthAgain;
        liveLayout = healthAgain.layout ?? liveLayout;
        const existingAgain = Array.isArray(healthAgain.sceneCards) ? healthAgain.sceneCards : [];
        liveRetained = existingAgain.filter((item) => {
          const id = notificationIdFromCardId(item?.id);
          return id && !isTickerFlight(item?.behavior?.behaviorProfileId);
        });
        card = this.buildNotificationScenePayload({
          record,
          health: liveHealth,
          layout: liveLayout,
          retainedNotificationCards: liveRetained,
          visualPayload,
          presentation,
          behavior
        });
      }
    }
    if (!response) {
      behavior?.manager?.remove(record.notificationId);
      const overflow = new Error('Stack layout could not place the newest card after dropping older cards');
      overflow.code = 'LAYOUT_BEHAVIOR_CHANNEL_OUT_OF_BOUNDS';
      throw overflow;
    }
    this.commitNotificationSceneShown(record, behavior);
    this.recordNotificationLifecycle(record.notificationId, 'scene.commit.shown', { channelId: behavior?.behaviorChannelId });
    return { card, response: response?.payload?.result ?? null };
  }

  removeVisualRuntimeShadowCard(notificationId) {
    const channelId = this.visualRuntimeShadowCards.get(notificationId);
    if (!channelId) return;
    const cardId = `shadow-${notificationId}`;
    const channel = this.visualRuntimeShadowRegistry.getChannel(channelId);
    channel?.close(cardId, 'native-dismiss', Date.now());
    channel?.reclaim(cardId, Date.now());
    this.visualRuntimeShadowCards.delete(notificationId);
    this.visualRuntimeShadowRegistry.removeIfEmpty(channelId);
  }

  removeNotificationBehaviorCard(notificationId) {
    this.removeVisualRuntimeShadowCard(notificationId);
    const channelId = this.notificationSceneCardChannels.get(notificationId);
    if (!channelId) return { removed: null, promoted: null, channelId: null };
    const manager = this.notificationBehaviorManagers.get(channelId);
    const result = manager?.removeByNotificationId?.(notificationId) ?? { removed: null, promoted: null };
    this.notificationSceneCardChannels.delete(notificationId);
    if (manager && manager.snapshot().cards.length === 0 && manager.snapshot().pending.length === 0) this.notificationBehaviorManagers.delete(channelId);
    return { ...result, channelId };
  }

  resolveNotificationBehavior(selector, record, nativeBehavior = null) {
    const behaviorProfileId = nativeBehavior?.behaviorProfileId ?? selector?.behavior?.behaviorProfileId;
    const behaviorChannelId = nativeBehavior?.behaviorChannelId ?? selector?.behavior?.channelId;
    if (!behaviorProfileId || !behaviorChannelId) return null;
    let manager = this.notificationBehaviorManagers.get(behaviorChannelId);
    if (!manager) {
      manager = createBehaviorManager({
        channelId: behaviorChannelId,
        profile: createBehaviorProfile({ mode: behaviorProfileId, profileId: behaviorProfileId, channelId: behaviorChannelId }),
        policy: selector?.behavior?.channelPolicy ?? { policyId: selector?.behavior?.channelPolicyId ?? `${behaviorProfileId}.default` }
      });
      this.notificationBehaviorManagers.set(behaviorChannelId, manager);
    }
    return Object.freeze({
      behaviorProfileId,
      behaviorChannelId,
      eventId: selector?.eventId ?? record?.presentation?.eventId ?? record?.notificationId,
      visualProfileId: selector?.visual?.visualProfileId ?? nativeBehavior?.visualProfileId ?? 'visual.default',
      channelPolicyId: selector?.behavior?.channelPolicyId ?? `${behaviorProfileId}.default`,
      manager,
      notificationId: record.notificationId
    });
  }

  dismissNotificationScene(notificationId, status = 'dismissed') {
    return this.notificationSceneDismissQueue.enqueue({ notificationId, status });
  }

  reconcileNativeSceneDismissAck(notificationId, status = 'dismissed', change = null) {
    this.notificationSceneReconciledIds.add(notificationId);
    this.notificationSceneVisibleIds.delete(notificationId);
    this.removeNotificationBehaviorCard(notificationId);
    const timer = this.notificationSceneTimers.get(notificationId);
    if (timer) clearTimeout(timer);
    this.notificationSceneTimers.delete(notificationId);
    const record = this.notificationStore.get(notificationId);
    if (record && record.status === 'shown') this.notificationStore.setStatus(notificationId, status);
    this.recordNotificationLifecycle(notificationId, 'scene.dismiss.reconciled', { reason: change?.reason ?? status, outcome: 'ack' });
    return { notificationId, status, reason: change?.reason ?? status };
  }

  async performNotificationSceneDismiss(notificationId, status = 'dismissed') {
    this.recordNotificationLifecycle(notificationId, 'scene.dismiss.request', { reason: status });
    const timer = this.notificationSceneTimers.get(notificationId);
    if (timer) clearTimeout(timer);
    this.notificationSceneTimers.delete(notificationId);
    const host = this.runtimeHost;
    if (host?.state === 'running' && typeof host.client?.request === 'function') {
      let response = null;
      try {
        response = await host.client.request('scene.dismiss', { id: notificationCardId(notificationId) }, {
          retryable: false,
          timeoutMs: RUNTIME_SCENE_DISMISS_TIMEOUT_MS
        });
      } catch (error) {
        if (error?.code !== 'RUNTIME_SCENE_CARD_NOT_FOUND') throw error;
      }
      const responseResult = response?.payload?.result ?? null;
      return this.reconcileNativeSceneDismissAck(notificationId, status, responseResult?.change ?? null);
    }
    return this.reconcileNativeSceneDismissAck(notificationId, status, null);
  }

  async reconcileNativeSceneChangedCard(notificationId, change) {
    if (this.notificationSceneReconciledIds.has(notificationId)) return { removed: null, promoted: null, duplicate: true };
    this.notificationSceneReconciledIds.add(notificationId);
    this.notificationSceneVisibleIds.delete(notificationId);
    const removal = this.removeNotificationBehaviorCard(notificationId);
    const timer = this.notificationSceneTimers.get(notificationId);
    if (timer) clearTimeout(timer);
    this.notificationSceneTimers.delete(notificationId);
    const record = this.notificationStore.get(notificationId);
    let reconciledStatus = record?.status ?? null;
    if (record?.status === 'shown') {
      try {
        reconciledStatus = this.notificationStore.setStatus(notificationId, 'dismissed')?.status ?? 'dismissed';
      } catch (error) {
        this.recordNotificationDiagnostic(error, 'scene-dismiss-reconcile-status');
      }
    }
    this.recordNotificationLifecycle(notificationId, 'scene.changed.reconciled', { reason: change?.reason ?? null, outcome: reconciledStatus });
    if (removal?.promoted?.notificationId) {
      const promotedRecord = this.notificationStore.get(removal.promoted.notificationId);
      if (promotedRecord) await this.notificationPromotionQueue.enqueue({ record: promotedRecord, promotedCard: removal.promoted, channelId: removal.channelId });
    }
    return removal;
  }

  handleNativeSceneChanged(payload) {
    const eventPayload = payload?.payload?.payload ?? payload?.payload ?? payload;
    const snapshot = eventPayload?.snapshot ?? eventPayload?.result?.sceneStateSnapshot;
    if (!snapshot || !Array.isArray(snapshot.cards)) return;
    const change = eventPayload?.change ?? eventPayload?.result?.change;
    const changedNotificationId = notificationIdFromCardId(change?.targetId);
    if (changedNotificationId) this.recordNotificationLifecycle(changedNotificationId, 'scene.changed.received', { reason: change?.reason ?? null });
    if (changedNotificationId && change?.target === 'card') {
      void this.reconcileNativeSceneChangedCard(changedNotificationId, change).catch((error) => {
        this.notificationSceneReconciledIds.delete(changedNotificationId);
        this.recordNotificationDiagnostic(error, 'scene-dismiss-reconcile');
      });
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
      this.notificationCenterServices = createNotificationCenterServices({
        notificationApi: this.notificationApi,
        settingsApi: this.runtimeTestApi
      });
      this.ctx._notificationHubVNextNotificationCenterServices = this.notificationCenterServices;
      this.soundSettingsServices = createSoundSettingsServices({ settingsApi: this.runtimeTestApi });
      this.soundAssetServices = createSoundAssetServices({ settingsApi: this.runtimeTestApi });
      this.ctx._notificationHubVNextSoundSettingsServices = this.soundSettingsServices;
      this.ctx._notificationHubVNextSoundAssetServices = this.soundAssetServices;
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
      this.notificationCenterServices = createNotificationCenterServices({
        notificationApi: this.notificationApi,
        settingsApi: this.runtimeTestApi
      });
      this.soundSettingsServices = createSoundSettingsServices({ settingsApi: this.runtimeTestApi });
      this.soundAssetServices = createSoundAssetServices({ settingsApi: this.runtimeTestApi });
      if (this.ctx._notificationHubVNextPlugin === this.runtimeTestApi) {
        this.ctx._notificationHubVNextNotificationApi = this.notificationApi;
        this.ctx._notificationHubVNextNotificationCenterServices = this.notificationCenterServices;
        this.ctx._notificationHubVNextSoundSettingsServices = this.soundSettingsServices;
        this.ctx._notificationHubVNextSoundAssetServices = this.soundAssetServices;
      }
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
    const { currentError, recoveryNotice } = projectCurrentRuntimeError({
      connected: runtime.connected,
      lastError: runtimeStatus.lastError,
      requestError: runtime.requestError,
      runtimeError: runtime.runtimeError
    });
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
      lastError: currentError,
      recoveryNotice
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
    const projected = projectDiagnosticRecords({
      runtime: this.runtimeDiagnostics,
      settings: this.settingsDiagnostics,
      notifications: this.notificationDiagnostics
    });
    const { diagnostics } = projected;
    const { currentError: currentRuntimeError } = projectCurrentRuntimeError({
      connected: runtime.connected,
      lastError: runtimeStatus.lastError,
      requestError: runtime.requestError,
      runtimeError: runtime.runtimeError
    });
    const currentFailure = runtime.state === 'failed' || runtime.state === 'crashed' || runtime.state === 'stop-failed'
      || Boolean(currentRuntimeError);
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
        ...projected.summary,
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
      await this.applyVisualAssetManifest();
      await this.applyFontAssetManifest();
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
    await this.notificationPromotionQueue.retry().catch((error) => this.recordNotificationDiagnostic(error, 'promotion-retry'));
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
        async (input = {}) => input?.mode === 'parallel-card-sample' ? this.runParallelCardSample(input) : this.runNotificationTest(input)
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

  async runParallelCardSample({ count = 1, createCards = true, intervalMs = 0 } = {}) {
    if (!Number.isInteger(count) || count < 1 || count > 50) throw Object.assign(new Error('并行卡片样板数量必须是 1 到 50'), { code: 'PARALLEL_CARD_SAMPLE_COUNT_INVALID' });
    const gap = Number.isInteger(intervalMs) && intervalMs >= 0 && intervalMs <= 5000 ? intervalMs : 0;
    const host = createCards ? this.requireRuntimeTestHost() : null;
    const health = host
      ? ((await host.client.request('health', {}, { retryable: true, maxAttempts: 2 }))?.payload?.result ?? {})
      : { workArea: { left: 0, top: 0, width: 1920, height: 1080 }, layout: { direction: 'right', anchor: 'bottom-right', spacing: 12 } };
    const samples = [
      { cardType: 'minimal', channelId: 'visual.try-one.stack', behaviorId: 'stack', category: 'chat', title: '堆叠', content: '堆叠卡片叠在角落。', visual: { enabled: true, preset: 'minimal', intensity: 'balanced', category: 'chat', cardType: 'minimal', behaviorId: 'stack', space: { anchor: 'bottom-right', gap: 12, margin: 18 }, appearance: { size: 'medium', aspectRatio: 'default', backgroundColor: '#0e1916', backgroundFit: 'fill', backgroundPadding: 0, borderRadius: 16, opacity: 0.96 } } },
      { cardType: 'minimal', channelId: 'visual.try-one.ticker', behaviorId: 'ticker', category: 'chat', title: '弹幕', content: '弹幕从右往左流过。', visual: { enabled: true, preset: 'accent', intensity: 'expressive', category: 'chat', cardType: 'minimal', behaviorId: 'ticker', space: { anchor: 'top-right', gap: 12, margin: 18 }, appearance: { size: 'small', aspectRatio: 'wide', backgroundColor: '#10221e', backgroundFit: 'fill', backgroundPadding: 0, borderRadius: 12, opacity: 0.98 } } }
    ];
    const results = [];
    for (const sample of samples) {
      for (let index = 0; index < count; index += 1) {
        const notificationId = `parallel-${sample.behaviorId}-${Date.now().toString(36)}-${index + 1}`;
        const record = { notificationId, title: sample.title, content: `${sample.content} 通道：${sample.channelId}` };
        const card = notificationCardPayload(record, index, health.workArea, health.layout, sample.visual, { eventId: `visual.parallel.${sample.behaviorId}`, categoryId: sample.category, eventTypeId: 'parallel-test', visualProfileId: `visual.${sample.behaviorId}` }, { behaviorProfileId: sample.behaviorId, behaviorChannelId: sample.channelId }, this.ctx);
        const entry = { cardId: card.id, notificationId, cardType: sample.cardType, behaviorId: sample.behaviorId, behaviorChannelId: sample.channelId, geometry: { x: card.x, y: card.y, width: card.width, height: card.height } };
        if (host) {
          await this.ensureNativeStackLayout(host, sample.visual);
          const response = await host.client.request('scene.create', card, sceneCreateOptions({ idempotencyKey: `parallel-card-${notificationId}` }));
          entry.response = response?.payload?.result ?? null;
        }
        results.push(entry);
        if (gap > 0 && !(sample === samples.at(-1) && index === count - 1)) await new Promise((resolve) => setTimeout(resolve, gap));
      }
    }
    return { ok: true, count, intervalMs: gap, generated: results.length, created: createCards, channels: Object.fromEntries(samples.map((sample) => [sample.channelId, count])), cardTypes: samples.map((sample) => sample.cardType), behaviors: samples.map((sample) => sample.behaviorId), results };
  }

  async runNotificationTest(input = {}) {
    const normalized = normalizeNotificationTestInput(input);
    const entryPoint = input?.entryPoint === 'tool' || input?.entryPoint === 'command' ? input.entryPoint : 'internal';
    const notifications = createNotificationTestNotifications(normalized);
    const counts = Object.fromEntries(normalized.events.map((event) => [event, 0]));
    const results = [];
    const playbackPromises = [];
    const sceneFailures = [];
    const startedAt = Date.now();
    for (const item of notifications) {
      const metadata = { ...item.notification.metadata, testCreateCards: normalized.createCards, testEntryPoint: entryPoint };
      let result;
      try {
        result = this.notificationApi.ingestEvent({
          event: item.event,
          notification: { ...item.notification, metadata },
          profiles: [{ id: 'default' }],
          soundEnabled: normalized.playSound
        });
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
    for (const item of notifications) {
      const diagnostic = this.notificationTestSceneFailures.get(item.notification.notificationId);
      if (!diagnostic) continue;
      const result = results.find((entry) => entry.notificationId === item.notification.notificationId);
      if (result) result.sceneError = diagnostic.code;
      sceneFailures.push({ notificationId: item.notification.notificationId, code: diagnostic.code, stage: diagnostic.stage });
      this.notificationTestSceneFailures.delete(item.notification.notificationId);
    }
    const failed = results.filter((entry) => entry.error || entry.sceneError).length;
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
      failed,
      cardsCreated: normalized.createCards ? results.filter((entry) => entry.notificationId && this.notificationSceneVisibleIds.has(entry.notificationId)).length : 0,
      sceneFailures,
      durationMs: Date.now() - startedAt,
      results,
      activeSounds: this.soundScheduler?.getStatus?.() ?? null,
      storedNotifications: results.filter((entry) => entry.notificationId !== null).length
    };
  }

  buildVisualDraftNativeCard({ health, cardId, draft = null, title, body, eventId, channelId, sampleAgent = null }) {
    const sourceProfile = draft ?? this.visualSettingsStore.getSnapshot().settings.profile;
    const profile = createVisualProfile(normalizeVisualPreviewProfile(sourceProfile));
    const activeType = profile.card.types[profile.card.activeType];
    const behaviorId = profile.behaviorId === 'ticker' ? 'ticker' : 'stack';
    const visual = resolveVisualDraftPayload({
      enabled: profile.global.enabled !== false,
      preset: profile.global.preset,
      intensity: profile.global.intensity,
      category: 'chat',
      cardType: profile.card.activeType,
      behaviorId,
      space: activeType.properties?.space,
      appearance: activeType.appearance,
      ...(behaviorId === 'ticker' && profile.ticker ? { ticker: profile.ticker } : {})
    }, activeType);
    const sample = sampleAgentFromInput(sampleAgent);
    const card = notificationCardPayload(
      {
        notificationId: cardId,
        title,
        content: body,
        ...(sample ? { agent: sample } : {})
      },
      0,
      health.workArea,
      health.layout ?? { direction: 'right', anchor: 'bottom-left', spacing: 12 },
      visual,
      { eventId, categoryId: 'chat', eventTypeId: 'preview', visualProfileId: 'draft' },
      { behaviorProfileId: behaviorId, behaviorChannelId: channelId ?? `visual.try-one.${behaviorId}` },
      this.ctx
    );
    return { profile, card: { ...card, id: cardId, title, body } };
  }

  async runVisualDraftSample({ draft = null, sampleAgent = null } = {}) {
    const host = this.requireRuntimeTestHost();
    const sample = sampleAgentFromInput(sampleAgent);
    await this.applyVisualAssetManifest();
    await this.applyFontAssetManifest();
    await this.applyAgentAvatarManifestForRecord(sample ? { agent: sample } : null);
    const health = (await host.client.request('health', {}, { retryable: true, maxAttempts: 2 }))?.payload?.result ?? {};
    const id = `${VISUAL_TRY_CARD_PREFIX}${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
    const { profile, card } = this.buildVisualDraftNativeCard({
      health,
      cardId: id,
      draft,
      title: '试一条',
      body: '当前工作室草稿，不写通知历史。',
      eventId: 'visual.try-one',
      sampleAgent: sample
    });
    const label = profile.behaviorId === 'ticker' ? '弹幕' : '堆叠';
    card.title = `试一条 · ${label}`;
    card.body = profile.behaviorId === 'ticker'
      ? (profile.ticker?.direction === 'right' ? '弹幕从左往右流过。' : '弹幕从右往左流过。')
      : '当前工作室草稿，不写通知历史。';
    await this.ensureNativeStackLayout(host, {
      behaviorId: profile.behaviorId,
      space: profile.card?.types?.[profile.card.activeType]?.properties?.space,
      ticker: profile.ticker
    });
    const response = await host.client.request('scene.create', card, sceneCreateOptions());
    this.recordVisualDiagnostic({ code: 'VISUAL_DRAFT_SAMPLE_CREATED', message: 'Visual draft sample created' }, 'DRAFT_SAMPLE', { cardId: id, behaviorId: profile.behaviorId });
    return {
      generated: 1,
      receivedDraft: draft !== null,
      behaviorId: profile.behaviorId,
      historyWritten: false,
      soundPlayed: false,
      cardId: id,
      results: [{ cardId: id, response: response?.payload?.result ?? null }]
    };
  }

  async runVisualEventExperiment({ eventId, count = 1, intervalMs = 120 } = {}) {
    if (typeof eventId !== 'string' || !eventId.trim()) throw Object.assign(new Error('视觉实验台需要选择事件'), { code: 'VISUAL_EVENT_TEST_EVENT_REQUIRED' });
    if (!Number.isInteger(count) || count < 1 || count > 50) throw Object.assign(new Error('视觉实验台次数必须是 1 到 50'), { code: 'VISUAL_EVENT_TEST_COUNT_INVALID' });
    if (!Number.isInteger(intervalMs) || intervalMs < 0 || intervalMs > 5000) throw Object.assign(new Error('视觉实验台间隔必须是 0 到 5000 毫秒'), { code: 'VISUAL_EVENT_TEST_INTERVAL_INVALID' });
    const binding = this.visualBindingRegistry.get(eventId);
    if (!binding) throw Object.assign(new Error(`事件尚未绑定配置包：${eventId}`), { code: 'VISUAL_EVENT_TEST_NOT_BOUND' });
    const profile = this.visualProfileRegistry.get(binding.visualProfileId);
    if (!profile) throw Object.assign(new Error(`绑定配置包不存在：${binding.visualProfileId}`), { code: 'VISUAL_EVENT_TEST_PROFILE_NOT_FOUND' });
    const host = this.requireRuntimeTestHost();
    const health = (await host.client.request('health', {}, { retryable: true, maxAttempts: 2 }))?.payload?.result ?? {};
    const results = [];
    for (let index = 0; index < count; index += 1) {
      const id = `${VISUAL_EVENT_TEST_CARD_PREFIX}${Date.now().toString(36)}-${index + 1}`;
      const card = this.buildVisualWorkbenchCard('hold', health, id, profile.profile, binding);
      card.title = `视觉实验台 · ${eventId}`;
      card.body = `使用已绑定配置包：${binding.visualProfileId}`;
      await this.ensureNativeStackLayout(host, {
        behaviorId: profile.profile?.behaviorId ?? card.behavior?.behaviorProfileId,
        space: profile.profile?.card?.types?.[profile.profile.card?.activeType ?? 'minimal']?.properties?.space,
        ticker: profile.profile?.ticker
      });
      const response = await host.client.request('scene.create', card, sceneCreateOptions());
      results.push({ eventId, visualProfileId: binding.visualProfileId, cardId: id, response: response?.payload?.result ?? null });
      if (intervalMs > 0 && index < count - 1) await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    this.recordVisualDiagnostic({ code: 'VISUAL_EVENT_EXPERIMENT_COMPLETED', message: 'Visual event experiment completed' }, 'EVENT_EXPERIMENT', { eventId, visualProfileId: binding.visualProfileId, count });
    return { eventId, visualProfileId: binding.visualProfileId, count, intervalMs, generated: results.length, historyWritten: false, soundPlayed: false, results };
  }

  buildVisualWorkbenchCard(phase, health, cardId = null, draft = null, event = null) {
    const profile = draft ?? this.visualSettingsStore.getSnapshot().settings.profile;
    const eventInput = event ?? { eventId: 'chat.assistant_reply.completed', categoryId: 'chat', visualProfileId: 'visual.default' };
    const visual = resolveVisualRuleSafe({
      visualInput: { labels: [eventInput.categoryId ?? 'chat'], categoryId: eventInput.categoryId ?? 'chat', visualProfileId: eventInput.visualProfileId ?? 'visual.default', status: 'workbench', importance: 'normal' },
      profile,
      context: { globalEnabled: profile.global?.enabled !== false }
    });
    const activeType = profile?.card?.types?.[profile.card.activeType ?? 'minimal'] ?? {};
    const nativeBehavior = resolveVisualEventNativeFlight(profile);
    const visualPayload = resolveVisualDraftPayload({
      enabled: visual.enabled,
      preset: visual.preset,
      intensity: visual.intensity,
      category: visual.category,
      cardType: visual.cardType,
      behaviorId: visual.behaviorId,
      space: visual.space,
      appearance: visual.appearance,
      ...(visual.interaction ? { interaction: visual.interaction } : {}),
      ...(visual.parts ? { parts: visual.parts } : {}),
      ...(visual.glossary ? { glossary: visual.glossary } : {}),
      ...(profile.ticker ? { ticker: profile.ticker } : {})
    }, activeType);
    const id = cardId ?? `${VISUAL_WORKBENCH_CARD_PREFIX}${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
    const phaseLabels = { enter: '入场测试', hold: '持续更新测试', exit: '消失测试' };
    const card = notificationCardPayload({ notificationId: id, title: `视觉实验台 · ${phaseLabels[phase]}`, content: '真实 Native 卡片。修改设置后点击持续 / 更新，验证当前视觉配置。' }, 0, health.workArea, health.layout ?? { direction: 'right', anchor: 'bottom-left', spacing: 12 }, visualPayload, { eventId: eventInput.eventId, categoryId: eventInput.categoryId ?? 'chat', eventTypeId: eventInput.eventTypeId ?? 'completed', visualProfileId: eventInput.visualProfileId ?? 'visual.default' }, { behaviorProfileId: nativeBehavior.behaviorProfileId, behaviorChannelId: eventInput.behaviorChannelId ?? nativeBehavior.behaviorChannelId }, this.ctx);
    return { ...card, id, title: `视觉实验台 · ${phaseLabels[phase]}`, body: '真实 Native 卡片。修改设置后点击持续 / 更新，验证当前视觉配置。' };
  }

  async openVisualWorkbenchCard({ phase = 'enter', draft = null } = {}) {
    const host = this.requireRuntimeTestHost();
    if (!['enter', 'hold', 'exit'].includes(phase)) throw Object.assign(new Error('实验台阶段必须是 enter、hold 或 exit'), { code: 'VISUAL_WORKBENCH_PHASE_INVALID' });
    const health = (await host.client.request('health', {}, { retryable: true, maxAttempts: 2 }))?.payload?.result ?? {};
    const card = this.buildVisualWorkbenchCard(phase, health, null, draft);
    const source = draft ?? this.visualSettingsStore.getSnapshot().settings.profile;
    await this.ensureNativeStackLayout(host, {
      behaviorId: source?.behaviorId ?? card.behavior?.behaviorProfileId,
      space: source?.card?.types?.[source.card?.activeType ?? 'minimal']?.properties?.space,
      ticker: source?.ticker
    });
    const response = await host.client.request('scene.create', card, sceneCreateOptions());
    this.visualWorkbenchCardId = card.id;
    return { phase, card, response: response?.payload?.result ?? null };
  }

  async updateVisualWorkbenchCard({ phase = 'hold', draft = null } = {}) {
    const host = this.requireRuntimeTestHost();
    if (!this.visualWorkbenchCardId) throw Object.assign(new Error('实验台卡片尚未打开'), { code: 'VISUAL_WORKBENCH_CARD_NOT_OPEN' });
    if (!['hold', 'enter', 'exit'].includes(phase)) throw Object.assign(new Error('实验台阶段必须是 enter、hold 或 exit'), { code: 'VISUAL_WORKBENCH_PHASE_INVALID' });
    const health = (await host.client.request('health', {}, { retryable: true, maxAttempts: 2 }))?.payload?.result ?? {};
    const card = this.buildVisualWorkbenchCard(phase, health, this.visualWorkbenchCardId, draft);
    const response = await host.client.request('scene.update', card, { retryable: false });
    return { phase, card, response: response?.payload?.result ?? null };
  }

  async closeVisualWorkbenchCard() {
    const host = this.requireRuntimeTestHost();
    if (!this.visualWorkbenchCardId) return { closed: false };
    const id = this.visualWorkbenchCardId;
    const response = await host.client.request('scene.dismiss', { id }, { retryable: false });
    this.visualWorkbenchCardId = null;
    return { closed: true, id, response: response?.payload?.result ?? null };
  }

  async clearVisualStudioCards() {
    const prefixes = [VISUAL_TRY_CARD_PREFIX, VISUAL_WORKBENCH_CARD_PREFIX, VISUAL_PREVIEW_CARD_PREFIX, VISUAL_EVENT_TEST_CARD_PREFIX];
    this.visualPreviewClosedExplicitly = true;
    this.visualPreviewSessionGeneration += 1;
    const host = this.requireRuntimeTestHost();
    const health = await host.client.request('health', {}, { retryable: true, maxAttempts: 2 });
    const cards = health?.payload?.result?.sceneCards;
    const liveIds = Array.isArray(cards)
      ? cards.map((card) => card?.id).filter((id) => typeof id === 'string' && prefixes.some((prefix) => id.startsWith(prefix)))
      : [];
    const tracked = [this.visualPreviewCardId, this.visualWorkbenchCardId].filter((id) => typeof id === 'string' && !liveIds.includes(id));
    const ids = [...liveIds, ...tracked];
    const dismissed = [];
    for (const id of ids) {
      try {
        await host.client.request('scene.dismiss', { id }, { retryable: false });
        dismissed.push(id);
      } catch {
        // Card may already be gone.
      }
    }
    this.visualPreviewCardId = null;
    this.visualWorkbenchCardId = null;
    this.recordVisualDiagnostic({ code: 'VISUAL_STUDIO_CARDS_CLEARED', message: 'Visual studio cards cleared' }, 'STUDIO_CLEAR', { count: dismissed.length });
    return { dismissed, count: dismissed.length, historyWritten: false };
  }

  buildVisualPreviewCard(health, cardId, draft = null, sampleAgent = null) {
    // Preview owns its source boundary: an explicit draft is never resolved through
    // the persisted store or visual.default category policy.
    const { card } = this.buildVisualDraftNativeCard({
      health,
      cardId,
      draft,
      title: '实时视觉预览',
      body: '当前编辑草稿的 Native 预览，不会写入通知历史。',
      eventId: 'visual.preview',
      channelId: 'visual.preview',
      sampleAgent
    });
    return card;
  }

  isVisualPreviewCardMissing(error) {
    return ['CARD_NOT_FOUND', 'RUNTIME_SCENE_CARD_NOT_FOUND', 'SCENE_CARD_NOT_FOUND'].includes(error?.code)
      || /card.?not.?found|scene.?card.?not.?found/i.test(error?.message ?? '');
  }

  async openVisualPreviewCard({ draft = null, sampleAgent = null } = {}) {
    this.visualPreviewClosedExplicitly = false;
    if (this.visualPreviewCardId) return this.updateVisualPreviewCard({ draft, sampleAgent });
    const sessionGeneration = ++this.visualPreviewSessionGeneration;
    const host = this.requireRuntimeTestHost();
    const sample = sampleAgentFromInput(sampleAgent);
    await this.applyVisualAssetManifest();
    await this.applyFontAssetManifest();
    await this.applyAgentAvatarManifestForRecord(sample ? { agent: sample } : null);
    const health = (await host.client.request('health', {}, { retryable: true, maxAttempts: 2 }))?.payload?.result ?? {};
    if (this.visualPreviewClosedExplicitly || sessionGeneration !== this.visualPreviewSessionGeneration) {
      throw Object.assign(new Error('Realtime Native preview session is closed'), { code: 'VISUAL_PREVIEW_SESSION_CLOSED' });
    }
    const id = `${VISUAL_PREVIEW_CARD_PREFIX}${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
    const card = this.buildVisualPreviewCard(health, id, draft, sample);
    const source = draft ?? this.visualSettingsStore.getSnapshot().settings.profile;
    await this.ensureNativeStackLayout(host, {
      behaviorId: source?.behaviorId ?? card.behavior?.behaviorProfileId,
      space: source?.card?.types?.[source.card?.activeType ?? 'minimal']?.properties?.space,
      ticker: source?.ticker
    });
    const response = await host.client.request('scene.create', card, sceneCreateOptions());
    const responseResult = response?.payload?.result ?? null;
    if (this.visualPreviewClosedExplicitly || sessionGeneration !== this.visualPreviewSessionGeneration) {
      await host.client.request('scene.dismiss', { id }, { retryable: false }).catch(() => {});
      throw Object.assign(new Error('Realtime Native preview session is closed'), { code: 'VISUAL_PREVIEW_SESSION_CLOSED' });
    }
    this.visualPreviewCardId = id;
    this.visualPreviewCardGeometry = sceneCardGeometryFromResult(responseResult, id) ?? { x: card.x, y: card.y, width: card.width, height: card.height };
    this.visualPreviewPlacementFingerprint = visualPlacementFingerprint(draft ?? this.visualSettingsStore.getSnapshot().settings.profile);
    this.recordVisualDiagnostic({ code: 'VISUAL_PREVIEW_CREATED', message: 'Realtime Native preview card created' }, 'PREVIEW_SESSION', { cardId: id });
    return {
      created: true,
      recreated: false,
      card,
      response: responseResult,
      ...visualPreviewHandshake({ receivedDraft: draft !== null, updated: false, recreated: false, cardId: id, draft: card.visual, nativeVisual: card.visual })
    };
  }

  async updateVisualPreviewCard({ draft = null, sampleAgent = null } = {}) {
    const host = this.requireRuntimeTestHost();
    const sample = sampleAgentFromInput(sampleAgent);
    if (!this.visualPreviewCardId) {
      if (this.visualPreviewClosedExplicitly) {
        throw Object.assign(new Error('Realtime Native preview session is closed'), { code: 'VISUAL_PREVIEW_SESSION_CLOSED' });
      }
      return this.openVisualPreviewCard({ draft, sampleAgent: sample });
    }
    const sessionGeneration = this.visualPreviewSessionGeneration;
    await this.applyAgentAvatarManifestForRecord(sample ? { agent: sample } : null);
    const health = (await host.client.request('health', {}, { retryable: true, maxAttempts: 2 }))?.payload?.result ?? {};
    if (this.visualPreviewClosedExplicitly || sessionGeneration !== this.visualPreviewSessionGeneration) {
      throw Object.assign(new Error('Realtime Native preview session is closed'), { code: 'VISUAL_PREVIEW_SESSION_CLOSED' });
    }
    const placementFingerprint = visualPlacementFingerprint(draft ?? this.visualSettingsStore.getSnapshot().settings.profile);
    const placementChanged = this.visualPreviewPlacementFingerprint !== null && placementFingerprint !== this.visualPreviewPlacementFingerprint;
    if (placementChanged && this.visualPreviewCardId) {
      const previousCardId = this.visualPreviewCardId;
      try { await host.client.request('scene.dismiss', { id: previousCardId }, { retryable: false }); } catch { /* recreate even if dismiss failed */ }
      this.visualPreviewCardId = null;
      this.visualPreviewCardGeometry = null;
      this.visualPreviewPlacementFingerprint = null;
      if (this.visualPreviewClosedExplicitly || sessionGeneration !== this.visualPreviewSessionGeneration) {
        throw Object.assign(new Error('Realtime Native preview session is closed'), { code: 'VISUAL_PREVIEW_SESSION_CLOSED' });
      }
      const recreated = await this.openVisualPreviewCard({ draft, sampleAgent: sample });
      this.recordVisualDiagnostic({ code: 'VISUAL_PREVIEW_RECREATED', message: 'Realtime Native preview card recreated' }, 'PREVIEW_RECREATE', { cardId: recreated.cardId, previousCardId });
      return { ...recreated, updated: false, recreated: true };
    }
    const currentGeometry = sceneCardGeometryFromResult(health, this.visualPreviewCardId) ?? this.visualPreviewCardGeometry;
    const card = {
      ...this.buildVisualPreviewCard(health, this.visualPreviewCardId, draft, sample),
      ...(currentGeometry ? { x: currentGeometry.x, y: currentGeometry.y } : {})
    };
    const sourceProfile = draft ?? this.visualSettingsStore.getSnapshot().settings.profile;
    const activeType = sourceProfile?.card?.types?.[sourceProfile?.card?.activeType ?? 'minimal'] ?? {};
    const explicitDimensions = Number.isInteger(activeType.appearance?.width) && Number.isInteger(activeType.appearance?.height);
    if (!explicitDimensions && currentGeometry) {
      card.width = currentGeometry.width;
      card.height = currentGeometry.height;
    }
    try {
      const response = await host.client.request('scene.update', card, { retryable: false });
      if (this.visualPreviewClosedExplicitly || sessionGeneration !== this.visualPreviewSessionGeneration) {
        throw Object.assign(new Error('Realtime Native preview session is closed'), { code: 'VISUAL_PREVIEW_SESSION_CLOSED' });
      }
      const responseResult = response?.payload?.result ?? null;
      this.visualPreviewCardGeometry = sceneCardGeometryFromResult(responseResult, card.id) ?? this.visualPreviewCardGeometry ?? { x: card.x, y: card.y, width: card.width, height: card.height };
      this.visualPreviewPlacementFingerprint = placementFingerprint;
      this.recordVisualDiagnostic({ code: 'VISUAL_PREVIEW_UPDATED', message: 'Realtime Native preview card updated' }, 'PREVIEW_SESSION', { cardId: card.id });
      return {
        updated: true,
        recreated: false,
        card,
        response: responseResult,
        ...visualPreviewHandshake({ receivedDraft: draft !== null, updated: true, recreated: false, cardId: card.id, draft: card.visual, nativeVisual: card.visual })
      };
    } catch (error) {
      if (error?.code === 'VISUAL_PREVIEW_SESSION_CLOSED' || !this.isVisualPreviewCardMissing(error)) throw error;
      this.recordVisualDiagnostic(error, 'PREVIEW_RECREATE', { cardId: this.visualPreviewCardId, reason: 'card-missing' });
      this.visualPreviewCardId = null;
      this.visualPreviewCardGeometry = null;
      this.visualPreviewPlacementFingerprint = null;
      if (this.visualPreviewClosedExplicitly || sessionGeneration !== this.visualPreviewSessionGeneration) {
        throw Object.assign(new Error('Realtime Native preview session is closed'), { code: 'VISUAL_PREVIEW_SESSION_CLOSED' });
      }
      const recreated = await this.openVisualPreviewCard({ draft, sampleAgent: sample });
      return { ...recreated, updated: false, recreated: true };
    }
  }

  async closeVisualPreviewCard() {
    const host = this.requireRuntimeTestHost();
    this.visualPreviewClosedExplicitly = true;
    this.visualPreviewSessionGeneration += 1;
    if (!this.visualPreviewCardId) return { closed: false };
    const id = this.visualPreviewCardId;
    try {
      const response = await host.client.request('scene.dismiss', { id }, { retryable: false });
      return { closed: true, id, response: response?.payload?.result ?? null };
    } finally {
      this.visualPreviewCardId = null;
      this.visualPreviewCardGeometry = null;
      this.visualPreviewPlacementFingerprint = null;
      this.recordVisualDiagnostic({ code: 'VISUAL_PREVIEW_CLOSED', message: 'Realtime Native preview card closed' }, 'PREVIEW_SESSION', { cardId: id });
    }
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
    const response = await host.client.request('scene.create', card, sceneCreateOptions());
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
    if (!runtimeHostReady(this.runtimeHost)) {
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
        const forwarded = payload?.payload ?? payload ?? {};
        if (event === 'diagnostic') this.recordRuntimeDiagnostic(forwarded, 'runtime');
        else if (event !== 'stdout' && event !== 'stderr') this.recordRuntimeLog(event, forwarded, 'runtime');
        this.runtimeStatus = adapter.getRuntimeStatus?.() ?? this.runtimeStatus;
        this.runtimeError = this.runtimeStatus.lastError ?? this.runtimeError;
        this.ctx.log?.debug?.(`[notification-hub-vnext] runtime:${event}`, summarizeRuntimeDebugPayload(event, payload));
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
