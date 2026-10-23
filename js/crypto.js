export const HEADER_SIZE = 36;
const ITERATIONS = 310000;
const encoder = new TextEncoder();

export function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const raw = await crypto.subtle.deriveBits({name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256'}, material, 256);
  const key = await crypto.subtle.importKey('raw', raw, {name: 'AES-GCM'}, false, ['encrypt', 'decrypt']);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', raw));
  const seed = new DataView(digest.buffer).getUint32(0, false) || 0x6d2b79f5;
  const fingerprint = [...digest.subarray(0, 6)].map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  return {key, seed, fingerprint};
}

export async function encryptBytes(password, plaintext) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const {key, seed} = await deriveKey(password, salt);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, plaintext));
  return {salt, iv, ciphertext, seed, key};
}

export async function decryptBytes(password, salt, iv, ciphertext) {
  const {key, seed} = await deriveKey(password, salt);
  const plaintext = await decryptWithKey(key, iv, ciphertext);
  return {plaintext, seed};
}

export async function decryptWithKey(key, iv, ciphertext) {
  return new Uint8Array(await crypto.subtle.decrypt({name: 'AES-GCM', iv}, key, ciphertext));
}

export function makeHeader(salt, iv, cipherLength) {
  const header = new Uint8Array(HEADER_SIZE);
  header.set([0x57, 0x50, 0x58, 0x32], 0);
  header.set(salt, 4);
  header.set(iv, 20);
  new DataView(header.buffer).setUint32(32, cipherLength);
  return header;
}

export function parseHeader(header) {
  if (header.length !== HEADER_SIZE || header[0] !== 0x57 || header[1] !== 0x50 || header[2] !== 0x58 || header[3] !== 0x32) return null;
  const length = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(32);
  if (length < 16 || length > 64 * 1024 * 1024) throw new Error('The image contains an invalid or damaged Whisper Pixels header.');
  return {salt: header.slice(4, 20), iv: header.slice(20, 32), length};
}
