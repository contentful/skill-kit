import test from 'node:test';
import assert from 'node:assert/strict';
import { type } from 'arktype';
import { step } from '../step.js';
import { skill } from '../skill.js';
import { WorkflowEngine } from '../runtime/engine.js';
import { validateCycleGuards, CycleGuardError } from './cycle-guard.js';
import type { Handshake } from '../types.js';

const output = type({});
const genericHost: Handshake = { host: 'generic', toolsAvailable: [], isSubagent: false };

test('validateCycleGuards() accepts a linear graph', () => {
  const steps = {
    a: step({ prompt: 'a', output, next: 'b' }),
    b: step({ prompt: 'b', output, next: 'c' }),
    c: step({ prompt: 'c', output, next: { terminal: true } }),
  };

  const result = validateCycleGuards(steps);
  assert.equal(result.stepsInCycles.size, 0);
});

test('validateCycleGuards() detects unguarded cycle without throwing', () => {
  const steps = {
    a: step({ prompt: 'a', output, next: 'b' }),
    b: step({ prompt: 'b', output, next: 'a' }),
  };

  const result = validateCycleGuards(steps);
  assert.ok(result.stepsInCycles.has('a'));
  assert.ok(result.stepsInCycles.has('b'));
  assert.equal(result.defaultMaxVisits, 10);
});

test('validateCycleGuards() accepts a guarded cycle', () => {
  const steps = {
    a: step({ prompt: 'a', output, next: 'b', maxVisits: 3, onMaxVisits: 'c' }),
    b: step({ prompt: 'b', output, next: 'a', maxVisits: 3, onMaxVisits: 'c' }),
    c: step({ prompt: 'c', output, next: { terminal: true } }),
  };

  const result = validateCycleGuards(steps);
  assert.ok(result.stepsInCycles.has('a'));
  assert.ok(result.stepsInCycles.has('b'));
});

test('validateCycleGuards() accepts partially guarded cycle', () => {
  const steps = {
    a: step({ prompt: 'a', output, next: 'b' }),
    b: step({ prompt: 'b', output, next: 'a', maxVisits: 3, onMaxVisits: 'c' }),
    c: step({ prompt: 'c', output, next: { terminal: true } }),
  };

  const result = validateCycleGuards(steps);
  assert.ok(result.stepsInCycles.has('a'));
  assert.ok(result.stepsInCycles.has('b'));
});

test('validateCycleGuards() rejects onMaxVisits pointing to nonexistent step', () => {
  const steps = {
    a: step({ prompt: 'a', output, next: 'b', maxVisits: 3, onMaxVisits: 'missing' }),
    b: step({ prompt: 'b', output, next: 'a', maxVisits: 3, onMaxVisits: 'missing' }),
  };

  assert.throws(() => validateCycleGuards(steps), CycleGuardError);
});

test('validateCycleGuards() accepts a self-loop with guard', () => {
  const steps = {
    a: step({ prompt: 'a', output, next: 'a', maxVisits: 3, onMaxVisits: 'b' }),
    b: step({ prompt: 'b', output, next: { terminal: true } }),
  };

  const result = validateCycleGuards(steps);
  assert.ok(result.stepsInCycles.has('a'));
});

test('unguarded cycle throws at runtime after implicit limit', async () => {
  const s = skill({ name: 'unguarded', entry: 'loop' })
    .step('loop', {
      prompt: 'Loop',
      output: type({}),
      next: 'loop',
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();

  // Run up to the implicit limit (10 visits)
  for (let i = 0; i < 9; i++) {
    await engine.advance('loop', {});
  }

  // The 10th visit should throw
  await assert.rejects(() => engine.advance('loop', {}), CycleGuardError);
});

test('maxVisits without onMaxVisits throws at runtime (fail-closed)', async () => {
  const s = skill({ name: 'fail-closed', entry: 'loop' })
    .step('loop', {
      prompt: 'Loop',
      output: type({}),
      next: 'loop',
      maxVisits: 2,
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();

  await engine.advance('loop', {});
  await assert.rejects(() => engine.advance('loop', {}), CycleGuardError);
});

test('maxVisits with onMaxVisits redirects as before', async () => {
  const s = skill({ name: 'guarded', entry: 'loop' })
    .step('loop', {
      prompt: 'Loop',
      output: type({}),
      next: 'loop',
      maxVisits: 2,
      onMaxVisits: 'done',
    })
    .step('done', { prompt: 'Done', output: type({}), next: { terminal: true } })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();

  await engine.advance('loop', {});
  const result = await engine.advance('loop', {});
  assert.equal((result as { step: string }).step, 'done');
});
