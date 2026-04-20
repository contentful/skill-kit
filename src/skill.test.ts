import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { skill } from './skill.js';

test('skill().build() creates a frozen SkillDefinition', () => {
  const s = skill({
    name: 'test-skill',
    entry: 'start',
  })
    .step('start', {
      prompt: 'Do something.',
      output: z.object({ done: z.boolean() }),
      next: { terminal: true },
    })
    .build();

  assert.equal(s.kind, 'skill');
  assert.equal(s.name, 'test-skill');
  assert.equal(s.version, '0.0.0');
  assert.equal(s.entry, 'start');
  assert.ok(Object.isFrozen(s));
  assert.ok(Object.isFrozen(s.steps));
});

test('skill().build() preserves version and description', () => {
  const s = skill({
    name: 'versioned',
    version: '1.2.3',
    description: 'A test skill',
    entry: 'start',
  })
    .step('start', {
      prompt: 'Go.',
      output: z.object({ ok: z.boolean() }),
      next: { terminal: true },
    })
    .build();

  assert.equal(s.version, '1.2.3');
  assert.equal(s.description, 'A test skill');
});

test('skill().build() throws on missing name', () => {
  assert.throws(
    () =>
      skill({ name: '', entry: 'start' })
        .step('start', { prompt: 'x', output: z.object({}), next: { terminal: true } })
        .build(),
    /name is required/,
  );
});

test('skill().build() throws on missing entry', () => {
  assert.throws(
    () =>
      skill({ name: 'x', entry: '' })
        .step('start', { prompt: 'x', output: z.object({}), next: { terminal: true } })
        .build(),
    /entry is required/,
  );
});

test('skill().build() throws when entry step not found', () => {
  assert.throws(
    () =>
      skill({ name: 'x', entry: 'missing' })
        .step('start', { prompt: 'x', output: z.object({}), next: { terminal: true } })
        .build(),
    /entry step "missing" not found/,
  );
});

test('skill().build() throws on empty steps', () => {
  assert.throws(() => skill({ name: 'x', entry: 'start' }).build(), /at least one step/);
});

test('context type flows into step prompt callbacks', () => {
  const s = skill({
    name: 'typed',
    entry: 'a',
    context: z.object({ greeting: z.string() }),
  })
    .step('a', {
      prompt: ({ context }) => {
        const _check: string = context.greeting;
        void _check;
        return 'hi';
      },
      output: z.object({}),
      next: { terminal: true },
    })
    .build();

  assert.equal(s.kind, 'skill');
});

test('triggers are appended to description', () => {
  const s = skill({
    name: 'triggered',
    description: 'Diagnoses issues',
    triggers: ['debug', 'doctor', 'diagnose'],
    entry: 'start',
  })
    .step('start', {
      prompt: 'Go.',
      output: z.object({}),
      next: { terminal: true },
    })
    .build();

  assert.equal(s.description, 'Diagnoses issues. Trigger keywords: debug, doctor, diagnose');
});

test('triggers do not double-period when description ends with period', () => {
  const s = skill({
    name: 'dotted',
    description: 'Fixes things.',
    triggers: ['fix', 'repair'],
    entry: 'start',
  })
    .step('start', {
      prompt: 'Go.',
      output: z.object({}),
      next: { terminal: true },
    })
    .build();

  assert.equal(s.description, 'Fixes things. Trigger keywords: fix, repair');
});

test('triggers without description', () => {
  const s = skill({
    name: 'triggered',
    triggers: ['deploy', 'ship'],
    entry: 'start',
  })
    .step('start', {
      prompt: 'Go.',
      output: z.object({}),
      next: { terminal: true },
    })
    .build();

  assert.equal(s.description, 'Trigger keywords: deploy, ship');
});

test('empty triggers array does not modify description', () => {
  const s = skill({
    name: 'no-triggers',
    description: 'Just a skill',
    triggers: [],
    entry: 'start',
  })
    .step('start', {
      prompt: 'Go.',
      output: z.object({}),
      next: { terminal: true },
    })
    .build();

  assert.equal(s.description, 'Just a skill');
});

test('stash type flows into step prompt callbacks', () => {
  const s = skill({
    name: 'stashed',
    entry: 'a',
    stash: z.object({ name: z.string() }),
  })
    .step('a', {
      prompt: ({ stash }) => {
        const _check: string = stash.name;
        void _check;
        return 'hi';
      },
      output: z.object({}),
      next: { terminal: true },
    })
    .build();

  assert.equal(s.kind, 'skill');
});
