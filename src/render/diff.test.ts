import test from 'node:test';
import assert from 'node:assert/strict';
import { diff } from './diff.js';

test('diff() shows additions', () => {
  const result = diff('line1', 'line1\nline2');
  assert.ok(result.includes('+line2'));
  assert.ok(result.includes(' line1'));
});

test('diff() shows deletions', () => {
  const result = diff('line1\nline2', 'line1');
  assert.ok(result.includes('-line2'));
});

test('diff() shows changes', () => {
  const result = diff('old line', 'new line');
  assert.ok(result.includes('-old line'));
  assert.ok(result.includes('+new line'));
});

test('diff() handles identical inputs', () => {
  const result = diff('same', 'same');
  const bodyLines = result.split('\n').slice(2);
  assert.equal(bodyLines.length, 1);
  assert.equal(bodyLines[0], ' same');
});

test('diff() includes header', () => {
  const result = diff('a', 'b');
  assert.ok(result.startsWith('--- before\n+++ after'));
});
