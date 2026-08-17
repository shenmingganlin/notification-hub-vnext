import assert from 'node:assert/strict';
import test from 'node:test';
import { filterNotificationsByEvents } from '../../plugin/domain/notification-event-filter.js';

test('other error event excludes tool errors when both facets are present', () => {
  const records = [
    { notificationId: 'tool', type: 'tool_error', source: 'hana.tool' },
    { notificationId: 'generic', type: 'error', source: 'hana.system' }
  ];
  assert.deepEqual(filterNotificationsByEvents(records, ['error']).map((record) => record.notificationId), ['generic']);
  assert.deepEqual(filterNotificationsByEvents(records, ['tool_error']).map((record) => record.notificationId), ['tool']);
});
