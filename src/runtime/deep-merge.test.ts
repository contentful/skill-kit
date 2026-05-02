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

// ============================================================
// Edge cases
// ============================================================

test('deepMerge: nested arrays are replaced, not concatenated', () => {
  const target = { data: { items: [1, 2, 3], name: 'orig' } };
  const source = { data: { items: [4, 5] } };
  assert.deepEqual(deepMerge(target, source), { data: { items: [4, 5], name: 'orig' } });
});

test('deepMerge: deeply nested 4 levels', () => {
  const target = { a: { b: { c: { d: 1, e: 2 } } } };
  const source = { a: { b: { c: { e: 3, f: 4 } } } };
  assert.deepEqual(deepMerge(target, source), { a: { b: { c: { d: 1, e: 3, f: 4 } } } });
});

test('deepMerge: source with Date object replaces target', () => {
  const d = new Date('2025-01-01');
  // Date is an object but not a plain object (fails isPlainObject)
  // So it should replace the target value
  assert.deepEqual(deepMerge({ a: { x: 1 } }, { a: d }), { a: d });
});

test('deepMerge: multiple sibling keys in source', () => {
  assert.deepEqual(deepMerge({ a: 1, b: 2 }, { b: 3, c: 4 }), { a: 1, b: 3, c: 4 });
});

test('deepMerge: both empty objects', () => {
  assert.deepEqual(deepMerge({}, {}), {});
});

test('deepMerge: source value is empty object merges as no-op', () => {
  assert.deepEqual(deepMerge({ a: { x: 1 } }, { a: {} }), { a: { x: 1 } });
});

test('deepMerge: target has extra keys not in source', () => {
  assert.deepEqual(deepMerge({ a: 1, b: 2, c: 3 }, { a: 10 }), { a: 10, b: 2, c: 3 });
});
