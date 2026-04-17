import test from 'node:test';
import assert from 'node:assert/strict';
import { checklist } from './checklist.js';

test('checklist() renders all checked items', () => {
  const result = checklist([
    { text: 'Setup CI', done: true },
    { text: 'Add tests', done: true },
  ]);
  assert.equal(result, '- [x] Setup CI\n- [x] Add tests');
});

test('checklist() renders all unchecked items', () => {
  const result = checklist([
    { text: 'Setup CI', done: false },
    { text: 'Add tests', done: false },
  ]);
  assert.equal(result, '- [ ] Setup CI\n- [ ] Add tests');
});

test('checklist() renders mixed items', () => {
  const result = checklist([
    { text: 'Done', done: true },
    { text: 'Pending', done: false },
  ]);
  assert.ok(result.includes('[x] Done'));
  assert.ok(result.includes('[ ] Pending'));
});

test('checklist() handles empty list', () => {
  assert.equal(checklist([]), '');
});
