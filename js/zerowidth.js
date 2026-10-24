export function encodeInvisible(bytes) {
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  return '\u2063' + [...bits].map(bit => bit === '0' ? '\u200b' : '\u200c').join('') + '\u2064';
}

function findPayload(text) {
  const start = text.indexOf('\u2063');
  const end = text.indexOf('\u2064', start + 1);
  if (start < 0 || end < 0 || end <= start) return null;
  return {start, end, byteLength: (end - start - 1) / 8};
}

export function decodeInvisiblePrefix(text, byteLength) {
  const payload = findPayload(text);
  const bitLength = byteLength * 8;
  if (!payload || !Number.isSafeInteger(byteLength) || byteLength < 0 || payload.end - payload.start - 1 < bitLength) return null;
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < bitLength; i += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit++) {
      const character = text[payload.start + 1 + i + bit];
      if (character !== '\u200b' && character !== '\u200c') return null;
      byte = (byte << 1) | (character === '\u200c' ? 1 : 0);
    }
    bytes[i / 8] = byte;
  }
  return bytes;
}

export function invisibleByteLength(text) {
  const payload = findPayload(text);
  return payload && Number.isInteger(payload.byteLength) ? payload.byteLength : null;
}

export function decodeInvisible(text) {
  const byteLength = invisibleByteLength(text);
  if (byteLength === null) return null;
  const payload = findPayload(text);
  if (!payload) return null;
  const hidden = text.slice(payload.start + 1, payload.end);
  if (!hidden.length || /[^\u200b\u200c]/u.test(hidden)) return null;
  return decodeInvisiblePrefix(text, byteLength);
}
