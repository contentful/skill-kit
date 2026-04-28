import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { skill } from '../skill.js';
import { action } from '../action.js';
import { view } from '../view.js';
import { WorkflowEngine } from './engine.js';
import type { Handshake, PromptResult, DoneResult, ValidationErrorResult, RedirectResult } from '../types.js';

const genericHost: Handshake = { host: 'generic', toolsAvailable: [], isSubagent: false };

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
  assert.equal((p as PromptResult).prompt, '<prompt>\nPrevious: {"val":42}\n</prompt>');
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
      action: { run: writeAction },
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

test('actionInput mapping decouples step output from action input', async () => {
  let receivedInput: unknown;

  const writeAction = action({
    name: 'write',
    input: z.object({ path: z.string(), content: z.string() }),
    output: z.object({ ok: z.boolean() }),
    run: async ({ input }) => {
      receivedInput = input;
      return { ok: true };
    },
  });

  const s = skill({ name: 'mapped', entry: 'a' })
    .step('a', {
      prompt: 'Decide',
      output: z.object({ fileName: z.string(), body: z.string() }),
      action: {
        run: writeAction,
        input: ({ output }) => ({ path: `/out/${output.fileName}`, content: output.body }),
      },
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  await engine.advance('a', { fileName: 'report.md', body: 'hello' });
  assert.deepEqual(receivedInput, { path: '/out/report.md', content: 'hello' });
});

test('actionInput receives current stash', async () => {
  let receivedInput: unknown;

  const myAction = action({
    name: 'a',
    input: z.object({ prefix: z.string(), val: z.string() }),
    output: z.object({}),
    run: async ({ input }) => {
      receivedInput = input;
      return {};
    },
  });

  const s = skill({ name: 'stash-map', entry: 'setup', stash: z.object({ prefix: z.string() }) })
    .step('setup', {
      prompt: 'Setup',
      output: z.object({}),
      stash: () => ({ prefix: 'pre' }),
      next: 'a',
    })
    .step('a', {
      prompt: 'Go',
      output: z.object({ val: z.string() }),
      action: {
        run: myAction,
        input: ({ output, stash }) => ({ prefix: stash.prefix, val: output.val }),
      },
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  await engine.advance('setup', {});
  await engine.advance('a', { val: 'test' });
  assert.deepEqual(receivedInput, { prefix: 'pre', val: 'test' });
});

test('action output is passed to transition function', async () => {
  const apiAction = action({
    name: 'api-call',
    input: z.object({ url: z.string() }),
    output: z.object({ status: z.number() }),
    run: async () => ({ status: 200 }),
  });

  const s = skill({ name: 'action-in-next', entry: 'call' })
    .step('call', {
      prompt: 'Call the API',
      output: z.object({ url: z.string() }),
      action: { run: apiAction },
      next: ({ action }) => ((action as { status: number }).status === 200 ? 'success' : 'failure'),
    })
    .step('success', { prompt: 'OK', output: z.object({}), next: { terminal: true } })
    .step('failure', { prompt: 'Fail', output: z.object({}), next: { terminal: true } })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  const r = await engine.advance('call', { url: 'https://example.com' });
  assert.equal((r as PromptResult).step, 'success');
});

test('action is undefined in next when no action configured', async () => {
  let capturedAction: unknown = 'not-set';

  const s = skill({ name: 'no-action-next', entry: 'a' })
    .step('a', {
      prompt: 'Go',
      output: z.object({ ok: z.boolean() }),
      next: ({ action }) => {
        capturedAction = action;
        return 'b';
      },
    })
    .step('b', { prompt: 'B', output: z.object({}), next: { terminal: true } })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  await engine.advance('a', { ok: true });
  assert.equal(capturedAction, undefined);
});

test('afterAction stashes action result', async () => {
  let capturedStash: unknown;

  const apiAction = action({
    name: 'api',
    input: z.object({ url: z.string() }),
    output: z.object({ responseCode: z.number() }),
    run: async () => ({ responseCode: 201 }),
  });

  const s = skill({ name: 'post-stash', entry: 'call', stash: z.object({ lastCode: z.number() }) })
    .step('call', {
      prompt: 'Call API',
      output: z.object({ url: z.string() }),
      action: {
        run: apiAction,
        stash: ({ result }) => ({ lastCode: result.responseCode }),
      },
      next: 'report',
    })
    .step('report', {
      prompt: (ctx) => {
        capturedStash = ctx.stash;
        return 'Report';
      },
      output: z.object({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  await engine.advance('call', { url: 'https://api.example.com' });
  assert.deepEqual(capturedStash, { lastCode: 201 });
});

test('afterAction is replayed correctly from history', () => {
  let capturedStash: unknown;

  const apiAction = action({
    name: 'api',
    input: z.object({ url: z.string() }),
    output: z.object({ code: z.number() }),
    run: async () => ({ code: 200 }),
  });

  const s = skill({ name: 'replay-after', entry: 'call', stash: z.object({ code: z.number() }) })
    .step('call', {
      prompt: (ctx) => {
        capturedStash = ctx.stash;
        return 'Call';
      },
      output: z.object({ url: z.string() }),
      action: {
        run: apiAction,
        stash: ({ result }) => ({ code: result.code }),
      },
      next: 'report',
    })
    .step('report', {
      prompt: 'Report',
      output: z.object({}),
      next: { terminal: true },
    })
    .build();

  // Replay history with action output → afterAction should populate stash
  const engine = new WorkflowEngine(s, genericHost, {});
  engine.replayHistory([{ step: 'call', output: { url: 'https://x.com' }, action: { code: 404 } }]);
  // start() builds prompt for entry step 'call', which captures stash
  engine.start();
  assert.deepEqual(capturedStash, { code: 404 });
});

test('getStep provides typed history access', async () => {
  let stepAResult: unknown;

  const s = skill({ name: 'get-step', entry: 'a' })
    .step('a', { prompt: 'A', output: z.object({ val: z.number() }), next: 'b' })
    .step('b', {
      prompt: (ctx) => {
        stepAResult = ctx.getStep<{ val: number }>('a');
        return 'B';
      },
      output: z.object({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  await engine.advance('a', { val: 42 });
  assert.deepEqual(stepAResult, { output: { val: 42 }, action: undefined });
});

test('getStep returns undefined for missing step', async () => {
  let result: unknown = 'not-set';

  const s = skill({ name: 'get-step-missing', entry: 'a' })
    .step('a', {
      prompt: (ctx) => {
        result = ctx.getStep('nonexistent');
        return 'A';
      },
      output: z.object({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  assert.equal(result, undefined);
});

test('engine returns RedirectResult when next target is not a local step', async () => {
  const s = skill({ name: 'redirect-test', entry: 'classify', stash: z.object({ intent: z.string() }) })
    .step('classify', {
      prompt: 'Classify',
      output: z.object({ intent: z.string() }),
      stash: ({ output }) => ({ intent: output.intent }),
      next: ({ output }) => `subskill:${output.intent}`,
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  const result = await engine.advance('classify', { intent: 'doctor' });

  const redirect = result as RedirectResult;
  assert.equal(redirect.redirect, 'subskill:doctor');
  assert.deepEqual(redirect.completed, { step: 'classify', output: { intent: 'doctor' }, action: undefined });
  assert.deepEqual(redirect.stash, { intent: 'doctor' });
});

test('engine returns RedirectResult for topic targets', async () => {
  const s = skill({ name: 'topic-redirect', entry: 'ask' })
    .step('ask', {
      prompt: 'What topic?',
      output: z.object({ topic: z.string() }),
      next: ({ output }) => `topic:${output.topic}`,
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  const result = await engine.advance('ask', { topic: 'rate-limits' });

  const redirect = result as RedirectResult;
  assert.equal(redirect.redirect, 'topic:rate-limits');
});

test('engine still routes normally when next target is a local step', async () => {
  const s = skill({ name: 'normal-routing', entry: 'a' })
    .step('a', { prompt: 'A', output: z.object({}), next: 'b' })
    .step('b', { prompt: 'B', output: z.object({}), next: { terminal: true } })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  const result = await engine.advance('a', {});

  assert.equal((result as PromptResult).step, 'b');
});

// --- Array prompt composition tests ---

import { act } from '../act.js';

test('engine assembles array prompt in author order with XML tags', () => {
  const s = skill({ name: 'array-test', entry: 'a' })
    .step('a', {
      prompt: ({ act, system }) => [
        system`Be precise.`,
        act.checklist({
          create: [
            { title: 'Item one', status: 'pending' },
            { title: 'Item two', status: 'done' },
          ],
        }),
        'Do the work.',
      ],
      output: z.object({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  const result = engine.start();

  const lines = result.prompt.split('\n\n');
  assert.equal(lines[0], '<system>Be precise.</system>');
  assert.ok(lines[1]!.startsWith('<checklist>'));
  assert.ok(lines[1]!.includes('<item status="pending">Item one</item>'));
  assert.ok(lines[1]!.includes('<item status="done">Item two</item>'));
  assert.ok(lines[1]!.endsWith('</checklist>'));
  assert.equal(lines[2], '<prompt>\nDo the work.\n</prompt>');
});

test('engine preserves author order — system between acts', () => {
  const s = skill({ name: 'order-test', entry: 'a' })
    .step('a', {
      prompt: ({ act, system }) => [
        act.confirm({ message: 'Ready?', defaultAnswer: 'yes' }),
        system`Now be thorough.`,
        'Build everything.',
      ],
      output: z.object({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  const result = engine.start();

  const lines = result.prompt.split('\n\n');
  assert.ok(lines[0]!.startsWith('<confirm'));
  assert.equal(lines[1], '<system>Now be thorough.</system>');
  assert.equal(lines[2], '<prompt>\nBuild everything.\n</prompt>');
});

test('engine renders act segment in prompt array', () => {
  const s = skill({ name: 'act-in-prompt', entry: 'a' })
    .step('a', {
      prompt: [
        act.askUser({
          type: 'structured',
          question: 'Pick one',
          options: [
            { value: 'a', label: 'A', description: 'Option A' },
            { value: 'b', label: 'B', description: 'Option B' },
          ],
        }),
        'Additional context.',
      ],
      output: z.object({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  const result = engine.start();

  const lines = result.prompt.split('\n\n');
  assert.ok(lines[0]!.startsWith('<ask-user'));
  assert.ok(lines[0]!.includes('question="Pick one"'));
  assert.equal(lines[1], '<prompt>\nAdditional context.\n</prompt>');
});

test('engine renders subagent with no-recurse attribute', () => {
  const s = skill({ name: 'recurse-test', entry: 'a' })
    .step('a', {
      prompt: act.subagent({
        prompt: 'Do research.',
        output: z.object({ result: z.string() }),
      }),
      output: z.object({ result: z.string() }),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  const result = engine.start();

  assert.ok(result.prompt.includes('no-recurse="recurse-test"'));
  assert.ok(result.prompt.includes('Do research.'));
});

test('engine renders subagent without no-recurse when allowRecursion is true', () => {
  const s = skill({ name: 'recurse-allowed', entry: 'a' })
    .step('a', {
      prompt: act.subagent({
        prompt: 'Run the sub-skill.',
        output: z.object({ result: z.string() }),
        allowRecursion: true,
      }),
      output: z.object({ result: z.string() }),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  const result = engine.start();

  assert.ok(!result.prompt.includes('no-recurse'));
  assert.ok(result.prompt.includes('<subagent>Run the sub-skill.</subagent>'));
});

test('engine renders view segment as <rendered> tag', () => {
  const s = skill({ name: 'view-test', entry: 'a' })
    .step('a', {
      prompt: [view('# Hello World'), 'Show the card.'],
      output: z.object({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  const result = engine.start();

  assert.ok(result.prompt.includes('<rendered>\n# Hello World\n</rendered>'));
  assert.ok(result.prompt.includes('<prompt>\nShow the card.\n</prompt>'));
});

test('engine renders named view segment with name attribute', () => {
  const s = skill({ name: 'named-view-test', entry: 'a' })
    .step('a', {
      prompt: [view('stats', '# Stats'), 'Show the stats.'],
      output: z.object({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  const result = engine.start();

  assert.ok(result.prompt.includes('<rendered name="stats">\n# Stats\n</rendered>'));
});

test('engine injects skill-level system into preamble', () => {
  const s = skill({ name: 'system-test', entry: 'a', system: 'You are helpful.' })
    .step('a', {
      prompt: 'Do something.',
      output: z.object({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  const result = engine.start();

  assert.ok(result.preamble!.startsWith('You are helpful.'));
  assert.ok(result.preamble!.includes('| Tag |'));
});
