const SUPPORTED_BEHAVIORS = new Set(['stack']);
const SUPPORTED_OVERFLOW = new Set(['allow', 'queue', 'drop-oldest']);
function adapterError(code, message, details = {}) { return Object.assign(new Error(message), { code, details }); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function canTakeover(input = {}) {
  const behaviorId = input.behaviorId;
  const policy = input.policy ?? {};
  if (!SUPPORTED_BEHAVIORS.has(behaviorId)) return { ok: false, code: 'VISUAL_RUNTIME_TAKEOVER_POLICY_UNSUPPORTED', reason: 'behavior' };
  if (!SUPPORTED_OVERFLOW.has(policy.overflow ?? 'allow')) return { ok: false, code: 'VISUAL_RUNTIME_TAKEOVER_POLICY_UNSUPPORTED', reason: 'overflow' };
  if (policy.suppression === 'aggressive') return { ok: false, code: 'VISUAL_RUNTIME_TAKEOVER_POLICY_UNSUPPORTED', reason: 'suppression' };
  return { ok: true };
}
export function createVisualRuntimeTakeoverAdapter({ request } = {}) {
  return {
    canTakeover,
    async create({ channelId, behaviorId, policy, card, nativePayload } = {}) {
      const support = canTakeover({ behaviorId, policy });
      if (!support.ok) return { decision: 'rollback', code: support.code, reason: support.reason };
      if (!nativePayload || typeof nativePayload !== 'object') return { decision: 'rollback', code: 'VISUAL_RUNTIME_TAKEOVER_PAYLOAD_INVALID' };
      const payload = clone(nativePayload);
      payload.behavior = { ...(payload.behavior ?? {}), behaviorProfileId: behaviorId, behaviorChannelId: channelId };
      if (card?.visualProfileId && payload.presentation) payload.presentation.visualProfileId = card.visualProfileId;
      try {
        if (typeof request !== 'function') return { decision: 'rollback', code: 'VISUAL_RUNTIME_TAKEOVER_REQUEST_UNAVAILABLE', reason: 'request-unavailable' };
        const response = await request('scene.create', payload);
        return { decision: 'created', status: 'created', response: response?.result ?? response?.payload?.result ?? null, payload };
      } catch (error) {
        return { decision: 'rollback', code: error?.code ?? 'VISUAL_RUNTIME_TAKEOVER_NATIVE_FAILED', reason: 'native-create-failed' };
      }
    }
  };
}
