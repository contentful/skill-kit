import test from 'node:test';
import assert from 'node:assert/strict';
import { type } from 'arktype';
import { step } from './step.js';

test('step() creates a frozen StepDefinition', () => {
  const s = step({
    prompt: 'Do something.',
    response: type({ done: 'boolean' }),
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
    response: type({}),
    next: { terminal: true },
  });

  assert.deepEqual(s.config.next, { terminal: true });
});

test('step() supports function next', () => {
  const fn = ({ response }: { response: { ok: boolean } }) => (response.ok ? 'done' : 'retry');
  const s = step({
    prompt: 'Check.',
    response: type({ ok: 'boolean' }),
    next: fn,
  });

  assert.equal(s.config.next, fn);
});

test('step.extend() overrides next while preserving other config', () => {
  const original = step({
    prompt: 'Do work.',
    response: type({ result: 'string' }),
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
    response: type({}),
    next: 'done',
  });

  const extended = original.extend({ prompt: 'Overridden.' });

  assert.equal(extended.config.prompt, 'Overridden.');
  assert.equal(extended.config.next, 'done');
});

test('step() allows omitting output for output-less steps', () => {
  const s = step({ prompt: 'Display only', next: { terminal: true } });
  assert.equal(s.kind, 'step');
  assert.equal(s.config.response, undefined);
});

test('step() throws on missing next', () => {
  assert.throws(() => step({ prompt: 'x', response: type({}), next: undefined as never }), /next is required/);
});

test('step() allows action-only steps without prompt or response', () => {
  assert.doesNotThrow(() => step({ next: 'b' }));
});
