import { lexiconError } from './lexicon-error.js';

const CHARTER_SETTLE_IDS = Object.freeze(['snap']);
const TICKER_BANDS = Object.freeze(['top', 'bottom']);
const TICKER_OVERFLOWS = Object.freeze(['avoid', 'queue']);
const STACK_ANCHORS = Object.freeze(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
const STACK_GROWS = Object.freeze(['up', 'down', 'left', 'right']);
const STACK_WRAPS = Object.freeze(['off', 'parallel', 'snake']);

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (plain(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function fail(code, message, details) {
  throw lexiconError(code, message, details);
}

function integer(field, value, fallback, min, max) {
  const next = value === undefined ? fallback : value;
  if (!Number.isInteger(next) || next < min || (max !== undefined && next > max)) {
    fail('CHARTER_FIELD_INVALID', `${field} out of range`, {
      field,
      expected: max === undefined ? `integer >= ${min}` : `integer ${min}..${max}`,
      actual: value
    });
  }
  return next;
}

function number(field, value, fallback, min, max) {
  const next = value === undefined ? fallback : value;
  if (typeof next !== 'number' || !Number.isFinite(next) || next < min || next > max) {
    fail('CHARTER_FIELD_INVALID', `${field} out of range`, {
      field,
      expected: `number ${min}..${max}`,
      actual: value
    });
  }
  return next;
}

export const FLIGHT_IDS = Object.freeze(['stack', 'ticker', 'popup']);
export const IMPLEMENTED_FLIGHT_IDS = Object.freeze(['stack', 'ticker']);
export const FLIGHT_CHANNEL_IDS = Object.freeze({
  stack: 'visual.event.stack',
  ticker: 'visual.event.ticker'
});

export function isTickerFlight(flight) {
  return flight === 'ticker' || flight === 'danmaku';
}

export function resolveFlightId(value, field = 'flight') {
  if (value === undefined || value === null || value === '') return 'stack';
  if (typeof value !== 'string') {
    fail('FLIGHT_ID_INVALID', `${field} must be a flight id`, { field, expected: FLIGHT_IDS.join('|'), actual: value });
  }
  const flight = value === 'danmaku' ? 'ticker' : value;
  if (!FLIGHT_IDS.includes(flight)) {
    fail('FLIGHT_ID_INVALID', `Unknown flight: ${value}`, { field, expected: FLIGHT_IDS.join('|'), actual: value });
  }
  return flight;
}

export const STACK_CHARTER_DEFAULTS = Object.freeze({
  flight: 'stack',
  settle: 'snap',
  anchor: 'bottom-right',
  grow: null,
  wrap: 'off',
  gap: 8,
  margin: 18,
  marginLeft: null,
  marginRight: null,
  marginTop: null,
  marginBottom: null
});

export const TICKER_CHARTER_DEFAULTS = Object.freeze({
  flight: 'ticker',
  band: 'top',
  bandRatio: 0.28,
  trackCount: 3,
  trackGapPx: 8,
  minGapPx: 64,
  clickThrough: true,
  overflow: 'avoid'
});

export const TICKER_MOTION_DEFAULTS = Object.freeze({
  speedPxPerSec: 400,
  speedRandom: false,
  hoverPause: false,
  direction: 'left'
});

const STACK_CHARTER_FIELDS = Object.freeze([
  'flight', 'settle', 'anchor', 'grow', 'wrap', 'gap', 'margin',
  'marginLeft', 'marginRight', 'marginTop', 'marginBottom'
]);
const TICKER_CHARTER_FIELDS = Object.freeze([
  'flight', 'band', 'bandRatio', 'trackCount', 'trackGapPx', 'minGapPx', 'clickThrough', 'overflow'
]);
const TICKER_MOTION_FIELDS = Object.freeze(['speedPxPerSec', 'speedRandom', 'hoverPause', 'direction']);

export function createStackCharter(input = {}) {
  if (input === undefined || input === null) input = {};
  if (!plain(input)) fail('CHARTER_INVALID', 'stack charter must be a plain object', { field: 'channels.stack', actual: input });
  for (const key of Object.keys(input)) {
    if (!STACK_CHARTER_FIELDS.includes(key)) {
      fail('CHARTER_FIELD_UNKNOWN', `Unknown stack charter field: ${key}`, { field: `channels.stack.${key}`, actual: key });
    }
  }
  const settle = input.settle ?? STACK_CHARTER_DEFAULTS.settle;
  if (!CHARTER_SETTLE_IDS.includes(settle)) {
    fail('CHARTER_SETTLE_UNSUPPORTED', 'stack settle must be snap', {
      field: 'channels.stack.settle',
      expected: 'snap',
      actual: settle
    });
  }
  const anchor = input.anchor ?? STACK_CHARTER_DEFAULTS.anchor;
  if (!STACK_ANCHORS.includes(anchor)) {
    fail('CHARTER_FIELD_INVALID', 'invalid stack anchor', { field: 'channels.stack.anchor', expected: STACK_ANCHORS.join('|'), actual: anchor });
  }
  const wrap = input.wrap ?? STACK_CHARTER_DEFAULTS.wrap;
  if (!STACK_WRAPS.includes(wrap)) {
    fail('CHARTER_FIELD_INVALID', 'invalid stack wrap', { field: 'channels.stack.wrap', expected: STACK_WRAPS.join('|'), actual: wrap });
  }
  const grow = input.grow ?? null;
  if (grow !== null && !STACK_GROWS.includes(grow)) {
    fail('CHARTER_FIELD_INVALID', 'invalid stack grow', { field: 'channels.stack.grow', expected: STACK_GROWS.join('|'), actual: grow });
  }
  const margin = integer('channels.stack.margin', input.margin, STACK_CHARTER_DEFAULTS.margin, 0, 240);
  const side = (name, value) => {
    if (value === undefined || value === null) return null;
    return integer(`channels.stack.${name}`, value, margin, 0, 240);
  };
  return freeze({
    flight: 'stack',
    settle: 'snap',
    anchor,
    grow,
    wrap,
    gap: integer('channels.stack.gap', input.gap, STACK_CHARTER_DEFAULTS.gap, 0, 64),
    margin,
    marginLeft: side('marginLeft', input.marginLeft),
    marginRight: side('marginRight', input.marginRight),
    marginTop: side('marginTop', input.marginTop),
    marginBottom: side('marginBottom', input.marginBottom)
  });
}

export function createTickerCharter(input = {}) {
  if (input === undefined || input === null) input = {};
  if (!plain(input)) fail('CHARTER_INVALID', 'ticker charter must be a plain object', { field: 'channels.ticker', actual: input });
  for (const key of Object.keys(input)) {
    if (!TICKER_CHARTER_FIELDS.includes(key)) {
      fail('CHARTER_FIELD_UNKNOWN', `Unknown ticker charter field: ${key}`, { field: `channels.ticker.${key}`, actual: key });
    }
  }
  const band = input.band ?? TICKER_CHARTER_DEFAULTS.band;
  if (!TICKER_BANDS.includes(band)) {
    fail('CHARTER_FIELD_INVALID', 'ticker band must be top or bottom', { field: 'channels.ticker.band', expected: 'top|bottom', actual: band });
  }
  const overflow = input.overflow ?? TICKER_CHARTER_DEFAULTS.overflow;
  if (!TICKER_OVERFLOWS.includes(overflow)) {
    fail('CHARTER_FIELD_INVALID', 'ticker overflow must be avoid or queue', { field: 'channels.ticker.overflow', expected: 'avoid|queue', actual: overflow });
  }
  const clickThrough = input.clickThrough ?? TICKER_CHARTER_DEFAULTS.clickThrough;
  if (typeof clickThrough !== 'boolean') {
    fail('CHARTER_FIELD_INVALID', 'ticker clickThrough must be boolean', { field: 'channels.ticker.clickThrough', expected: 'boolean', actual: clickThrough });
  }
  return freeze({
    flight: 'ticker',
    band,
    bandRatio: number('channels.ticker.bandRatio', input.bandRatio, TICKER_CHARTER_DEFAULTS.bandRatio, 0.15, 1),
    trackCount: integer('channels.ticker.trackCount', input.trackCount, TICKER_CHARTER_DEFAULTS.trackCount, 0),
    trackGapPx: integer('channels.ticker.trackGapPx', input.trackGapPx, TICKER_CHARTER_DEFAULTS.trackGapPx, 0, 48),
    minGapPx: integer('channels.ticker.minGapPx', input.minGapPx, TICKER_CHARTER_DEFAULTS.minGapPx, 24, 160),
    clickThrough,
    overflow
  });
}

export function createTickerMotion(input = {}) {
  if (input === undefined || input === null) input = {};
  if (!plain(input)) fail('MOTION_INVALID', 'ticker motion must be a plain object', { field: 'motion', actual: input });
  for (const key of Object.keys(input)) {
    if (!TICKER_MOTION_FIELDS.includes(key)) {
      fail('MOTION_FIELD_UNKNOWN', `Unknown ticker motion field: ${key}`, { field: `motion.${key}`, actual: key });
    }
  }
  const direction = input.direction ?? TICKER_MOTION_DEFAULTS.direction;
  if (direction !== 'left' && direction !== 'right') {
    fail('MOTION_FIELD_INVALID', 'ticker direction must be left or right', { field: 'motion.direction', expected: 'left|right', actual: direction });
  }
  const speedRandom = input.speedRandom ?? TICKER_MOTION_DEFAULTS.speedRandom;
  const hoverPause = input.hoverPause ?? TICKER_MOTION_DEFAULTS.hoverPause;
  if (typeof speedRandom !== 'boolean') {
    fail('MOTION_FIELD_INVALID', 'speedRandom must be boolean', { field: 'motion.speedRandom', expected: 'boolean', actual: speedRandom });
  }
  if (typeof hoverPause !== 'boolean') {
    fail('MOTION_FIELD_INVALID', 'hoverPause must be boolean', { field: 'motion.hoverPause', expected: 'boolean', actual: hoverPause });
  }
  const speedPxPerSec = input.speedPxPerSec ?? TICKER_MOTION_DEFAULTS.speedPxPerSec;
  if (!Number.isInteger(speedPxPerSec) || speedPxPerSec < 150 || speedPxPerSec > 800) {
    fail('MOTION_FIELD_INVALID', 'speedPxPerSec out of range', { field: 'motion.speedPxPerSec', expected: 'integer 150..800', actual: input.speedPxPerSec });
  }
  return freeze({ speedPxPerSec, speedRandom, hoverPause, direction });
}

export function splitLegacyTicker(ticker = {}) {
  const source = plain(ticker) ? ticker : {};
  const charterInput = {};
  const motionInput = {};
  for (const key of TICKER_CHARTER_FIELDS) {
    if (key === 'flight') continue;
    if (source[key] !== undefined) charterInput[key] = source[key];
  }
  for (const key of TICKER_MOTION_FIELDS) {
    if (source[key] !== undefined) motionInput[key] = source[key];
  }
  return freeze({
    charter: createTickerCharter(charterInput),
    motion: createTickerMotion(motionInput)
  });
}

export function stripCharterFromExport(value) {
  if (!plain(value)) return value;
  const next = clone(value);
  delete next.channels;
  if (plain(next.profile)) delete next.profile.channels;
  return next;
}

export function migrateStackCharterFromSpace(space = {}) {
  const source = plain(space) ? space : {};
  return createStackCharter({
    anchor: source.anchor,
    grow: source.grow ?? null,
    wrap: source.wrap ?? 'off',
    gap: source.gap,
    margin: source.margin,
    marginLeft: source.marginLeft,
    marginRight: source.marginRight,
    marginTop: source.marginTop,
    marginBottom: source.marginBottom
  });
}

export function createFlightChannels(input = {}, { profile = null } = {}) {
  if (input === undefined || input === null) input = {};
  if (!plain(input)) fail('CHARTER_INVALID', 'channels must be a plain object', { field: 'channels', actual: input });
  for (const key of Object.keys(input)) {
    if (key !== 'stack' && key !== 'ticker') {
      fail('CHARTER_FIELD_UNKNOWN', `Unknown flight channel: ${key}`, { field: `channels.${key}`, actual: key });
    }
  }
  const space = profile?.card?.types?.[profile?.card?.activeType ?? 'minimal']?.properties?.space;
  const stack = input.stack === undefined && space
    ? migrateStackCharterFromSpace(space)
    : createStackCharter(input.stack);
  const ticker = input.ticker === undefined && profile?.ticker
    ? splitLegacyTicker(profile.ticker).charter
    : createTickerCharter(input.ticker);
  return freeze({ stack, ticker });
}

export function toNativeTickerCharterPayload(charter, channelId = FLIGHT_CHANNEL_IDS.ticker) {
  const next = createTickerCharter(charter);
  return freeze({
    flight: 'ticker',
    channelId,
    charter: {
      band: next.band,
      bandRatio: next.bandRatio,
      trackCount: next.trackCount,
      trackGapPx: next.trackGapPx,
      minGapPx: next.minGapPx,
      clickThrough: next.clickThrough,
      overflow: next.overflow
    }
  });
}

export function mergeTickerPayload(charter, motion) {
  const nextCharter = createTickerCharter(charter);
  const nextMotion = createTickerMotion(motion);
  return freeze({
    speedPxPerSec: nextMotion.speedPxPerSec,
    speedRandom: nextMotion.speedRandom,
    hoverPause: nextMotion.hoverPause,
    direction: nextMotion.direction,
    band: nextCharter.band,
    bandRatio: nextCharter.bandRatio,
    trackCount: nextCharter.trackCount,
    trackGapPx: nextCharter.trackGapPx,
    minGapPx: nextCharter.minGapPx,
    clickThrough: nextCharter.clickThrough,
    overflow: nextCharter.overflow
  });
}
