function utf16be(text) {
  const buf = Buffer.alloc(text.length * 2);
  for (let i = 0; i < text.length; i += 1) buf.writeUInt16BE(text.charCodeAt(i), i * 2);
  return buf;
}

export function ttfNamed(fullName = 'Test Family', familyName = 'Test Family') {
  const full = utf16be(fullName);
  const family = utf16be(familyName);
  const count = 2;
  const stringOffset = 6 + count * 12;
  const nameBody = Buffer.alloc(stringOffset + full.length + family.length);
  nameBody.writeUInt16BE(0, 0);
  nameBody.writeUInt16BE(count, 2);
  nameBody.writeUInt16BE(stringOffset, 4);
  nameBody.writeUInt16BE(3, 6);
  nameBody.writeUInt16BE(1, 8);
  nameBody.writeUInt16BE(0x0409, 10);
  nameBody.writeUInt16BE(4, 12);
  nameBody.writeUInt16BE(full.length, 14);
  nameBody.writeUInt16BE(0, 16);
  nameBody.writeUInt16BE(3, 18);
  nameBody.writeUInt16BE(1, 20);
  nameBody.writeUInt16BE(0x0409, 22);
  nameBody.writeUInt16BE(1, 24);
  nameBody.writeUInt16BE(family.length, 26);
  nameBody.writeUInt16BE(full.length, 28);
  full.copy(nameBody, stringOffset);
  family.copy(nameBody, stringOffset + full.length);
  const header = Buffer.alloc(28);
  header.writeUInt32BE(0x00010000, 0);
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(16, 6);
  header.write('name', 12);
  header.writeUInt32BE(28, 20);
  header.writeUInt32BE(nameBody.length, 24);
  return Buffer.concat([header, nameBody]);
}

export function otfNamed(name = 'Otto Family') {
  const ttf = ttfNamed(name, name);
  ttf.write('OTTO', 0);
  return ttf;
}
