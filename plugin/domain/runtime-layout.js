const SHELF_DIRECTIONS = new Set(['right', 'left']);
const SHELF_ANCHORS = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
const SHELF_NORMAL_DIRECTION = Object.freeze({
  'top-left': 'right',
  'bottom-left': 'right',
  'top-right': 'left',
  'bottom-right': 'left'
});

function layoutError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details });
}

export function createShelfLayout(input = {}, { errorCode = 'RUNTIME_LAYOUT_INVALID' } = {}) {
  const direction = input.direction ?? 'right';
  const anchor = input.anchor ?? 'bottom-left';
  const spacing = input.spacing ?? 12;
  if (!SHELF_DIRECTIONS.has(direction) || !SHELF_ANCHORS.has(anchor)
    || direction !== SHELF_NORMAL_DIRECTION[anchor]
    || !Number.isInteger(spacing) || spacing < 0 || spacing > 200) {
    throw layoutError(
      errorCode,
      '请先选择停靠位置，再使用该位置对应的正常排列方向；卡片间距必须是 0 到 200 的整数',
      { direction, anchor, spacing }
    );
  }
  return Object.freeze({ layout: 'shelf', direction, anchor, spacing });
}

export const SHELF_LAYOUT_DEFAULTS = Object.freeze({
  layout: 'shelf',
  direction: 'right',
  anchor: 'bottom-left',
  spacing: 12
});
