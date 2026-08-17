const INTERNAL_BLOCK_PATTERN = /<(reflect(?:ion)?|thinking)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

function cloneRecord(record, patch) {
  return Object.freeze({ ...record, ...patch });
}

export function stripInternalReflectionBlocks(value) {
  return String(value ?? '').replace(INTERNAL_BLOCK_PATTERN, '').trim();
}

export function sanitizeNotificationRecordForDisplay(record) {
  if (!record || typeof record !== 'object') return null;
  const content = stripInternalReflectionBlocks(record.content);
  const summary = record.summary === null || record.summary === undefined
    ? record.summary
    : stripInternalReflectionBlocks(record.summary);
  const hasInternalBlock = /<(reflect(?:ion)?|thinking)\b[^>]*>[\s\S]*?<\/\1\s*>/i.test(String(record.content ?? ''))
    || (typeof record.summary === 'string'
      && /<(reflect(?:ion)?|thinking)\b[^>]*>[\s\S]*?<\/\1\s*>/i.test(record.summary));

  if (!hasInternalBlock) return record;
  if (!content && !summary) return null;
  return cloneRecord(record, {
    content,
    summary: summary || null
  });
}

export function filterVisibleNotificationRecords(records) {
  if (!Array.isArray(records)) return [];
  return records.map(sanitizeNotificationRecordForDisplay).filter(Boolean);
}
