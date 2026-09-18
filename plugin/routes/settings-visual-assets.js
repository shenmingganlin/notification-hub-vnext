const MESSAGES = Object.freeze({
  VISUAL_ASSET_IN_USE: '这个视觉素材仍被使用，请先解除引用。',
  VISUAL_ASSET_NOT_FOUND: '视觉素材不存在。',
  VISUAL_PACKAGE_FILE_INVALID: '视觉配置包文件无效。',
  VISUAL_PACKAGE_IO_STRATEGY_INVALID: '视觉配置包冲突策略无效。'
});
function errorPayload(error) { return { code: error?.code ?? 'VISUAL_ASSET_ROUTE_FAILED', message: MESSAGES[error?.code] ?? error?.message ?? String(error), details: error?.details ?? {} }; }
function getPlugin(ctx) { return ctx?._notificationHubVNextSettingsApi ?? ctx?._notificationHubVNextPlugin; }
function readFlag(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return defaultValue;
}
async function readPackageInput(c) {
  const contentType = c.req.header?.('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await c.req.json().catch(() => ({}));
    if (typeof body?.base64 === 'string' && body.base64.trim()) {
      return {
        zipBuffer: Buffer.from(body.base64, 'base64'),
        strategy: body.strategy,
        applyBindings: readFlag(body.applyBindings, true),
        clearMissingAssets: readFlag(body.clearMissingAssets, false),
        clearMissingFonts: readFlag(body.clearMissingFonts, false)
      };
    }
    throw Object.assign(new Error('package file is required'), { code: 'VISUAL_PACKAGE_FILE_INVALID' });
  }
  const form = await c.req.parseBody();
  const file = form?.package ?? form?.file;
  if (!file || typeof file.arrayBuffer !== 'function') throw Object.assign(new Error('package file is required'), { code: 'VISUAL_PACKAGE_FILE_INVALID' });
  return {
    file,
    strategy: typeof form.strategy === 'string' ? form.strategy : undefined,
    applyBindings: readFlag(form.applyBindings, true),
    clearMissingAssets: readFlag(form.clearMissingAssets, false),
    clearMissingFonts: readFlag(form.clearMissingFonts, false)
  };
}
export default function registerVisualAssetRoute(app, ctx) {
  const pluginOf = () => getPlugin(ctx);
  app.post('/visual-assets/import', async (c) => { try { const plugin = pluginOf(); if (!plugin?.importVisualAssetFromPicker) return c.json({ ok:false, error:errorPayload({ code:'VISUAL_ASSET_API_UNAVAILABLE', message:'视觉素材库暂不可用。' }) }, 503); return c.json({ ok:true, ...(await plugin.importVisualAssetFromPicker(await c.req.json().catch(() => ({})))) }); } catch (error) { return c.json({ ok:false, error:errorPayload(error) }, 400); } });
  app.get('/visual-assets', (c) => { try { const plugin = pluginOf(); if (!plugin?.listVisualAssets) return c.json({ ok:false, error:errorPayload({ code:'VISUAL_ASSET_API_UNAVAILABLE', message:'视觉素材库暂不可用。' }) }, 503); return c.json({ ok:true, assets: plugin.listVisualAssets(c.req.query?.() ?? {}) }); } catch (error) { return c.json({ ok:false, error:errorPayload(error) }, 500); } });
  app.get('/visual-assets/:assetId/file', async (c) => {
    try {
      const plugin = pluginOf();
      if (!plugin?.readVisualAssetFile) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_ASSET_API_UNAVAILABLE', message: '视觉素材库暂不可用。' }) }, 503);
      const file = await plugin.readVisualAssetFile(c.req.param('assetId'));
      if (!file) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_ASSET_NOT_FOUND', message: '视觉素材不存在。' }) }, 404);
      const mime = file.format === 'jpg' ? 'image/jpeg' : file.format === 'webp' ? 'image/webp' : 'image/png';
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
  app.get('/visual-assets/:assetId', (c) => { try { const plugin = pluginOf(); const asset = plugin?.getVisualAsset?.(c.req.param('assetId')); if (!asset) return c.json({ ok:false, error:errorPayload({ code:'VISUAL_ASSET_NOT_FOUND', message:'视觉素材不存在。' }) }, 404); return c.json({ ok:true, asset }); } catch (error) { return c.json({ ok:false, error:errorPayload(error) }, 500); } });
  app.delete('/visual-assets/:assetId', async (c) => { try { const plugin = pluginOf(); if (!plugin?.removeVisualAsset) return c.json({ ok:false, error:errorPayload({ code:'VISUAL_ASSET_API_UNAVAILABLE', message:'视觉素材库暂不可用。' }) }, 503); return c.json({ ok:true, removed:await plugin.removeVisualAsset(c.req.param('assetId')) }); } catch (error) { return c.json({ ok:false, error:errorPayload(error) }, error.code === 'VISUAL_ASSET_NOT_FOUND' ? 404 : error.code === 'VISUAL_ASSET_IN_USE' ? 409 : 400); } });

  app.post('/visual-package-export', async (c) => {
    try {
      const plugin = pluginOf();
      if (!plugin?.exportVisualPackageToPicker) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_PACKAGE_API_UNAVAILABLE', message: '视觉配置包 API 暂不可用。' }) }, 503);
      return c.json({ ok: true, ...(await plugin.exportVisualPackageToPicker(await c.req.json().catch(() => ({})))) });
    } catch (error) {
      return c.json({ ok: false, error: errorPayload(error) }, 400);
    }
  });
  app.post('/visual-package-preview', async (c) => {
    try {
      const plugin = pluginOf();
      if (!plugin?.previewVisualPackage) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_PACKAGE_API_UNAVAILABLE', message: '视觉配置包 API 暂不可用。' }) }, 503);
      return c.json({ ok: true, preview: await plugin.previewVisualPackage(await readPackageInput(c)) });
    } catch (error) {
      const status = error?.code?.startsWith('VISUAL_PACKAGE_') ? 400 : 503;
      return c.json({ ok: false, error: errorPayload(error) }, status);
    }
  });
  app.post('/visual-package-import', async (c) => {
    try {
      const plugin = pluginOf();
      if (!plugin?.importVisualPackage) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_PACKAGE_API_UNAVAILABLE', message: '视觉配置包 API 暂不可用。' }) }, 503);
      const input = await readPackageInput(c);
      return c.json({ ok: true, report: await plugin.importVisualPackage(input) });
    } catch (error) {
      const status = error?.code?.startsWith('VISUAL_PACKAGE_') ? 400 : 503;
      return c.json({ ok: false, error: errorPayload(error) }, status);
    }
  });
  app.post('/visual-package-diagnostics-export', async (c) => {
    try {
      const plugin = pluginOf();
      if (!plugin?.exportVisualPackageDiagnostics) return c.json({ ok: false, error: errorPayload({ code: 'VISUAL_PACKAGE_API_UNAVAILABLE', message: '视觉配置包诊断 API 暂不可用。' }) }, 503);
      return c.json({ ok: true, ...(await plugin.exportVisualPackageDiagnostics(await c.req.json().catch(() => ({})))) });
    } catch (error) {
      return c.json({ ok: false, error: errorPayload(error) }, error?.code === 'VISUAL_PACKAGE_DIAGNOSTIC_NOT_FOUND' ? 404 : 400);
    }
  });
}
