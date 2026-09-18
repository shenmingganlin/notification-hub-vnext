import { resolveStackGrow, resolveStackWrap, stackWrapGrow } from '../domain/stack-grow.js';
import { withLexiconCode } from '../domain/lexicon-codes.js';

const ANCHORS = Object.freeze(['top-left', 'top-right', 'bottom-left', 'bottom-right']);

function layoutError(message, details = {}) {
  return withLexiconCode(Object.assign(new Error(message), { code: 'VISUAL_BEHAVIOR_LAYOUT_FAILED', details }));
}
function integer(field, value) { if (!Number.isInteger(value) || value <= 0) throw layoutError(`${field} must be a positive integer`, { field }); return value; }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

function isHorizontal(grow) {
  return grow === 'left' || grow === 'right';
}

function oppositeGrow(dir) {
  if (dir === 'up') return 'down';
  if (dir === 'down') return 'up';
  if (dir === 'left') return 'right';
  return 'left';
}

function hugFromAnchorGrow(anchor, grow) {
  if (grow === 'up' || grow === 'down') return anchor.endsWith('left') ? 'left' : 'right';
  return anchor.startsWith('top') ? 'top' : 'bottom';
}

function farHug(dir) {
  if (dir === 'down') return 'bottom';
  if (dir === 'up') return 'top';
  if (dir === 'right') return 'right';
  return 'left';
}

function shrinkRect(rect, hug, consume) {
  if (hug === 'left') return { left: rect.left + consume, top: rect.top, width: rect.width - consume, height: rect.height };
  if (hug === 'right') return { left: rect.left, top: rect.top, width: rect.width - consume, height: rect.height };
  if (hug === 'top') return { left: rect.left, top: rect.top + consume, width: rect.width, height: rect.height - consume };
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height - consume };
}

function primarySpan(rect, dir) {
  return dir === 'left' || dir === 'right' ? rect.width : rect.height;
}

function cardPrimary(card, dir) {
  return dir === 'left' || dir === 'right' ? card.width : card.height;
}

function cardCross(card, dir) {
  return dir === 'left' || dir === 'right' ? card.height : card.width;
}

function placeCoilRun(items, rect, hug, dir, spacing) {
  const placed = [];
  let cursor;
  if (dir === 'down') cursor = rect.top;
  else if (dir === 'up') cursor = rect.top + rect.height;
  else if (dir === 'right') cursor = rect.left;
  else cursor = rect.left + rect.width;
  const horizontal = dir === 'left' || dir === 'right';
  for (const card of items) {
    let x;
    let y;
    if (dir === 'down') {
      y = cursor;
      cursor += card.height + spacing;
    } else if (dir === 'up') {
      y = cursor - card.height;
      cursor = y - spacing;
    } else if (dir === 'right') {
      x = cursor;
      cursor += card.width + spacing;
    } else {
      x = cursor - card.width;
      cursor = x - spacing;
    }
    if (horizontal) y = hug === 'bottom' ? rect.top + rect.height - card.height : rect.top;
    else x = hug === 'right' ? rect.left + rect.width - card.width : rect.left;
    placed.push({ ...card, x, y });
  }
  return placed;
}

function layoutCoil(normalized, { workArea, margin, spacing, anchor, grow, newest }) {
  const wrapAxis = stackWrapGrow(anchor, grow);
  const dirs = [grow, wrapAxis, oppositeGrow(grow), oppositeGrow(wrapAxis)];
  const rightOn = anchor.endsWith('right');
  const bottomOn = anchor.startsWith('bottom');
  let rect = {
    left: workArea.left + (rightOn ? 0 : margin),
    top: workArea.top + (bottomOn ? 0 : margin),
    width: workArea.width - margin,
    height: workArea.height - margin
  };
  if (rect.width <= 0 || rect.height <= 0) throw layoutError('workArea is invalid', { workArea });
  const queue = newest === 'next' ? [...normalized] : [...normalized].reverse();
  const placed = [];
  let dirIndex = 0;
  let hug = hugFromAnchorGrow(anchor, grow);
  let index = 0;
  while (index < queue.length) {
    const dir = dirs[dirIndex % 4];
    const items = [];
    let used = 0;
    const span = primarySpan(rect, dir);
    while (index + items.length < queue.length) {
      const card = queue[index + items.length];
      const extent = cardPrimary(card, dir);
      const need = items.length === 0 ? extent : used + spacing + extent;
      if (need > span) break;
      items.push(card);
      used = need;
    }
    if (items.length === 0) {
      const failing = queue[index];
      throw layoutError(`Card ${failing.cardId} does not fit in work area`, { cardId: failing.cardId });
    }
    let cross = 0;
    for (const card of items) cross = Math.max(cross, cardCross(card, dir));
    placed.push(...placeCoilRun(items, rect, hug, dir, spacing));
    index += items.length;
    if (index >= queue.length) break;
    rect = shrinkRect(rect, hug, cross + spacing);
    hug = farHug(dir);
    dirIndex += 1;
  }
  return placed;
}

function binColumns(cards, primaryWork, spacing, horizontal) {
  const columns = [];
  let index = cards.length - 1;
  while (index >= 0) {
    const items = [];
    let used = 0;
    let cross = 0;
    while (index >= 0) {
      const card = cards[index];
      const extent = horizontal ? card.width : card.height;
      const need = items.length === 0 ? extent : used + spacing + extent;
      if (need > primaryWork) break;
      items.unshift(card);
      used = need;
      cross = Math.max(cross, horizontal ? card.height : card.width);
      index -= 1;
    }
    if (items.length === 0) {
      throw layoutError(`Card ${cards[index].cardId} does not fit in work area`, { cardId: cards[index].cardId });
    }
    columns.push({ items, cross });
  }
  return columns;
}

function binRunsOldestFirst(cards, primaryWork, spacing, horizontal) {
  const runs = [];
  let index = 0;
  while (index < cards.length) {
    const items = [];
    let used = 0;
    let cross = 0;
    while (index < cards.length) {
      const card = cards[index];
      const extent = horizontal ? card.width : card.height;
      const need = items.length === 0 ? extent : used + spacing + extent;
      if (need > primaryWork) break;
      items.push(card);
      used = need;
      cross = Math.max(cross, horizontal ? card.height : card.width);
      index += 1;
    }
    if (items.length === 0) {
      throw layoutError(`Card ${cards[index].cardId} does not fit in work area`, { cardId: cards[index].cardId });
    }
    runs.push({ items, cross });
  }
  return runs;
}

function placeColumn(column, { workArea, margin, spacing, anchor, grow, wrapOffset, newest }) {
  const rightOn = anchor.endsWith('right');
  const bottomOn = anchor.startsWith('bottom');
  const items = newest === 'next' ? column.items : [...column.items].reverse();
  const result = [];
  if (!isHorizontal(grow)) {
    let cursor = bottomOn ? workArea.top + workArea.height - margin : workArea.top + margin;
    for (const card of items) {
      const x = rightOn
        ? workArea.left + workArea.width - margin - wrapOffset - card.width
        : workArea.left + margin + wrapOffset;
      const y = bottomOn ? cursor - card.height : cursor;
      result.push({ ...card, x, y });
      cursor = bottomOn ? y - spacing : y + card.height + spacing;
    }
    return result;
  }
  let cursor = rightOn ? workArea.left + workArea.width - margin : workArea.left + margin;
  for (const card of items) {
    const x = rightOn ? cursor - card.width : cursor;
    const y = bottomOn
      ? workArea.top + workArea.height - margin - wrapOffset - card.height
      : workArea.top + margin + wrapOffset;
    result.push({ ...card, x, y });
    cursor = rightOn ? x - spacing : x + card.width + spacing;
  }
  return result;
}

function placeSnakeRun(run, { workArea, margin, spacing, anchor, grow, wrapOffset, reverse }) {
  const rightOn = anchor.endsWith('right');
  const bottomOn = anchor.startsWith('bottom');
  const result = [];
  if (isHorizontal(grow)) {
    const rowTop = bottomOn
      ? workArea.top + workArea.height - margin - wrapOffset - run.cross
      : workArea.top + margin + wrapOffset;
    const packRight = reverse ? !rightOn : rightOn;
    let cursor = packRight ? workArea.left + workArea.width - margin : workArea.left + margin;
    for (const card of run.items) {
      const x = packRight ? cursor - card.width : cursor;
      const y = bottomOn ? rowTop + run.cross - card.height : rowTop;
      result.push({ ...card, x, y });
      cursor = packRight ? x - spacing : x + card.width + spacing;
    }
    return result;
  }
  const colLeft = rightOn
    ? workArea.left + workArea.width - margin - wrapOffset - run.cross
    : workArea.left + margin + wrapOffset;
  const packBottom = reverse ? !bottomOn : bottomOn;
  let cursor = packBottom ? workArea.top + workArea.height - margin : workArea.top + margin;
  for (const card of run.items) {
    const y = packBottom ? cursor - card.height : cursor;
    const x = rightOn ? colLeft + run.cross - card.width : colLeft;
    result.push({ ...card, x, y });
    cursor = packBottom ? y - spacing : y + card.height + spacing;
  }
  return result;
}

function assertFits(placed, workArea) {
  for (const card of placed) {
    if (card.x < workArea.left || card.y < workArea.top || card.x + card.width > workArea.left + workArea.width || card.y + card.height > workArea.top + workArea.height) {
      throw layoutError(`Card ${card.cardId} does not fit in work area`, { cardId: card.cardId });
    }
  }
}

function finish(normalized, placed) {
  const byId = new Map(placed.map((card) => [card.cardId, card]));
  return freeze(normalized.map((card) => byId.get(card.cardId)));
}

export function createStackLayout({ anchor = 'bottom-right', spacing = 12, margin = 20, grow, wrap, newest } = {}) {
  if (!ANCHORS.includes(anchor)) throw layoutError(`Unsupported stack anchor: ${anchor}`, { anchor });
  if (!Number.isInteger(spacing) || spacing < 0 || spacing > 200) throw layoutError('spacing must be an integer from 0 to 200', { spacing });
  if (!Number.isInteger(margin) || margin < 0 || margin > 500) throw layoutError('margin must be an integer from 0 to 500', { margin });
  const resolvedGrow = resolveStackGrow(anchor, grow);
  const resolvedWrap = resolveStackWrap(wrap);
  const resolvedNewest = newest === 'next' ? 'next' : 'dock';
  const horizontal = isHorizontal(resolvedGrow);
  return ({ workArea, cards = [] } = {}) => {
    if (!workArea || !Number.isInteger(workArea.left) || !Number.isInteger(workArea.top) || !Number.isInteger(workArea.width) || !Number.isInteger(workArea.height) || workArea.width <= 0 || workArea.height <= 0) throw layoutError('workArea is invalid', { workArea });
    const normalized = cards.map((card) => ({ ...card, cardId: String(card.cardId), width: integer('width', card.width), height: integer('height', card.height) }));
    const primaryWork = (horizontal ? workArea.width : workArea.height) - margin;
    const crossWork = (horizontal ? workArea.height : workArea.width) - margin;
    if (primaryWork <= 0 || crossWork <= 0) throw layoutError('workArea is invalid', { workArea });

    if (resolvedWrap === 'coil') {
      const placed = layoutCoil(normalized, {
        workArea,
        margin,
        spacing,
        anchor,
        grow: resolvedGrow,
        newest: resolvedNewest
      });
      assertFits(placed, workArea);
      return finish(normalized, placed);
    }

    if (resolvedWrap === 'snake') {
      const snakeCards = resolvedNewest === 'dock' ? [...normalized].reverse() : normalized;
      const runs = binRunsOldestFirst(snakeCards, primaryWork, spacing, horizontal);
      let wrapUsed = 0;
      for (let i = 0; i < runs.length; i += 1) {
        if (i > 0) wrapUsed += spacing;
        wrapUsed += runs[i].cross;
      }
      if (wrapUsed > crossWork) {
        const failing = normalized[normalized.length - 1];
        throw layoutError(`Card ${failing.cardId} does not fit in work area`, { cardId: failing.cardId });
      }
      const placed = [];
      let wrapOffset = 0;
      for (let i = 0; i < runs.length; i += 1) {
        placed.push(...placeSnakeRun(runs[i], {
          workArea,
          margin,
          spacing,
          anchor,
          grow: resolvedGrow,
          wrapOffset,
          reverse: i % 2 === 1
        }));
        wrapOffset += runs[i].cross + spacing;
      }
      assertFits(placed, workArea);
      return finish(normalized, placed);
    }

    const columns = resolvedNewest === 'next'
      ? binRunsOldestFirst(normalized, primaryWork, spacing, horizontal)
      : binColumns(normalized, primaryWork, spacing, horizontal);
    if (resolvedWrap === 'off' && columns.length > 1) {
      const failing = normalized[normalized.length - 1];
      throw layoutError(`Card ${failing.cardId} does not fit in work area`, { cardId: failing.cardId });
    }
    let wrapUsed = 0;
    for (let i = 0; i < columns.length; i += 1) {
      if (i > 0) wrapUsed += spacing;
      wrapUsed += columns[i].cross;
    }
    if (wrapUsed > crossWork) {
      const failing = normalized[0];
      throw layoutError(`Card ${failing.cardId} does not fit in work area`, { cardId: failing.cardId });
    }
    const placed = [];
    let wrapOffset = 0;
    for (const column of columns) {
      placed.push(...placeColumn(column, { workArea, margin, spacing, anchor, grow: resolvedGrow, wrapOffset, newest: resolvedNewest }));
      wrapOffset += column.cross + spacing;
    }
    assertFits(placed, workArea);
    return finish(normalized, placed);
  };
}
