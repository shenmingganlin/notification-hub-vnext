function builderError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function createVisualRuntimeCardBuilder({ buildCard } = {}) {
  if (typeof buildCard !== 'function') {
    throw builderError('VISUAL_RUNTIME_CARD_BUILDER_INVALID', 'buildCard must be a function');
  }
  return Object.freeze({
    build(input = {}) {
      if (!input.record?.notificationId) throw builderError('VISUAL_RUNTIME_CARD_RECORD_INVALID', 'record.notificationId is required');
      if (!input.health || !input.layout) throw builderError('VISUAL_RUNTIME_CARD_CONTEXT_INVALID', 'health and layout are required');
      return buildCard(input);
    }
  });
}
