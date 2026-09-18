import assert from 'node:assert/strict';
import test from 'node:test';
import { BODY_CUSTOM_TEXT_MAX, CARD_ASPECT_RATIOS, CARD_FITS, CARD_SIZES, CARD_TYPES, IMPLEMENTED_CARD_TYPES, createCardVisualSettings, PROPERTIES_DEFAULTS, SKIN_DEFAULTS, EFFECT_DEFAULTS, resolvePartContent, TITLE_CUSTOM_TEXT_MAX } from '../../plugin/domain/card-visual-settings.js';

test('card types are the content-structure axis; only minimal is implemented', () => {
  assert.deepEqual(CARD_TYPES, ['minimal', 'message', 'detail', 'progress', 'character', 'system']);
  assert.deepEqual(IMPLEMENTED_CARD_TYPES, ['minimal']);
});

test('minimal card visual settings have stable defaults and are deeply frozen', () => {
  const settings = createCardVisualSettings();
  assert.equal(settings.activeType, 'minimal');
  assert.deepEqual(CARD_SIZES, ['small', 'medium', 'large']);
  assert.deepEqual(CARD_ASPECT_RATIOS, ['default', 'square', 'wide']);
  assert.deepEqual(settings.types.minimal, {
    appearance: { size: 'medium', aspectRatio: 'default', backgroundColor: '#0e1916', backgroundFit: 'fill', backgroundPadding: 0, borderRadius: 16, opacity: 0.96 },
    properties: PROPERTIES_DEFAULTS,
    skin: SKIN_DEFAULTS,
    effects: EFFECT_DEFAULTS
  });
  assert.equal(Object.isFrozen(settings.types.minimal.appearance), true);
  assert.equal(Object.isFrozen(settings.types.minimal.properties), true);
  assert.equal(Object.isFrozen(settings.types.minimal.skin), true);
  assert.equal(Object.isFrozen(settings.types.minimal.effects), true);
  assert.equal('behavior' in settings.types.minimal, false);
});

test('minimal card settings accept controlled appearance fields', () => {
  const settings = createCardVisualSettings({
    activeType: 'minimal',
    types: { minimal: { appearance: { size: 'large', aspectRatio: 'wide', backgroundColor: '#123456', backgroundAssetId: 'visual-asset-1', backgroundFit: 'cover', backgroundPadding: 8, borderRadius: 24, opacity: 0.8 } } }
  });
  assert.equal(settings.types.minimal.appearance.size, 'large');
  assert.equal(settings.types.minimal.appearance.aspectRatio, 'wide');
  assert.equal(settings.types.minimal.appearance.backgroundColor, '#123456');
  assert.equal(settings.types.minimal.appearance.backgroundAssetId, 'visual-asset-1');
  assert.equal(settings.types.minimal.appearance.backgroundFit, 'cover');
  assert.equal(settings.types.minimal.appearance.backgroundPadding, 8);
  assert.equal(settings.types.minimal.appearance.borderRadius, 24);
});

test('minimal card settings accept and normalize backgroundFit values', () => {
  const settings = createCardVisualSettings({ types: { minimal: { appearance: { backgroundFit: 'contain' } } } });
  assert.equal(settings.types.minimal.appearance.backgroundFit, 'contain');
  assert.throws(() => createCardVisualSettings({ types: { minimal: { appearance: { backgroundFit: 'zoom' } } } }), (error) => error.code === 'CARD_VISUAL_FIT_INVALID');
});

test('minimal card settings accept and validate backgroundPadding values', () => {
  const settings = createCardVisualSettings({ types: { minimal: { appearance: { backgroundPadding: 20 } } } });
  assert.equal(settings.types.minimal.appearance.backgroundPadding, 20);
  assert.throws(() => createCardVisualSettings({ types: { minimal: { appearance: { backgroundPadding: -1 } } } }), (error) => error.code === 'CARD_VISUAL_FIELD_INVALID');
  assert.throws(() => createCardVisualSettings({ types: { minimal: { appearance: { backgroundPadding: 41 } } } }), (error) => error.code === 'CARD_VISUAL_FIELD_INVALID');
  assert.throws(() => createCardVisualSettings({ types: { minimal: { appearance: { backgroundPadding: '10' } } } }), (error) => error.code === 'CARD_VISUAL_FIELD_INVALID');
});

test('CARD_FITS exports the three fit modes', () => {
  assert.deepEqual(CARD_FITS, ['fill', 'contain', 'cover']);
});

test('minimal card settings keep default background transform off the type and accept scale and position', () => {
  const empty = createCardVisualSettings();
  assert.equal('backgroundScale' in empty.types.minimal.appearance, false);
  assert.equal('backgroundX' in empty.types.minimal.appearance, false);
  assert.equal('backgroundY' in empty.types.minimal.appearance, false);
  const settings = createCardVisualSettings({
    types: { minimal: { appearance: { backgroundAssetId: 'visual-asset-1', backgroundScale: 1.5, backgroundX: 0.2, backgroundY: 0.8 } } }
  });
  assert.equal(settings.types.minimal.appearance.backgroundScale, 1.5);
  assert.equal(settings.types.minimal.appearance.backgroundX, 0.2);
  assert.equal(settings.types.minimal.appearance.backgroundY, 0.8);
  assert.throws(() => createCardVisualSettings({ types: { minimal: { appearance: { backgroundScale: 0.1 } } } }), (error) => error.code === 'CARD_VISUAL_FIELD_INVALID');
  assert.throws(() => createCardVisualSettings({ types: { minimal: { appearance: { backgroundX: 1.2 } } } }), (error) => error.code === 'CARD_VISUAL_FIELD_INVALID');
  assert.throws(() => createCardVisualSettings({ types: { minimal: { appearance: { backgroundY: -0.1 } } } }), (error) => error.code === 'CARD_VISUAL_FIELD_INVALID');
});

test('minimal card settings accept bounded dimensions and space parameters', () => {
  const settings = createCardVisualSettings({ types: { minimal: {
    properties: { space: { anchor: 'top-right', gap: 12, margin: 24 } },
    appearance: { width: 480, height: 120 }
  } } });
  assert.equal(settings.types.minimal.properties.space.anchor, 'top-right');
  assert.equal(settings.types.minimal.properties.space.gap, 12);
  assert.equal(settings.types.minimal.properties.space.margin, 24);
  assert.equal(settings.types.minimal.appearance.width, 480);
  assert.equal(settings.types.minimal.appearance.height, 120);
  assert.equal(createCardVisualSettings({ types: { minimal: { appearance: { width: 100, height: 1 } } } }).types.minimal.appearance.width, 100);
  assert.throws(() => createCardVisualSettings({ types: { minimal: { appearance: { width: 0 } } } }), (error) => error.code === 'CARD_VISUAL_DIMENSION_INVALID');
  assert.throws(() => createCardVisualSettings({ types: { minimal: { appearance: { width: 1921 } } } }), (error) => error.code === 'CARD_VISUAL_DIMENSION_INVALID');
  assert.equal(createCardVisualSettings({ types: { minimal: { properties: { space: { margin: 97 } } } } }).types.minimal.properties.space.margin, 97);
  assert.throws(() => createCardVisualSettings({ types: { minimal: { properties: { space: { margin: -1 } } } } }), (error) => error.code === 'CARD_VISUAL_FIELD_INVALID');
  assert.equal(createCardVisualSettings({ types: { minimal: { appearance: { paintOverflow: 240 } } } }).types.minimal.appearance.paintOverflow, 240);
  assert.throws(() => createCardVisualSettings({ types: { minimal: { appearance: { paintOverflow: 241 } } } }), (error) => error.code === 'CARD_VISUAL_FIELD_INVALID');
});

test('minimal card settings keep empty parts off the type and accept title paint', () => {
  const empty = createCardVisualSettings();
  assert.equal('parts' in empty.types.minimal, false);
  const settings = createCardVisualSettings({
    types: { minimal: { parts: { title: { fill: '#ffaa00', stroke: '#00ffaa', strokeWidth: 0 }, body: {} } } }
  });
  assert.deepEqual(settings.types.minimal.parts, { title: { fill: '#ffaa00', stroke: '#00ffaa', strokeWidth: 0 } });
  assert.throws(
    () => createCardVisualSettings({ types: { minimal: { parts: { image: { fill: '#ffaa00' } } } } }),
    (error) => error.code === 'CARD_VISUAL_FIELD_UNKNOWN'
  );
  assert.throws(
    () => createCardVisualSettings({ types: { minimal: { parts: { title: { fill: 'red' } } } } }),
    (error) => error.code === 'CARD_VISUAL_COLOR_INVALID'
  );
  const geom = createCardVisualSettings({
    types: { minimal: { parts: { title: { x: 0, y: 10, w: 120, h: 34 } } } }
  });
  assert.deepEqual(geom.types.minimal.parts, { title: { x: 0, y: 10, w: 120, h: 34 } });
  const omitted = createCardVisualSettings({
    types: { minimal: { parts: { title: {} } } }
  });
  assert.equal('parts' in omitted.types.minimal, false);
  assert.throws(
    () => createCardVisualSettings({ types: { minimal: { parts: { title: { x: 1921 } } } } }),
    (error) => error.code === 'CARD_VISUAL_FIELD_INVALID'
  );
  assert.throws(
    () => createCardVisualSettings({ types: { minimal: { parts: { body: { w: 0 } } } } }),
    (error) => error.code === 'CARD_VISUAL_FIELD_INVALID'
  );
});

test('part paint keeps show false even without color', () => {
  const settings = createCardVisualSettings({
    types: { minimal: { parts: { body: { show: false } } } }
  });
  assert.deepEqual(settings.types.minimal.parts, { body: { show: false } });
});

test('glossary names resolve on parts and stay off the type when empty', () => {
  const empty = createCardVisualSettings();
  assert.equal('glossary' in empty.types.minimal, false);
  const settings = createCardVisualSettings({
    types: {
      minimal: {
        glossary: { '标题色': '#f2fff9', '描边色': '#62d0a8' },
        parts: { title: { fill: '标题色', stroke: '描边色', strokeWidth: 1, textStroke: true, textStrokeColor: '描边色' } }
      }
    }
  });
  assert.deepEqual(settings.types.minimal.glossary, { '标题色': '#f2fff9', '描边色': '#62d0a8' });
  assert.deepEqual(settings.types.minimal.parts, { title: { fill: '标题色', stroke: '描边色', strokeWidth: 1, textStroke: true, textStrokeColor: '描边色' } });
  assert.throws(
    () => createCardVisualSettings({ types: { minimal: { parts: { title: { fill: '标题色' } } } } }),
    (error) => error.code === 'CARD_VISUAL_COLOR_INVALID'
  );
  assert.throws(
    () => createCardVisualSettings({ types: { minimal: { glossary: { '#ffaa00': '#ffaa00' } } } }),
    (error) => error.code === 'CARD_VISUAL_FIELD_INVALID'
  );
});

test('card visual settings reject arbitrary styling and unsupported types', () => {
  assert.throws(() => createCardVisualSettings({ types: { minimal: { appearance: { css: 'body{}' } } } }), (error) => error.code === 'CARD_VISUAL_FIELD_UNKNOWN');
  assert.throws(() => createCardVisualSettings({ types: { minimal: { appearance: { backgroundColor: 'red' } } } }), (error) => error.code === 'CARD_VISUAL_COLOR_INVALID');
  assert.throws(() => createCardVisualSettings({ activeType: 'unknown' }), (error) => error.code === 'CARD_VISUAL_TYPE_INVALID');
  // 出现方式（danmaku/popup）不再是卡片种类，直接传入必须被拒绝。
  assert.throws(() => createCardVisualSettings({ activeType: 'danmaku' }), (error) => error.code === 'CARD_VISUAL_TYPE_INVALID');
  assert.throws(() => createCardVisualSettings({ activeType: 'popup' }), (error) => error.code === 'CARD_VISUAL_TYPE_INVALID');
  // 卡片种类里不再接受 behavior 字段。
  assert.throws(() => createCardVisualSettings({ types: { minimal: { behavior: { layout: 'simple' } } } }), (error) => error.code === 'CARD_VISUAL_FIELD_UNKNOWN');
});

test('icon and assistantName persist show true, show false, and custom assetId null', () => {
  const off = createCardVisualSettings({
    types: { minimal: { parts: { icon: { show: false }, assistantName: { show: false } } } }
  });
  assert.equal(off.types.minimal.parts.icon.show, false);
  assert.equal(off.types.minimal.parts.icon.source, 'assistant');
  assert.equal(off.types.minimal.parts.icon.assetId, null);
  assert.equal(off.types.minimal.parts.assistantName.show, false);
  const on = createCardVisualSettings({
    types: { minimal: { parts: { icon: { show: true, source: 'assistant' }, assistantName: { show: true, radius: 6 } } } }
  });
  assert.equal(on.types.minimal.parts.icon.show, true);
  assert.equal(on.types.minimal.parts.assistantName.show, true);
  assert.equal(on.types.minimal.parts.assistantName.radius, 6);
  const customOff = createCardVisualSettings({
    types: { minimal: { parts: { icon: { show: true, source: 'custom', assetId: null, radius: 20 } } } }
  });
  assert.equal(customOff.types.minimal.parts.icon.source, 'custom');
  assert.equal(customOff.types.minimal.parts.icon.assetId, null);
  assert.equal(customOff.types.minimal.parts.icon.radius, 20);
  const assistantClearsAsset = createCardVisualSettings({
    types: { minimal: { parts: { icon: { show: true, source: 'assistant', assetId: 'visual-asset-1' } } } }
  });
  assert.equal(assistantClearsAsset.types.minimal.parts.icon.assetId, null);
  const transformed = createCardVisualSettings({
    types: { minimal: { parts: { icon: { show: true, source: 'assistant', backgroundScale: 1.4, backgroundX: 0.2, backgroundY: 0.8 } } } }
  });
  assert.equal(transformed.types.minimal.parts.icon.backgroundScale, 1.4);
  assert.equal(transformed.types.minimal.parts.icon.backgroundX, 0.2);
  assert.equal(transformed.types.minimal.parts.icon.backgroundY, 0.8);
});

test('title and assistantName persist fitWidth true and reject it on body', () => {
  const settings = createCardVisualSettings({
    types: { minimal: { parts: { title: { fitWidth: true, fitCompensate: true }, assistantName: { show: true, fitWidth: true, fitCompensate: true } } } }
  });
  assert.equal(settings.types.minimal.parts.title.fitWidth, true);
  assert.equal(settings.types.minimal.parts.title.fitCompensate, true);
  assert.equal(settings.types.minimal.parts.assistantName.fitWidth, true);
  assert.equal(settings.types.minimal.parts.assistantName.fitCompensate, true);
  const off = createCardVisualSettings({
    types: { minimal: { parts: { title: { fitWidth: false, fitCompensate: false } } } }
  });
  assert.equal(off.types.minimal.parts, undefined);
  assert.throws(
    () => createCardVisualSettings({ types: { minimal: { parts: { body: { fitWidth: true } } } } }),
    (error) => error.code === 'CARD_VISUAL_FIELD_UNKNOWN'
  );
  assert.throws(
    () => createCardVisualSettings({ types: { minimal: { parts: { body: { fitCompensate: true } } } } }),
    (error) => error.code === 'CARD_VISUAL_FIELD_UNKNOWN'
  );
});

test('minimal card settings accept title background plate and opacity', () => {
  const settings = createCardVisualSettings({
    types: { minimal: { parts: { title: { fill: '#f2fff9', background: '#1d2b27', opacity: 0.6 } } } }
  });
  assert.deepEqual(settings.types.minimal.parts.title, { fill: '#f2fff9', background: '#1d2b27', opacity: 0.6 });
  assert.throws(
    () => createCardVisualSettings({ types: { minimal: { parts: { title: { opacity: 1.2 } } } } }),
    (error) => error.code === 'CARD_VISUAL_FIELD_INVALID'
  );
});

test('close persists explicit radius 0', () => {
  const settings = createCardVisualSettings({
    types: { minimal: { parts: { close: { radius: 0 } } } }
  });
  assert.equal(settings.types.minimal.parts.close.radius, 0);
});

test('text parts persist textStroke true with color and omit false', () => {
  const settings = createCardVisualSettings({
    types: { minimal: { parts: { title: { textStroke: true, textStrokeColor: '#112233' }, body: { textStroke: true, textStrokeColor: '#445566' }, assistantName: { show: true, textStroke: true, textStrokeColor: '#778899' } } } }
  });
  assert.equal(settings.types.minimal.parts.title.textStroke, true);
  assert.equal(settings.types.minimal.parts.title.textStrokeColor, '#112233');
  assert.equal(settings.types.minimal.parts.body.textStroke, true);
  assert.equal(settings.types.minimal.parts.body.textStrokeColor, '#445566');
  assert.equal(settings.types.minimal.parts.assistantName.textStroke, true);
  assert.equal(settings.types.minimal.parts.assistantName.textStrokeColor, '#778899');
  const off = createCardVisualSettings({
    types: { minimal: { parts: { title: { textStroke: false, textStrokeColor: '#112233' } } } }
  });
  assert.equal(off.types.minimal.parts, undefined);
  const onNoColor = createCardVisualSettings({
    types: { minimal: { parts: { title: { textStroke: true } } } }
  });
  assert.equal(onNoColor.types.minimal.parts.title.textStroke, true);
  assert.equal('textStrokeColor' in onNoColor.types.minimal.parts.title, false);
  assert.throws(
    () => createCardVisualSettings({ types: { minimal: { parts: { close: { textStroke: true } } } } }),
    (error) => error.code === 'CARD_VISUAL_FIELD_UNKNOWN'
  );
  assert.throws(
    () => createCardVisualSettings({ types: { minimal: { parts: { icon: { textStroke: true } } } } }),
    (error) => error.code === 'CARD_VISUAL_FIELD_UNKNOWN'
  );
  assert.throws(
    () => createCardVisualSettings({ types: { minimal: { parts: { title: { textStroke: true, textStrokeColor: 'red' } } } } }),
    (error) => error.code === 'CARD_VISUAL_COLOR_INVALID'
  );
});

test('visual settings persist gap without upper bound and new stroke/close fields', () => {
  const settings = createCardVisualSettings({
    types: {
      minimal: {
        appearance: { borderPaint: 'gradient' },
        properties: { space: { gap: 96 } },
        parts: {
          title: { textStroke: true, textStrokeWidth: 6, textStrokePaint: 'rainbow' },
          close: { closeIcon: 'minus', closeIconColor: '#aabbcc', strokePaint: 'gradient' }
        }
      }
    }
  });
  assert.equal(settings.types.minimal.appearance.borderPaint, 'gradient');
  assert.equal(settings.types.minimal.properties.space.gap, 96);
  assert.equal(settings.types.minimal.parts.title.textStrokeWidth, 6);
  assert.equal(settings.types.minimal.parts.title.textStrokePaint, 'rainbow');
  assert.equal(settings.types.minimal.parts.close.closeIcon, 'minus');
  assert.equal(settings.types.minimal.parts.close.closeIconColor, '#aabbcc');
  assert.equal(settings.types.minimal.parts.close.strokePaint, 'gradient');
  assert.throws(
    () => createCardVisualSettings({ types: { minimal: { appearance: { borderPaint: 'rainbow' } } } }),
    (error) => error.code === 'CARD_VISUAL_FIELD_INVALID'
  );
  assert.throws(
    () => createCardVisualSettings({ types: { minimal: { parts: { title: { textStroke: true, textStrokeWidth: 17 } } } } }),
    (error) => error.code === 'CARD_VISUAL_FIELD_INVALID'
  );
  assert.throws(
    () => createCardVisualSettings({ types: { minimal: { parts: { close: { closeIcon: 'heart' } } } } }),
    (error) => error.code === 'CARD_VISUAL_FIELD_INVALID'
  );
});

test('title and body keep content source independent of event text', () => {
  const settings = createCardVisualSettings({
    types: {
      minimal: {
        parts: {
          title: { contentSource: 'custom', customText: '写死标题' },
          body: { contentSource: 'custom', customText: '写死正文' }
        }
      }
    }
  });
  assert.equal(settings.types.minimal.parts.title.contentSource, 'custom');
  assert.equal(settings.types.minimal.parts.title.customText, '写死标题');
  assert.equal(settings.types.minimal.parts.body.contentSource, 'custom');
  assert.equal(settings.types.minimal.parts.body.customText, '写死正文');
  const eventOnly = createCardVisualSettings({
    types: { minimal: { parts: { title: { contentSource: 'event', customText: '还留着' } } } }
  });
  assert.equal('contentSource' in eventOnly.types.minimal.parts.title, false);
  assert.equal(eventOnly.types.minimal.parts.title.customText, '还留着');
  const emptyBody = createCardVisualSettings({
    types: { minimal: { parts: { body: { contentSource: 'custom', customText: '' } } } }
  });
  assert.equal(emptyBody.types.minimal.parts.body.contentSource, 'custom');
  assert.equal('customText' in emptyBody.types.minimal.parts.body, false);
  assert.throws(
    () => createCardVisualSettings({ types: { minimal: { parts: { title: { contentSource: 'custom' } } } } }),
    (error) => error.code === 'CARD_VISUAL_FIELD_INVALID'
  );
  assert.throws(
    () => createCardVisualSettings({ types: { minimal: { parts: { assistantName: { contentSource: 'custom' } } } } }),
    (error) => error.code === 'CARD_VISUAL_FIELD_UNKNOWN'
  );
  assert.equal(TITLE_CUSTOM_TEXT_MAX, 2000);
  assert.equal(BODY_CUSTOM_TEXT_MAX, 4000);
  const longTitle = '标'.repeat(TITLE_CUSTOM_TEXT_MAX);
  const longBody = '正'.repeat(BODY_CUSTOM_TEXT_MAX);
  const longCustom = createCardVisualSettings({
    types: { minimal: { parts: { title: { contentSource: 'custom', customText: longTitle }, body: { contentSource: 'custom', customText: longBody } } } }
  });
  assert.equal(longCustom.types.minimal.parts.title.customText.length, TITLE_CUSTOM_TEXT_MAX);
  assert.equal(longCustom.types.minimal.parts.body.customText.length, BODY_CUSTOM_TEXT_MAX);
  assert.throws(
    () => createCardVisualSettings({ types: { minimal: { parts: { title: { contentSource: 'custom', customText: longTitle + '溢' } } } } }),
    (error) => error.code === 'CARD_VISUAL_FIELD_INVALID'
  );
  assert.throws(
    () => createCardVisualSettings({ types: { minimal: { parts: { body: { customText: longBody + '溢' } } } } }),
    (error) => error.code === 'CARD_VISUAL_FIELD_INVALID'
  );
});

test('resolvePartContent uses custom text without keeping the card on screen', () => {
  assert.equal(resolvePartContent({ contentSource: 'custom', customText: '写死' }, '事件标题', { fallback: '新通知', maxLength: 120 }), '写死');
  assert.equal(resolvePartContent({ contentSource: 'event' }, '事件标题', { fallback: '新通知', maxLength: 120 }), '事件标题');
  assert.equal(resolvePartContent({}, '事件标题', { fallback: '新通知', maxLength: 120 }), '事件标题');
  assert.equal(resolvePartContent({ contentSource: 'custom' }, '事件正文', { fallback: '', maxLength: 2000 }), '');
  assert.equal(resolvePartContent({ contentSource: 'custom', customText: '' }, '', { fallback: '新通知', maxLength: 120 }), '新通知');
  const customTitle = '标'.repeat(500);
  assert.equal(resolvePartContent({ contentSource: 'custom', customText: customTitle }, '事件标题', { fallback: '新通知', maxLength: TITLE_CUSTOM_TEXT_MAX }), customTitle);
});
