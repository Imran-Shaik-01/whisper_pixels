import assert from 'node:assert/strict';
import test from 'node:test';
import {CURRENT_ITERATIONS, LEGACY_ITERATIONS, decryptBytes, deriveKey, encryptBytes, makeHeader, makeLegacyHeader, parseHeader} from '../js/crypto.js';

test('AES-GCM encrypts and authenticates bytes with the right password', async () => {
  const original = new TextEncoder().encode('private message ✓');
  const encrypted = await encryptBytes('correct horse battery staple!', original);
  const decrypted = await decryptBytes('correct horse battery staple!', encrypted.salt, encrypted.iv, encrypted.ciphertext);

  assert.deepEqual(decrypted.plaintext, original);
  assert.equal(decrypted.seed, encrypted.seed);
});

test('AES-GCM rejects a wrong password', async () => {
  const encrypted = await encryptBytes('correct password', new Uint8Array([1, 2, 3]));

  await assert.rejects(
    decryptBytes('incorrect password', encrypted.salt, encrypted.iv, encrypted.ciphertext),
    {name: 'OperationError'}
  );
});

test('binary header round-trips and rejects missing magic', () => {
  const salt = Uint8Array.from({length: 16}, (_, index) => index);
  const iv = Uint8Array.from({length: 12}, (_, index) => index + 16);
  const header = makeHeader(salt, iv, 128, 'night-sky');
  const parsed = parseHeader(header);

  assert.equal(parsed.version, 3);
  assert.deepEqual(parsed.salt, salt);
  assert.deepEqual(parsed.iv, iv);
  assert.equal(parsed.length, 128);
  assert.equal(parsed.hint, 'night-sky');
  assert.equal(header.length, 38 + new TextEncoder().encode('night-sky').length);
  assert.equal(parseHeader(new Uint8Array(36)), null);
});

test('legacy WPX2 headers remain readable with the original KDF setting', () => {
  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  const parsed = parseHeader(makeLegacyHeader(salt, iv, 128));

  assert.equal(parsed.version, 2);
  assert.equal(parsed.hint, '');
  assert.equal(parsed.bytes.length, 36);
  assert.equal(LEGACY_ITERATIONS, 310000);
});

test('legacy WPX2 ciphertext decrypts without additional authenticated data', async () => {
  const password = 'legacy password';
  const plaintext = new TextEncoder().encode('older payload');
  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  const {key} = await deriveKey(password, salt, LEGACY_ITERATIONS);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, plaintext));
  const header = parseHeader(makeLegacyHeader(salt, iv, ciphertext.length));
  const decrypted = await decryptBytes(password, header.salt, header.iv, ciphertext, null, LEGACY_ITERATIONS);

  assert.deepEqual(decrypted.plaintext, plaintext);
});

test('WPX3 hint bytes are authenticated as AES-GCM additional data', async () => {
  const salt = Uint8Array.from({length: 16}, (_, index) => index);
  const iv = Uint8Array.from({length: 12}, (_, index) => index + 16);
  const plaintext = new TextEncoder().encode('hint-bound message');
  const hint = 'night-sky';
  const header = makeHeader(salt, iv, plaintext.length + 16, hint);
  const encrypted = await encryptBytes('correct password', plaintext, header, salt, iv);
  const parsed = parseHeader(header);
  const decrypted = await decryptBytes('correct password', salt, iv, encrypted.ciphertext, parsed.bytes, CURRENT_ITERATIONS);

  assert.deepEqual(decrypted.plaintext, plaintext);
  const tamperedHeader = header.slice();
  tamperedHeader[tamperedHeader.length - 1] ^= 1;
  await assert.rejects(
    decryptBytes('correct password', salt, iv, encrypted.ciphertext, tamperedHeader, CURRENT_ITERATIONS),
    {name: 'OperationError'}
  );
});
