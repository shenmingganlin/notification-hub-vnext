import { createChannelRuntime } from './channel-runtime.js';

function registryError(code, message, field) { return Object.assign(new Error(message), { code, details: field ? { field } : {} }); }
function text(field, value) { if (typeof value !== 'string' || !value.trim()) throw registryError('VISUAL_RUNTIME_CHANNEL_INVALID', `${field} must be a non-empty string`, field); return value.trim(); }

export function createRuntimeRegistry({ channelFactory = createChannelRuntime } = {}) {
  const channels = new Map();
  return {
    get size() { return channels.size; },
    getOrCreateChannel(input = {}) {
      const channelId = text('channelId', input.channelId);
      const existing = channels.get(channelId);
      if (existing) return existing;
      const channel = channelFactory({ ...input, channelId });
      channels.set(channelId, channel);
      return channel;
    },
    getChannel(channelId) { return channels.get(channelId) ?? null; },
    listChannelIds() { return [...channels.keys()]; },
    removeChannel(channelId) {
      if (!channels.has(channelId)) return false;
      channels.delete(channelId);
      return true;
    },
    removeIfEmpty(channelId) {
      const channel = channels.get(channelId);
      if (!channel) return false;
      if (channel.metrics().activeCardCount > 0) return false;
      channels.delete(channelId);
      return true;
    },
    metrics() {
      const result = { channelCount: channels.size, activeCardCount: 0, visibleCardCount: 0, queuedCardCount: 0, suppressedCardCount: 0 };
      for (const channel of channels.values()) {
        try {
          const metrics = channel.metrics();
          for (const key of ['activeCardCount', 'visibleCardCount', 'queuedCardCount', 'suppressedCardCount']) result[key] += Number(metrics[key] ?? 0);
        } catch { /* One broken channel cannot hide global metrics. */ }
      }
      return result;
    },
    forEach(callback) { for (const [channelId, channel] of channels) callback(channel, channelId); }
  };
}
