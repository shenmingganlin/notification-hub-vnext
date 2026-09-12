const ANCHORS = Object.freeze(['top-left', 'top-right', 'bottom-left', 'bottom-right']);

function layoutError(message, details = {}) { return Object.assign(new Error(message), { code: 'VISUAL_BEHAVIOR_LAYOUT_FAILED', details }); }
function integer(field, value) { if (!Number.isInteger(value) || value <= 0) throw layoutError(`${field} must be a positive integer`, { field }); return value; }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

export function createStackLayout({ anchor = 'bottom-right', spacing = 12, margin = 20 } = {}) {
  if (!ANCHORS.includes(anchor)) throw layoutError(`Unsupported stack anchor: ${anchor}`, { anchor });
  if (!Number.isInteger(spacing) || spacing < 0 || spacing > 200) throw layoutError('spacing must be an integer from 0 to 200', { spacing });
  if (!Number.isInteger(margin) || margin < 0 || margin > 500) throw layoutError('margin must be an integer from 0 to 500', { margin });
  return ({ workArea, cards = [] } = {}) => {
    if (!workArea || !Number.isInteger(workArea.left) || !Number.isInteger(workArea.top) || !Number.isInteger(workArea.width) || !Number.isInteger(workArea.height) || workArea.width <= 0 || workArea.height <= 0) throw layoutError('workArea is invalid', { workArea });
    const normalized = cards.map((card) => ({ ...card, cardId: String(card.cardId), width: integer('width', card.width), height: integer('height', card.height) }));
    const result = [];
    let cursor = anchor.startsWith('bottom') ? workArea.top + workArea.height - margin : workArea.top + margin;
    for (const card of [...normalized].reverse()) {
      const x = anchor.endsWith('right') ? workArea.left + workArea.width - margin - card.width : workArea.left + margin;
      const y = anchor.startsWith('bottom') ? cursor - card.height : cursor;
      if (x < workArea.left || y < workArea.top || x + card.width > workArea.left + workArea.width || y + card.height > workArea.top + workArea.height) throw layoutError(`Card ${card.cardId} does not fit in work area`, { cardId: card.cardId });
      result.unshift({ ...card, x, y });
      cursor = anchor.startsWith('bottom') ? y - spacing : y + card.height + spacing;
    }
    return freeze(result);
  };
}
