import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { step } from './step.js';

test('step() creates a frozen StepDefinition', () => {
  const s = step({
    prompt: 'Do something.',
    output: z.object({ done: z.boolean() }),
    next: 'other-step',
  });

  assert.equal(s.kind, 'step');
  assert.equal(s.config.prompt, 'Do something.');
  assert.equal(s.config.next, 'other-step');
  assert.ok(Object.isFrozen(s));
});

test('step() supports terminal next', () => {
  const s = step({
    prompt: 'Final.',
    output: z.object({}),
    next: { terminal: true },
  });

  assert.deepEqual(s.config.next, { terminal: true });
});

test('step() supports function next', () => {
  const fn = ({ output }: { output: { ok: boolean } }) => (output.ok ? 'done' : 'retry');
  const s = step({
    prompt: 'Check.',
    output: z.object({ ok: z.boolean() }),
    next: fn,
  });

  assert.equal(s.config.next, fn);
});

test('step.extend() overrides next while preserving other config', () => {
  const original = step({
    prompt: 'Do work.',
    output: z.object({ result: z.string() }),
    next: '__parent__',
  });

  const extended = original.extend({ next: 'report' });

  assert.equal(extended.config.prompt, 'Do work.');
  assert.equal(extended.config.next, 'report');
  assert.notEqual(original, extended);
});

test('step.extend() overrides prompt', () => {
  const original = step({
    prompt: 'Original.',
    output: z.object({}),
    next: 'done',
  });

  const extended = original.extend({ prompt: 'Overridden.' });

  assert.equal(extended.config.prompt, 'Overridden.');
  assert.equal(extended.config.next, 'done');
});

test('step() throws on missing output', () => {
  assert.throws(
    () => step({ prompt: 'x', output: undefined as never, next: 'y' }),
    /output schema is required/,
  );
});

test('step() throws on missing next', () => {
  assert.throws(
    () => step({ prompt: 'x', output: z.object({}), next: undefined as never }),
    /next is required/,
  );
});
