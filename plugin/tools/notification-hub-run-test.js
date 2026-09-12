export const name = 'notification-hub-run-test';
export const description = '通过 Notification Hub 的测试工具入口生成可追踪的工具事件卡片；仅用于验收，不代表真实业务通知。';
export const parameters = {
  type: 'object',
  properties: {
    count: { type: 'integer', minimum: 1, maximum: 100, description: '生成数量，默认 1' },
    intervalMs: { type: 'integer', minimum: 0, maximum: 5000, description: '事件间隔毫秒，默认 100' },
    createCards: { type: 'boolean', description: '是否创建桌面卡片，默认 true' },
    playSound: { type: 'boolean', description: '是否播放声音，默认 false' },
    label: { type: 'string', maxLength: 80, description: '测试批次名称' }
  }
};
export const sessionPermission = { kind: 'external_side_effect' };

export async function execute(input = {}, ctx = {}) {
  const result = await ctx.bus?.request?.('notification-hub-vnext.run-test', {
    ...input,
    playSound: input.playSound === true,
    events: Array.isArray(input.events) && input.events.length ? input.events : ['tool_completed'],
    entryPoint: 'tool'
  });
  if (!result) return JSON.stringify({ ok: false, error: 'NOTIFICATION_HUB_RUNTIME_UNAVAILABLE' });
  return typeof result === 'string' ? result : JSON.stringify(result);
}
