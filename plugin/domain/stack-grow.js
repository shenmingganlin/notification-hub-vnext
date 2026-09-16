export const STACK_GROWS = Object.freeze(['up', 'down', 'left', 'right']);
export const STACK_WRAPS = Object.freeze(['off', 'parallel', 'snake']);
export const STACK_GROW_ANCHORS = Object.freeze(['top-left', 'top-right', 'bottom-left', 'bottom-right']);

function normalizeAnchor(anchor) {
  return STACK_GROW_ANCHORS.includes(anchor) ? anchor : 'bottom-right';
}

export function defaultStackGrow(anchor) {
  return String(normalizeAnchor(anchor)).startsWith('top') ? 'down' : 'up';
}

export function allowedStackGrows(anchor) {
  const a = normalizeAnchor(anchor);
  return Object.freeze({
    up: !a.startsWith('top'),
    down: !a.startsWith('bottom'),
    left: !a.endsWith('left'),
    right: !a.endsWith('right')
  });
}

export function resolveStackGrow(anchor, grow) {
  const allowed = allowedStackGrows(anchor);
  if (STACK_GROWS.includes(grow) && allowed[grow]) return grow;
  return defaultStackGrow(anchor);
}

export function resolveStackWrap(wrap) {
  return STACK_WRAPS.includes(wrap) ? wrap : 'parallel';
}

export function stackGrowToNativeDirection(anchor, grow, wrap) {
  const resolved = resolveStackGrow(anchor, grow);
  if (resolveStackWrap(wrap) === 'snake') return resolved;
  if (resolved === 'up') return 'down';
  if (resolved === 'down') return 'up';
  if (resolved === 'left') return 'right';
  return 'left';
}

export function stackWrapGrow(anchor, grow) {
  const resolved = resolveStackGrow(anchor, grow);
  const allowed = allowedStackGrows(anchor);
  return STACK_GROWS.find((item) => item !== resolved && allowed[item]) ?? resolved;
}
