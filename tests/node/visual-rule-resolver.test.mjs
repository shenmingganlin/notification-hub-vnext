import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveVisualRule, resolveVisualRuleSafe } from '../../plugin/domain/visual-rule-resolver.js';

const card = {
  cardType: 'minimal',
  behavior: { layout: 'simple', boundary: 'work-area' },
  appearance: { size: 'medium', aspectRatio: 'default', backgroundColor: '#0e1916', backgroundFit: 'fill', backgroundPadding: 0, borderRadius: 16, opacity: 0.96 }
};

const profile = {
  global: { enabled: true, preset: 'minimal', intensity: 'balanced' },
  categories: {
    chat: { enabled: true, preset: 'soft', intensity: 'balanced' },
    error: { enabled: true, preset: 'warning', intensity: 'expressive' },
    tool: { enabled: true, preset: 'accent', intensity: 'balanced' }
  }
};

test('visual event rule overrides category preset and intensity', () => {
  const result = resolveVisualRule({
    visualInput: { labels: ['tool'], categoryId: 'tool', eventId: 'tool.execution.failed', visualRulePreset: 'critical', visualRuleIntensity: 'expressive', status: 'failed', importance: 'normal' },
    profile
  });
  assert.equal(result.preset, 'critical');
  assert.equal(result.intensity, 'expressive');
});

test('visual resolver selects one deterministic category and critical override', () => {
  const result = resolveVisualRule({
    visualInput: { labels: ['tool', 'error'], status: 'failed', importance: 'critical' },
    profile
  });
  assert.deepEqual(result, {
    enabled: true,
    preset: 'critical',
    intensity: 'expressive',
    category: 'error',
    matchedBy: 'critical',
    reason: 'critical-override',
    ...card
  });
});

test('event visual profile wins over legacy label priority', () => {
  const result = resolveVisualRule({
    visualInput: {
      labels: ['error', 'tool'],
      categoryId: 'tool',
      visualProfileId: 'visual.tool.success',
      status: 'completed',
      importance: 'normal'
    },
    profile: {
      ...profile,
      visualProfiles: {
        'visual.tool.success': { preset: 'critical', intensity: 'expressive' }
      }
    }
  });
  assert.deepEqual(result, {
    enabled: true,
    preset: 'critical',
    intensity: 'expressive',
    category: 'tool',
    matchedBy: 'presentation-profile',
    reason: 'presentation-profile',
    ...card
  });
});

test('unknown visual profile falls back to legacy category selection with a reason', () => {
  const result = resolveVisualRule({
    visualInput: {
      labels: ['error', 'tool'],
      visualProfileId: 'visual.missing',
      status: 'failed',
      importance: 'normal'
    },
    profile
  });
  assert.equal(result.category, 'error');
  assert.equal(result.matchedBy, 'category');
  assert.equal(result.fallbackReason, 'unknown-visual-profile');
});

test('invalid visual profile id safely falls back without throwing', () => {
  const result = resolveVisualRule({
    visualInput: {
      labels: ['tool'],
      visualProfileId: '../invalid',
      status: 'failed',
      importance: 'normal'
    },
    profile
  });
  assert.equal(result.category, 'tool');
  assert.equal(result.fallbackReason, 'invalid-visual-profile-id');
});

test('visual resolver selects category policy for ordinary notifications', () => {
  const result = resolveVisualRule({
    visualInput: { labels: ['tool', 'chat'], status: 'classified', importance: 'normal' },
    profile
  });
  assert.deepEqual(result, {
    enabled: true,
    preset: 'accent',
    intensity: 'balanced',
    category: 'tool',
    matchedBy: 'category',
    reason: 'category-policy',
    ...card
  });
});

test('global visual disablement is absolute', () => {
  const result = resolveVisualRule({
    visualInput: { labels: ['error'], status: 'failed', importance: 'critical' },
    profile,
    context: { globalEnabled: false }
  });
  assert.deepEqual(result, {
    enabled: false,
    preset: 'minimal',
    intensity: 'reduced',
    category: null,
    matchedBy: 'global',
    reason: 'global-disabled',
    ...card
  });
});

test('visual resolver safely falls back for invalid input or profile', () => {
  const result = resolveVisualRuleSafe({
    visualInput: { labels: ['error'], status: 'failed', importance: 'normal' },
    profile: { global: { preset: 'invalid' } }
  });
  assert.deepEqual(result, {
    enabled: true,
    preset: 'minimal',
    intensity: 'balanced',
    category: null,
    matchedBy: 'fallback',
    reason: 'fallback-invalid-profile',
    cardType: 'minimal',
    behavior: { layout: 'simple', boundary: 'work-area' },
    appearance: { size: 'medium', aspectRatio: 'default', backgroundColor: '#0e1916', borderRadius: 16, opacity: 0.96 }
  });
  assert.ok(Object.isFrozen(result));
});
