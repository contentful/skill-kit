import test from 'node:test';
import assert from 'node:assert/strict';
import { type } from 'arktype';
import { skill } from './skill.js';
import { module } from './module.js';
import { runSkill, mockModel } from './test.js';

test('module() creates a ModuleDefinition with steps', () => {
  const mod = module({
    name: 'auth',
    entry: 'login',
    stash: type({ userId: 'string' }),
  })
    .step('login', {
      prompt: 'Ask for credentials.',
      output: type({ userId: 'string' }),
      updateStash: ({ stepOutput }) => ({ userId: stepOutput.userId }),
      next: '__parent__',
    })
    .build();

  assert.equal(mod.kind, 'module');
  assert.equal(mod.name, 'auth');
  assert.equal(mod.entry, 'login');
  assert.ok(mod.steps['login']);
});

test('module stash type flows into step prompt callbacks', () => {
  const mod = module({
    name: 'auth',
    entry: 'login',
    stash: type({ userId: 'string' }),
  })
    .step('login', {
      prompt: ({ stash }) => {
        const _check: string = stash.userId;
        void _check;
        return 'Login';
      },
      output: type({ userId: 'string' }),
      updateStash: ({ stepOutput }) => ({ userId: stepOutput.userId }),
      next: 'verify',
    })
    .step('verify', {
      prompt: ({ stash }) => `Verify ${stash.userId}`,
      output: type({ ok: 'boolean' }),
      next: '__parent__',
    })
    .build();

  assert.ok(mod.steps['login']);
  assert.ok(mod.steps['verify']);
});

test('skill.register() merges module steps and wires __parent__', async () => {
  const authModule = module({
    name: 'auth',
    entry: 'auth-login',
    stash: type({ userId: 'string' }),
  })
    .step('auth-login', {
      prompt: 'Log in.',
      output: type({ userId: 'string' }),
      updateStash: ({ stepOutput }) => ({ userId: stepOutput.userId }),
      next: '__parent__',
    })
    .build();

  const s = skill({
    name: 'app',
    entry: 'start',
    stash: type({ appName: 'string' }),
  })
    .step('start', {
      prompt: 'Welcome.',
      output: type({ appName: 'string' }),
      updateStash: ({ stepOutput }) => ({ appName: stepOutput.appName }),
      next: 'auth-login',
    })
    .register(authModule, { next: 'dashboard' })
    .step('dashboard', {
      prompt: ({ stash }) => `Welcome ${stash.userId} to ${stash.appName}`,
      output: type({}),
      next: { terminal: true },
    })
    .build();

  assert.ok(s.steps['auth-login']);
  assert.ok(s.steps['dashboard']);

  const result = await runSkill(s, {
    model: mockModel({
      start: { appName: 'MyApp' },
      'auth-login': { userId: 'alice' },
      dashboard: {},
    }),
  });

  assert.deepEqual(result.path, ['start', 'auth-login', 'dashboard']);
});

test('module params is unknown (module steps cannot access parent params)', () => {
  const mod = module({
    name: 'isolated',
    entry: 'step1',
    stash: type({ val: 'string' }),
  })
    .step('step1', {
      prompt: ({ params }) => {
        // params should be unknown — module doesn't see parent params
        void params;
        return 'Do something';
      },
      output: type({ val: 'string' }),
      updateStash: ({ stepOutput }) => ({ val: stepOutput.val }),
      next: '__parent__',
    })
    .build();

  assert.ok(mod.steps['step1']);
});

test('module().build() throws on missing entry step', () => {
  assert.throws(
    () =>
      module({ name: 'bad', entry: 'missing', stash: type({}) })
        .step('other', { prompt: 'x', output: type({}), next: '__parent__' })
        .build(),
    /entry step "missing" not found/,
  );
});
