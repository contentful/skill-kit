import test from 'node:test';
import assert from 'node:assert/strict';
import { type } from 'arktype';
import { skill } from '../skill.js';
import { action } from '../action.js';
import { SubskillEngine } from './subskill-engine.js';
import type { Handshake, PromptResult, DoneResult, ValidationErrorResult } from '../types.js';

const genericHost: Handshake = { host: 'generic', toolsAvailable: [], isSubagent: false };

const scanAction = action({
  name: 'scan',
  input: type({ path: 'string' }),
  output: type({ found: 'string' }),
  run: async ({ input }) => ({ found: `scanned:${input.path}` }),
});

const doctorSkill = skill({ name: 'doctor', entry: 'diagnose' })
  .step('diagnose', {
    prompt: 'Diagnose.',
    response: type({ issue: 'string' }),
    action: {
      run: scanAction,
      mapInput: ({ response }) => ({ path: response.issue }),
    },
    next: 'report',
  })
  .step('report', {
    prompt: (ctx) => {
      const record = ctx.store.steps.history.find((r) => r.step === 'diagnose');
      return `Report: scanResult=${JSON.stringify((record?.actionResult as { found: string })?.found)}`;
    },
    response: type({ summary: 'string' }),
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
  let capturedStoreValue: unknown;

  const storeSkill = skill({ name: 'doc', entry: 'a' })
    .step('a', {
      prompt: 'A',
      response: type({ v: 'string' }),
      next: 'b',
    })
    .step('b', {
      prompt: 'B',
      response: type({ x: 'string' }),
      next: 'c',
    })
    .step('c', {
      prompt: (ctx) => {
        capturedStoreValue = ctx.store.steps.a;
        return 'C';
      },
      response: type({}),
      next: { terminal: true },
    })
    .build();

  const sub = new SubskillEngine(storeSkill, genericHost, {}, { load: () => '', asset: (p) => p }, 'doc');
  // Mixed history: dispatcher entry, this subskill entry, another subskill entry
  sub.replayHistory([
    { step: 'classify', response: { intent: 'doc' } },
    { step: 'doc/a', response: { v: 'hello' } },
    { step: 'other/x', response: {} },
  ]);
  sub.startForReplay();
  // Advance b -> builds c prompt which captures store
  const result = await sub.advance('doc/b', { x: 'ok' });
  assert.equal((result as PromptResult).step, 'doc/c');
  assert.deepEqual(capturedStoreValue, { v: 'hello' });
});
