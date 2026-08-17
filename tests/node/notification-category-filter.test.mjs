import assert from 'node:assert/strict';
import test from 'node:test';

import { filterNotificationsByCategories } from '../../plugin/domain/notification-category-filter.js';
import { createNotificationRecord } from '../../plugin/domain/notification-record.js';

function record(notificationId, input = {}) {
  return createNotificationRecord({
    notificationId,
    traceId: `trace-${notificationId}`,
    type: 'assistant_message',
    source: 'hana.session',
    title: notificationId,
    content: notificationId,
    ...input
  });
}

const chatRecord = record('chat-record', {
  channel: { kind: 'chat' }
});
const errorRecord = record('error-record', {
  type: 'tool_error',
  source: 'hana.tool'
});
const comboRecord = record('combo-record', {
  type: 'tool_error',
  source: 'plugin.event',
  channel: { kind: 'feishu' },
  producer: { kind: 'api', id: 'plugin-a' }
});


test('category filter selects records matching all requested labels', () => {
  const records = [chatRecord, errorRecord, comboRecord];

  assert.deepEqual(
    filterNotificationsByCategories(records, ['channel', 'tool', 'error', 'external_call'], { match: 'all' })
      .map((item) => item.notificationId),
    ['combo-record']
  );
  assert.deepEqual(
    filterNotificationsByCategories(records, ['chat', 'error'], { match: 'all' }),
    []
  );
});

test('category filter selects records matching any requested label', () => {
  const records = [chatRecord, errorRecord, comboRecord];

  assert.deepEqual(
    filterNotificationsByCategories(records, ['error']).map((item) => item.notificationId),
    ['error-record', 'combo-record']
  );
  assert.deepEqual(
    filterNotificationsByCategories(records, ['chat', 'external_call']).map((item) => item.notificationId),
    ['chat-record', 'combo-record']
  );
});

test('category filter validates categories and preserves records', () => {
  const records = [chatRecord, errorRecord, comboRecord];
  assert.throws(
    () => filterNotificationsByCategories(records, ['unknown']),
    (error) => error.code === 'NOTIFICATION_CATEGORY_FILTER_INVALID'
      && error.details.field === 'categories'
  );
  assert.throws(
    () => filterNotificationsByCategories(records, []),
    (error) => error.code === 'NOTIFICATION_CATEGORY_FILTER_INVALID'
      && error.details.field === 'categories'
  );
  assert.throws(
    () => filterNotificationsByCategories(records, ['error'], { match: 'invalid' }),
    (error) => error.code === 'NOTIFICATION_CATEGORY_FILTER_MATCH_INVALID'
      && error.details.field === 'match'
  );
  assert.deepEqual(records, [chatRecord, errorRecord, comboRecord]);
  assert.deepEqual(records[2].channel, { kind: 'feishu' });
});
