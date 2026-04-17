import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { skill } from './skill.js';
import { step } from './step.js';

test('skill() creates a frozen SkillDefinition', () => {
  const s = skill({
    name: 'test-skill',
    entry: 'start',
    steps: {
      start: step({
        prompt: 'Do something.',
        output: z.object({ done: z.boolean() }),
        next: { terminal: true },
      }),
    },
  });

  assert.equal(s.kind, 'skill');
  assert.equal(s.name, 'test-skill');
  assert.equal(s.version, '0.0.0');
  assert.equal(s.entry, 'start');
  assert.ok(Object.isFrozen(s));
  assert.ok(Object.isFrozen(s.steps));
});

test('skill() preserves version and description', () => {
  const s = skill({
    name: 'versioned',
    version: '1.2.3',
    description: 'A test skill',
    entry: 'start',
    steps: {
      start: step({
        prompt: 'Go.',
        output: z.object({ ok: z.boolean() }),
        next: { terminal: true },
      }),
    },
  });

  assert.equal(s.version, '1.2.3');
  assert.equal(s.description, 'A test skill');
});

test('skill() throws on missing name', () => {
  assert.throws(
    () =>
      skill({
        name: '',
        entry: 'start',
        steps: {
          start: step({ prompt: 'x', output: z.object({}), next: { terminal: true } }),
        },
      }),
    /name is required/,
  );
});

test('skill() throws on missing entry', () => {
  assert.throws(
    () =>
      skill({
        name: 'x',
        entry: '',
        steps: {
          start: step({ prompt: 'x', output: z.object({}), next: { terminal: true } }),
        },
      }),
    /entry is required/,
  );
});

test('skill() throws when entry step not found', () => {
  assert.throws(
    () =>
      skill({
        name: 'x',
        entry: 'missing',
        steps: {
          start: step({ prompt: 'x', output: z.object({}), next: { terminal: true } }),
        },
      }),
    /entry step "missing" not found/,
  );
});

test('skill() throws on empty steps', () => {
  assert.throws(
    () =>
      skill({
        name: 'x',
        entry: 'start',
        steps: {},
      }),
    /at least one step/,
  );
});
