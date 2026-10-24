export const HEADER_SIZE = 36;
export const CURRENT_ITERATIONS = 600000;
export const LEGACY_ITERATIONS = 310000;
export const MAX_HINT_BYTES = 256;
const HEADER_V3_BASE_SIZE = 38;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal: true});

export function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function deriveKey(password, salt, iterations = CURRENT_ITERATIONS) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const raw = await crypto.subtle.deriveBits({name: 'PBKDF2', salt, iterations, hash: 'SHA-256'}, material, 256);
  const key = await crypto.subtle.importKey('raw', raw, {name: 'AES-GCM'}, false, ['encrypt', 'decrypt']);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', raw));
  const seed = new DataView(digest.buffer).getUint32(0, false) || 0x6d2b79f5;
  const fingerprint = [...digest.subarray(0, 6)].map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  return {key, seed, fingerprint};
}

export async function encryptBytes(password, plaintext, additionalData = null, salt = randomBytes(16), iv = randomBytes(12)) {
  const {key, seed} = await deriveKey(password, salt);
  const parameters = {name: 'AES-GCM', iv};
  if (additionalData) parameters.additionalData = additionalData;
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(parameters, key, plaintext));
  return {salt, iv, ciphertext, seed, key};
}

export async function decryptBytes(password, salt, iv, ciphertext, additionalData = null, iterations = CURRENT_ITERATIONS) {
  const {key, seed} = await deriveKey(password, salt, iterations);
  const plaintext = await decryptWithKey(key, iv, ciphertext, additionalData);
  return {plaintext, seed};
}

export async function decryptWithKey(key, iv, ciphertext, additionalData = null) {
  const parameters = {name: 'AES-GCM', iv};
  if (additionalData) parameters.additionalData = additionalData;
  return new Uint8Array(await crypto.subtle.decrypt(parameters, key, ciphertext));
}

export function makeHeader(salt, iv, cipherLength, hint = '') {
  const hintBytes = encoder.encode(hint);
  if (hintBytes.length > MAX_HINT_BYTES) throw new Error(`Hints must be ${MAX_HINT_BYTES} UTF-8 bytes or fewer.`);
  const header = new Uint8Array(HEADER_V3_BASE_SIZE + hintBytes.length);
  header.set([0x57, 0x50, 0x58, 0x33], 0);
  header.set(salt, 4);
  header.set(iv, 20);
  new DataView(header.buffer).setUint32(32, cipherLength);
  new DataView(header.buffer).setUint16(36, hintBytes.length);
  header.set(hintBytes, HEADER_V3_BASE_SIZE);
  return header;
}

export function makeLegacyHeader(salt, iv, cipherLength) {
  const header = new Uint8Array(HEADER_SIZE);
  header.set([0x57, 0x50, 0x58, 0x32], 0);
  header.set(salt, 4);
  header.set(iv, 20);
  new DataView(header.buffer).setUint32(32, cipherLength);
  return header;
}

export function headerSizeFromPrefix(prefix) {
  if (prefix.length < 4 || prefix[0] !== 0x57 || prefix[1] !== 0x50 || prefix[2] !== 0x58) return null;
  if (prefix[3] === 0x32) return HEADER_SIZE;
  if (prefix[3] !== 0x33) throw new Error('This Whisper Pixels payload uses an unsupported format version.');
  if (prefix.length < HEADER_V3_BASE_SIZE) throw new Error('The Whisper Pixels header is incomplete.');
  const hintLength = new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength).getUint16(36);
  if (hintLength > MAX_HINT_BYTES) throw new Error('The Whisper Pixels hint is too long or the header is damaged.');
  return HEADER_V3_BASE_SIZE + hintLength;
}

export function parseHeader(header) {
  const expectedSize = headerSizeFromPrefix(header);
  if (expectedSize === null) return null;
  if (header.length !== expectedSize) throw new Error('The Whisper Pixels header is incomplete or damaged.');
  const length = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(32);
  if (length < 16 || length > 64 * 1024 * 1024) throw new Error('The image contains an invalid or damaged Whisper Pixels header.');
  const version = header[3] === 0x32 ? 2 : 3;
  const hint = version === 3 ? decoder.decode(header.subarray(HEADER_V3_BASE_SIZE)) : '';
  return {
    version,
    salt: header.slice(4, 20),
    iv: header.slice(20, 32),
    length,
    hint,
    bytes: header.slice()
  };
}
