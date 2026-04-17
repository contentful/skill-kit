import test from 'node:test';
import assert from 'node:assert/strict';
import { kv } from './kv.js';

test('kv() aligns keys', () => {
  const result = kv({ name: 'test', status: 'pass', longerKey: 'value' });
  const lines = result.split('\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[0]!.startsWith('name      '));
  assert.ok(lines[2]!.startsWith('longerKey'));
});

test('kv() handles mixed types', () => {
  const result = kv({ count: 42, enabled: true, label: 'test' });
  assert.ok(result.includes('42'));
  assert.ok(result.includes('true'));
  assert.ok(result.includes('test'));
});

test('kv() returns empty string for empty object', () => {
  assert.equal(kv({}), '');
});
