import test from 'node:test';
import assert from 'node:assert/strict';
import register, { renderFontAssetLibraryPage } from '../../plugin/routes/settings-font-assets-page.js';

function harness() {
  const routes = new Map();
  return { app: { get(path, handler) { routes.set(path, handler); } }, routes };
}

test('font asset page renders metadata, filters and protected states', () => {
  const html = renderFontAssetLibraryPage('/font-assets-page', {
    assets: [{
      assetId: 'a',
      name: 'Mint Sans',
      format: 'ttf',
      byteSize: 2048,
      sha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      references: 1
    }]
  });
  assert.match(html, /字体库/);
  assert.match(html, /Mint Sans/);
  assert.match(html, /已引用 1 次/);
  assert.match(html, /搜索名称/);
  assert.match(html, /正在使用/);
  assert.match(html, /font-assets/);
  assert.match(html, /再次点击确认/);
  assert.match(html, /toolbar-actions/);
  assert.match(html, /toolbar-heading/);
  assert.doesNotMatch(html, /visual-package/);
  assert.doesNotThrow(() => new Function([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1]));
});

test('font asset page route reads plugin assets', () => {
  const { app, routes } = harness();
  register(app, { _notificationHubVNextPlugin: { listFontAssets() { return []; } } });
  assert.equal(routes.size, 1);
  const response = routes.get('/font-assets-page')({ req: { url: '/font-assets-page' }, html(value) { return { value }; } });
  assert.match(response.value, /字体库/);
});
