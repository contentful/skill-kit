import test from 'node:test';
import assert from 'node:assert/strict';
import { deepMerge } from './deep-merge.js';

test('deepMerge: flat objects', () => {
  assert.deepEqual(deepMerge({ a: 1 }, { b: 2 }), { a: 1, b: 2 });
});

test('deepMerge: nested objects merge recursively', () => {
  assert.deepEqual(deepMerge({ a: { x: 1 } }, { a: { y: 2 } }), { a: { x: 1, y: 2 } });
});

test('deepMerge: overwrites leaf values', () => {
  assert.deepEqual(deepMerge({ a: { x: 1 } }, { a: { x: 2 } }), { a: { x: 2 } });
});

test('deepMerge: replaces arrays', () => {
  assert.deepEqual(deepMerge({ a: [1] }, { a: [2, 3] }), { a: [2, 3] });
});

test('deepMerge: skips undefined values in source', () => {
  assert.deepEqual(deepMerge({ a: 1 }, { a: undefined }), { a: 1 });
});

test('deepMerge: null replaces value', () => {
  assert.deepEqual(deepMerge({ a: 1 }, { a: null }), { a: null });
});

test('deepMerge: empty source returns target', () => {
  assert.deepEqual(deepMerge({ a: 1 }, {}), { a: 1 });
});

test('deepMerge: empty target returns source', () => {
  assert.deepEqual(deepMerge({}, { a: 1 }), { a: 1 });
});

test('deepMerge: three levels deep', () => {
  const target = { a: { b: { c: 1, d: 2 } } };
  const source = { a: { b: { d: 3, e: 4 } } };
  assert.deepEqual(deepMerge(target, source), { a: { b: { c: 1, d: 3, e: 4 } } });
});

test('deepMerge: non-object source replaces target', () => {
  assert.equal(deepMerge({ a: 1 }, 'string'), 'string');
});

test('deepMerge: non-object target replaced by source', () => {
  assert.deepEqual(deepMerge('old', { a: 1 }), { a: 1 });
});
