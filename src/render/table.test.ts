import test from 'node:test';
import assert from 'node:assert/strict';
import { table } from './table.js';

test('table() returns empty string for empty rows', () => {
  assert.equal(table([]), '');
});

test('table() renders a single row', () => {
  const result = table([{ name: 'ci', status: 'pass' }]);
  assert.equal(
    result,
    ['| name | status |', '| --- | --- |', '| ci | pass |'].join('\n'),
  );
});

test('table() renders multiple rows', () => {
  const result = table([
    { name: 'ci', status: 'pass' },
    { name: 'lint', status: 'fail' },
  ]);
  const lines = result.split('\n');
  assert.equal(lines.length, 4);
  assert.equal(lines[3], '| lint | fail |');
});

test('table() respects columns option', () => {
  const result = table([{ name: 'ci', status: 'pass', detail: 'all green' }], {
    columns: ['name', 'status'],
  });
  assert.ok(!result.includes('detail'));
  assert.ok(result.includes('name'));
  assert.ok(result.includes('status'));
});

test('table() applies statusIcons', () => {
  const result = table([{ name: 'ci', status: 'pass' }], {
    statusIcons: { pass: '✅', fail: '❌' },
  });
  assert.ok(result.includes('✅'));
  assert.ok(!result.includes('pass'));
});

test('table() handles null/undefined values', () => {
  const result = table([{ name: 'test', value: null }]);
  assert.ok(result.includes('|'));
});
