// 视觉方案 v1 → v2 迁移：把「卡片种类 = 外观＋出现方式打包」拆成两条正交轴。
// 决策见 docs/adr/ADR-002-card-type-behavior-axis.md。
//
// v1 形态： card = { activeType: 'minimal'|'danmaku'|'popup', types: { ...含 behavior stub } }
// v2 形态： profile.behaviorId 承载出现方式轴；card.activeType 只承载内容结构轴，types 不含 behavior。

export const VISUAL_PROFILE_LEGACY_VERSION = 1;

// 旧「模式」id → 规范出现方式 id。danmaku 收敛为 ticker。
export const LEGACY_MODE_TO_BEHAVIOR = Object.freeze({
  danmaku: 'ticker',
  ticker: 'ticker',
  popup: 'popup'
});

// 旧的「模式」id 都映射到唯一已实现的内容结构种类。
const LEGACY_MODE_CARD_TYPE = 'minimal';

function isPlain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function stripBehavior(typeConfig) {
  if (!isPlain(typeConfig)) return {};
  const { behavior, ...rest } = typeConfig;
  return rest;
}

// 把一个 v1 的 card 配置升级为 v2：抽出被揉进 kinds 的出现方式，并收敛到单一内容结构种类。
function migrateCard(cardInput) {
  const card = isPlain(cardInput) ? cardInput : {};
  const legacyType = typeof card.activeType === 'string' ? card.activeType : 'minimal';
  const behaviorId = LEGACY_MODE_TO_BEHAVIOR[legacyType] ?? null;
  const sourceTypes = isPlain(card.types) ? card.types : {};

  // 旧模式自己的那套外观优先（它才是用户当前在编辑的东西），否则退回 minimal。
  const activeLegacyConfig = isPlain(sourceTypes[legacyType]) ? sourceTypes[legacyType] : null;
  const minimalConfig = isPlain(sourceTypes.minimal) ? sourceTypes.minimal : null;

  const types = {};
  if (minimalConfig || activeLegacyConfig) {
    types[LEGACY_MODE_CARD_TYPE] = {
      ...stripBehavior(minimalConfig ?? {}),
      ...stripBehavior(activeLegacyConfig ?? {})
    };
  }

  return {
    card: {
      ...card,
      activeType: LEGACY_MODE_CARD_TYPE,
      types
    },
    behaviorId,
    migratedFrom: legacyType
  };
}

/**
 * 纯函数：把 v1 的视觉方案输入升级为 v2 形态。
 * 幂等：输入已是 v2（version === 2）时原样返回。
 * 不抛错：无法识别的旧值保留原文，并在 notes 中记录，交给上层诊断。
 */
export function migrateVisualProfileV1ToV2(input = {}) {
  if (!isPlain(input)) return { profile: input, migrated: false, notes: ['migration.input-not-plain'] };
  if (input.version === 2) return { profile: input, migrated: false, notes: [] };

  const notes = [];
  const { card, behaviorId, migratedFrom } = migrateCard(input.card);

  const visualProfiles = isPlain(input.visualProfiles)
    ? Object.fromEntries(Object.entries(input.visualProfiles).map(([id, strategy]) => {
        if (!isPlain(strategy)) return [id, strategy];
        if (!isPlain(strategy.card)) return [id, strategy];
        return [id, { ...strategy, card: migrateCard(strategy.card).card }];
      }))
    : input.visualProfiles;

  const resolvedBehaviorId = typeof input.behaviorId === 'string' && input.behaviorId
    ? input.behaviorId
    : (behaviorId ?? 'stack');

  if (!behaviorId && migratedFrom !== 'minimal') notes.push(`migration.unknown-mode:${migratedFrom}`);

  const profile = {
    ...input,
    version: 2,
    behaviorId: resolvedBehaviorId,
    card
  };
  // 仅在原输入确实携带 visualProfiles 时写回，避免凭空引入 undefined 键。
  if (input.visualProfiles !== undefined) profile.visualProfiles = visualProfiles;

  return { profile, migrated: true, notes };
}

/** 按版本号分派迁移；已是当前版本则原样返回。 */
export function migrateVisualProfile(input = {}, currentVersion = 2) {
  if (!isPlain(input)) return { profile: input, migrated: false, notes: [] };
  if (input.version === currentVersion) return { profile: input, migrated: false, notes: [] };
  if (input.version === VISUAL_PROFILE_LEGACY_VERSION || input.version === undefined) {
    return migrateVisualProfileV1ToV2(input);
  }
  return { profile: input, migrated: false, notes: [`migration.unsupported-version:${input.version}`] };
}
