import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { skill } from '../skill.js';
import { action } from '../action.js';
import { SubskillEngine } from './subskill-engine.js';
import type { Handshake, PromptResult, DoneResult, ValidationErrorResult } from '../types.js';

const genericHost: Handshake = { host: 'generic', toolsAvailable: [], isSubagent: false };

const scanAction = action({
  name: 'scan',
  input: z.object({ path: z.string() }),
  output: z.object({ found: z.string() }),
  run: async ({ input }) => ({ found: `scanned:${input.path}` }),
});

const doctorSkill = skill({ name: 'doctor', entry: 'diagnose', stash: z.object({ scanResult: z.string() }) })
  .step('diagnose', {
    prompt: 'Diagnose.',
    output: z.object({ issue: z.string() }),
    action: {
      run: scanAction,
      input: ({ output }) => ({ path: output.issue }),
      stash: ({ result }) => ({ scanResult: result.found }),
    },
    next: 'report',
  })
  .step('report', {
    prompt: (ctx) => `Report: scanResult=${JSON.stringify(ctx.stash.scanResult)}`,
    output: z.object({ summary: z.string() }),
    next: { terminal: true },
  })
  .build();

test('SubskillEngine.start qualifies step name', () => {
  const sub = new SubskillEngine(doctorSkill, genericHost, {}, { load: () => '', asset: (p) => p }, 'doctor');
  const result = sub.start();
  assert.equal(result.step, 'doctor/diagnose');
});

test('SubskillEngine.advance qualifies prompt step and completed step', async () => {
  const sub = new SubskillEngine(doctorSkill, genericHost, {}, { load: () => '', asset: (p) => p }, 'doctor');
  sub.start();
  const result = (await sub.advance('doctor/diagnose', { issue: '/src' })) as PromptResult;
  assert.equal(result.step, 'doctor/report');
  assert.equal(result.completed?.step, 'doctor/diagnose');
});

test('SubskillEngine.advance strips prefix from already-qualified step', async () => {
  const sub = new SubskillEngine(doctorSkill, genericHost, {}, { load: () => '', asset: (p) => p }, 'doctor');
  sub.start();
  const result = (await sub.advance('doctor/diagnose', { issue: '/src' })) as PromptResult;
  assert.equal(result.step, 'doctor/report');
});

test('SubskillEngine.advance tolerates bare step name', async () => {
  const sub = new SubskillEngine(doctorSkill, genericHost, {}, { load: () => '', asset: (p) => p }, 'doctor');
  sub.start();
  const result = (await sub.advance('diagnose', { issue: '/src' })) as PromptResult;
  assert.equal(result.step, 'doctor/report');
});

test('SubskillEngine.advance qualifies validation error step', async () => {
  const sub = new SubskillEngine(doctorSkill, genericHost, {}, { load: () => '', asset: (p) => p }, 'doctor');
  sub.start();
  const result = (await sub.advance('diagnose', { bad: 'data' })) as ValidationErrorResult;
  assert.equal(result.error, 'validation');
  assert.equal(result.step, 'doctor/diagnose');
});

test('SubskillEngine.advance qualifies done result completed step', async () => {
  const sub = new SubskillEngine(doctorSkill, genericHost, {}, { load: () => '', asset: (p) => p }, 'doctor');
  sub.start();
  await sub.advance('diagnose', { issue: '/src' });
  const result = (await sub.advance('report', { summary: 'ok' })) as DoneResult;
  assert.equal(result.done, true);
  assert.equal(result.completed?.step, 'doctor/report');
});

test('SubskillEngine.replayHistory filters and unqualifies entries', async () => {
  let capturedStash: unknown;

  const stashSkill = skill({ name: 'doc', entry: 'a', stash: z.object({ val: z.string() }) })
    .step('a', {
      prompt: 'A',
      output: z.object({ v: z.string() }),
      stash: ({ output }) => ({ val: output.v }),
      next: 'b',
    })
    .step('b', {
      prompt: 'B',
      output: z.object({ x: z.string() }),
      next: 'c',
    })
    .step('c', {
      prompt: (ctx) => {
        capturedStash = ctx.stash;
        return 'C';
      },
      output: z.object({}),
      next: { terminal: true },
    })
    .build();

  const sub = new SubskillEngine(stashSkill, genericHost, {}, { load: () => '', asset: (p) => p }, 'doc');
  // Mixed history: dispatcher entry, this subskill entry, another subskill entry
  sub.replayHistory([
    { step: 'classify', output: { intent: 'doc' } },
    { step: 'doc/a', output: { v: 'hello' } },
    { step: 'other/x', output: {} },
  ]);
  sub.startForReplay();
  // Advance b → builds c prompt which captures stash
  const result = await sub.advance('doc/b', { x: 'ok' });
  assert.equal((result as PromptResult).step, 'doc/c');
  assert.deepEqual(capturedStash, { val: 'hello' });
});
