import { extname } from 'node:path';

const MAX_BYTES = 32 * 1024 * 1024;
const TTF_SFNT = Buffer.from([0x00, 0x01, 0x00, 0x00]);
const TTF_TRUE = Buffer.from('true');
const OTF_OTTO = Buffer.from('OTTO');
const TTC_TTCF = Buffer.from('ttcf');
const WOFF = Buffer.from('wOFF');
const WOFF2 = Buffer.from('wOF2');
const EXTENSIONS = Object.freeze({ ttf: 'ttf', otf: 'otf' });

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

function extension(fileName) {
  const value = EXTENSIONS[extname(String(fileName ?? '')).slice(1).toLowerCase()];
  if (!value) throw fail('FONT_ASSET_FORMAT_UNSUPPORTED', 'Only TTF and OTF assets are supported');
  return value;
}

function signature(buffer) {
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(TTF_SFNT)) return 'ttf';
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(TTF_TRUE)) return 'ttf';
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(OTF_OTTO)) return 'otf';
  if (buffer.length >= 4 && (buffer.subarray(0, 4).equals(TTC_TTCF) || buffer.subarray(0, 4).equals(WOFF) || buffer.subarray(0, 4).equals(WOFF2))) {
    throw fail('FONT_ASSET_FORMAT_UNSUPPORTED', 'TTC and WOFF fonts are not supported');
  }
  throw fail('FONT_ASSET_HEADER_INVALID', 'Font signature is not supported');
}

function utf16be(buffer) {
  if (buffer.length < 2 || buffer.length % 2 !== 0) return '';
  const swapped = Buffer.allocUnsafe(buffer.length);
  for (let offset = 0; offset < buffer.length; offset += 2) {
    swapped[offset] = buffer[offset + 1];
    swapped[offset + 1] = buffer[offset];
  }
  return swapped.toString('utf16le').replace(/\u0000+$/g, '').trim();
}

function decodeName(platformId, encodingId, bytes) {
  if (platformId === 3 && (encodingId === 1 || encodingId === 10)) return utf16be(bytes);
  if (platformId === 0) return utf16be(bytes);
  return bytes.toString('latin1').replace(/\u0000+$/g, '').trim();
}

function scoreName(platformId, encodingId, languageId, nameId) {
  const windowsUnicode = platformId === 3 && (encodingId === 1 || encodingId === 10);
  let score = 0;
  if (nameId === 4) score += windowsUnicode ? 400 : 200;
  else if (nameId === 1) score += windowsUnicode ? 300 : 100;
  else return -1;
  if (languageId === 0x0804) score += 20;
  else if (languageId === 0x0409) score += 10;
  return score;
}

function readFamilyName(buffer) {
  if (buffer.length < 12) return '';
  const numTables = buffer.readUInt16BE(4);
  let nameOffset = 0;
  let nameLength = 0;
  for (let index = 0; index < numTables; index += 1) {
    const record = 12 + index * 16;
    if (record + 16 > buffer.length) return '';
    if (buffer.toString('ascii', record, record + 4) !== 'name') continue;
    nameOffset = buffer.readUInt32BE(record + 8);
    nameLength = buffer.readUInt32BE(record + 12);
    break;
  }
  if (!nameLength || nameOffset + 6 > buffer.length) return '';
  const end = Math.min(buffer.length, nameOffset + nameLength);
  const format = buffer.readUInt16BE(nameOffset);
  if (format !== 0 && format !== 1) return '';
  const count = buffer.readUInt16BE(nameOffset + 2);
  const stringOffset = buffer.readUInt16BE(nameOffset + 4);
  let best = '';
  let bestScore = -1;
  for (let index = 0; index < count; index += 1) {
    const record = nameOffset + 6 + index * 12;
    if (record + 12 > end) break;
    const platformId = buffer.readUInt16BE(record);
    const encodingId = buffer.readUInt16BE(record + 2);
    const languageId = buffer.readUInt16BE(record + 4);
    const nameId = buffer.readUInt16BE(record + 6);
    const length = buffer.readUInt16BE(record + 8);
    const offset = buffer.readUInt16BE(record + 10);
    const score = scoreName(platformId, encodingId, languageId, nameId);
    if (score < 0 || score <= bestScore) continue;
    const start = nameOffset + stringOffset + offset;
    if (start < 0 || start + length > end) continue;
    const decoded = decodeName(platformId, encodingId, buffer.subarray(start, start + length));
    if (!decoded) continue;
    best = decoded;
    bestScore = score;
  }
  return best;
}

function displayNameFromFile(fileName) {
  const base = String(fileName ?? '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '').trim();
  return base;
}

export function inspectFontAssetBuffer(buffer, fileName) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw fail('FONT_ASSET_DATA_INVALID', 'Asset data must be a non-empty Buffer');
  if (buffer.length > MAX_BYTES) throw fail('FONT_ASSET_TOO_LARGE', 'Font exceeds the 32MB limit');
  const expected = extension(fileName);
  const format = signature(buffer);
  if (format !== expected) throw fail('FONT_ASSET_EXTENSION_MISMATCH', 'File extension does not match detected format');
  const familyName = readFamilyName(buffer) || displayNameFromFile(fileName);
  return Object.freeze({ format, familyName });
}
