import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { skill } from '../skill.js';
import { runSkill } from './run-skill.js';
import { mockModel } from './mock-model.js';

const CheckResult = z.object({
  name: z.string(),
  status: z.enum(['pass', 'fail']),
  detail: z.string(),
});

const doctor = skill({ name: 'repo-doctor', entry: 'diagnose' })
  .step('diagnose', {
    prompt: 'Inspect the repository and report failed health checks.',
    output: z.object({ checks: z.array(CheckResult) }),
    next: ({ output }) => (output.checks.some((c) => c.status === 'fail') ? 'remediate' : 'report'),
  })
  .step('remediate', {
    prompt: 'Fix the failing checks.',
    output: z.object({ remediations: z.array(z.object({ check: z.string(), action: z.string() })) }),
    next: 'report',
  })
  .step('report', {
    prompt: 'Generate a report.',
    output: z.object({ summary: z.string() }),
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

test('runSkill provides final output', async () => {
  const result = await runSkill(doctor, {
    model: mockModel({
      diagnose: { checks: [] },
      report: { summary: 'Nothing to do' },
    }),
  });

  assert.deepEqual(result.output, { summary: 'Nothing to do' });
});

test('runSkill with context overrides', async () => {
  const s = skill({ name: 'ctx-skill', entry: 'a', context: z.object({ path: z.string().default('.') }) })
    .step('a', {
      prompt: (ctx) => `Analyze ${ctx.context.path}`,
      output: z.object({ done: z.boolean() }),
      next: { terminal: true },
    })
    .build();

  const result = await runSkill(s, {
    context: { path: '/custom' },
    model: mockModel({ a: { done: true } }),
  });

  assert.deepEqual(result.output, { done: true });
});

test('runSkill throws on schema mismatch', async () => {
  const s = skill({ name: 'strict', entry: 'a' })
    .step('a', { prompt: 'Go', output: z.object({ count: z.number() }), next: { terminal: true } })
    .build();

  await assert.rejects(() => runSkill(s, { model: mockModel({ a: { count: 'not-a-number' } }) }), /Validation error/);
});

test('mockModel with function adapter', async () => {
  const s = skill({ name: 'fn-mock', entry: 'a' })
    .step('a', {
      prompt: 'Do it',
      output: z.object({ answer: z.string() }),
      next: { terminal: true },
    })
    .build();

  const result = await runSkill(s, {
    model: mockModel({ a: (prompt: string) => ({ answer: `Got: ${prompt}` }) }),
  });

  assert.ok((result.output as { answer: string }).answer.includes('Do it'));
});

test('mockModel with array for repeated visits', async () => {
  const s = skill({ name: 'loop-skill', entry: 'retry' })
    .step('retry', {
      prompt: 'Try',
      output: z.object({ confidence: z.number() }),
      next: ({ output }) => (output.confidence >= 0.8 ? 'done' : 'retry'),
      maxVisits: 3,
      onMaxVisits: 'done',
    })
    .step('done', { prompt: 'Done', output: z.object({}), next: { terminal: true } })
    .build();

  const result = await runSkill(s, {
    model: mockModel({
      retry: [{ confidence: 0.3 }, { confidence: 0.9 }],
      done: {},
    }),
  });

  assert.deepEqual(result.path, ['retry', 'retry', 'done']);
});
