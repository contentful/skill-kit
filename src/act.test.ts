import test from 'node:test';
import assert from 'node:assert/strict';
import { type } from 'arktype';
import { act } from './act.js';

test('act.askUser() wraps structured config in ActSegment', () => {
  const seg = act.askUser({
    type: 'structured',
    question: 'Pick one',
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
  });
  assert.equal(seg.kind, 'act');
  assert.equal(seg.primitive.kind, 'askUser');
  assert.ok(Object.isFrozen(seg));
});

test('act.askUser() wraps open config in ActSegment', () => {
  const seg = act.askUser({ type: 'open', question: 'Tell me more' });
  assert.equal(seg.kind, 'act');
  assert.equal(seg.primitive.kind, 'askUser');
});

test('act.confirm() wraps ConfirmConfig', () => {
  const seg = act.confirm({ message: 'Delete everything?', destructive: true });
  assert.equal(seg.kind, 'act');
  assert.equal(seg.primitive.kind, 'confirm');
});

test('act.plan() wraps PlanConfig', () => {
  const seg = act.plan({ summary: 'Migrate auth', steps: ['Step 1', 'Step 2'] });
  assert.equal(seg.kind, 'act');
  assert.equal(seg.primitive.kind, 'plan');
});

test('act.checklist() wraps ChecklistConfig', () => {
  const items = [{ title: 'Fix CI', status: 'pending' }];
  const seg = act.checklist({ create: items });
  assert.equal(seg.kind, 'act');
  assert.equal(seg.primitive.kind, 'checklist');
});

test('act.subagent() wraps SubagentConfig', () => {
  const seg = act.subagent({
    prompt: 'Research CVEs',
    output: type({ findings: 'string[]' }),
  });
  assert.equal(seg.kind, 'act');
  assert.equal(seg.primitive.kind, 'subagent');
});
