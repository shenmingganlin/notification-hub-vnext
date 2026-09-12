export const CARD_RUNTIME_STATES = Object.freeze({
  CREATED: 'created',
  ACTIVE: 'active',
  EXITING: 'exiting',
  RECLAIMED: 'reclaimed'
});

const TRANSITIONS = Object.freeze({
  created: ['active'],
  active: ['exiting'],
  exiting: ['reclaimed'],
  reclaimed: []
});

function runtimeError(code, message, field) { return Object.assign(new Error(message), { code, details: field ? { field } : {} }); }
function text(field, value, fallback) { const result = typeof value === 'string' && value.trim() ? value.trim() : fallback; if (!result) throw runtimeError('CARD_RUNTIME_FIELD_INVALID', `${field} must be a non-empty string`, field); return result; }
function integer(field, value, fallback = 0) { const result = value ?? fallback; if (!Number.isInteger(result) || result < 0) throw runtimeError('CARD_RUNTIME_TIME_INVALID', `${field} must be a non-negative integer`, field); return result; }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

export function createCardRuntimeInstance(input = {}) {
  const cardId = text('cardId', input.cardId);
  const notificationId = text('notificationId', input.notificationId, cardId);
  const channelId = text('channelId', input.channelId);
  const behaviorId = text('behaviorId', input.behaviorId, 'stack');
  const createdAt = integer('createdAt', input.createdAt, Date.now());
  const durationMs = integer('durationMs', input.durationMs, 5000);
  const width = integer('width', input.width, 320);
  const height = integer('height', input.height, 96);
  let state = CARD_RUNTIME_STATES.CREATED;
  let startedAt = null;
  let closeReason = null;
  let closedAt = null;
  let reclaimedAt = null;
  const transition = (next, now, reason = null) => {
    if (!TRANSITIONS[state].includes(next)) throw runtimeError('CARD_RUNTIME_TRANSITION_INVALID', `Cannot transition card ${cardId} from ${state} to ${next}`, 'state');
    state = next;
    if (next === CARD_RUNTIME_STATES.ACTIVE) startedAt = integer('startedAt', now, createdAt);
    if (next === CARD_RUNTIME_STATES.EXITING) { closedAt = integer('closedAt', now, startedAt ?? createdAt); closeReason = text('closeReason', reason, 'unspecified'); }
    if (next === CARD_RUNTIME_STATES.RECLAIMED) reclaimedAt = integer('reclaimedAt', now, closedAt ?? startedAt ?? createdAt);
  };
  return {
    cardId, notificationId, channelId, behaviorId, durationMs, width, height,
    get state() { return state; },
    start(now = Date.now()) { transition(CARD_RUNTIME_STATES.ACTIVE, now); return this.snapshot(); },
    close(reason = 'unspecified', now = Date.now()) { transition(CARD_RUNTIME_STATES.EXITING, now, reason); return this.snapshot(); },
    reclaim(now = Date.now()) { transition(CARD_RUNTIME_STATES.RECLAIMED, now); return this.snapshot(); },
    ageMs(now = Date.now()) { return Math.max(0, integer('now', now, Date.now()) - (startedAt ?? createdAt)); },
    snapshot() { return freeze({ cardId, notificationId, channelId, behaviorId, durationMs, width, height, state, createdAt, startedAt, closedAt, reclaimedAt, closeReason }); }
  };
}
