import test from 'node:test';
import assert from 'node:assert/strict';
import { type } from 'arktype';
import { skill } from '../skill.js';
import { action } from '../action.js';
import { view } from '../view.js';
import { WorkflowEngine } from './engine.js';
import type { Handshake, PromptResult, DoneResult, ValidationErrorResult, RedirectResult } from '../types.js';

const genericHost: Handshake = { host: 'generic', toolsAvailable: [], isSubagent: false };

test('engine runs a 3-step linear skill to completion', async () => {
  const s = skill({ name: 'linear', entry: 'a' })
    .step('a', { prompt: 'Step A', response: type({ val: 'string' }), next: 'b' })
    .step('b', { prompt: 'Step B', response: type({ val: 'string' }), next: 'c' })
    .step('c', { prompt: 'Step C', response: type({ val: 'string' }), next: { terminal: true } })
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
      response: type({ ok: 'boolean' }),
      next: ({ response }) => (response.ok ? 'done' : 'fix'),
    })
    .step('fix', { prompt: 'Fix it', response: type({ fixed: 'boolean' }), next: { terminal: true } })
    .step('done', { prompt: 'All good', response: type({}), next: { terminal: true } })
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

test('engine routes via NextBranch array (declarative branching)', async () => {
  const s = skill({ name: 'branching', entry: 'pick' })
    .step('pick', {
      prompt: 'Pick a role',
      response: type({ role: "'dev' | 'designer' | 'other'" }),
      next: [
        { to: 'dev-path', when: ({ response }) => response.role === 'dev' },
        { to: 'design-path', when: ({ response }) => response.role === 'designer' },
        { to: 'other-path' },
      ],
    })
    .step('dev-path', { prompt: 'Dev', response: type({}), next: { terminal: true } })
    .step('design-path', { prompt: 'Design', response: type({}), next: { terminal: true } })
    .step('other-path', { prompt: 'Other', response: type({}), next: { terminal: true } })
    .build();

  const e1 = new WorkflowEngine(s, genericHost, {});
  e1.start();
  assert.equal(((await e1.advance('pick', { role: 'dev' })) as PromptResult).step, 'dev-path');

  const e2 = new WorkflowEngine(s, genericHost, {});
  e2.start();
  assert.equal(((await e2.advance('pick', { role: 'designer' })) as PromptResult).step, 'design-path');

  const e3 = new WorkflowEngine(s, genericHost, {});
  e3.start();
  assert.equal(((await e3.advance('pick', { role: 'other' })) as PromptResult).step, 'other-path');
});

test('NextBranch default (no when) catches unmatched values', async () => {
  const s = skill({ name: 'default-branch', entry: 'pick' })
    .step('pick', {
      prompt: 'Pick',
      response: type({ val: 'string' }),
      next: [{ to: 'a', when: ({ response }) => response.val === 'x' }, { to: 'fallback' }],
    })
    .step('a', { prompt: 'A', response: type({}), next: { terminal: true } })
    .step('fallback', { prompt: 'Fallback', response: type({}), next: { terminal: true } })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  assert.equal(((await engine.advance('pick', { val: 'y' })) as PromptResult).step, 'fallback');
});

test('NextBranch throws when no branch matches and no default', async () => {
  const s = skill({ name: 'no-default', entry: 'pick' })
    .step('pick', {
      prompt: 'Pick',
      response: type({ val: 'string' }),
      next: [
        { to: 'a', when: ({ response }) => response.val === 'x' },
        { to: 'b', when: ({ response }) => response.val === 'y' },
      ],
    })
    .step('a', { prompt: 'A', response: type({}), next: { terminal: true } })
    .step('b', { prompt: 'B', response: type({}), next: { terminal: true } })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  await assert.rejects(() => engine.advance('pick', { val: 'z' }), /no branch matched/);
});

test('engine returns validation error for bad output', async () => {
  const s = skill({ name: 'validated', entry: 'a' })
    .step('a', { prompt: 'Go', response: type({ count: 'number' }), next: { terminal: true } })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();

  const result = await engine.advance('a', { count: 'not-a-number' });
  assert.equal((result as ValidationErrorResult).error, 'validation');
  assert.equal((result as ValidationErrorResult).retry, true);
});

test('engine validates context schema on construction', () => {
  const s = skill({ name: 'ctx', entry: 'a', params: type({ path: 'string' }) })
    .step('a', { prompt: 'Go', response: type({}), next: { terminal: true } })
    .build();

  assert.throws(() => new WorkflowEngine(s, genericHost, { path: 123 }), /Invalid params/);
  assert.doesNotThrow(() => new WorkflowEngine(s, genericHost, { path: '/src' }));
});

test('engine params error includes skill name and field path', () => {
  const s = skill({ name: 'my-skill', entry: 'a', params: type({ target: 'string' }) })
    .step('a', { prompt: 'Go', response: type({}), next: { terminal: true } })
    .build();

  assert.throws(
    () => new WorkflowEngine(s, genericHost, {}),
    (err: Error) => {
      assert.ok(err.message.includes('my-skill'), 'should include skill name');
      assert.ok(err.message.includes('target'), 'should include field name');
      assert.ok(err.message.includes('--params'), 'should hint at --params flag');
      return true;
    },
  );
});

test('engine enforces maxVisits and routes to onMaxVisits', async () => {
  const s = skill({ name: 'bounded', entry: 'loop' })
    .step('loop', {
      prompt: 'Retry',
      response: type({ confidence: 'number' }),
      next: ({ response }) => (response.confidence < 0.7 ? 'loop' : 'report'),
      maxVisits: 2,
      onMaxVisits: 'report',
    })
    .step('report', { prompt: 'Report', response: type({}), next: { terminal: true } })
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

  const s = skill({ name: 'dynamic', entry: 'a', params: type({ name: 'string' }) })
    .step('a', { prompt: 'First', response: type({ val: 'number' }), next: 'b' })
    .step('b', {
      prompt: (ctx) => {
        capturedCtx = ctx;
        return `Previous: ${JSON.stringify(ctx.store.steps.history.at(-1)?.response)}`;
      },
      response: type({}),
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
  const s = skill({ name: 'replay', entry: 'a' })
    .step('a', {
      prompt: 'A',
      response: type({ val: 'string' }),
      next: 'b',
    })
    .step('b', {
      prompt: (ctx) => `Store: ${JSON.stringify(ctx.store.steps.a)}`,
      response: type({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.replayHistory([{ step: 'a', response: { val: 'hello' } }]);
  const prompt = engine.start();
  assert.ok(prompt);
});

test('engine runs action after validation, before transition', async () => {
  let actionRan = false;

  const writeAction = action({
    name: 'test-action',
    input: type({ content: 'string' }),
    output: type({ written: 'boolean' }),
    run: async ({ input }) => {
      actionRan = true;
      return { written: input.content.length > 0 };
    },
  });

  const s = skill({ name: 'with-action', entry: 'a' })
    .step('a', {
      prompt: 'Write something',
      response: type({ content: 'string' }),
      action: { run: writeAction },
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();

  const result = await engine.advance('a', { content: 'hello' });
  assert.ok(actionRan);
  assert.equal((result as DoneResult).done, true);
  assert.deepEqual((result as DoneResult).completed?.actionResult, { written: true });
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
    .step('a', { prompt: 'A', response: type({}), next: { terminal: true } })
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
    .step('a', { prompt: 'A', response: type({}), next: { terminal: true } })
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
    input: type({ path: 'string', content: 'string' }),
    output: type({ ok: 'boolean' }),
    run: async ({ input }) => {
      receivedInput = input;
      return { ok: true };
    },
  });

  const s = skill({ name: 'mapped', entry: 'a' })
    .step('a', {
      prompt: 'Decide',
      response: type({ fileName: 'string', body: 'string' }),
      action: {
        run: writeAction,
        input: ({ response }) => ({ path: `/out/${response.fileName}`, content: response.body }),
      },
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  await engine.advance('a', { fileName: 'report.md', body: 'hello' });
  assert.deepEqual(receivedInput, { path: '/out/report.md', content: 'hello' });
});

test('actionInput receives store accessor', async () => {
  let receivedInput: unknown;

  const myAction = action({
    name: 'a',
    input: type({ prefix: 'string', val: 'string' }),
    output: type({}),
    run: async ({ input }) => {
      receivedInput = input;
      return {};
    },
  });

  const s = skill({ name: 'store-map', entry: 'setup' })
    .step('setup', {
      prompt: 'Setup',
      response: type({ prefix: 'string' }),
      next: 'a',
    })
    .step('a', {
      prompt: 'Go',
      response: type({ val: 'string' }),
      action: {
        run: myAction,
        input: ({ response, store }) => ({
          prefix: store.steps.setup?.prefix ?? '',
          val: response.val,
        }),
      },
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  await engine.advance('setup', { prefix: 'pre' });
  await engine.advance('a', { val: 'test' });
  assert.deepEqual(receivedInput, { prefix: 'pre', val: 'test' });
});

test('action output is passed to transition function', async () => {
  const apiAction = action({
    name: 'api-call',
    input: type({ url: 'string' }),
    output: type({ status: 'number' }),
    run: async () => ({ status: 200 }),
  });

  const s = skill({ name: 'action-in-next', entry: 'call' })
    .step('call', {
      prompt: 'Call the API',
      response: type({ url: 'string' }),
      action: { run: apiAction },
      next: ({ actionResult }) => ((actionResult as { status: number }).status === 200 ? 'success' : 'failure'),
    })
    .step('success', { prompt: 'OK', response: type({}), next: { terminal: true } })
    .step('failure', { prompt: 'Fail', response: type({}), next: { terminal: true } })
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
      response: type({ ok: 'boolean' }),
      next: ({ actionResult }) => {
        capturedAction = actionResult;
        return 'b';
      },
    })
    .step('b', { prompt: 'B', response: type({}), next: { terminal: true } })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  await engine.advance('a', { ok: true });
  assert.equal(capturedAction, undefined);
});

test('action result is stored and accessible via store', async () => {
  let capturedActionResult: unknown;

  const apiAction = action({
    name: 'api',
    input: type({ url: 'string' }),
    output: type({ responseCode: 'number' }),
    run: async () => ({ responseCode: 201 }),
  });

  const s = skill({ name: 'post-store', entry: 'call' })
    .step('call', {
      prompt: 'Call API',
      response: type({ url: 'string' }),
      action: { run: apiAction },
      next: 'report',
    })
    .step('report', {
      prompt: (ctx) => {
        // Access the action result from the store history
        const callRecord = ctx.store.steps.history.find((r) => r.step === 'call');
        capturedActionResult = callRecord?.actionResult;
        return 'Report';
      },
      response: type({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  await engine.advance('call', { url: 'https://api.example.com' });
  assert.deepEqual(capturedActionResult, { responseCode: 201 });
});

test('action result is replayed correctly from history', () => {
  let capturedActionResult: unknown;

  const apiAction = action({
    name: 'api',
    input: type({ url: 'string' }),
    output: type({ code: 'number' }),
    run: async () => ({ code: 200 }),
  });

  const s = skill({ name: 'replay-after', entry: 'call' })
    .step('call', {
      prompt: (ctx) => {
        const record = ctx.store.steps.history.find((r) => r.step === 'call');
        capturedActionResult = record?.actionResult;
        return 'Call';
      },
      response: type({ url: 'string' }),
      action: { run: apiAction },
      next: 'report',
    })
    .step('report', {
      prompt: 'Report',
      response: type({}),
      next: { terminal: true },
    })
    .build();

  // Replay history with action output
  const engine = new WorkflowEngine(s, genericHost, {});
  engine.replayHistory([{ step: 'call', response: { url: 'https://x.com' }, actionResult: { code: 404 } }]);
  // start() builds prompt for entry step 'call', which captures action result
  engine.start();
  assert.deepEqual(capturedActionResult, { code: 404 });
});

test('action result and step response survive replay into next prompt', async () => {
  let capturedData: { fromResult: unknown; fromResponse: unknown; fromAction: unknown } | undefined;

  const fetchAction = action({
    name: 'fetch',
    input: type({ url: 'string' }),
    output: type({ spaceId: 'string' }),
    run: async () => ({ spaceId: 'never-called' }),
  });

  const s = skill({
    name: 'store-compare',
    entry: 'explore',
  })
    .step('explore', {
      prompt: 'Explore',
      response: type({ url: 'string' }),
      action: { run: fetchAction },
      next: 'triage',
    })
    .step('triage', {
      prompt: 'Triage',
      response: type({ decision: 'string' }),
      next: 'report',
    })
    .step('report', {
      prompt: (ctx) => {
        const exploreResult = ctx.store.steps.explore;
        const exploreRecord = ctx.store.steps.history.find((r) => r.step === 'explore');
        capturedData = {
          fromResult: exploreResult?.spaceId,
          fromResponse: (exploreRecord?.response as { url: string })?.url,
          fromAction: (exploreRecord?.actionResult as { spaceId: string })?.spaceId,
        };
        return 'Report';
      },
      response: type({}),
      next: { terminal: true },
    })
    .build();

  // Simulate: explore completed (with action), triage being advanced -> report prompt built
  // store.steps['step'] returns the step result (action output when action exists)
  const engine = new WorkflowEngine(s, genericHost, {});
  engine.replayHistory([{ step: 'explore', response: { url: 'https://x.com' }, actionResult: { spaceId: 'abc123' } }]);
  engine.start();
  await engine.advance('triage', { decision: 'go' });

  assert.deepEqual(capturedData, { fromResult: 'abc123', fromResponse: 'https://x.com', fromAction: 'abc123' });
});

test('action result survives cross-process replay into next step prompt', async () => {
  let capturedScanResult: unknown;

  const fetchAction = action({
    name: 'fetch',
    input: type({ url: 'string' }),
    output: type({ spaceId: 'string' }),
    run: async () => ({ spaceId: 'never-called' }),
  });

  const s = skill({ name: 'cross-process', entry: 'explore' })
    .step('explore', {
      prompt: 'Explore',
      response: type({ url: 'string' }),
      action: { run: fetchAction },
      next: 'triage',
    })
    .step('triage', {
      prompt: 'Triage',
      response: type({ decision: 'string' }),
      next: 'report',
    })
    .step('report', {
      prompt: (ctx) => {
        const record = ctx.store.steps.history.find((r) => r.step === 'explore');
        capturedScanResult = (record?.actionResult as { spaceId: string })?.spaceId;
        return 'Report';
      },
      response: type({ summary: 'string' }),
      next: { terminal: true },
    })
    .build();

  // Simulate process 3: explore and triage completed, advancing triage builds report prompt
  const engine = new WorkflowEngine(s, genericHost, {});
  engine.replayHistory([
    { step: 'explore', response: { url: 'https://x.com' }, actionResult: { spaceId: '58j6jt5cfhic' } },
    { step: 'triage', response: { decision: 'fix' } },
  ]);
  engine.start();
  const result = await engine.advance('triage', { decision: 'fix' });

  assert.equal((result as PromptResult).step, 'report');
  assert.equal(capturedScanResult, '58j6jt5cfhic');
});

test('result callback transforms what gets stored', async () => {
  const checkLinks = action({
    name: 'check-links',
    input: type({ urls: 'string[]' }),
    output: type({ statuses: type({ url: 'string', ok: 'boolean' }).array() }),
    run: async ({ input }) => ({
      statuses: input.urls.map((url: string) => ({ url, ok: url !== 'broken.com' })),
    }),
  });

  let storedResult: unknown;

  const s = skill({ name: 'with-result', entry: 'find-links' })
    .step('find-links', {
      prompt: 'Find links',
      response: type({ links: 'string[]' }),
      action: {
        run: checkLinks,
        input: ({ response }) => ({ urls: response.links }),
      },
      save: ({ response, actionResult }) => ({
        step: {
          totalLinks: response.links.length,
          broken: (actionResult as { statuses: { url: string; ok: boolean }[] }).statuses
            .filter((s) => !s.ok)
            .map((s) => s.url),
        },
      }),
      next: 'report',
    })
    .step('report', {
      prompt: (ctx) => {
        storedResult = ctx.store.steps['find-links'];
        return 'Report';
      },
      response: type({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  await engine.advance('find-links', { links: ['good.com', 'broken.com', 'ok.com'] });
  await engine.advance('report', {});

  assert.deepEqual(storedResult, { totalLinks: 3, broken: ['broken.com'] });
});

test('result defaults to action output when action exists but no result callback', async () => {
  const writeFile = action({
    name: 'write-file',
    input: type({ content: 'string' }),
    output: type({ path: 'string', bytes: 'number' }),
    run: async ({ input }) => ({ path: '/tmp/out.txt', bytes: input.content.length }),
  });

  let storedResult: unknown;

  const s = skill({ name: 'action-default', entry: 'write' })
    .step('write', {
      prompt: 'Write something',
      response: type({ content: 'string' }),
      action: { run: writeFile },
      next: 'done',
    })
    .step('done', {
      prompt: (ctx) => {
        storedResult = ctx.store.steps.write;
        return 'Done';
      },
      response: type({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  await engine.advance('write', { content: 'hello world' });
  await engine.advance('done', {});

  assert.deepEqual(storedResult, { path: '/tmp/out.txt', bytes: 11 });
});

test('result defaults to response when no action and no result callback', async () => {
  let storedResult: unknown;

  const s = skill({ name: 'response-default', entry: 'greet' })
    .step('greet', {
      prompt: 'Say hello',
      response: type({ name: 'string' }),
      next: 'done',
    })
    .step('done', {
      prompt: (ctx) => {
        storedResult = ctx.store.steps.greet;
        return 'Done';
      },
      response: type({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  await engine.advance('greet', { name: 'Alice' });
  await engine.advance('done', {});

  assert.deepEqual(storedResult, { name: 'Alice' });
});

test('DAG narrowing: linear predecessors are guaranteed on store', async () => {
  let capturedName: string | undefined;

  const s = skill({ name: 'linear-narrow', entry: 'greet' })
    .step('greet', {
      prompt: 'Say hi',
      response: type({ name: 'string' }),
      next: 'profile',
    })
    .step('profile', {
      prompt: ({ store }) => {
        // greet is a guaranteed predecessor (linear chain) — non-optional access
        capturedName = store.steps.greet.name;
        return 'Profile';
      },
      response: type({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  await engine.advance('greet', { name: 'Alice' });
  await engine.advance('profile', {});

  assert.equal(capturedName, 'Alice');
});

test('store property access provides typed history access', async () => {
  let stepAResult: unknown;

  const s = skill({ name: 'get-step', entry: 'a' })
    .step('a', { prompt: 'A', response: type({ val: 'number' }), next: 'b' })
    .step('b', {
      prompt: (ctx) => {
        stepAResult = ctx.store.steps.a;
        return 'B';
      },
      response: type({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  await engine.advance('a', { val: 42 });
  assert.deepEqual(stepAResult, { val: 42 });
});

test('store property access returns undefined for missing step', async () => {
  let result: unknown = 'not-set';

  const s = skill({ name: 'get-step-missing', entry: 'a' })
    .step('a', {
      prompt: (ctx) => {
        result = (ctx.store.steps as unknown as Record<string, unknown>)['nonexistent'];
        return 'A';
      },
      response: type({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  assert.equal(result, undefined);
});

test('engine returns RedirectResult when next target is not a local step', async () => {
  const s = skill({ name: 'redirect-test', entry: 'classify' })
    .step('classify', {
      prompt: 'Classify',
      response: type({ intent: 'string' }),
      next: ({ response }) => `subskill:${response.intent}`,
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  const result = await engine.advance('classify', { intent: 'doctor' });

  const redirect = result as RedirectResult;
  assert.equal(redirect.redirect, 'subskill:doctor');
  assert.deepEqual(redirect.completed, {
    step: 'classify',
    response: { intent: 'doctor' },
    actionResult: undefined,
    result: { intent: 'doctor' },
  });
  // store is a StoreAccessor
  assert.ok(redirect.store);
  assert.equal(typeof redirect.store.steps.ran, 'function');
});

test('engine returns RedirectResult for topic targets', async () => {
  const s = skill({ name: 'topic-redirect', entry: 'ask' })
    .step('ask', {
      prompt: 'What topic?',
      response: type({ topic: 'string' }),
      next: ({ response }) => `topic:${response.topic}`,
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
    .step('a', { prompt: 'A', response: type({}), next: 'b' })
    .step('b', { prompt: 'B', response: type({}), next: { terminal: true } })
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
      response: type({}),
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
      response: type({}),
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
      response: type({}),
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
        output: type({ result: 'string' }),
      }),
      response: type({ result: 'string' }),
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
        output: type({ result: 'string' }),
        allowRecursion: true,
      }),
      response: type({ result: 'string' }),
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
      response: type({}),
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
      response: type({}),
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
      response: type({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  const result = engine.start();

  assert.ok(result.preamble!.startsWith('You are helpful.'));
  assert.ok(result.preamble!.includes('| Tag |'));
});

// --- Prompt-less and output-less steps ---

test('isPromptless returns true for steps without prompt', () => {
  const s = skill({ name: 'promptless', entry: 'gate' })
    .step('gate', { response: type({}), next: { terminal: true } })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  assert.equal(engine.isPromptless('gate'), true);
});

test('isPromptless returns false for steps with prompt', () => {
  const s = skill({ name: 'prompted', entry: 'a' })
    .step('a', { prompt: 'Go', response: type({}), next: { terminal: true } })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  assert.equal(engine.isPromptless('a'), false);
});

test('prompt-less step can be advanced with empty output', async () => {
  const s = skill({ name: 'gate-advance', entry: 'gate' })
    .step('gate', {
      response: type({}),
      next: 'main',
    })
    .step('main', {
      prompt: (ctx) => `Routed: ${ctx.store.steps.ran('gate')}`,
      response: type({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  const result = await engine.advance('gate', {});
  assert.equal((result as PromptResult).step, 'main');
  assert.ok((result as PromptResult).prompt.includes('Routed: true'));
});

test('output-less step skips validation and omits schema', () => {
  const s = skill({ name: 'outputless', entry: 'display' })
    .step('display', { prompt: 'Show results', next: { terminal: true } })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  const result = engine.start();
  assert.equal(result.step, 'display');
  assert.equal(result.schema, null);
});

test('output-less step advance succeeds without validation', async () => {
  const s = skill({ name: 'outputless-advance', entry: 'display' })
    .step('display', { prompt: 'Show results', next: { terminal: true } })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  const result = await engine.advance('display', {});
  assert.equal((result as DoneResult).done, true);
});

test('prompt-less + output-less step is a pure routing gate', async () => {
  const s = skill({ name: 'pure-gate', entry: 'gate', params: type({ fast: 'boolean' }) })
    .step('gate', {
      next: ({ params }) => (params.fast ? 'quick' : 'full'),
    })
    .step('quick', { prompt: 'Quick mode', response: type({}), next: { terminal: true } })
    .step('full', { prompt: 'Full mode', response: type({}), next: { terminal: true } })
    .build();

  const engine = new WorkflowEngine(s, genericHost, { fast: true });
  engine.start();
  const result = await engine.advance('gate', {});
  assert.equal((result as PromptResult).step, 'quick');
});

test('prompt-less step with action runs action before transitioning', async () => {
  let actionRan = false;

  const checkAction = action({
    name: 'check',
    input: type({}),
    output: type({ ok: 'boolean' }),
    run: async () => {
      actionRan = true;
      return { ok: true };
    },
  });

  const s = skill({ name: 'gate-action', entry: 'check' })
    .step('check', {
      response: type({}),
      action: { run: checkAction },
      next: 'main',
    })
    .step('main', { prompt: 'Go', response: type({}), next: { terminal: true } })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  const result = await engine.advance('check', {});
  assert.ok(actionRan);
  assert.equal((result as PromptResult).step, 'main');
});

test('engine with required params can be reconstructed for advance', async () => {
  const s = skill({ name: 'param-advance', entry: 'a', params: type({ target: 'string' }) })
    .step('a', {
      prompt: (ctx) => `Target: ${(ctx.params as { target: string }).target}`,
      response: type({ ok: 'boolean' }),
      next: 'b',
    })
    .step('b', { prompt: 'Done', response: type({}), next: { terminal: true } })
    .build();

  const params = { target: 'https://example.com' };
  const engine1 = new WorkflowEngine(s, genericHost, params);
  engine1.start();
  const r1 = await engine1.advance('a', { ok: true });
  assert.equal((r1 as PromptResult).step, 'b');

  const engine2 = new WorkflowEngine(s, genericHost, params);
  engine2.replayHistory([{ step: 'a', response: { ok: true } }]);
  engine2.start();
  const r2 = await engine2.advance('b', {});
  assert.equal((r2 as DoneResult).done, true);
});

// ============================================================
// Sub-store tests
// ============================================================

test('save writes sub-store data accessible in next step prompt', async () => {
  let capturedHost: unknown;
  const s = skill({
    name: 'sub-store',
    entry: 'gather',
    stores: { environment: type({ host: 'string' }) },
  })
    .step('gather', {
      prompt: 'Gather',
      response: type({ host: 'string' }),
      save: ({ response }) => ({ environment: { host: response.host } }),
      next: 'use',
    })
    .step('use', {
      prompt: (ctx) => {
        capturedHost = (ctx.store as Record<string, unknown>).environment;
        return 'Use';
      },
      response: type({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  await engine.advance('gather', { host: 'api.example.com' });
  assert.deepEqual(capturedHost, { host: 'api.example.com' });
});

test('two steps writing to same sub-store deep-merge', async () => {
  let capturedEnv: unknown;
  const s = skill({
    name: 'merge-stores',
    entry: 'a',
    stores: { env: type({ apiA: { host: 'string' }, apiB: { host: 'string' } }) },
  })
    .step('a', {
      prompt: 'A',
      response: type({ host: 'string' }),
      save: ({ response }) => ({ env: { apiA: { host: response.host } } }),
      next: 'b',
    })
    .step('b', {
      prompt: 'B',
      response: type({ host: 'string' }),
      save: ({ response }) => ({ env: { apiB: { host: response.host } } }),
      next: 'c',
    })
    .step('c', {
      prompt: (ctx) => {
        capturedEnv = (ctx.store as Record<string, unknown>).env;
        return 'C';
      },
      response: type({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  await engine.advance('a', { host: 'a.com' });
  await engine.advance('b', { host: 'b.com' });
  assert.deepEqual(capturedEnv, { apiA: { host: 'a.com' }, apiB: { host: 'b.com' } });
});

test('save with both step and sub-store keys', async () => {
  let capturedStep: unknown;
  let capturedEnv: unknown;
  const s = skill({
    name: 'both',
    entry: 'a',
    stores: { env: type({ host: 'string' }) },
  })
    .step('a', {
      prompt: 'A',
      response: type({ val: 'string' }),
      save: ({ response }) => ({
        step: { transformed: response.val.toUpperCase() },
        env: { host: response.val },
      }),
      next: 'b',
    })
    .step('b', {
      prompt: (ctx) => {
        capturedStep = ctx.store.steps.a;
        capturedEnv = (ctx.store as Record<string, unknown>).env;
        return 'B';
      },
      response: type({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  await engine.advance('a', { val: 'hello' });
  assert.deepEqual(capturedStep, { transformed: 'HELLO' });
  assert.deepEqual(capturedEnv, { host: 'hello' });
});

test('replayHistory rebuilds sub-store state from save callbacks', async () => {
  let capturedEnv: unknown;
  const s = skill({
    name: 'replay-stores',
    entry: 'a',
    stores: { env: type({ host: 'string' }) },
  })
    .step('a', {
      prompt: 'A',
      response: type({ host: 'string' }),
      save: ({ response }) => ({ env: { host: response.host } }),
      next: 'b',
    })
    .step('b', {
      prompt: (ctx) => {
        capturedEnv = (ctx.store as Record<string, unknown>).env;
        return 'B';
      },
      response: type({}),
      next: { terminal: true },
    })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.replayHistory([{ step: 'a', response: { host: 'replayed.com' } }]);
  engine.start();
  // Advance past replayed step a to reach b (where we capture sub-store)
  const p2 = await engine.advance('a', { host: 'replayed.com' });
  assert.equal((p2 as PromptResult).step, 'b');
  assert.deepEqual(capturedEnv, { host: 'replayed.com' });
});

test('skill without stores — zero regression', async () => {
  const s = skill({ name: 'no-stores', entry: 'a' })
    .step('a', { prompt: 'A', response: type({ val: 'string' }), next: { terminal: true } })
    .build();

  const engine = new WorkflowEngine(s, genericHost, {});
  engine.start();
  const done = await engine.advance('a', { val: 'ok' });
  assert.equal((done as DoneResult).done, true);
});
