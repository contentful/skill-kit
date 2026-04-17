import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { skill } from '../skill.js';
import { action } from '../action.js';
import { WorkflowEngine } from './engine.js';
import type { Handshake, PromptResult, DoneResult, ValidationErrorResult } from '../types.js';

const genericHost: Handshake = { host: 'generic', toolsAvailable: [] };

test('engine runs a 3-step linear skill to completion', async () => {
  const s = skill({ name: 'linear', entry: 'a' })
    .step('a', { prompt: 'Step A', output: z.object({ val: z.string() }), next: 'b' })
    .step('b', { prompt: 'Step B', output: z.object({ val: z.string() }), next: 'c' })
    .step('c', { prompt: 'Step C', output: z.object({ val: z.string() }), next: { terminal: true } })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  const p1 = engine.start();
  assert.equal(p1.step, 'a');

  const p2 = await engine.advance('a', { val: 'from-a' });
  assert.equal((p2 as PromptResult).step, 'b');

  const p3 = await engine.advance('b', { val: 'from-b' });
  assert.equal((p3 as PromptResult).step, 'c');

  const done = await engine.advance('c', { val: 'from-c' });
  assert.equal((done as DoneResult).done, true);
  assert.deepEqual((done as DoneResult).finalOutput, { val: 'from-c' });
});

test('engine routes conditionally based on output', async () => {
  const s = skill({ name: 'conditional', entry: 'check' })
    .step('check', {
      prompt: 'Check status',
      output: z.object({ ok: z.boolean() }),
      next: ({ output }) => (output.ok ? 'done' : 'fix'),
    })
    .step('fix', { prompt: 'Fix it', output: z.object({ fixed: z.boolean() }), next: { terminal: true } })
    .step('done', { prompt: 'All good', output: z.object({}), next: { terminal: true } })
    .build();

  const engine1 = new WorkflowEngine(s, genericHost, {});
  engine1.start();
  const r1 = await engine1.advance('check', { ok: true });
  assert.equal((r1 as PromptResult).step, 'done');

  const engine2 = new WorkflowEngine(s, genericHost, {});
  engine2.start();
  const r2 = await engine2.advance('check', { ok: false });
  assert.equal((r2 as PromptResult).step, 'fix');
});

test('engine returns validation error for bad output', async () => {
  const s = skill({ name: 'validated', entry: 'a' })
    .step('a', { prompt: 'Go', output: z.object({ count: z.number() }), next: { terminal: true } })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();

  const result = await engine.advance('a', { count: 'not-a-number' });
  assert.equal((result as ValidationErrorResult).error, 'validation');
  assert.equal((result as ValidationErrorResult).retry, true);
});

test('engine validates context schema on construction', () => {
  const s = skill({ name: 'ctx', entry: 'a', context: z.object({ path: z.string() }) })
    .step('a', { prompt: 'Go', output: z.object({}), next: { terminal: true } })
    .build();

  assert.throws(() => new WorkflowEngine(s, genericHost, { path: 123 }), /Invalid context/);
  assert.doesNotThrow(() => new WorkflowEngine(s, genericHost, { path: '/src' }));
});

test('engine enforces maxVisits and routes to onMaxVisits', async () => {
  const s = skill({ name: 'bounded', entry: 'loop' })
    .step('loop', {
      prompt: 'Retry',
      output: z.object({ confidence: z.number() }),
      next: ({ output }) => (output.confidence < 0.7 ? 'loop' : 'report'),
      maxVisits: 2,
      onMaxVisits: 'report',
    })
    .step('report', { prompt: 'Report', output: z.object({}), next: { terminal: true } })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();

  const r1 = await engine.advance('loop', { confidence: 0.3 });
  assert.equal((r1 as PromptResult).step, 'loop');

  const r2 = await engine.advance('loop', { confidence: 0.4 });
  assert.equal((r2 as PromptResult).step, 'report');
});

test('engine provides dynamic prompt context', async () => {
  let capturedCtx: unknown = null;

  const s = skill({ name: 'dynamic', entry: 'a', context: z.object({ name: z.string() }) })
    .step('a', { prompt: 'First', output: z.object({ val: z.number() }), next: 'b' })
    .step('b', {
      prompt: (ctx) => {
        capturedCtx = ctx;
        return `Previous: ${JSON.stringify(ctx.prev)}`;
      },
      output: z.object({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, { name: 'test' });
  engine.start();
  const p = await engine.advance('a', { val: 42 });

  assert.ok(capturedCtx);
  assert.ok((p as PromptResult).prompt.includes('42'));
});

test('engine replays history for single-invocation mode', () => {
  const s = skill({ name: 'replay', entry: 'a', stash: z.object({ memo: z.string() }) })
    .step('a', {
      prompt: 'A',
      output: z.object({ val: z.string() }),
      stash: ({ output }) => ({ memo: output.val }),
      next: 'b',
    })
    .step('b', {
      prompt: (ctx) => `Stash: ${JSON.stringify(ctx.stash)}`,
      output: z.object({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.replayHistory([{ step: 'a', output: { val: 'hello' } }]);
  const prompt = engine.start();
  assert.ok(prompt);
});

test('engine runs action after validation, before transition', async () => {
  let actionRan = false;

  const writeAction = action({
    name: 'test-action',
    input: z.object({ content: z.string() }),
    output: z.object({ written: z.boolean() }),
    run: async ({ input }) => {
      actionRan = true;
      return { written: input.content.length > 0 };
    },
  });

  const s = skill({ name: 'with-action', entry: 'a' })
    .step('a', {
      prompt: 'Write something',
      output: z.object({ content: z.string() }),
      action: writeAction,
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();

  const result = await engine.advance('a', { content: 'hello' });
  assert.ok(actionRan);
  assert.equal((result as DoneResult).done, true);
  assert.deepEqual((result as DoneResult).completed?.action, { written: true });
});

test('engine fires observers at lifecycle points', async () => {
  const events: string[] = [];

  const s = skill({
    name: 'observed',
    entry: 'a',
    observers: {
      onStepStart: ({ step: stepName }) => {
        events.push(`start:${stepName}`);
      },
      onStepComplete: ({ step: stepName }) => {
        events.push(`complete:${stepName}`);
      },
      onTransition: ({ from, to }) => {
        events.push(`transition:${from}->${to}`);
      },
      onSkillComplete: () => {
        events.push('skill-complete');
      },
    },
  })
    .step('a', { prompt: 'A', output: z.object({}), next: { terminal: true } })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  await engine.advance('a', {});

  await new Promise((r) => setTimeout(r, 10));

  assert.ok(events.includes('start:a'));
  assert.ok(events.includes('complete:a'));
  assert.ok(events.includes('transition:a->__terminal__'));
  assert.ok(events.includes('skill-complete'));
});

test('throwing observer does not crash the skill', async () => {
  const s = skill({
    name: 'bad-observer',
    entry: 'a',
    observers: {
      onStepComplete: () => {
        throw new Error('observer crash');
      },
    },
  })
    .step('a', { prompt: 'A', output: z.object({}), next: { terminal: true } })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();

  const result = await engine.advance('a', {});
  assert.equal((result as DoneResult).done, true);
});
