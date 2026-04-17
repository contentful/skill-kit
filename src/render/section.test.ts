import test from 'node:test';
import assert from 'node:assert/strict';
import { section } from './section.js';

test('section() renders heading and body', () => {
  const result = section('Summary', 'Everything passed.');
  assert.equal(result, '## Summary\n\nEverything passed.');
});

test('section() handles multiline body', () => {
  const result = section('Details', 'Line 1.\nLine 2.');
  assert.ok(result.startsWith('## Details\n\n'));
  assert.ok(result.includes('Line 1.\nLine 2.'));
});
