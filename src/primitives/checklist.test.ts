import test from 'node:test';
import assert from 'node:assert/strict';
import { checklist } from './checklist.js';

test('checklist() returns a frozen ChecklistConfig', () => {
  const config = checklist({
    create: [
      { title: 'Fix CI', status: 'pending' },
      { title: 'Update deps', status: 'in_progress' },
    ],
  });
  assert.equal(config.kind, 'checklist');
  assert.equal(config.create.length, 2);
  assert.ok(Object.isFrozen(config));
});
