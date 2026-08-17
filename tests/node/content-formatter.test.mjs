import assert from 'node:assert/strict';
import test from 'node:test';

import { formatNotificationContent } from '../../plugin/domain/content-formatter.js';

const record = {
  notificationId: 'notification-content',
  traceId: 'trace-content',
  type: 'message',
  source: 'test',
  title: '标题',
  content: '这是一段用于测试的通知正文。它包含第二句话。'
};

test('ContentFormatter full mode uses defaults and preserves short content', () => {
  const result = formatNotificationContent({ record });

  assert.equal(result.mode, 'full');
  assert.equal(result.content, record.content);
  assert.equal(result.summary, record.content);
  assert.equal(result.truncated, false);
  assert.equal(result.redacted, false);
  assert.equal(result.originalLength, record.content.length);
  assert.equal(result.finalLength, record.content.length);
  assert.deepEqual(result.policy, { mode: 'full', maxLength: 4000 });
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.policy));
});

test('ContentFormatter accepts resolved Profile and explicit policy overrides', () => {
  const result = formatNotificationContent({
    record,
    profile: {
      profile: {
        contentPolicy: { mode: 'summary', maxLength: 12 }
      }
    },
    contentPolicy: { mode: 'full', maxLength: 10 }
  });

  assert.equal(result.mode, 'full');
  assert.equal(result.policy.maxLength, 10);
  assert.equal(result.content.length <= 10, true);
  assert.equal(result.truncated, true);
});

test('ContentFormatter truncates at a sentence or whitespace boundary and stays within limit', () => {
  const sentence = formatNotificationContent({
    record: { content: '第一句完整。第二句不应出现。' },
    contentPolicy: { mode: 'full', maxLength: 8 }
  });
  const whitespace = formatNotificationContent({
    record: { content: 'alpha beta gamma' },
    contentPolicy: { mode: 'full', maxLength: 10 }
  });

  assert.equal(sentence.content, '第一句完整。…');
  assert.equal(sentence.content.length <= 8, true);
  assert.equal(whitespace.content, 'alpha…');
  assert.equal(whitespace.content.length <= 10, true);
});

test('ContentFormatter does not mutate or freeze input values', () => {
  const inputRecord = { content: '原始正文' };
  const policy = { mode: 'full', maxLength: 20 };
  formatNotificationContent({ record: inputRecord, contentPolicy: policy });

  assert.equal(Object.isFrozen(inputRecord), false);
  assert.equal(Object.isFrozen(policy), false);
  assert.deepEqual(inputRecord, { content: '原始正文' });
  assert.deepEqual(policy, { mode: 'full', maxLength: 20 });
});

test('ContentFormatter summary mode keeps complete sentences before truncating', () => {
  const result = formatNotificationContent({
    record: { content: '第一句完成。第二句也很长，需要被截断。第三句不应出现。' },
    contentPolicy: { mode: 'summary', maxLength: 12 }
  });

  assert.equal(result.mode, 'summary');
  assert.equal(result.content, '第一句完成。');
  assert.equal(result.summary, result.content);
  assert.equal(result.truncated, true);
  assert.equal(result.redacted, false);
});

test('ContentFormatter redacted mode hides sensitive values and then truncates', () => {
  const result = formatNotificationContent({
    record: {
      content: 'path=C:\\Users\\Ganlin\\Desktop\\file.txt password=secret123 token: abc123 Bearer xyz api_key=key-value'
    },
    contentPolicy: { mode: 'redacted', maxLength: 80 }
  });

  assert.equal(result.mode, 'redacted');
  assert.equal(result.redacted, true);
  assert.equal(result.content.includes('secret123'), false);
  assert.equal(result.content.includes('abc123'), false);
  assert.equal(result.content.includes('C:\\Users\\[REDACTED]\\'), true);
  assert.equal(result.content.length <= 80, true);
});

test('ContentFormatter redaction leaves safe content unchanged and does not mutate policy inputs', () => {
  const inputRecord = { content: 'safe content' };
  const profile = { profile: { contentPolicy: { mode: 'redacted', maxLength: 100 } } };
  const result = formatNotificationContent({ record: inputRecord, profile });

  assert.equal(result.redacted, false);
  assert.equal(result.content, 'safe content');
  assert.deepEqual(inputRecord, { content: 'safe content' });
  assert.deepEqual(profile, { profile: { contentPolicy: { mode: 'redacted', maxLength: 100 } } });
});

test('ContentFormatter rejects invalid record, mode, and maxLength', () => {
  assert.throws(
    () => formatNotificationContent({ record: {} }),
    (error) => error.code === 'CONTENT_FORMATTER_RECORD_INVALID'
      && error.details.field === 'record.content'
  );
  assert.throws(
    () => formatNotificationContent({ record, contentPolicy: { mode: 'unknown' } }),
    (error) => error.code === 'CONTENT_FORMATTER_MODE_INVALID'
      && error.details.field === 'contentPolicy.mode'
  );
  assert.throws(
    () => formatNotificationContent({ record, contentPolicy: { maxLength: 0 } }),
    (error) => error.code === 'CONTENT_FORMATTER_MAX_LENGTH_INVALID'
      && error.details.field === 'contentPolicy.maxLength'
  );
});
