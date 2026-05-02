import test from 'node:test';
import assert from 'node:assert/strict';
import { type } from 'arktype';
import { skill } from '../skill.js';
import { runSkill } from './run-skill.js';
import { mockModel } from './mock-model.js';

const CheckResult = type({
  name: 'string',
  status: "'pass' | 'fail'",
  detail: 'string',
});

const doctor = skill({ name: 'repo-doctor', entry: 'diagnose' })
  .step('diagnose', {
    prompt: 'Inspect the repository and report failed health checks.',
    response: type({ checks: CheckResult.array() }),
    next: ({ response }) => (response.checks.some((c) => c.status === 'fail') ? 'remediate' : 'report'),
  })
  .step('remediate', {
    prompt: 'Fix the failing checks.',
    response: type({ remediations: type({ check: 'string', action: 'string' }).array() }),
    next: 'report',
  })
  .step('report', {
    prompt: 'Generate a report.',
    response: type({ summary: 'string' }),
    next: { terminal: true },
  })
  .build();

test('runSkill routes to remediate when checks fail (SPEC §10 example)', async () => {
  const result = await runSkill(doctor, {
    model: mockModel({
      diagnose: { checks: [{ name: 'ci', status: 'fail', detail: 'no CI config' }] },
      remediate: { remediations: [{ check: 'ci', action: 'add .github/workflows/ci.yml' }] },
      report: { summary: 'CI config added' },
    }),
  });

  assert.deepEqual(result.path, ['diagnose', 'remediate', 'report']);
});

test('runSkill routes to report when all checks pass', async () => {
  const result = await runSkill(doctor, {
    model: mockModel({
      diagnose: { checks: [{ name: 'ci', status: 'pass', detail: 'ok' }] },
      report: { summary: 'All good' },
    }),
  });

  assert.deepEqual(result.path, ['diagnose', 'report']);
});

test('runSkill provides final stepOutput', async () => {
  const result = await runSkill(doctor, {
    model: mockModel({
      diagnose: { checks: [] },
      report: { summary: 'Nothing to do' },
    }),
  });

  assert.deepEqual(result.response, { summary: 'Nothing to do' });
});

test('runSkill with params overrides', async () => {
  const s = skill({ name: 'ctx-skill', entry: 'a', params: type({ path: 'string = "."' }) })
    .step('a', {
      prompt: (ctx) => `Analyze ${ctx.params.path}`,
      response: type({ done: 'boolean' }),
      next: { terminal: true },
    })
    .build();

  const result = await runSkill(s, {
    params: { path: '/custom' },
    model: mockModel({ a: { done: true } }),
  });

  assert.deepEqual(result.response, { done: true });
});

test('runSkill throws on schema mismatch', async () => {
  const s = skill({ name: 'strict', entry: 'a' })
    .step('a', { prompt: 'Go', response: type({ count: 'number' }), next: { terminal: true } })
    .build();

  await assert.rejects(() => runSkill(s, { model: mockModel({ a: { count: 'not-a-number' } }) }), /Validation error/);
});

test('mockModel with function adapter', async () => {
  const s = skill({ name: 'fn-mock', entry: 'a' })
    .step('a', {
      prompt: 'Do it',
      response: type({ answer: 'string' }),
      next: { terminal: true },
    })
    .build();

  const result = await runSkill(s, {
    model: mockModel({ a: (prompt: string) => ({ answer: `Got: ${prompt}` }) }),
  });

  assert.ok((result.response as { answer: string }).answer.includes('Do it'));
});

test('mockModel with array for repeated visits', async () => {
  const s = skill({ name: 'loop-skill', entry: 'retry' })
    .step('retry', {
      prompt: 'Try',
      response: type({ confidence: 'number' }),
      next: ({ response }) => (response.confidence >= 0.8 ? 'done' : 'retry'),
      maxVisits: 3,
      onMaxVisits: 'done',
    })
    .step('done', { prompt: 'Done', response: type({}), next: { terminal: true } })
    .build();

  const result = await runSkill(s, {
    model: mockModel({
      retry: [{ confidence: 0.3 }, { confidence: 0.9 }],
      done: {},
    }),
  });

  assert.deepEqual(result.path, ['retry', 'retry', 'done']);
});

test('runSkill auto-advances prompt-less steps', async () => {
  const s = skill({ name: 'auto-advance', entry: 'gate', params: type({ skip: 'boolean' }) })
    .step('gate', {
      next: ({ params }) => (params.skip ? 'fast' : 'slow'),
    })
    .step('fast', { prompt: 'Fast path', response: type({}), next: { terminal: true } })
    .step('slow', { prompt: 'Slow path', response: type({}), next: { terminal: true } })
    .build();

  const result = await runSkill(s, {
    params: { skip: true },
    model: mockModel({ fast: {} }),
  });

  assert.deepEqual(result.path, ['gate', 'fast']);
});

test('runSkill handles output-less terminal step', async () => {
  const s = skill({ name: 'outputless', entry: 'work' })
    .step('work', { prompt: 'Do work', response: type({ done: 'boolean' }), next: 'farewell' })
    .step('farewell', { prompt: 'Goodbye', next: { terminal: true } })
    .build();

  const result = await runSkill(s, {
    model: mockModel({
      work: { done: true },
      farewell: {},
    }),
  });

  assert.deepEqual(result.path, ['work', 'farewell']);
});
