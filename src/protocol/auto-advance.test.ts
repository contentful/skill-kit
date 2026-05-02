import test from 'node:test';
import assert from 'node:assert/strict';
import { type } from 'arktype';
import { skill } from '../skill.js';
import { WorkflowEngine } from '../runtime/engine.js';
import { autoAdvance } from './auto-advance.js';
import type { Handshake, PromptResult, DoneResult } from '../types.js';

const genericHost: Handshake = { host: 'generic', toolsAvailable: [], isSubagent: false };

test('autoAdvance skips prompt-less steps and returns autoAdvanced entries', async () => {
  const s = skill({ name: 'gate-test', entry: 'gate', stash: type({ routed: 'boolean' }) })
    .step('gate', {
      updateStash: () => ({ routed: true }),
      next: 'main',
    })
    .step('main', {
      prompt: 'Do work',
      output: type({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  const startResult = engine.start();
  const result = await autoAdvance(engine, startResult);

  const prompt = result as PromptResult;
  assert.equal(prompt.step, 'main');
  assert.ok(prompt.autoAdvanced);
  assert.equal(prompt.autoAdvanced!.length, 1);
  assert.equal(prompt.autoAdvanced![0]!.step, 'gate');
});

test('autoAdvance chains multiple prompt-less steps', async () => {
  const s = skill({ name: 'chain', entry: 'a' })
    .step('a', { next: 'b' })
    .step('b', { next: 'c' })
    .step('c', {
      prompt: 'Final',
      output: type({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  const startResult = engine.start();
  const result = await autoAdvance(engine, startResult);

  const prompt = result as PromptResult;
  assert.equal(prompt.step, 'c');
  assert.equal(prompt.autoAdvanced!.length, 2);
  assert.equal(prompt.autoAdvanced![0]!.step, 'a');
  assert.equal(prompt.autoAdvanced![1]!.step, 'b');
});

test('autoAdvance collects intermediates via callback', async () => {
  const s = skill({ name: 'callback-test', entry: 'gate' })
    .step('gate', { next: 'main' })
    .step('main', {
      prompt: 'Go',
      output: type({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  const startResult = engine.start();

  const intermediates: unknown[] = [];
  await autoAdvance(engine, startResult, (r) => intermediates.push(r));

  assert.equal(intermediates.length, 1);
});

test('autoAdvance returns result unchanged when step has a prompt', async () => {
  const s = skill({ name: 'no-gate', entry: 'main' })
    .step('main', {
      prompt: 'Go',
      output: type({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  const startResult = engine.start();
  const result = await autoAdvance(engine, startResult);

  assert.equal((result as PromptResult).step, 'main');
  assert.equal((result as PromptResult).autoAdvanced, undefined);
});

test('autoAdvance handles prompt-less step leading to terminal', async () => {
  const s = skill({ name: 'gate-terminal', entry: 'gate' })
    .step('gate', { next: { terminal: true } })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  const startResult = engine.start();
  const result = await autoAdvance(engine, startResult);

  assert.ok('done' in result);
  assert.equal((result as DoneResult).done, true);
  assert.equal((result as DoneResult).autoAdvanced!.length, 1);
  assert.equal((result as DoneResult).autoAdvanced![0]!.step, 'gate');
});
