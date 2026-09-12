export const name = 'notification-hub-vnext_notification-hub-run-test';
export const description = '通过 /notification-hub-run-test 命令生成可追踪的命令事件卡片；仅用于验收。';
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

function parseCommandInput(input) {
  if (input && typeof input === 'object' && !Array.isArray(input)) return input;
  if (typeof input !== 'string' || !input.trim()) return {};
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return { label: input.trim().slice(0, 80) };
  }
}

export async function handler(context = {}) {
  const input = parseCommandInput(context.args);
  const result = await context.hub?.eventBus?.request?.('notification-hub-vnext.run-test', {
    ...input,
    playSound: input.playSound === true,
    events: ['tool_completed'],
    entryPoint: 'command'
  });
  if (!result) return { reply: JSON.stringify({ ok: false, error: 'NOTIFICATION_HUB_RUNTIME_UNAVAILABLE' }) };
  return { reply: typeof result === 'string' ? result : JSON.stringify(result) };
}
