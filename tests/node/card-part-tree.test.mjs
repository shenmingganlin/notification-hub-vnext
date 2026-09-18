import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyAppearanceToRoot,
  createDefaultTextPartTree,
  paintPartTree,
  validatePartTree
} from '../../plugin/domain/card-part-tree.js';

test('default stack tree has root, title, body, and close parts', () => {
  const parts = createDefaultTextPartTree({ width: 420, height: 220 });
  assert.equal(parts.length, 4);
  assert.equal(parts[0].id, 'root');
  assert.equal(parts[0].kind, 'block');
  assert.equal(parts[0].x, 0);
  assert.equal(parts[0].y, 0);
  assert.equal(parts[0].w, 420);
  assert.equal(parts[0].h, 220);
  assert.equal(parts[1].id, 'title');
  assert.equal(parts[1].kind, 'text');
  assert.equal(parts[1].binding, 'title');
  assert.equal(parts[1].x, 30);
  assert.equal(parts[1].y, 24);
  assert.equal(parts[1].h, 34);
  assert.equal(parts[2].id, 'body');
  assert.equal(parts[2].kind, 'text');
  assert.equal(parts[2].binding, 'body');
  assert.equal(parts[2].x, 30);
  assert.equal(parts[2].y, 62);
  assert.equal(parts[3].id, 'close');
  assert.equal(parts[3].kind, 'close');
  assert.equal(parts[3].w, 28);
  assert.equal(parts[3].h, 28);
  assert.equal(parts[3].x, 420 - 12 - 28);
  assert.equal(parts[3].y, 12);
  assert.ok(Object.isFrozen(parts));
  validatePartTree(parts);
});

test('short ticker card has a root and a single text part', () => {
  const parts = createDefaultTextPartTree({ width: 480, height: 56, ticker: true });
  assert.equal(parts.length, 2);
  assert.equal(parts[0].id, 'root');
  assert.equal(parts[0].kind, 'block');
  assert.equal(parts[0].w, 480);
  assert.equal(parts[0].h, 56);
  assert.equal(parts[1].id, 'title');
  assert.equal(parts[1].kind, 'text');
  assert.equal(parts.every((part) => part.kind !== 'close'), true);
  assert.equal(parts[1].binding, 'title');
  assert.equal(parts[1].x, 14);
  assert.equal(parts[1].y, 8);
  validatePartTree(parts);
});

test('stack tree omits close when close is off', () => {
  const parts = createDefaultTextPartTree({ width: 420, height: 220, close: false });
  assert.equal(parts.length, 3);
  assert.equal(parts[0].id, 'root');
  assert.equal(parts.every((part) => part.kind !== 'close'), true);
  assert.equal(parts[1].w, 420 - 24 - 30);
  assert.equal(parts[2].h, 220 - 22 - 62);
  validatePartTree(parts);
});

test('tall ticker with body off keeps only title filling the card', () => {
  const parts = createDefaultTextPartTree({ width: 480, height: 84, ticker: true, body: false });
  assert.equal(parts.some((part) => part.id === 'body'), false);
  assert.equal(parts.some((part) => part.id === 'title'), true);
  const title = parts.find((part) => part.id === 'title');
  assert.equal(title.x, 14);
  assert.equal(title.y, 8);
  assert.equal(title.w, 480 - 28);
  assert.equal(title.h, 84 - 16);
  validatePartTree(parts);
});

test('stack with body off omits body and expands title', () => {
  const parts = createDefaultTextPartTree({ width: 420, height: 220, body: false });
  assert.equal(parts.some((part) => part.id === 'body'), false);
  assert.equal(parts.some((part) => part.id === 'title'), true);
  const title = parts.find((part) => part.id === 'title');
  assert.equal(title.x, 30);
  assert.equal(title.y, 24);
  assert.equal(title.h, 220 - 22 - 24);
  assert.equal(parts.some((part) => part.id === 'close'), true);
  validatePartTree(parts);
});

test('turning both text parts off still keeps title', () => {
  const parts = createDefaultTextPartTree({ width: 420, height: 220, title: false, body: false });
  assert.equal(parts.some((part) => part.id === 'title'), true);
  assert.equal(parts.some((part) => part.id === 'body'), false);
  const title = parts.find((part) => part.id === 'title');
  assert.equal(title.y, 24);
  assert.equal(title.h, 220 - 22 - 24);
  validatePartTree(parts);
});

test('paintPartTree writes background plate onto text without turning fill into a panel', () => {
  const painted = paintPartTree(createDefaultTextPartTree({ width: 420, height: 220 }), {
    title: { fill: '#f2fff9', background: '#1d2b27', opacity: 0.6 }
  });
  const title = painted.find((part) => part.id === 'title');
  assert.equal(title.fill, '#f2fff9');
  assert.equal(title.background, '#1d2b27');
  assert.equal(title.opacity, 0.6);
  validatePartTree(painted);
});

test('paintPartTree writes fill and stroke onto matching parts only', () => {
  const painted = paintPartTree(createDefaultTextPartTree({ width: 420, height: 220 }), {
    title: { fill: '#ffaa00', stroke: '#00ffaa', strokeWidth: 2 },
    body: { fill: '' }
  });
  assert.equal(painted[1].id, 'title');
  assert.equal(painted[1].fill, '#ffaa00');
  assert.equal(painted[1].stroke, '#00ffaa');
  assert.equal(painted[1].strokeWidth, 2);
  assert.equal('fill' in painted[2], false);
  assert.equal('stroke' in painted[3], false);
  validatePartTree(painted);
});

test('paintPartTree resolves glossary names to hex', () => {
  const painted = paintPartTree(
    createDefaultTextPartTree({ width: 420, height: 220 }),
    { title: { fill: '标题色', stroke: '描边色', strokeWidth: 1 } },
    { '标题色': '#f2fff9', '描边色': '#62d0a8' }
  );
  assert.equal(painted[1].fill, '#f2fff9');
  assert.equal(painted[1].stroke, '#62d0a8');
  assert.equal(painted[1].strokeWidth, 1);
});

test('appearance maps onto empty root fill and stroke', () => {
  const mapped = applyAppearanceToRoot(
    createDefaultTextPartTree({ width: 420, height: 220 }),
    { backgroundColor: '#0e1916', borderWidth: 2, borderColor: '#62d0a8' }
  );
  assert.equal(mapped[0].id, 'root');
  assert.equal(mapped[0].fill, '#0e1916');
  assert.equal(mapped[0].stroke, '#62d0a8');
  assert.equal(mapped[0].strokeWidth, 2);
  validatePartTree(mapped);
});

test('paintPartTree parts.root overrides appearance mapping', () => {
  const painted = paintPartTree(
    applyAppearanceToRoot(
      createDefaultTextPartTree({ width: 420, height: 220 }),
      { backgroundColor: '#ff0000', borderWidth: 3, borderColor: '#00ff00' }
    ),
    { root: { fill: '#0044aa', stroke: '#62d0a8', strokeWidth: 2 } }
  );
  assert.equal(painted[0].id, 'root');
  assert.equal(painted[0].fill, '#0044aa');
  assert.equal(painted[0].stroke, '#62d0a8');
  assert.equal(painted[0].strokeWidth, 2);
  validatePartTree(painted);
});

test('explicit strokeWidth 0 is kept and not replaced by appearance border 2', () => {
  const rooted = applyAppearanceToRoot(
    createDefaultTextPartTree({ width: 420, height: 220 }).map((part) => (
      part.id === 'root' ? { ...part, strokeWidth: 0 } : part
    )),
    { backgroundColor: '#0e1916', borderWidth: 2, borderColor: '#62d0a8' }
  );
  assert.equal(rooted[0].strokeWidth, 0);
  const painted = paintPartTree(
    applyAppearanceToRoot(
      createDefaultTextPartTree({ width: 420, height: 220 }),
      { backgroundColor: '#0e1916', borderWidth: 2, borderColor: '#62d0a8' }
    ),
    { root: { strokeWidth: 0 }, title: { stroke: '#00ffaa', strokeWidth: 0 } }
  );
  assert.equal('strokeWidth' in painted[0], false);
  const title = painted.find((part) => part.id === 'title');
  assert.equal(title.strokeWidth, undefined);
});

test('appearance maps wallpaper onto empty root', () => {
  const mapped = applyAppearanceToRoot(
    createDefaultTextPartTree({ width: 420, height: 220 }),
    {
      backgroundAssetId: 'wall-red',
      backgroundFit: 'cover',
      backgroundScale: 1.5,
      backgroundX: 0.2,
      backgroundY: 0.8
    }
  );
  assert.equal(mapped[0].id, 'root');
  assert.equal(mapped[0].backgroundAssetId, 'wall-red');
  assert.equal(mapped[0].backgroundFit, 'cover');
  assert.equal(mapped[0].backgroundScale, 1.5);
  assert.equal(mapped[0].backgroundX, 0.2);
  assert.equal(mapped[0].backgroundY, 0.8);
  validatePartTree(mapped);
});

test('appearance default wallpaper transform is not written onto empty root', () => {
  const mapped = applyAppearanceToRoot(
    createDefaultTextPartTree({ width: 420, height: 220 }),
    {
      backgroundAssetId: 'wall-red',
      backgroundFit: 'fill',
      backgroundScale: 1,
      backgroundX: 0.5,
      backgroundY: 0.5
    }
  );
  assert.equal(mapped[0].backgroundAssetId, 'wall-red');
  assert.equal(mapped[0].backgroundFit, 'fill');
  assert.equal('backgroundScale' in mapped[0], false);
  assert.equal('backgroundX' in mapped[0], false);
  assert.equal('backgroundY' in mapped[0], false);
  validatePartTree(mapped);
});

test('paintPartTree parts.root wallpaper overrides appearance mapping', () => {
  const painted = paintPartTree(
    applyAppearanceToRoot(
      createDefaultTextPartTree({ width: 420, height: 220 }),
      {
        backgroundAssetId: 'from-appearance',
        backgroundFit: 'contain',
        backgroundScale: 2,
        backgroundX: 0.1,
        backgroundY: 0.9
      }
    ),
    { root: { backgroundAssetId: 'from-parts' } }
  );
  assert.equal(painted[0].id, 'root');
  assert.equal(painted[0].backgroundAssetId, 'from-parts');
  assert.equal(painted[0].backgroundFit, 'contain');
  assert.equal(painted[0].backgroundScale, 2);
  validatePartTree(painted);
});

test('paintPartTree overlays integer title geometry in range', () => {
  const painted = paintPartTree(createDefaultTextPartTree({ width: 420, height: 220 }), {
    title: { x: 40, y: 10, w: 200, h: 40 }
  });
  assert.equal(painted[1].id, 'title');
  assert.equal(painted[1].x, 40);
  assert.equal(painted[1].y, 10);
  assert.equal(painted[1].w, 200);
  assert.equal(painted[1].h, 40);
  validatePartTree(painted);
});

test('paintPartTree ignores illegal geometry and keeps default tree', () => {
  const defaults = createDefaultTextPartTree({ width: 420, height: 220 });
  const painted = paintPartTree(defaults, {
    title: { x: 1.5, y: -1, w: 0, h: 1081 },
    body: { x: 1921, y: 1081, w: 1921, h: 0.5 }
  });
  assert.equal(painted[1].x, defaults[1].x);
  assert.equal(painted[1].y, defaults[1].y);
  assert.equal(painted[1].w, defaults[1].w);
  assert.equal(painted[1].h, defaults[1].h);
  assert.equal(painted[2].x, defaults[2].x);
  assert.equal(painted[2].y, defaults[2].y);
  assert.equal(painted[2].w, defaults[2].w);
  assert.equal(painted[2].h, defaults[2].h);
});

test('paintPartTree writes fontAssetId onto title', () => {
  const painted = paintPartTree(createDefaultTextPartTree({ width: 420, height: 220 }), {
    title: { fontAssetId: 'font-asset-1', fontFamily: 'yahei' }
  });
  const title = painted.find((part) => part.id === 'title');
  assert.equal(title.fontAssetId, 'font-asset-1');
  assert.equal(title.fontFamily, 'yahei');
});

test('paintPartTree writes font fields onto title and body', () => {
  const painted = paintPartTree(createDefaultTextPartTree({ width: 420, height: 220 }), {
    title: { fontSize: 28, fontFamily: 'songti', textPaint: 'rainbow' },
    body: { fontSize: 99, fontFamily: 'comic', textPaint: 'stripe' }
  });
  const title = painted.find((part) => part.id === 'title');
  const body = painted.find((part) => part.id === 'body');
  const close = painted.find((part) => part.id === 'close');
  assert.equal(title.fontSize, 28);
  assert.equal(title.fontFamily, 'songti');
  assert.equal(title.textPaint, 'rainbow');
  assert.equal(body.fontSize, 13);
  assert.equal(body.fontFamily, 'yahei');
  assert.equal(body.textPaint, 'solid');
  assert.equal(title.fontBold, true);
  assert.equal(title.fontItalic, false);
  assert.equal(title.fontUnderline, false);
  assert.equal(title.fontStrike, false);
  assert.equal(body.fontBold, false);
  assert.equal('fontSize' in close, false);
  assert.equal('fontBold' in close, false);
  validatePartTree(painted);
});

test('paintPartTree writes title/body text styles and skips close', () => {
  const painted = paintPartTree(createDefaultTextPartTree({ width: 420, height: 220 }), {
    title: { fontBold: false, fontItalic: true, fontUnderline: true, fontStrike: true },
    body: { fontBold: true, fontItalic: true },
    close: { fontBold: true, fontItalic: true }
  });
  const title = painted.find((part) => part.id === 'title');
  const body = painted.find((part) => part.id === 'body');
  const close = painted.find((part) => part.id === 'close');
  assert.equal(title.fontBold, false);
  assert.equal(title.fontItalic, true);
  assert.equal(title.fontUnderline, true);
  assert.equal(title.fontStrike, true);
  assert.equal(body.fontBold, true);
  assert.equal(body.fontItalic, true);
  assert.equal(body.fontUnderline, false);
  assert.equal(body.fontStrike, false);
  assert.equal('fontBold' in close, false);
  assert.equal('fontItalic' in close, false);
  validatePartTree(painted);
});

test('default tree omits icon and assistantName until show is on', () => {
  const parts = createDefaultTextPartTree({ width: 420, height: 220 });
  assert.equal(parts.some((part) => part.id === 'icon'), false);
  assert.equal(parts.some((part) => part.id === 'assistantName'), false);
  const opened = createDefaultTextPartTree({ width: 420, height: 220, icon: true, assistantName: true });
  const icon = opened.find((part) => part.id === 'icon');
  const name = opened.find((part) => part.id === 'assistantName');
  const title = opened.find((part) => part.id === 'title');
  const body = opened.find((part) => part.id === 'body');
  assert.equal(icon.kind, 'image');
  assert.equal(icon.x, 16);
  assert.equal(icon.y, 22);
  assert.equal(icon.w, 40);
  assert.equal(icon.h, 40);
  assert.equal(icon.radius, 20);
  assert.equal(name.kind, 'text');
  assert.equal(name.binding, 'assistantName');
  assert.equal(name.x, 66);
  assert.equal(name.y, 16);
  assert.equal(title.x, 66);
  assert.equal(title.y, 36);
  assert.equal(body.y, 74);
  const ids = opened.map((part) => part.id);
  assert.ok(ids.indexOf('assistantName') > ids.indexOf('body'));
  assert.ok(ids.indexOf('close') > ids.indexOf('assistantName'));
  validatePartTree(opened);
});

test('paintPartTree writes radius onto any part and font onto assistantName', () => {
  const painted = paintPartTree(
    createDefaultTextPartTree({ width: 420, height: 220, icon: true, assistantName: true }),
    {
      icon: { radius: 20, fill: '#123456' },
      assistantName: { fontSize: 12, fill: '#62d0a8', radius: 4 },
      close: { radius: 14 }
    }
  );
  const icon = painted.find((part) => part.id === 'icon');
  const name = painted.find((part) => part.id === 'assistantName');
  const close = painted.find((part) => part.id === 'close');
  assert.equal(icon.radius, 20);
  assert.equal(icon.fill, '#123456');
  assert.equal(name.fontSize, 12);
  assert.equal(name.fill, '#62d0a8');
  assert.equal(name.radius, 4);
  assert.equal(close.radius, 14);
  validatePartTree(painted);
  const squared = paintPartTree(
    createDefaultTextPartTree({ width: 420, height: 220 }),
    { close: { radius: 0 } }
  );
  const squaredClose = squared.find((part) => part.id === 'close');
  assert.equal(squaredClose.radius, 0);
  validatePartTree(squared);
});

test('ticker icon sits on the left without changing the default ticker tree', () => {
  const closed = createDefaultTextPartTree({ width: 480, height: 56, ticker: true });
  assert.equal(closed.some((part) => part.id === 'icon'), false);
  const opened = createDefaultTextPartTree({ width: 480, height: 56, ticker: true, icon: true });
  const icon = opened.find((part) => part.id === 'icon');
  const title = opened.find((part) => part.id === 'title');
  assert.equal(icon.x, 8);
  assert.equal(icon.w, 24);
  assert.equal(icon.h, 24);
  assert.equal(title.x, 38);
  const named = createDefaultTextPartTree({ width: 480, height: 56, ticker: true, assistantName: true });
  const namedIds = named.map((part) => part.id);
  assert.ok(namedIds.indexOf('assistantName') > namedIds.indexOf('title'));
  validatePartTree(opened);
  validatePartTree(named);
});

test('paintPartTree writes fitWidth only for title and assistantName', () => {
  const painted = paintPartTree(
    createDefaultTextPartTree({ width: 420, height: 220, assistantName: true }),
    {
      title: { fitWidth: true, fitCompensate: true },
      body: { fitWidth: true, fitCompensate: true },
      assistantName: { show: true, fitWidth: true, fitCompensate: true }
    }
  );
  const title = painted.find((part) => part.id === 'title');
  const body = painted.find((part) => part.id === 'body');
  const name = painted.find((part) => part.id === 'assistantName');
  assert.equal(title.fitWidth, true);
  assert.equal(title.fitCompensate, true);
  assert.equal('fitWidth' in body, false);
  assert.equal('fitCompensate' in body, false);
  assert.equal(name.fitWidth, true);
  assert.equal(name.fitCompensate, true);
  validatePartTree(painted);
});

test('paintPartTree resolves glossary names on textStrokeColor', () => {
  const painted = paintPartTree(
    createDefaultTextPartTree({ width: 420, height: 220 }),
    { title: { textStroke: true, textStrokeColor: '描边色' } },
    { '描边色': '#112233' }
  );
  const title = painted.find((part) => part.id === 'title');
  assert.equal(title.textStroke, true);
  assert.equal(title.textStrokeColor, '#112233');
  validatePartTree(painted);
});

test('paintPartTree writes textStroke onto text parts and skips close', () => {
  const painted = paintPartTree(
    createDefaultTextPartTree({ width: 420, height: 220, assistantName: true }),
    {
      title: { textStroke: true, textStrokeColor: '#112233' },
      body: { textStroke: true, textStrokeColor: 'not-a-color' },
      assistantName: { textStroke: true, textStrokeColor: '#445566' },
      close: { textStroke: true, textStrokeColor: '#778899' }
    }
  );
  const title = painted.find((part) => part.id === 'title');
  const body = painted.find((part) => part.id === 'body');
  const name = painted.find((part) => part.id === 'assistantName');
  const close = painted.find((part) => part.id === 'close');
  assert.equal(title.textStroke, true);
  assert.equal(title.textStrokeColor, '#112233');
  assert.equal(body.textStroke, true);
  assert.equal('textStrokeColor' in body, false);
  assert.equal(name.textStroke, true);
  assert.equal(name.textStrokeColor, '#445566');
  assert.equal('textStroke' in close, false);
  assert.equal('textStrokeColor' in close, false);
  const off = paintPartTree(createDefaultTextPartTree({ width: 420, height: 220 }), {
    title: { textStroke: false, textStrokeColor: '#112233' }
  });
  const offTitle = off.find((part) => part.id === 'title');
  assert.equal('textStroke' in offTitle, false);
  assert.equal('textStrokeColor' in offTitle, false);
  validatePartTree(painted);
});

test('paintPartTree writes strokePaint, textStroke extras, and close icon', () => {
  const painted = paintPartTree(
    createDefaultTextPartTree({ width: 420, height: 220 }),
    {
      title: { textStroke: true, textStrokeWidth: 4, textStrokePaint: 'rainbow' },
      root: { strokePaint: 'gradient', strokeWidth: 2, stroke: '#62d0a8' },
      close: { closeIcon: 'star', closeIconColor: '#ffcc00' }
    }
  );
  const title = painted.find((part) => part.id === 'title');
  const root = painted.find((part) => part.id === 'root');
  const close = painted.find((part) => part.id === 'close');
  assert.equal(title.textStroke, true);
  assert.equal(title.textStrokeWidth, 4);
  assert.equal(title.textStrokePaint, 'rainbow');
  assert.equal(root.strokePaint, 'gradient');
  assert.equal(close.closeIcon, 'star');
  assert.equal(close.closeIconColor, '#ffcc00');
});

test('applyAppearanceToRoot copies gradient borderPaint onto root strokePaint', () => {
  const mapped = applyAppearanceToRoot(
    createDefaultTextPartTree({ width: 420, height: 220 }),
    { borderWidth: 3, borderColor: '#62d0a8', borderPaint: 'gradient' }
  );
  const root = mapped.find((part) => part.id === 'root');
  assert.equal(root.strokeWidth, 3);
  assert.equal(root.stroke, '#62d0a8');
  assert.equal(root.strokePaint, 'gradient');
});

test('validatePartTree rejects empty id and non-positive width', () => {
  assert.throws(
    () => validatePartTree([{ id: '', kind: 'text', binding: 'title', x: 0, y: 0, w: 10, h: 10 }]),
    (error) => error.code === 'CARD_PART_TREE_INVALID'
  );
  assert.throws(
    () => validatePartTree([{ id: 'title', kind: 'text', binding: 'title', x: 0, y: 0, w: 0, h: 10 }]),
    (error) => error.code === 'CARD_PART_TREE_INVALID'
  );
});
