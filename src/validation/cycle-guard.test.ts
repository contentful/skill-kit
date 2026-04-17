import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { step } from '../step.js';
import { validateCycleGuards, CycleGuardError } from './cycle-guard.js';

const output = z.object({});

test('validateCycleGuards() accepts a linear graph', () => {
  const steps = {
    a: step({ prompt: 'a', output, next: 'b' }),
    b: step({ prompt: 'b', output, next: 'c' }),
    c: step({ prompt: 'c', output, next: { terminal: true } }),
  };

  assert.doesNotThrow(() => validateCycleGuards(steps));
});

test('validateCycleGuards() rejects an unguarded cycle', () => {
  const steps = {
    a: step({ prompt: 'a', output, next: 'b' }),
    b: step({ prompt: 'b', output, next: 'a' }),
  };

  assert.throws(() => validateCycleGuards(steps), CycleGuardError);
});

test('validateCycleGuards() accepts a guarded cycle', () => {
  const steps = {
    a: step({ prompt: 'a', output, next: 'b', maxVisits: 3, onMaxVisits: 'c' }),
    b: step({ prompt: 'b', output, next: 'a', maxVisits: 3, onMaxVisits: 'c' }),
    c: step({ prompt: 'c', output, next: { terminal: true } }),
  };

  assert.doesNotThrow(() => validateCycleGuards(steps));
});

test('validateCycleGuards() rejects cycle where only one step has guard', () => {
  const steps = {
    a: step({ prompt: 'a', output, next: 'b' }),
    b: step({ prompt: 'b', output, next: 'a', maxVisits: 3, onMaxVisits: 'c' }),
    c: step({ prompt: 'c', output, next: { terminal: true } }),
  };

  assert.throws(() => validateCycleGuards(steps), CycleGuardError);
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

  assert.doesNotThrow(() => validateCycleGuards(steps));
});
