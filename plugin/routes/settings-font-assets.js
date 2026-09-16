const MESSAGES = Object.freeze({
  FONT_ASSET_IN_USE: '这个字体仍被使用，请先解除引用。',
  FONT_ASSET_NOT_FOUND: '字体不存在。'
});
function errorPayload(error) { return { code: error?.code ?? 'FONT_ASSET_ROUTE_FAILED', message: MESSAGES[error?.code] ?? error?.message ?? String(error), details: error?.details ?? {} }; }
function getPlugin(ctx) { return ctx?._notificationHubVNextSettingsApi ?? ctx?._notificationHubVNextPlugin; }
export default function registerFontAssetRoute(app, ctx) {
  const pluginOf = () => getPlugin(ctx);
  app.post('/font-assets/import', async (c) => {
    try {
      const plugin = pluginOf();
      if (!plugin?.importFontAssetFromPicker) return c.json({ ok: false, error: errorPayload({ code: 'FONT_ASSET_API_UNAVAILABLE', message: '字体库暂不可用。' }) }, 503);
      return c.json({ ok: true, ...(await plugin.importFontAssetFromPicker(await c.req.json().catch(() => ({})))) });
    } catch (error) {
      return c.json({ ok: false, error: errorPayload(error) }, 400);
    }
  });
  app.get('/font-assets', (c) => {
    try {
      const plugin = pluginOf();
      if (!plugin?.listFontAssets) return c.json({ ok: false, error: errorPayload({ code: 'FONT_ASSET_API_UNAVAILABLE', message: '字体库暂不可用。' }) }, 503);
      return c.json({ ok: true, assets: plugin.listFontAssets(c.req.query?.() ?? {}) });
    } catch (error) {
      return c.json({ ok: false, error: errorPayload(error) }, 500);
    }
  });
  app.get('/font-assets/:assetId/file', async (c) => {
    try {
      const plugin = pluginOf();
      if (!plugin?.readFontAssetFile) return c.json({ ok: false, error: errorPayload({ code: 'FONT_ASSET_API_UNAVAILABLE', message: '字体库暂不可用。' }) }, 503);
      const file = await plugin.readFontAssetFile(c.req.param('assetId'));
      if (!file) return c.json({ ok: false, error: errorPayload({ code: 'FONT_ASSET_NOT_FOUND', message: '字体不存在。' }) }, 404);
      const mime = file.format === 'otf' ? 'font/otf' : 'font/ttf';
      const accept = String(c.req.header?.('Accept') || c.req.header?.('accept') || '');
      if (accept.includes('application/json')) {
        const bytes = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer);
        return c.json({ ok: true, assetId: file.assetId, format: file.format, dataUrl: 'data:' + mime + ';base64,' + bytes.toString('base64') });
      }
      return c.body(file.buffer, 200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
    } catch (error) {
      return c.json({ ok: false, error: errorPayload(error) }, 500);
    }
  });
  app.get('/font-assets/:assetId', (c) => {
    try {
      const plugin = pluginOf();
      const asset = plugin?.getFontAsset?.(c.req.param('assetId'));
      if (!asset) return c.json({ ok: false, error: errorPayload({ code: 'FONT_ASSET_NOT_FOUND', message: '字体不存在。' }) }, 404);
      return c.json({ ok: true, asset });
    } catch (error) {
      return c.json({ ok: false, error: errorPayload(error) }, 500);
    }
  });
  app.delete('/font-assets/:assetId', async (c) => {
    try {
      const plugin = pluginOf();
      if (!plugin?.removeFontAsset) return c.json({ ok: false, error: errorPayload({ code: 'FONT_ASSET_API_UNAVAILABLE', message: '字体库暂不可用。' }) }, 503);
      return c.json({ ok: true, removed: await plugin.removeFontAsset(c.req.param('assetId')) });
    } catch (error) {
      return c.json({ ok: false, error: errorPayload(error) }, error.code === 'FONT_ASSET_NOT_FOUND' ? 404 : error.code === 'FONT_ASSET_IN_USE' ? 409 : 400);
    }
  });
}
