import assert from 'node:assert/strict';
import test from 'node:test';
import {decryptBytes, encryptBytes, makeHeader, parseHeader} from '../js/crypto.js';

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
  const header = makeHeader(salt, iv, 128);
  const parsed = parseHeader(header);

  assert.deepEqual(parsed.salt, salt);
  assert.deepEqual(parsed.iv, iv);
  assert.equal(parsed.length, 128);
  assert.equal(parseHeader(new Uint8Array(36)), null);
});
