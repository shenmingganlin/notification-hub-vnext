import { isTickerFlight } from './channel-charter.js';

export const VISUAL_EVENT_STACK_CHANNEL = 'visual.event.stack';
export const VISUAL_EVENT_TICKER_CHANNEL = 'visual.event.ticker';
export const TEST_EVENT_PRESENTATION_IDS = Object.freeze({
  chat_message: 'chat.assistant_reply.completed',
  channel_message: 'channel.message.received',
  tool_completed: 'tool.execution.succeeded',
  tool_error: 'tool.execution.failed',
  timeout: 'tool.execution.timed_out',
  system_warning: 'session.health.degraded'
});

export function resolveVisualEventNativeFlight(profile) {
  const ticket = typeof profile?.behaviorId === 'string' && profile.behaviorId
    ? profile.behaviorId
    : (typeof profile?.flight === 'string' ? profile.flight : '');
  if (isTickerFlight(ticket)) {
    return Object.freeze({
      flight: 'ticker',
      flightChannelId: VISUAL_EVENT_TICKER_CHANNEL,
      behaviorProfileId: 'ticker',
      behaviorChannelId: VISUAL_EVENT_TICKER_CHANNEL
    });
  }
  return Object.freeze({
    flight: 'stack',
    flightChannelId: VISUAL_EVENT_STACK_CHANNEL,
    behaviorProfileId: 'stack',
    behaviorChannelId: VISUAL_EVENT_STACK_CHANNEL
  });
}

/** @deprecated 协议旧名；新代码用 resolveVisualEventNativeFlight */
export const resolveVisualEventNativeBehavior = resolveVisualEventNativeFlight;

export function hasExplicitVisualBinding(bindingRegistry, eventId) {
  if (!eventId || typeof eventId !== 'string' || !bindingRegistry || typeof bindingRegistry.get !== 'function') {
    return false;
  }
  return Boolean(bindingRegistry.get(eventId));
}

export function resolveVisualEventCardIntent({
  eventId = null,
  globalEnabled = true,
  defaultMode = 'off',
  binding = null,
  boundProfile = null,
  storeProfile = null
} = {}) {
  if (globalEnabled === false) {
    return { showCard: false, reason: 'global-disabled', eventId, binding: binding ?? null };
  }
  if (binding) {
    if (!boundProfile) {
      return { showCard: false, reason: 'missing-profile', eventId, binding };
    }
    const nativeFlight = resolveVisualEventNativeFlight(boundProfile);
    return {
      showCard: true,
      reason: 'bound',
      eventId,
      binding,
      visualProfile: boundProfile,
      nativeFlight,
      nativeBehavior: nativeFlight
    };
  }
  if (defaultMode !== 'stack' && defaultMode !== 'ticker') {
    return { showCard: false, reason: 'unbound', eventId, binding: null };
  }
  const source = storeProfile && typeof storeProfile === 'object' ? storeProfile : {};
  const visualProfile = {
    ...source,
    behaviorId: defaultMode,
    flight: defaultMode,
    ...(defaultMode === 'ticker' ? { ticker: source.ticker ?? {} } : {})
  };
  const nativeFlight = resolveVisualEventNativeFlight(visualProfile);
  return {
    showCard: true,
    reason: 'default-mode',
    eventId,
    binding: null,
    visualProfile,
    nativeFlight,
    nativeBehavior: nativeFlight
  };
}

export function classifyVisualDiagnosticLevel(error, stage) {
  const code = String(error?.code ?? '');
  if (stage === 'PREVIEW_RECREATE' || /WARN|RECREATE/.test(code)) return 'warn';
  const thrown = error instanceof Error;
  if (thrown || /FAILED|INVALID|MISSING|NOT_FOUND|ERROR|UNAVAILABLE|PROTECTED|NOT_BOUND/.test(code)) return 'error';
  return 'ok';
}

export function visualPreviewFingerprint(profile = {}) {
  const activeType = profile?.card?.types?.[profile?.card?.activeType ?? 'minimal'] ?? {};
  const space = activeType.properties?.space ?? {};
  const appearance = activeType.appearance ?? {};
  const skin = activeType.skin?.background ?? {};
  const legacyMargin = space.margin ?? 18;
  const ticker = profile?.ticker ?? {};
  return JSON.stringify({
    behaviorId: profile?.behaviorId ?? profile?.flight ?? 'stack',
    flight: profile?.flight ?? profile?.behaviorId ?? 'stack',
    anchor: space.anchor ?? 'bottom-right',
    grow: space.grow ?? null,
    wrap: space.wrap ?? null,
    marginLeft: space.marginLeft ?? legacyMargin,
    marginRight: space.marginRight ?? legacyMargin,
    marginTop: space.marginTop ?? legacyMargin,
    marginBottom: space.marginBottom ?? legacyMargin,
    gap: space.gap ?? 8,
    size: appearance.size ?? space.size ?? 'medium',
    width: appearance.width ?? null,
    height: appearance.height ?? null,
    borderRadius: appearance.borderRadius ?? null,
    opacity: appearance.opacity ?? null,
    backgroundColor: appearance.backgroundColor ?? skin.color ?? null,
    backgroundAssetId: appearance.backgroundAssetId ?? skin.assetId ?? null,
    backgroundFit: appearance.backgroundFit ?? skin.fit ?? null,
    ticker: {
      speedPxPerSec: ticker.speedPxPerSec ?? null,
      band: ticker.band ?? null,
      bandRatio: ticker.bandRatio ?? null,
      trackCount: ticker.trackCount ?? null,
      trackGapPx: ticker.trackGapPx ?? null,
      minGapPx: ticker.minGapPx ?? null,
      speedRandom: ticker.speedRandom === true,
      clickThrough: ticker.clickThrough !== false
    }
  });
}
