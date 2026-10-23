export function encodeInvisible(bytes) {
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  return '\u2063' + [...bits].map(bit => bit === '0' ? '\u200b' : '\u200c').join('') + '\u2064';
}

export function decodeInvisible(text) {
  const start = text.indexOf('\u2063');
  const end = text.indexOf('\u2064', start + 1);
  if (start < 0 || end < 0 || end <= start) return null;
  const hidden = text.slice(start + 1, end);
  if (!hidden.length || hidden.length % 8 !== 0 || /[^\u200b\u200c]/u.test(hidden)) return null;
  const bytes = new Uint8Array(hidden.length / 8);
  for (let i = 0; i < hidden.length; i += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit++) byte = (byte << 1) | (hidden[i + bit] === '\u200c' ? 1 : 0);
    bytes[i / 8] = byte;
  }
  return bytes;
}
