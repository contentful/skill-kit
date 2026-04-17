import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { skill } from './skill.js';
import { module } from './module.js';
import { runSkill, mockModel } from './test.js';

test('module() creates a ModuleDefinition with steps', () => {
  const mod = module({
    name: 'auth',
    entry: 'login',
    stash: z.object({ userId: z.string() }),
  })
    .step('login', {
      prompt: 'Ask for credentials.',
      output: z.object({ userId: z.string() }),
      stash: ({ output }) => ({ userId: output.userId }),
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
    stash: z.object({ userId: z.string() }),
  })
    .step('login', {
      prompt: ({ stash }) => {
        const _check: string = stash.userId;
        void _check;
        return 'Login';
      },
      output: z.object({ userId: z.string() }),
      stash: ({ output }) => ({ userId: output.userId }),
      next: 'verify',
    })
    .step('verify', {
      prompt: ({ stash }) => `Verify ${stash.userId}`,
      output: z.object({ ok: z.boolean() }),
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
    stash: z.object({ userId: z.string() }),
  })
    .step('auth-login', {
      prompt: 'Log in.',
      output: z.object({ userId: z.string() }),
      stash: ({ output }) => ({ userId: output.userId }),
      next: '__parent__',
    })
    .build();

  const s = skill({
    name: 'app',
    entry: 'start',
    stash: z.object({ appName: z.string() }),
  })
    .step('start', {
      prompt: 'Welcome.',
      output: z.object({ appName: z.string() }),
      stash: ({ output }) => ({ appName: output.appName }),
      next: 'auth-login',
    })
    .register(authModule, { next: 'dashboard' })
    .step('dashboard', {
      prompt: ({ stash }) => `Welcome ${stash.userId} to ${stash.appName}`,
      output: z.object({}),
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

test('module context is unknown (module steps cannot access parent context)', () => {
  const mod = module({
    name: 'isolated',
    entry: 'step1',
    stash: z.object({ val: z.string() }),
  })
    .step('step1', {
      prompt: ({ context }) => {
        // context should be unknown — module doesn't see parent context
        void context;
        return 'Do something';
      },
      output: z.object({ val: z.string() }),
      stash: ({ output }) => ({ val: output.val }),
      next: '__parent__',
    })
    .build();

  assert.ok(mod.steps['step1']);
});

test('module().build() throws on missing entry step', () => {
  assert.throws(
    () =>
      module({ name: 'bad', entry: 'missing', stash: z.object({}) })
        .step('other', { prompt: 'x', output: z.object({}), next: '__parent__' })
        .build(),
    /entry step "missing" not found/,
  );
});
