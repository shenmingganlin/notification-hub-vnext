import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyNotificationImportance,
  createImportanceSettings,
  importanceDetails,
  legacyImportanceToClass,
  resolveNotificationImportance
} from '../../plugin/domain/notification-importance.js';

test('importance defaults to normal and becomes important on keyword match', () => {
  assert.equal(resolveNotificationImportance({ content: '普通消息', settings: { keywords: ['验证码'] } }), 'normal');
  assert.equal(resolveNotificationImportance({ content: '验证码是 1234', settings: { keywords: ['验证码'] } }), 'important');
  assert.deepEqual(classifyNotificationImportance({ content: '授权码已生成', keywords: ['授权码'] }), {
    value: 'important',
    matchedKeywords: ['授权码']
  });
});

test('legacy multi-level importance is reduced to the user-facing binary class', () => {
  assert.equal(legacyImportanceToClass('low'), 'normal');
  assert.equal(legacyImportanceToClass('normal'), 'normal');
  assert.equal(legacyImportanceToClass('high'), 'important');
  assert.equal(legacyImportanceToClass('critical'), 'important');
  assert.equal(resolveNotificationImportance({ content: '普通消息', explicitImportance: 'critical' }), 'important');
  assert.equal(resolveNotificationImportance({ content: '普通消息', explicitImportance: 'low' }), 'normal');
});

test('importance settings normalize, deduplicate, and reject unsafe values', () => {
  assert.deepEqual(createImportanceSettings({ keywords: [' 验证码 ', '验证码'] }), { keywords: ['验证码'] });
  assert.throws(() => createImportanceSettings({ keywords: [''] }), (error) => error.code === 'NOTIFICATION_IMPORTANCE_KEYWORD_INVALID');
  assert.throws(() => createImportanceSettings({ keywords: '验证码' }), (error) => error.code === 'NOTIFICATION_IMPORTANCE_KEYWORDS_INVALID');
  assert.deepEqual(importanceDetails({ content: '普通消息', settings: { keywords: ['验证码'] }, explicitImportance: 'high' }), {
    value: 'important',
    matchedKeywords: [],
    legacyValue: 'high'
  });
});
