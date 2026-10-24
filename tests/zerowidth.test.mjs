import assert from 'node:assert/strict';
import test from 'node:test';
import {decodeInvisible, decodeInvisiblePrefix, encodeInvisible, invisibleByteLength} from '../js/zerowidth.js';

test('zero-width text encoding preserves arbitrary bytes and surrounding text', () => {
  const original = Uint8Array.from([0, 1, 127, 128, 255]);
  const carrier = `A natural-looking cover sentence ${encodeInvisible(original)} stays readable.`;

  assert.deepEqual(decodeInvisible(carrier), original);
  assert.equal(invisibleByteLength(carrier), original.length);
  assert.deepEqual(decodeInvisiblePrefix(carrier, 2), original.subarray(0, 2));
  assert.equal(decodeInvisiblePrefix(carrier, 6), null);
});

test('zero-width decoder rejects absent, malformed, and incomplete data', () => {
  assert.equal(decodeInvisible('ordinary text'), null);
  assert.equal(decodeInvisible(`\u2063\u200b\u2064`), null);
  assert.equal(decodeInvisible(`\u2063\u200b\u200cX\u2064`), null);
});
