/**
 * Type-level tests for sub-store types.
 *
 * Run: pnpm exec tsc --noEmit
 * Passing = compiles silently. Failing = type error.
 */

import { type } from 'arktype';
import { skill, action } from '../index.js';
import type { Expect, Equal, IsOptional } from './test-utils.js';
import type { DeepPartial, DeepReadonly, SubStoreView, StoreView, InferStores } from './store.js';

// ============================================================
// DeepPartial
// ============================================================

type Nested = { a: { b: string; c: number }; d: boolean };
type _dp1 = Expect<Equal<DeepPartial<Nested>, { a?: { b?: string; c?: number }; d?: boolean }>>;

type _dp2 = Expect<Equal<DeepPartial<string>, string>>;
type _dp3 = Expect<Equal<DeepPartial<{ x: string }>, { x?: string }>>;

// ============================================================
// DeepReadonly
// ============================================================

type _dr1 = Expect<Equal<DeepReadonly<{ a: string }>, { readonly a: string }>>;
type _dr2 = Expect<Equal<DeepReadonly<{ a: { b: number } }>, { readonly a: { readonly b: number } }>>;

// ============================================================
// SubStoreView
// ============================================================

type Stores = { environment: { host: string; port: number }; diagnostics: { healthy: boolean } };
type SSV = SubStoreView<Stores>;

type _ssv1 = Expect<IsOptional<SSV['environment']>>;
type _ssv2 = Expect<IsOptional<SSV['diagnostics']>>;

// ============================================================
// StoreView with sub-stores
// ============================================================

type Steps = { greet: { name: string } };
type ViewWithStores = StoreView<Steps, 'greet', Stores>;

// Steps accessible under .steps
type _vws1 = Expect<Equal<ViewWithStores['steps']['greet'], { name: string }>>;

// Sub-stores at top level, optional
type _vws2 = Expect<IsOptional<ViewWithStores['environment']>>;
type _vws3 = Expect<IsOptional<ViewWithStores['diagnostics']>>;

// ============================================================
// StoreView without sub-stores (backward compatible)
// ============================================================

type ViewNoStores = StoreView<Steps, 'greet'>;
type _vns1 = Expect<Equal<ViewNoStores['steps']['greet'], { name: string }>>;

// ============================================================
// InferStores
// ============================================================

// Use actual type() calls to get the right schema types
declare const envSchema: ReturnType<typeof type<{ host: 'string'; port: 'number' }>>;
declare const diagSchema: ReturnType<typeof type<{ healthy: 'boolean' }>>;
type Schemas = { environment: typeof envSchema; diagnostics: typeof diagSchema };
type Inferred = InferStores<Schemas>;
type _is1 = Expect<Equal<Inferred['environment'], { host: string; port: number }>>;
type _is2 = Expect<Equal<Inferred['diagnostics'], { healthy: boolean }>>;

// ============================================================
// Builder with stores: save writes sub-stores
// ============================================================

const writeFile = action({
  name: 'write',
  input: type({ content: 'string' }),
  output: type({ path: 'string', bytes: 'number' }),
  run: async ({ input }) => ({ path: '/tmp/test', bytes: input.content.length }),
});

skill({
  name: 'sub-store-test',
  entry: 'gather',
  stores: {
    environment: type({ host: 'string', port: 'number' }),
  },
})
  .step('gather', {
    prompt: 'Gather',
    response: type({ host: 'string', port: 'number' }),
    save: ({ response }) => ({
      step: { gathered: true },
      environment: { host: response.host, port: response.port },
    }),
    next: 'use',
  })
  .step('use', {
    prompt: ({ store }) => {
      // Step result uses save's step value
      const gathered: boolean = store.steps.gather.gathered;
      void gathered;

      // Sub-store access (optional — no narrowing for MVP)
      const host = store.environment?.host;
      void host;

      return 'Use';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// save with only sub-store writes — step result defaults
// ============================================================

skill({
  name: 'store-only',
  entry: 'a',
  stores: {
    env: type({ host: 'string' }),
  },
})
  .step('a', {
    prompt: 'A',
    response: type({ val: 'string' }),
    action: {
      run: writeFile,
      input: ({ response }) => ({ content: response.val }),
    },
    save: ({ actionResult }) => ({
      env: { host: actionResult.path },
    }),
    next: 'b',
  })
  .step('b', {
    prompt: ({ store }) => {
      // No step key in save → defaults to action output
      const path: string = store.steps.a.path;
      const bytes: number = store.steps.a.bytes;
      void path;
      void bytes;

      // Sub-store written
      const host = store.env?.host;
      void host;

      return 'B';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// save with only step — no sub-store writes
// ============================================================

skill({
  name: 'step-only',
  entry: 'a',
  stores: {
    env: type({ host: 'string' }),
  },
})
  .step('a', {
    prompt: 'A',
    response: type({ val: 'string' }),
    save: ({ response }) => ({
      step: { transformed: response.val.toUpperCase() },
    }),
    next: 'b',
  })
  .step('b', {
    prompt: ({ store }) => {
      const t: string = store.steps.a.transformed;
      void t;
      return 'B';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// Sub-store access requires optional chaining
// ============================================================

skill({
  name: 'optional-chaining',
  entry: 'a',
  stores: {
    env: type({ nested: { host: 'string' } }),
  },
}).step('a', {
  prompt: ({ store }) => {
    // Must use ?. for sub-store access
    const host = store.env?.nested?.host;
    void host;
    return 'A';
  },
  response: type({}),
  next: { terminal: true },
});

// ============================================================
// save return type: wrong sub-store shape is a type error
// ============================================================

skill({
  name: 'bad-shape',
  entry: 'a',
  stores: { env: type({ host: 'string' }) },
}).step('a', {
  prompt: 'A',
  response: type({ val: 'string' }),
  // @ts-expect-error - env.host expects string, not number
  save: () => ({ env: { host: 123 } }),
  next: { terminal: true },
});

// ============================================================
// save return type: undeclared sub-store name is a type error
// ============================================================

skill({
  name: 'undeclared',
  entry: 'a',
  stores: { env: type({ host: 'string' }) },
}).step('a', {
  prompt: 'A',
  response: type({ val: 'string' }),
  // @ts-expect-error - 'nope' is not a declared store name
  save: () => ({ nope: { val: 1 } }),
  next: { terminal: true },
});

// ============================================================
// Sub-stores propagate through branching
// ============================================================

skill({
  name: 'branch-stores',
  entry: 'root',
  stores: { config: type({ mode: 'string' }) },
})
  .step('root', {
    prompt: 'Root',
    response: type({ choice: "'a' | 'b'" }),
    save: ({ response }) => ({ config: { mode: response.choice } }),
    next: [{ to: 'path-a', when: ({ response }) => response.choice === 'a' }, { to: 'path-b' }],
  })
  .step('path-a', {
    prompt: ({ store }) => {
      // Sub-stores available in branch targets
      const mode = store.config?.mode;
      void mode;
      // Step-keyed access still works
      const choice: string = store.steps.root.choice;
      void choice;
      return 'A';
    },
    response: type({}),
    next: { terminal: true },
  })
  .step('path-b', {
    prompt: ({ store }) => {
      const mode = store.config?.mode;
      void mode;
      return 'B';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// Sub-stores accessible in next branch callback
// ============================================================

skill({
  name: 'next-branch-store',
  entry: 'a',
  stores: { config: type({ ready: 'boolean' }) },
}).step('a', {
  prompt: 'A',
  response: type({ val: 'string' }),
  save: () => ({ config: { ready: true } }),
  next: [
    {
      to: 'b',
      when: ({ store }) => {
        const ready = store.config?.ready;
        void ready;
        return true;
      },
    },
    { to: 'c' },
  ],
});

// ============================================================
// Sub-stores accessible in action.input
// ============================================================

const dummyAction = action({
  name: 'dummy',
  input: type({ val: 'string' }),
  output: type({ ok: 'boolean' }),
  run: async () => ({ ok: true }),
});

skill({
  name: 'action-input-store',
  entry: 'a',
  stores: { config: type({ prefix: 'string' }) },
})
  .step('a', {
    prompt: 'A',
    response: type({ val: 'string' }),
    save: () => ({ config: { prefix: 'test' } }),
    next: 'b',
  })
  .step('b', {
    prompt: 'B',
    response: type({ val: 'string' }),
    action: {
      run: dummyAction,
      input: ({ response, store }) => {
        const prefix = store.config?.prefix;
        void prefix;
        return { val: response.val };
      },
    },
    next: { terminal: true },
  });

// ============================================================
// Skill without stores: save still works for step-only
// ============================================================

skill({ name: 'no-stores', entry: 'a' })
  .step('a', {
    prompt: 'A',
    response: type({ val: 'string' }),
    save: ({ response }) => ({ step: { upper: response.val.toUpperCase() } }),
    next: 'b',
  })
  .step('b', {
    prompt: ({ store }) => {
      const upper: string = store.steps.a.upper;
      void upper;
      return 'B';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// Sub-store narrowing: guaranteed predecessor writes are non-optional
// ============================================================

skill({
  name: 'narrowing',
  entry: 'init',
  stores: {
    env: type({ host: 'string', port: 'number' }),
    config: type({ mode: 'string' }),
  },
})
  .step('init', {
    prompt: 'Init',
    response: type({ host: 'string', port: 'number' }),
    save: ({ response }) => ({
      env: { host: response.host, port: response.port },
    }),
    next: 'branch',
  })
  .step('branch', {
    prompt: 'Branch',
    response: type({ path: "'a' | 'b'" }),
    next: [{ to: 'path-a', when: ({ response }) => response.path === 'a' }, { to: 'path-b' }],
  })
  .step('path-a', {
    prompt: 'A',
    response: type({}),
    save: () => ({ config: { mode: 'alpha' } }),
    next: 'final',
  })
  .step('path-b', {
    prompt: 'B',
    response: type({}),
    save: () => ({ config: { mode: 'beta' } }),
    next: 'final',
  })
  .step('final', {
    prompt: ({ store }) => {
      // env.host and env.port are GUARANTEED — init is on all paths
      const host: string = store.env.host;
      const port: number = store.env.port;

      // config.mode is OPTIONAL — path-a and path-b are branch targets
      const mode = store.config?.mode;

      void host;
      void port;
      void mode;
      return 'Final';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// NEGATIVE: guaranteed store writes must NOT require ?. access
// ============================================================

skill({
  name: 'narrowing-negative',
  entry: 'write',
  stores: { env: type({ host: 'string' }) },
})
  .step('write', {
    prompt: 'Write',
    response: type({}),
    save: () => ({ env: { host: 'test.com' } }),
    next: 'read',
  })
  .step('read', {
    prompt: ({ store }) => {
      // env.host was written by guaranteed predecessor — direct access works
      const host: string = store.env.host;
      void host;

      // @ts-expect-error - env.host is string, not number
      const bad: number = store.env.host;
      void bad;

      return 'Read';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// Sub-store reconvergence: branch target merge point gets promoted
// ============================================================
// gather → [test-staging, test-prod]
// test-staging → test-prod (reconvergence — test-prod is on ALL paths)
// test-prod's sub-store writes should be guaranteed downstream

skill({
  name: 'store-reconvergence',
  entry: 'gather',
  stores: {
    creds: type({ staging: { host: 'string' }, prod: { host: 'string' } }),
    results: type({ staging: { ok: 'boolean' }, prod: { ok: 'boolean' } }),
  },
})
  .step('gather', {
    prompt: 'Gather',
    response: type({ sHost: 'string', pHost: 'string' }),
    save: ({ response }) => ({
      creds: { staging: { host: response.sHost }, prod: { host: response.pHost } },
    }),
    next: [{ to: 'test-staging', when: ({ response }) => !!response.sHost }, { to: 'test-prod' }],
  })
  .step('test-staging', {
    prompt: 'Staging',
    response: type({ ok: 'boolean' }),
    save: ({ response }) => ({ results: { staging: { ok: response.ok } } }),
    next: 'test-prod',
  })
  .step('test-prod', {
    prompt: ({ store }) => {
      // creds GUARANTEED — gather is on all paths
      const prodHost: string = store.creds.prod.host;
      void prodHost;

      // results.staging OPTIONAL — test-staging is a branch target
      const stagingOk = store.results?.staging?.ok;
      void stagingOk;

      return 'Prod';
    },
    response: type({ ok: 'boolean' }),
    save: ({ response }) => ({ results: { prod: { ok: response.ok } } }),
    next: 'report',
  })
  .step('report', {
    prompt: ({ store }) => {
      // creds GUARANTEED — gather wrote it on all paths
      const sHost: string = store.creds.staging.host;
      const pHost: string = store.creds.prod.host;

      // results.prod GUARANTEED — test-prod promoted via reconvergence
      const prodOk: boolean = store.results.prod.ok;

      // results.staging OPTIONAL — test-staging is a true branch target
      const stagingOk = store.results?.staging?.ok;

      void sHost;
      void pHost;
      void prodOk;
      void stagingOk;

      return 'Report';
    },
    response: type({}),
    next: { terminal: true },
  });

// Suppress unused type warnings
void (0 as unknown as _dp1);
void (0 as unknown as _dp2);
void (0 as unknown as _dp3);
void (0 as unknown as _dr1);
void (0 as unknown as _dr2);
void (0 as unknown as _ssv1);
void (0 as unknown as _ssv2);
void (0 as unknown as _vws1);
void (0 as unknown as _vws2);
void (0 as unknown as _vws3);
void (0 as unknown as _vns1);
void (0 as unknown as _is1);
void (0 as unknown as _is2);
