import { createCardRuntimeInstance } from './card-runtime.js';

const DEFAULT_POLICY = Object.freeze({ maxVisible: 1000, maxActive: 1000, overflow: 'allow' });
function runtimeError(code, message, field) { return Object.assign(new Error(message), { code, details: field ? { field } : {} }); }
function text(field, value) { if (typeof value !== 'string' || !value.trim()) throw runtimeError('CHANNEL_RUNTIME_FIELD_INVALID', `${field} must be a non-empty string`, field); return value.trim(); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

export function createChannelRuntime({ channelId, behaviorId = 'stack', policy = {}, layout = null, layoutStrategy = null, workArea = null, diagnostics = [], onEvent = null } = {}) {
  const normalizedChannelId = text('channelId', channelId);
  const normalizedBehaviorId = text('behaviorId', behaviorId);
  const normalizedPolicy = { ...DEFAULT_POLICY, ...policy };
  for (const field of ['maxVisible', 'maxActive']) if (!Number.isInteger(normalizedPolicy[field]) || normalizedPolicy[field] < 1) throw runtimeError('VISUAL_CHANNEL_CAPACITY_INVALID', `${field} must be a positive integer`, `policy.${field}`);
  if (!['allow', 'queue', 'drop-oldest', 'aggregate', 'replace'].includes(normalizedPolicy.overflow)) throw runtimeError('VISUAL_CHANNEL_CAPACITY_INVALID', 'unsupported overflow mode', 'policy.overflow');
  const cards = new Map();
  const queue = new Map();
  const localDiagnostics = [...diagnostics];
  let layoutRecomputeCount = 0;
  let suppressedCount = 0;
  let lastLayout = [];
  const emit = (type, payload = {}) => {
    const event = freeze({ type, channelId: normalizedChannelId, at: payload.at ?? Date.now(), ...payload });
    try { onEvent?.(event); } catch (cause) { localDiagnostics.push(freeze({ code: 'VISUAL_LIFECYCLE_EVENT_FAILED', stage: 'LIFECYCLE_EXIT', message: cause?.message ?? 'lifecycle event failed', recoverable: true })); }
    return event;
  };
  const visible = () => [...cards.values()].filter((card) => card.state !== 'reclaimed');
  const recompute = () => {
    layoutRecomputeCount += 1;
    const cardsSnapshot = visible().filter((card) => card.state === 'active').map((card) => ({ cardId: card.cardId, width: card.width, height: card.height, ...card.snapshot() }));
    try {
      if (typeof layoutStrategy === 'function') lastLayout = layoutStrategy({ channelId: normalizedChannelId, workArea, cards: cardsSnapshot });
      else if (typeof layout === 'function') { layout({ channelId: normalizedChannelId, cards: visible().map((card) => card.snapshot()) }); lastLayout = []; }
      else lastLayout = [];
    } catch (cause) {
      lastLayout = [];
      localDiagnostics.push(freeze({ code: 'VISUAL_BEHAVIOR_LAYOUT_FAILED', stage: 'BEHAVIOR_LAYOUT', message: cause?.message ?? 'layout failed', recoverable: true }));
    }
    emit('channel.reflow', { cardIds: visible().map((card) => card.cardId) });
  };
  const promote = (now) => {
    if (visible().length >= normalizedPolicy.maxVisible) return;
    const next = queue.values().next().value;
    if (!next) return;
    queue.delete(next.cardId);
    cards.set(next.cardId, next);
    next.start(now);
    emit('card.started', { cardId: next.cardId, at: now });
  };
  return {
    channelId: normalizedChannelId,
    behaviorId: normalizedBehaviorId,
    policy: freeze({ ...normalizedPolicy }),
    enqueue(input = {}) {
      if (cards.size + queue.size >= normalizedPolicy.maxActive) throw runtimeError('VISUAL_CHANNEL_CAPACITY_INVALID', 'channel maxActive reached', 'policy.maxActive');
      const card = createCardRuntimeInstance({ ...input, channelId: normalizedChannelId, behaviorId: normalizedBehaviorId });
      if (visible().length >= normalizedPolicy.maxVisible && normalizedPolicy.overflow === 'queue') queue.set(card.cardId, card);
      else if (visible().length >= normalizedPolicy.maxVisible && normalizedPolicy.overflow === 'drop-oldest') {
        const oldest = visible()[0];
        const overflowAt = input.createdAt ?? Date.now();
        oldest.close('overflow', overflowAt);
        oldest.reclaim(overflowAt);
        cards.delete(oldest.cardId);
        emit('card.reclaimed', { cardId: oldest.cardId, reason: 'overflow', at: overflowAt });
        suppressedCount += 1;
        cards.set(card.cardId, card);
      } else cards.set(card.cardId, card);
      emit('card.enqueued', { cardId: card.cardId, notificationId: card.notificationId, at: card.snapshot().createdAt });
      recompute();
      return card.snapshot();
    },
    start(cardId, now = Date.now()) {
      const card = cards.get(cardId) ?? queue.get(cardId);
      if (!card) throw runtimeError('CARD_RUNTIME_NOT_FOUND', `Unknown card: ${cardId}`, 'cardId');
      if (queue.has(cardId) && visible().length >= normalizedPolicy.maxVisible) return card.snapshot();
      if (queue.has(cardId)) queue.delete(cardId);
      card.start(now);
      emit('card.started', { cardId, at: now });
      recompute();
      return card.snapshot();
    },
    close(cardId, reason = 'unspecified', now = Date.now()) {
      const card = cards.get(cardId) ?? queue.get(cardId);
      if (!card) return null;
      if (queue.has(cardId)) { queue.delete(cardId); card.close(reason, now); card.reclaim(now); }
      else card.close(reason, now);
      emit('card.closing', { cardId, reason, at: now });
      recompute();
      return card.snapshot();
    },
    reclaim(cardId, now = Date.now()) {
      const card = cards.get(cardId);
      if (!card) return null;
      card.reclaim(now);
      cards.delete(cardId);
      emit('card.reclaimed', { cardId, at: now });
      promote(now);
      recompute();
      return card.snapshot();
    },
    metrics() { return { channelCount: 1, activeCardCount: cards.size + queue.size, visibleCardCount: visible().filter((card) => card.state === 'active').length, queuedCardCount: queue.size, suppressedCardCount: suppressedCount, layoutRecomputeCount }; },
    snapshot() { return freeze({ channelId: normalizedChannelId, behaviorId: normalizedBehaviorId, visibleCardIds: visible().filter((card) => card.state === 'active').map((card) => card.cardId), queuedCardIds: [...queue.keys()], cards: [...cards.values(), ...queue.values()].map((card) => card.snapshot()), layout: clone(lastLayout), diagnostics: clone(localDiagnostics), metrics: this.metrics() }); }
  };
}
