function freezeDeep(value) {
  if (Array.isArray(value)) {
    value.forEach(freezeDeep);
    return Object.freeze(value);
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    return Object.freeze(value);
  }
  return value;
}

function partError(message) {
  return Object.assign(new Error(message), { code: 'CARD_PART_TREE_INVALID' });
}

function textPart(id, binding, x, y, w, h) {
  return {
    id,
    kind: 'text',
    binding,
    x,
    y,
    w,
    h
  };
}

function blockPart(id, x, y, w, h) {
  return {
    id,
    kind: 'block',
    x,
    y,
    w,
    h
  };
}

function imagePart(id, x, y, w, h, radius) {
  return {
    id,
    kind: 'image',
    x,
    y,
    w,
    h,
    radius,
    backgroundFit: 'cover'
  };
}

function withRoot(width, height, children) {
  return freezeDeep([blockPart('root', 0, 0, width, height), ...children]);
}

function closeButtonRect(width, height) {
  const size = 28;
  const pad = 12;
  return {
    x: width - pad - size,
    y: pad,
    w: size,
    h: size
  };
}

export function createDefaultTextPartTree({
  width,
  height,
  ticker = false,
  popup = false,
  close,
  title = true,
  body = true,
  icon = false,
  assistantName = false
} = {}) {
  const cardWidth = Math.trunc(width);
  const cardHeight = Math.trunc(height);
  const showClose = close === true || (close !== false && !ticker);
  const showBody = body !== false;
  const showTitle = title !== false || !showBody;
  const showIcon = icon === true;
  const showAssistantName = assistantName === true;
  if (ticker) {
    const textLeft = showIcon ? 38 : 14;
    const textWidth = Math.max(1, cardWidth - textLeft - 14);
    const fillY = cardHeight < 48 ? 4 : 8;
    const fillH = Math.max(1, cardHeight - fillY * 2);
    const extras = [];
    if (showIcon) {
      extras.push(imagePart('icon', 8, Math.max(0, Math.trunc((cardHeight - 24) / 2)), 24, 24, 12));
    }
    const namePart = showAssistantName
      ? [textPart('assistantName', 'assistantName', textLeft, 2, textWidth, 14)]
      : [];
    if (cardHeight < 70 || !showTitle || !showBody) {
      const id = showTitle ? 'title' : 'body';
      const y = showAssistantName ? fillY + 12 : fillY;
      const h = showAssistantName ? Math.max(1, fillH - 12) : fillH;
      return withRoot(cardWidth, cardHeight, [
        ...extras,
        textPart(id, id, textLeft, y, textWidth, h),
        ...namePart
      ]);
    }
    const titleY = showAssistantName ? 16 : 6;
    const titleH = 28;
    const bodyTop = showAssistantName ? 44 : 34;
    const bodyHeight = Math.max(1, cardHeight - bodyTop - 6);
    return withRoot(cardWidth, cardHeight, [
      ...extras,
      textPart('title', 'title', textLeft, titleY, textWidth, titleH),
      textPart('body', 'body', textLeft, bodyTop, textWidth, bodyHeight),
      ...namePart
    ]);
  }
  const textLeft = showIcon ? 66 : (popup ? 36 : 30);
  const textTop = showAssistantName ? 36 : 24;
  const bodyTop = showAssistantName ? 74 : 62;
  const splitBodyHeight = Math.max(1, cardHeight - 22 - bodyTop);
  const fillHeight = Math.max(1, cardHeight - 22 - textTop);
  const closeRect = showClose ? closeButtonRect(cardWidth, cardHeight) : null;
  const titleWidth = closeRect ? Math.max(1, closeRect.x - 8 - textLeft) : Math.max(1, cardWidth - 24 - textLeft);
  const bodyWidth = Math.max(1, cardWidth - 24 - textLeft);
  const extras = [];
  if (showIcon) extras.push(imagePart('icon', 16, 22, 40, 40, 20));
  const nameLeft = showIcon ? 66 : 30;
  const namePart = showAssistantName
    ? [textPart('assistantName', 'assistantName', nameLeft, 16, titleWidth, 18)]
    : [];
  const closeParts = closeRect
    ? [{ id: 'close', kind: 'close', x: closeRect.x, y: closeRect.y, w: closeRect.w, h: closeRect.h }]
    : [];
  if (!showTitle || !showBody) {
    const id = showTitle ? 'title' : 'body';
    const textWidth = id === 'title' ? titleWidth : bodyWidth;
    return withRoot(cardWidth, cardHeight, [
      ...extras,
      textPart(id, id, textLeft, textTop, textWidth, fillHeight),
      ...namePart,
      ...closeParts
    ]);
  }
  return withRoot(cardWidth, cardHeight, [
    ...extras,
    textPart('title', 'title', textLeft, textTop, titleWidth, 34),
    textPart('body', 'body', textLeft, bodyTop, bodyWidth, splitBodyHeight),
    ...namePart,
    ...closeParts
  ]);
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const FONT_FAMILIES = new Set(['yahei', 'heiti', 'songti', 'segoe']);
const TEXT_PAINTS = new Set(['solid', 'rainbow']);
const TEXT_PART_IDS = new Set(['title', 'body', 'assistantName']);

function clampNumber(value, fallback, bounds) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(bounds[0], Math.min(bounds[1], value));
}

function copyWallpaperTransform(target, source) {
  const scale = clampNumber(source.backgroundScale, 1, [0.2, 8]);
  const x = clampNumber(source.backgroundX, 0.5, [0, 1]);
  const y = clampNumber(source.backgroundY, 0.5, [0, 1]);
  if (scale !== 1 || x !== 0.5 || y !== 0.5) {
    target.backgroundScale = scale;
    target.backgroundX = x;
    target.backgroundY = y;
  }
}

export function resolveGlossaryColor(value, glossary = {}) {
  if (typeof value !== 'string' || value.length === 0) return '';
  if (HEX_COLOR.test(value)) return value;
  const hex = glossary && glossary[value];
  return typeof hex === 'string' && HEX_COLOR.test(hex) ? hex : '';
}

export function applyAppearanceToRoot(parts, appearance = {}) {
  const look = appearance && typeof appearance === 'object' && !Array.isArray(appearance) ? appearance : {};
  return freezeDeep((parts ?? []).map((part) => {
    if (!part || part.id !== 'root') return part;
    const next = { ...part };
    if (!next.fill) {
      const fill = typeof look.backgroundColor === 'string' && HEX_COLOR.test(look.backgroundColor)
        ? look.backgroundColor
        : '';
      if (fill) next.fill = fill;
    }
    const hasExplicitStroke = Number.isInteger(next.strokeWidth);
    if (!hasExplicitStroke && Number.isInteger(look.borderWidth) && look.borderWidth > 0) {
      const stroke = typeof look.borderColor === 'string' && HEX_COLOR.test(look.borderColor)
        ? look.borderColor
        : '';
      if (stroke) {
        next.stroke = stroke;
        next.strokeWidth = look.borderWidth;
      }
    }
    if (look.borderPaint === 'gradient') next.strokePaint = 'gradient';
    if (!next.backgroundAssetId) {
      const assetId = typeof look.backgroundAssetId === 'string' ? look.backgroundAssetId : '';
      if (assetId) next.backgroundAssetId = assetId;
    }
    if (!next.backgroundFit) {
      const fit = typeof look.backgroundFit === 'string' ? look.backgroundFit : '';
      if (fit) next.backgroundFit = fit;
    }
    const hasTransform = Number.isFinite(next.backgroundScale)
      || Number.isFinite(next.backgroundX)
      || Number.isFinite(next.backgroundY);
    if (!hasTransform) copyWallpaperTransform(next, look);
    return next;
  }));
}

function fallbackFontSize(id) {
  if (id === 'title') return 20;
  if (id === 'body') return 13;
  return 12;
}

export function paintPartTree(parts, paintById = {}, glossary = {}) {
  const paint = paintById && typeof paintById === 'object' && !Array.isArray(paintById) ? paintById : {};
  const names = glossary && typeof glossary === 'object' && !Array.isArray(glossary) ? glossary : {};
  return freezeDeep((parts ?? []).map((part) => {
    const extra = paint[part.id];
    const hasPaint = extra && typeof extra === 'object' && !Array.isArray(extra);
    if (!hasPaint && part.id !== 'title' && part.id !== 'body') return part;
    const next = { ...part };
    if (!hasPaint) {
      next.fontSize = part.id === 'title' ? 20 : 13;
      next.fontFamily = 'yahei';
      next.textPaint = 'solid';
      next.fontBold = part.id === 'title';
      next.fontItalic = false;
      next.fontUnderline = false;
      next.fontStrike = false;
      return next;
    }
    const fill = resolveGlossaryColor(extra.fill, names);
    const background = resolveGlossaryColor(extra.background, names);
    const stroke = resolveGlossaryColor(extra.stroke, names);
    if (fill) next.fill = fill;
    if (background) next.background = background;
    if (typeof extra.opacity === 'number' && Number.isFinite(extra.opacity)) {
      const opacity = clampNumber(extra.opacity, 1, [0, 1]);
      if (opacity !== 1) next.opacity = opacity;
    }
    if (stroke) next.stroke = stroke;
    if (Number.isInteger(extra.strokeWidth) && extra.strokeWidth >= 0) {
      if (extra.strokeWidth > 0) next.strokeWidth = extra.strokeWidth;
      else delete next.strokeWidth;
    }
    if (extra.strokePaint === 'gradient') next.strokePaint = 'gradient';
    if (Number.isInteger(extra.x) && extra.x >= 0 && extra.x <= 1920) next.x = extra.x;
    if (Number.isInteger(extra.y) && extra.y >= 0 && extra.y <= 1080) next.y = extra.y;
    if (Number.isInteger(extra.w) && extra.w > 0 && extra.w <= 1920) next.w = extra.w;
    if (Number.isInteger(extra.h) && extra.h > 0 && extra.h <= 1080) next.h = extra.h;
    if (Number.isInteger(extra.radius) && extra.radius >= 0 && extra.radius <= 240) next.radius = extra.radius;
    if (typeof extra.backgroundAssetId === 'string' && extra.backgroundAssetId.length > 0) {
      next.backgroundAssetId = extra.backgroundAssetId;
    }
    if (part.id === 'icon' && typeof extra.assetId === 'string' && extra.assetId.length > 0) {
      next.backgroundAssetId = extra.assetId;
    }
    if (typeof extra.backgroundFit === 'string' && extra.backgroundFit.length > 0) {
      next.backgroundFit = extra.backgroundFit;
    }
    if (extra.backgroundScale !== undefined || extra.backgroundX !== undefined || extra.backgroundY !== undefined) {
      next.backgroundScale = clampNumber(extra.backgroundScale, next.backgroundScale ?? 1, [0.2, 8]);
      next.backgroundX = clampNumber(extra.backgroundX, next.backgroundX ?? 0.5, [0, 1]);
      next.backgroundY = clampNumber(extra.backgroundY, next.backgroundY ?? 0.5, [0, 1]);
    }
    if (TEXT_PART_IDS.has(next.id)) {
      const fallbackSize = fallbackFontSize(next.id);
      next.fontSize = Number.isInteger(extra.fontSize) && extra.fontSize >= 8 && extra.fontSize <= 72
        ? extra.fontSize
        : fallbackSize;
      next.fontFamily = FONT_FAMILIES.has(extra.fontFamily) ? extra.fontFamily : 'yahei';
      if (typeof extra.fontAssetId === 'string' && extra.fontAssetId.length > 0) next.fontAssetId = extra.fontAssetId;
      next.textPaint = TEXT_PAINTS.has(extra.textPaint) ? extra.textPaint : 'solid';
      next.fontBold = typeof extra.fontBold === 'boolean' ? extra.fontBold : next.id === 'title';
      next.fontItalic = extra.fontItalic === true;
      next.fontUnderline = extra.fontUnderline === true;
      next.fontStrike = extra.fontStrike === true;
      if (next.id === 'title' || next.id === 'assistantName') {
        if (extra.fitWidth === true) next.fitWidth = true;
        if (extra.fitCompensate === true) next.fitCompensate = true;
      }
      if (extra.textStroke === true) {
        next.textStroke = true;
        const textStrokeColor = resolveGlossaryColor(extra.textStrokeColor, names);
        if (textStrokeColor) next.textStrokeColor = textStrokeColor;
        if (Number.isInteger(extra.textStrokeWidth) && extra.textStrokeWidth >= 1 && extra.textStrokeWidth <= 16) {
          next.textStrokeWidth = extra.textStrokeWidth;
        }
        if (extra.textStrokePaint === 'rainbow') next.textStrokePaint = 'rainbow';
      }
    }
    if (part.id === 'close') {
      if (typeof extra.closeIcon === 'string' && extra.closeIcon && extra.closeIcon !== 'x') next.closeIcon = extra.closeIcon;
      if (typeof extra.closeIconColor === 'string' && HEX_COLOR.test(extra.closeIconColor)) next.closeIconColor = extra.closeIconColor;
    }
    return next;
  }));
}

export function validatePartTree(parts) {
  if (!Array.isArray(parts)) throw partError('parts must be an array');
  const seen = new Set();
  for (const part of parts) {
    if (!part || typeof part !== 'object' || Array.isArray(part)) throw partError('part must be an object');
    if (typeof part.id !== 'string' || part.id.length === 0) throw partError('part id must be a non-empty string');
    if (seen.has(part.id)) throw partError('part id must be unique');
    seen.add(part.id);
    if (!Number.isInteger(part.w) || part.w <= 0) throw partError('part w must be an integer greater than 0');
    if (!Number.isInteger(part.h) || part.h <= 0) throw partError('part h must be an integer greater than 0');
  }
  return parts;
}
