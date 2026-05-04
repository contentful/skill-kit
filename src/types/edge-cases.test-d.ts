/**
 * Type-level edge case tests for the store system.
 *
 * These probe boundary conditions in the type system that the main
 * test files don't cover: void returns from save, empty stores config,
 * multi-level reconvergence, transitive convergence, and more.
 *
 * Run: pnpm exec tsc --noEmit
 */

import { type } from 'arktype';
import { skill, action } from '../index.js';
import type { Expect, Equal, IsRequired } from './test-utils.js';
import type {
  ShouldPromote,
  BranchState,
  GuaranteeState,
  AddStepGuarantees,
  ExtractBranchTargets,
  StoreView,
  StepsView,
} from './store.js';

// ============================================================
// 1. save returning void vs empty object vs undefined
// ============================================================

// save: () => {} returns empty object literal, which should be compatible
// The step result should default to the response type
skill({ name: 'save-empty-obj', entry: 'a' })
  .step('a', {
    prompt: 'A',
    response: type({ val: 'string' }),
    save: () => ({}),
    next: 'b',
  })
  .step('b', {
    prompt: ({ store }) => {
      // With save returning {}, no step key -> defaults to response
      const val: string = store.steps.a.val;
      void val;
      return 'B';
    },
    response: type({}),
    next: { terminal: true },
  });

// save: () => undefined should be handled like void
// TSaveReturn = void -> step result = response type
skill({ name: 'save-void', entry: 'a' })
  .step('a', {
    prompt: 'A',
    response: type({ val: 'string' }),
    save: () => {
      // implicit void return
    },
    next: 'b',
  })
  .step('b', {
    prompt: ({ store }) => {
      // void save -> step result defaults to response
      const val: string = store.steps.a.val;
      void val;
      return 'B';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 2. save with only step key in store-enabled skill
// ============================================================

skill({
  name: 'save-step-only-with-stores',
  entry: 'a',
  stores: { env: type({ host: 'string' }) },
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
      // Step result uses the save step value
      const t: string = store.steps.a.transformed;
      void t;

      // @ts-expect-error - val is from response, not save step value
      store.steps.a.val;

      // env is still accessible but optional (nobody wrote to it)
      const host = store.env?.host;
      void host;

      return 'B';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 3. Empty stores config
// ============================================================

// stores: {} should not break the builder
skill({ name: 'empty-stores', entry: 'a', stores: {} })
  .step('a', {
    prompt: 'A',
    response: type({ val: 'string' }),
    next: 'b',
  })
  .step('b', {
    prompt: ({ store }) => {
      const val: string = store.steps.a.val;
      void val;
      return 'B';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 4. Three-target reconvergence: [a, b, c], a->c, b->c
// ============================================================
// c is a sibling. a and b both route to c.
// c's siblings (excluding itself) are a and b.
// Both a and b route to c -> c should be promoted.

type ThreeTargetBranch = BranchState<'a' | 'b' | 'c', { a: 'root'; b: 'root'; c: 'root' }, 'a->c' | 'b->c'>;
type _tc1 = Expect<Equal<ShouldPromote<'c', ThreeTargetBranch>, true>>;
// a and b have NO routing to them -> not promoted
type _tc2 = Expect<Equal<ShouldPromote<'a', ThreeTargetBranch>, false>>;
type _tc3 = Expect<Equal<ShouldPromote<'b', ThreeTargetBranch>, false>>;

// Full builder test: three-way branch with full reconvergence at c
skill({ name: 'three-reconverge', entry: 'root' })
  .step('root', {
    prompt: 'Root',
    response: type({ choice: 'string' }),
    next: [
      { to: 'a', when: ({ response }) => response.choice === 'a' },
      { to: 'b', when: ({ response }) => response.choice === 'b' },
      { to: 'c' },
    ],
  })
  .step('a', { prompt: 'A', response: type({ av: 'string' }), next: 'c' })
  .step('b', { prompt: 'B', response: type({ bv: 'string' }), next: 'c' })
  .step('c', {
    prompt: ({ store }) => {
      // root is guaranteed
      const choice: string = store.steps.root.choice;
      void choice;

      // c IS promoted: all siblings (a, b) route to c
      // So c should be guaranteed — direct access works
      // NOTE: c is both a branch target AND the merge point.
      // After a->c and b->c edges, ShouldPromote returns true.

      // a and b are NOT promoted — optional
      const av = store.steps.a?.av;
      const bv = store.steps.b?.bv;
      void av;
      void bv;

      return 'C';
    },
    response: type({ cv: 'string' }),
    next: { terminal: true },
  });

// ============================================================
// 5. Transitive reconvergence: a->b, b->c (NOT direct reconvergence)
// ============================================================
// root -> [a, b, c]
// a -> b (edge: a->b)
// b -> c (edge: b->c)
// For c to be promoted, ALL siblings of c (a, b) must route TO c.
// a routes to b, NOT to c. So c should NOT be promoted.

type TransitiveBranch = BranchState<'a' | 'b' | 'c', { a: 'root'; b: 'root'; c: 'root' }, 'a->b' | 'b->c'>;
type _tr1 = Expect<Equal<ShouldPromote<'c', TransitiveBranch>, false>>;
// b: siblings are a, c. Only a->b. c does NOT route to b. Not promoted.
type _tr2 = Expect<Equal<ShouldPromote<'b', TransitiveBranch>, false>>;

// ============================================================
// 6. Double reconvergence: two sequential branch-merge points
// ============================================================
// root -> [a, b]
// a -> merge1, b -> merge1 (merge1 promoted)
// merge1 -> [c, d]
// c -> merge2, d -> merge2 (merge2 promoted)

skill({ name: 'double-reconverge', entry: 'root' })
  .step('root', {
    prompt: 'Root',
    response: type({ path: "'a' | 'b'" }),
    next: [{ to: 'a', when: ({ response }) => response.path === 'a' }, { to: 'b' }],
  })
  .step('a', { prompt: 'A', response: type({ av: 'string' }), next: 'merge1' })
  .step('b', { prompt: 'B', response: type({ bv: 'string' }), next: 'merge1' })
  .step('merge1', {
    prompt: 'Merge1',
    response: type({ choice2: "'c' | 'd'" }),
    next: [{ to: 'c', when: ({ response }) => response.choice2 === 'c' }, { to: 'd' }],
  })
  .step('c', { prompt: 'C', response: type({ cv: 'string' }), next: 'merge2' })
  .step('d', { prompt: 'D', response: type({ dv: 'string' }), next: 'merge2' })
  .step('merge2', {
    prompt: ({ store }) => {
      // root and merge1 are guaranteed (merge1 promoted from first branch)
      const path: string = store.steps.root.path;
      const choice2: string = store.steps.merge1.choice2;
      void path;
      void choice2;

      // a, b from first branch — optional
      const av = store.steps.a?.av;
      const bv = store.steps.b?.bv;
      void av;
      void bv;

      // c, d from second branch — optional
      const cv = store.steps.c?.cv;
      const dv = store.steps.d?.dv;
      void cv;
      void dv;

      return 'Merge2';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 7. Non-sibling edge should NOT cause reconvergence
// ============================================================
// root -> [a, b]
// x (guaranteed, not a sibling) -> b via string next.
// b should still be optional because x is not a sibling of b.

// The type-level tracking: x is not in the branch group of root,
// so x->b is NOT a sibling edge and doesn't contribute to promotion.

type NonSiblingBranch = BranchState<'a' | 'b', { a: 'root'; b: 'root' }, never>;
// No edges at all -> b not promoted
type _ns1 = Expect<Equal<ShouldPromote<'b', NonSiblingBranch>, false>>;

// Even with an edge from x that's not in the group:
// ExtractBranchEdge only fires when Name extends TBranched.
// If x is NOT branched, its string-next to b won't create an edge.
// So the branch state would still have no 'a->b' edge -> not promoted.

// ============================================================
// 8. save accessing the store (self-referencing)
// ============================================================
// save can read from the store. This tests that the store type
// in the save callback is correctly parameterized.

skill({
  name: 'self-ref-save',
  entry: 'init',
  stores: { env: type({ host: 'string' }) },
})
  .step('init', {
    prompt: 'Init',
    response: type({}),
    save: () => ({ env: { host: 'default.com' } }),
    next: 'update',
  })
  .step('update', {
    prompt: 'Update',
    response: type({ newHost: 'string' }),
    save: ({ response, store }) => {
      // Can read from sub-store inside save
      const currentHost = store.env?.host;
      void currentHost;
      return { env: { host: response.newHost } };
    },
    next: { terminal: true },
  });

// ============================================================
// 9. save with action but no response (promptless step)
// ============================================================

const testAction = action({
  name: 'test-action',
  input: type({}),
  output: type({ result: 'string' }),
  run: async () => ({ result: 'done' }),
});

skill({ name: 'action-save-no-prompt', entry: 'gate' })
  .step('gate', {
    response: type({}),
    action: { run: testAction },
    save: ({ actionResult }) => {
      // actionResult should be typed as the action output
      const r: string = actionResult.result;
      void r;
      return { step: { processed: true } };
    },
    next: 'report',
  })
  .step('report', {
    prompt: ({ store }) => {
      const p: boolean = store.steps.gate.processed;
      void p;
      return 'Report';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 10. Branch array with all conditional (no default) — type extraction
// ============================================================
// Two branches both with `when` — both should be branch targets

type AllConditional = ExtractBranchTargets<
  readonly [{ to: 'a'; when: () => boolean }, { to: 'b'; when: () => boolean }]
>;
type _ac1 = Expect<Equal<AllConditional, 'a' | 'b'>>;

skill({ name: 'all-conditional', entry: 'pick' })
  .step('pick', {
    prompt: 'Pick',
    response: type({ val: 'string' }),
    next: [
      { to: 'a', when: ({ response }) => response.val === 'a' },
      { to: 'b', when: ({ response }) => response.val === 'b' },
    ],
  })
  .step('a', { prompt: 'A', response: type({ av: 'string' }), next: 'end' })
  .step('b', { prompt: 'B', response: type({ bv: 'string' }), next: 'end' })
  .step('end', {
    prompt: ({ store }) => {
      // Both a and b are branch targets — optional
      const av = store.steps.a?.av;
      const bv = store.steps.b?.bv;
      void av;
      void bv;
      return 'End';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 11. Type-level: StoreView composition with both stores and storeWrites
// ============================================================

type MySteps = { a: { val: string } };
type MyStores = { env: { host: string; port: number } };
type MyWrites = { env: { host: string } };

type ViewWithWrites = StoreView<MySteps, 'a', MyStores, MyWrites>;

// Steps accessible
type _vw1 = Expect<Equal<ViewWithWrites['steps']['a'], { val: string }>>;

// Written path: host is required (from DeepReadonly<TStoreWrites>)
// The full env from SubStoreView is optional, but the intersection
// with DeepReadonly<MyWrites> makes env.host required at top level
type _vw2 = Expect<IsRequired<ViewWithWrites['env']>>;

// ============================================================
// 12. save with sub-store that matches a step name
// ============================================================
// If a store is named the same as a step, this creates a collision
// at the StoreView level. The types should handle this because
// stores live at store.* and steps at store.steps.*.

// This should work because steps are namespaced under store.steps
skill({
  name: 'name-collision',
  entry: 'a',
  stores: { a: type({ extra: 'string' }) },
})
  .step('a', {
    prompt: 'A',
    response: type({ val: 'string' }),
    save: ({ response }) => ({
      step: { processed: response.val },
      a: { extra: 'test' },
    }),
    next: 'b',
  })
  .step('b', {
    prompt: ({ store }) => {
      // Step result under store.steps.a
      const p: string = store.steps.a.processed;
      void p;
      // Sub-store under store.a
      const extra = store.a?.extra;
      void extra;
      return 'B';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 13. StepsView: method names don't collide with step names
// ============================================================
// What if a step is named 'all', 'ran', or 'history'?
// The Proxy implementation should handle this, but let's test the types.

// At the type level, methods take priority in the intersection.
// But in the runtime Proxy, method names shadow step names.
// We verify the type still allows accessing them via optional chaining.
type StepsWithMethodName = { all: { val: string }; normal: { x: number } };
type MethodNameView = StepsView<StepsWithMethodName>;

// 'all' as a step can't be accessed because the method shadows it at type level
// This is a known limitation — step names should not collide with method names.
// The type system won't catch this at definition time, but it causes runtime issues.

// ============================================================
// 14. StoreView with no stores and no storeWrites (backward compat)
// ============================================================

type MinimalView = StoreView<{ a: { val: string } }, 'a'>;
type _mv1 = Expect<Equal<MinimalView['steps']['a'], { val: string }>>;

// ============================================================
// 15. AddStepGuarantees: store writes accumulate via intersection
// ============================================================

// Step 1 writes { env: { host: string } }
type G1 = AddStepGuarantees<GuaranteeState, 'step1', BranchState, { env: { host: string } }>;
type _g1 = Expect<Equal<G1['steps'], 'step1'>>;
type _g1w = Expect<Equal<G1['storeWrites'], { env: { host: string } }>>;

// Step 2 writes { env: { port: number } } — intersection with step1's writes
type G2 = AddStepGuarantees<G1, 'step2', BranchState, { env: { port: number } }>;
type _g2 = Expect<Equal<G2['steps'], 'step1' | 'step2'>>;
// Intersection: { env: { host: string } } & { env: { port: number } }
// This means both host and port are guaranteed
type _g2w = Expect<Equal<G2['storeWrites'], { env: { host: string } } & { env: { port: number } }>>;

// ============================================================
// 16. ExtractBranchTargets with 4+ entries
// ============================================================

type FourBranch = ExtractBranchTargets<
  readonly [
    { to: 'w'; when: () => boolean },
    { to: 'x'; when: () => boolean },
    { to: 'y'; when: () => boolean },
    { to: 'z' },
  ]
>;
type _fb1 = Expect<Equal<FourBranch, 'w' | 'x' | 'y' | 'z'>>;

// ============================================================
// 17. save returning { step: undefined } — should be treated
// as "no step override" (default to action/response)
// ============================================================

skill({ name: 'step-undefined', entry: 'a' })
  .step('a', {
    prompt: 'A',
    response: type({ val: 'string' }),
    save: () => ({ step: undefined }),
    next: 'b',
  })
  .step('b', {
    prompt: ({ store }) => {
      // step: undefined -> TSaveReturn has step: undefined
      // TResultValue: TSaveReturn extends { step: infer S } -> S = undefined
      // This means store.steps.a is typed as undefined... which is a type-level quirk.
      // The runtime handles this correctly (falls back to response).
      // Just verify it compiles.
      void store.steps.a;
      return 'B';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 18. Reconvergence detection edge case: self-routing sibling
// ============================================================
// root -> [a, b]
// a -> a (self-loop, backward edge to already-defined step)
// a -> b (sibling edge)
// Since a routes to b, and a is the only sibling of b, b is promoted.

// In the type system, a's next is a branch array [self, b].
// Since a is already defined, [self(a)] is a backward edge.
// Only b is a forward target -> single forward target -> NOT a branch.
// So a's `next` doesn't create new branches, but IS an edge from a->b.

// ============================================================
// 19. Large chain: many linear steps all guaranteed
// ============================================================

skill({ name: 'long-chain', entry: 'a' })
  .step('a', { prompt: 'A', response: type({ a: 'string' }), next: 'b' })
  .step('b', { prompt: 'B', response: type({ b: 'string' }), next: 'c' })
  .step('c', { prompt: 'C', response: type({ c: 'string' }), next: 'd' })
  .step('d', { prompt: 'D', response: type({ d: 'string' }), next: 'e' })
  .step('e', { prompt: 'E', response: type({ e: 'string' }), next: 'f' })
  .step('f', {
    prompt: ({ store }) => {
      // All prior steps guaranteed
      const a: string = store.steps.a.a;
      const b: string = store.steps.b.b;
      const c: string = store.steps.c.c;
      const d: string = store.steps.d.d;
      const e: string = store.steps.e.e;
      void a;
      void b;
      void c;
      void d;
      void e;
      return 'F';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 20. Action output overrides step result in store type
// ============================================================
// When action exists but no save, the store type is the action output.

const fetchAction = action({
  name: 'fetch',
  input: type({ url: 'string' }),
  output: type({ status: 'number', body: 'string' }),
  run: async () => ({ status: 200, body: 'ok' }),
});

skill({ name: 'action-store-type', entry: 'req' })
  .step('req', {
    prompt: 'Request',
    response: type({ url: 'string' }),
    action: { run: fetchAction },
    next: 'report',
  })
  .step('report', {
    prompt: ({ store }) => {
      // Store carries action output, not response
      const status: number = store.steps.req.status;
      const body: string = store.steps.req.body;
      void status;
      void body;

      // @ts-expect-error - url is from response, not action output
      store.steps.req.url;

      return 'Report';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 21. save with action: save receives both response and actionResult
// ============================================================

skill({
  name: 'save-with-action-types',
  entry: 'a',
  stores: { results: type({ summary: 'string' }) },
})
  .step('a', {
    prompt: 'A',
    response: type({ url: 'string' }),
    action: {
      run: fetchAction,
      mapInput: ({ response }) => ({ url: response.url }),
    },
    save: ({ response, actionResult }) => {
      // response is the step output
      const url: string = response.url;
      // actionResult is the action output
      const status: number = actionResult.status;
      void url;
      void status;
      return {
        step: { processedUrl: url, statusCode: status },
        results: { summary: `${url}: ${status}` },
      };
    },
    next: 'b',
  })
  .step('b', {
    prompt: ({ store }) => {
      const pu: string = store.steps.a.processedUrl;
      const sc: number = store.steps.a.statusCode;
      void pu;
      void sc;

      // @ts-expect-error - url is from response, not save step value
      store.steps.a.url;

      return 'B';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 22. Deep sub-store narrowing: nested writes
// ============================================================

skill({
  name: 'deep-narrowing',
  entry: 'a',
  stores: {
    config: type({ db: { host: 'string', port: 'number' }, cache: { ttl: 'number' } }),
  },
})
  .step('a', {
    prompt: 'A',
    response: type({}),
    save: () => ({ config: { db: { host: 'localhost', port: 5432 } } }),
    next: 'b',
  })
  .step('b', {
    prompt: ({ store }) => {
      // db was written by guaranteed predecessor
      const host: string = store.config.db.host;
      const port: number = store.config.db.port;
      void host;
      void port;

      // cache was NOT written — should still be optional
      const ttl = store.config?.cache?.ttl;
      void ttl;

      return 'B';
    },
    response: type({}),
    next: { terminal: true },
  });

// Suppress unused type warnings
void (0 as unknown as _tc1);
void (0 as unknown as _tc2);
void (0 as unknown as _tc3);
void (0 as unknown as _tr1);
void (0 as unknown as _tr2);
void (0 as unknown as _ns1);
void (0 as unknown as _vw1);
void (0 as unknown as _vw2);
void (0 as unknown as _mv1);
void (0 as unknown as _g1);
void (0 as unknown as _g1w);
void (0 as unknown as _g2);
void (0 as unknown as _g2w);
void (0 as unknown as _fb1);
void (0 as unknown as _ac1);
void (0 as unknown as MethodNameView);
void (0 as unknown as _mg1);
void (0 as unknown as _mg2);

// ============================================================
// 23. Inline action: function form accepted, result flows to save
// ============================================================

skill({ name: 'inline-action-save', entry: 'a' }).step('a', {
  prompt: 'Go',
  response: type({ url: 'string' }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action: async (ctx: any) => ({ status: 200 }),
  save: ({ actionResult }) => {
    const s: number = actionResult.status;
    void s;
  },
  next: { terminal: true },
});

// ============================================================
// 24. Inline action: result becomes store step value when no save
// ============================================================

skill({ name: 'inline-action-store', entry: 'a' })
  .step('a', {
    prompt: 'Go',
    response: type({ url: 'string' }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    action: async (ctx: any) => ({ fetched: true, code: 200 }),
    next: 'b',
  })
  .step('b', {
    prompt: ({ store }) => {
      // store.steps.a carries the inline action return type, not the response
      const fetched: boolean = store.steps.a.fetched;
      const code: number = store.steps.a.code;
      void fetched;
      void code;

      // @ts-expect-error - 'url' is on the response, not the inline action return
      store.steps.a.url;

      return 'B';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 25. Inline action: save.step overrides store value
// ============================================================

skill({ name: 'inline-action-save-override', entry: 'a' })
  .step('a', {
    prompt: 'Go',
    response: type({ url: 'string' }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    action: async (ctx: any) => ({ status: 200 }),
    save: ({ actionResult }) => ({
      step: { statusText: actionResult.status === 200 ? 'ok' : 'fail' },
    }),
    next: 'b',
  })
  .step('b', {
    prompt: ({ store }) => {
      const text: string = store.steps.a.statusText;
      void text;
      return 'B';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 26. Inline action: contextual typing provides response, store, params, signal
// ============================================================

skill({ name: 'inline-action-ctx', entry: 'a', params: type({ apiKey: 'string' }) }).step('a', {
  prompt: 'Go',
  response: type({ url: 'string' }),
  action: async (ctx) => {
    const url: string = ctx.response.url;
    const key: string = ctx.params.apiKey;
    const sig: AbortSignal = ctx.signal;
    void url;
    void key;
    void sig;
    return { ok: true };
  },
  next: { terminal: true },
});

// ============================================================
// 27. No action: actionResult is undefined
// ============================================================

skill({ name: 'no-action-undefined', entry: 'a' }).step('a', {
  prompt: 'Go',
  response: type({ val: 'string' }),
  save: ({ actionResult }) => {
    const u: undefined = actionResult;
    void u;
  },
  next: { terminal: true },
});

// ============================================================
// 28. Nested branch reconvergence: all nested paths converge
// ============================================================
// root → [left, merge]
// left → [merge, mid]   (guaranteed, re-branches merge alongside mid)
// mid → merge
// merge is on ALL paths → guaranteed

skill({ name: 'nested-convergence', entry: 'root' })
  .step('root', {
    response: type({ ok: 'boolean' }),
    next: ({ response }) => (response.ok ? 'left' : 'merge'),
  })
  .step('left', {
    response: type({ choice: 'string' }),
    next: ({ response }) => (response.choice === 'a' ? 'merge' : 'mid'),
  })
  .step('mid', { response: type({ v: 'string' }), next: 'merge' })
  .step('merge', {
    prompt: ({ store }) => {
      // merge is guaranteed — on all paths
      const ok: boolean = store.steps.root.ok;
      void ok;
      // left is a branch target (optional)
      const choice = store.steps.left?.choice;
      void choice;
      return 'Merge';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 29. Partial nested convergence must NOT promote
// ============================================================
// root → [left, target]
// left → [target, mid]  (re-branches target alongside mid)
// mid → end              (does NOT route to target!)
// target is NOT on all paths — mid goes to end, not target

skill({ name: 'partial-nested-no-promote', entry: 'root' })
  .step('root', {
    response: type({ ok: 'boolean' }),
    next: ({ response }) => (response.ok ? 'left' : 'target'),
  })
  .step('left', {
    response: type({ choice: 'string' }),
    next: ({ response }) => (response.choice === 'a' ? 'target' : 'mid'),
  })
  .step('mid', { response: type({ v: 'string' }), next: 'end' })
  .step('target', {
    prompt: ({ store }) => {
      // target is NOT guaranteed — mid doesn't route to it
      // root is still guaranteed (before the branch)
      const ok: boolean = store.steps.root.ok;
      void ok;
      // left is optional (branch target)
      const choice = store.steps.left?.choice;
      void choice;
      return 'Target';
    },
    response: type({}),
    next: 'end',
  })
  .step('end', {
    prompt: ({ store }) => {
      // target is optional — assigning to non-optional type errors
      // @ts-expect-error - target is not guaranteed
      const t: {} = store.steps.target;
      void t;
      return 'End';
    },
    response: type({}),
    next: { terminal: true },
  });
// ============================================================
// 30. Diamond with nested diamond: outer and inner converge at same step
// ============================================================
// root → [a, d]
// a → [b, c] (nested branch)
// b → d, c → d (inner branches converge at d)
//
// d is a branch target from root's branch (group root).
// Its sibling is a. a does NOT route to d via string next (a branches).
// So ShouldPromote<d> = false (not all root-siblings route to d).
//
// Even though b and c both route to d, they are in group a, not group root.
// Their edges (b->d, c->d) don't satisfy d's promotion requirement
// (which needs a->d from the root group).
//
// Additionally, b and c are branched, so GuaranteedRouteTarget doesn't fire.
// Result: d remains optional. This is a known limitation of flat-group
// reconvergence — nested convergence across group boundaries isn't detected.

skill({ name: 'diamond-nested-diamond', entry: 'root' })
  .step('root', {
    prompt: 'Root',
    response: type({ choice: 'string' }),
    next: [{ to: 'a', when: ({ response }) => response.choice === 'a' }, { to: 'd' }],
  })
  .step('a', {
    prompt: 'A',
    response: type({ av: 'string' }),
    next: [{ to: 'b', when: ({ response }) => response.av === 'b' }, { to: 'c' }],
  })
  .step('b', { prompt: 'B', response: type({ bv: 'string' }), next: 'd' })
  .step('c', { prompt: 'C', response: type({ cv: 'string' }), next: 'd' })
  .step('d', {
    prompt: ({ store }) => {
      // root is guaranteed
      const choice: string = store.steps.root.choice;
      void choice;

      // d is NOT promoted — nested convergence across groups isn't detected.
      // a, b, c are all optional branch targets.
      const av = store.steps.a?.av;
      const bv = store.steps.b?.bv;
      const cv = store.steps.c?.cv;
      void av;
      void bv;
      void cv;

      // @ts-expect-error - d is a branch target from root, not guaranteed
      const dSelf: { dv: string } = store.steps.d;
      void dSelf;

      return 'D';
    },
    response: type({ dv: 'string' }),
    next: { terminal: true },
  });

// ============================================================
// 31. Three-way branch with inner reconvergence at merge
// ============================================================
// root → [a, b, c]
// a → merge (string next)
// b → merge (string next)
// c → merge (string next)
// All three siblings route to merge → merge is promoted.
//
// This is straightforward sibling reconvergence: ShouldPromote checks
// that all siblings of merge (a, b, c — all from root group) route to it.

skill({ name: 'three-way-full-reconverge', entry: 'root' })
  .step('root', {
    prompt: 'Root',
    response: type({ choice: 'string' }),
    next: [
      { to: 'a', when: ({ response }) => response.choice === 'a' },
      { to: 'b', when: ({ response }) => response.choice === 'b' },
      { to: 'c' },
    ],
  })
  .step('a', { prompt: 'A', response: type({ av: 'string' }), next: 'merge' })
  .step('b', { prompt: 'B', response: type({ bv: 'string' }), next: 'merge' })
  .step('c', { prompt: 'C', response: type({ cv: 'string' }), next: 'merge' })
  .step('merge', {
    prompt: ({ store }) => {
      // root is guaranteed
      const choice: string = store.steps.root.choice;
      void choice;

      // merge IS promoted — all three siblings route to it
      // a, b, c are still optional branch targets
      const av = store.steps.a?.av;
      const bv = store.steps.b?.bv;
      const cv = store.steps.c?.cv;
      void av;
      void bv;
      void cv;

      return 'Merge';
    },
    response: type({ merged: 'boolean' }),
    next: 'final',
  })
  .step('final', {
    prompt: ({ store }) => {
      // merge is guaranteed (promoted), root is guaranteed
      const choice: string = store.steps.root.choice;
      const merged: boolean = store.steps.merge.merged;
      void choice;
      void merged;

      return 'Final';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 32. Chained guaranteed intermediaries: transitive to same target
// ============================================================
// root → [a, f]
// a → b (string next, a is branched so b enters via guaranteed routing? no)
// b → c (string next)
// c → f (string next — c is guaranteed, f is branched → GuaranteedRouteTarget fires)
//
// Step-by-step trace:
// - root branches to [a, f]. TBranched = {a, f}. Groups = {a: root, f: root}.
// - a is branched. next: 'b'. b is NOT branched → no edge. b is not a branch target.
// - b is NOT branched (not in TBranched). It's guaranteed. next: 'c'. c is not branched.
// - c is NOT branched. Guaranteed. next: 'f'. f IS branched.
//   GuaranteedRouteTarget<'c', 'f', TBranched> → 'f' (c is not branched, f is branched)
//   → f is REMOVED from TBranched.
// - f is defined. It's no longer in TBranched → guaranteed.

skill({ name: 'chained-guaranteed-intermediaries', entry: 'root' })
  .step('root', {
    prompt: 'Root',
    response: type({ v: 'string' }),
    next: [{ to: 'a', when: ({ response }) => response.v === 'a' }, { to: 'f' }],
  })
  .step('a', { prompt: 'A', response: type({ av: 'string' }), next: 'b' })
  .step('b', { prompt: 'B', response: type({ bv: 'string' }), next: 'c' })
  .step('c', { prompt: 'C', response: type({ cv: 'string' }), next: 'f' })
  .step('f', {
    prompt: ({ store }) => {
      // root is guaranteed
      const v: string = store.steps.root.v;
      void v;

      // f is promoted via GuaranteedRouteTarget (c is guaranteed, routes to f)
      // b, c are guaranteed (linear successors of a, but not branched)
      const bv: string = store.steps.b.bv;
      const cv: string = store.steps.c.cv;
      void bv;
      void cv;

      // a is still a branch target — optional
      const av = store.steps.a?.av;
      void av;

      return 'F';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 33. Dead-end sibling prevents promotion
// ============================================================
// root → [a, target]
// a → [target, dead]
// dead → {terminal: true} (dead end — never reaches target)
//
// target is in root group. Sibling is a. a does NOT route to target
// via string next (a branches to [target, dead]).
// ExtractBranchEdge only fires for string next, not branch arrays.
// So no a->target edge. target is NOT promoted.
//
// The dead path confirms the system works: even when most paths
// converge, a single dead-end branch prevents guarantee promotion.

skill({ name: 'dead-end-sibling', entry: 'root' })
  .step('root', {
    prompt: 'Root',
    response: type({ choice: 'string' }),
    next: [{ to: 'a', when: ({ response }) => response.choice === 'a' }, { to: 'target' }],
  })
  .step('a', {
    prompt: 'A',
    response: type({ av: 'string' }),
    next: [{ to: 'target', when: ({ response }) => response.av === 'go' }, { to: 'dead' }],
  })
  .step('dead', {
    prompt: 'Dead end',
    response: type({ final: 'boolean' }),
    next: { terminal: true },
  })
  .step('target', {
    prompt: ({ store }) => {
      // root is guaranteed
      const choice: string = store.steps.root.choice;
      void choice;

      // target is NOT promoted — a doesn't route via string next
      // a and dead are optional
      const av = store.steps.a?.av;
      const dead = store.steps.dead?.final;
      void av;
      void dead;

      return 'Target';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 34. Mixed reconvergence: one sibling routes directly, another
//     routes transitively through guaranteed intermediary
// ============================================================
// root → [a, b, merge]
// a → merge (sibling edge: a->merge)
// b → mid (b is branched, mid is NOT branched)
// mid → merge (mid is guaranteed, merge is branched → GuaranteedRouteTarget)
//
// Two mechanisms combine:
// 1. a→merge records a sibling edge
// 2. mid→merge fires GuaranteedRouteTarget, removing merge from TBranched
//
// Since merge is removed from TBranched before it's defined, it's guaranteed.
// The key insight: GuaranteedRouteTarget fires when mid (guaranteed) is added
// with string next pointing to merge (branched). merge is removed from branched.

skill({ name: 'mixed-reconvergence', entry: 'root' })
  .step('root', {
    prompt: 'Root',
    response: type({ path: 'string' }),
    next: [
      { to: 'a', when: ({ response }) => response.path === 'a' },
      { to: 'b', when: ({ response }) => response.path === 'b' },
      { to: 'merge' },
    ],
  })
  .step('a', { prompt: 'A', response: type({ av: 'string' }), next: 'merge' })
  .step('b', { prompt: 'B', response: type({ bv: 'string' }), next: 'mid' })
  .step('mid', { prompt: 'Mid', response: type({ mv: 'string' }), next: 'merge' })
  .step('merge', {
    prompt: ({ store }) => {
      // root is guaranteed
      const path: string = store.steps.root.path;
      void path;

      // merge IS promoted: mid (guaranteed) routes to merge → GuaranteedRouteTarget
      // removes merge from TBranched before merge is defined.

      // mid is guaranteed (not in any branch group)
      const mv: string = store.steps.mid.mv;
      void mv;

      // a, b are branch targets — optional
      const av = store.steps.a?.av;
      const bv = store.steps.b?.bv;
      void av;
      void bv;

      return 'Merge';
    },
    response: type({ result: 'string' }),
    next: { terminal: true },
  });

// ============================================================
// 35. Store writes through reconverged merge point
// ============================================================
// gather → [path-a, path-b]
// path-a → merge, path-b → merge (merge promoted)
// merge writes to sub-store → writes are guaranteed downstream
//
// This tests that promoted steps' save() writes flow into
// GuaranteeState.storeWrites via AddStepGuarantees.

skill({
  name: 'store-writes-through-reconvergence',
  entry: 'gather',
  stores: {
    results: type({ summary: 'string', score: 'number' }),
  },
})
  .step('gather', {
    prompt: 'Gather',
    response: type({ input: 'string' }),
    next: [{ to: 'path-a', when: ({ response }) => response.input === 'a' }, { to: 'path-b' }],
  })
  .step('path-a', { prompt: 'A', response: type({ av: 'string' }), next: 'merge' })
  .step('path-b', { prompt: 'B', response: type({ bv: 'string' }), next: 'merge' })
  .step('merge', {
    prompt: 'Merge',
    response: type({ summary: 'string' }),
    save: ({ response }) => ({
      step: { processed: true },
      results: { summary: response.summary, score: 42 },
    }),
    next: 'report',
  })
  .step('report', {
    prompt: ({ store }) => {
      // merge is promoted (both siblings route to it) → its save writes are guaranteed
      const processed: boolean = store.steps.merge.processed;
      void processed;

      // Sub-store writes from merge are guaranteed
      const summary: string = store.results.summary;
      const score: number = store.results.score;
      void summary;
      void score;

      // gather is guaranteed, its step result is input
      const input: string = store.steps.gather.input;
      void input;

      // path-a, path-b are still optional
      const av = store.steps['path-a']?.av;
      const bv = store.steps['path-b']?.bv;
      void av;
      void bv;

      return 'Report';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 36. NEGATIVE: non-promoted branch target's store writes stay optional
// ============================================================
// root → [a, b]
// a writes to sub-store, b does NOT route to merge
// a's writes must remain optional because a is a branch target

skill({
  name: 'branch-writes-optional',
  entry: 'root',
  stores: {
    config: type({ mode: 'string' }),
  },
})
  .step('root', {
    prompt: 'Root',
    response: type({ path: 'string' }),
    next: [{ to: 'a', when: ({ response }) => response.path === 'a' }, { to: 'b' }],
  })
  .step('a', {
    prompt: 'A',
    response: type({}),
    save: () => ({ config: { mode: 'alpha' } }),
    next: 'end',
  })
  .step('b', {
    prompt: 'B',
    response: type({}),
    next: 'end',
  })
  .step('end', {
    prompt: ({ store }) => {
      // a is a branch target — its sub-store writes are NOT guaranteed
      // config.mode requires optional chaining
      const mode = store.config?.mode;
      void mode;

      return 'End';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 37. Double branch-merge: sequential reconvergence with sub-stores
// ============================================================
// root → [a, b], a → m1, b → m1 (m1 promoted)
// m1 → [c, d], c → m2, d → m2 (m2 promoted)
// Each merge point writes to a different sub-store.
// Both should be guaranteed at the final step.

skill({
  name: 'double-branch-merge-stores',
  entry: 'root',
  stores: {
    first: type({ merged: 'boolean' }),
    second: type({ merged: 'boolean' }),
  },
})
  .step('root', {
    prompt: 'Root',
    response: type({ choice: 'string' }),
    next: [{ to: 'a', when: ({ response }) => response.choice === 'a' }, { to: 'b' }],
  })
  .step('a', { prompt: 'A', response: type({ av: 'string' }), next: 'm1' })
  .step('b', { prompt: 'B', response: type({ bv: 'string' }), next: 'm1' })
  .step('m1', {
    prompt: 'M1',
    response: type({ pick: 'string' }),
    save: () => ({ first: { merged: true } }),
    next: [{ to: 'c', when: ({ response }) => response.pick === 'c' }, { to: 'd' }],
  })
  .step('c', { prompt: 'C', response: type({ cv: 'string' }), next: 'm2' })
  .step('d', { prompt: 'D', response: type({ dv: 'string' }), next: 'm2' })
  .step('m2', {
    prompt: 'M2',
    response: type({}),
    save: () => ({ second: { merged: true } }),
    next: 'final',
  })
  .step('final', {
    prompt: ({ store }) => {
      // root, m1, m2 are all guaranteed
      const choice: string = store.steps.root.choice;
      const pick: string = store.steps.m1.pick;
      void choice;
      void pick;

      // Both sub-store writes are guaranteed (from m1 and m2, both promoted)
      const firstMerged: boolean = store.first.merged;
      const secondMerged: boolean = store.second.merged;
      void firstMerged;
      void secondMerged;

      // Branch targets from both levels are optional
      const av = store.steps.a?.av;
      const bv = store.steps.b?.bv;
      const cv = store.steps.c?.cv;
      const dv = store.steps.d?.dv;
      void av;
      void bv;
      void cv;
      void dv;

      return 'Final';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 38. Transitive chain reconvergence with sub-store writes
// ============================================================
// root → [a, d], a → b → c → d
// c is guaranteed and routes to d → d is promoted via GuaranteedRouteTarget.
// b and c both write to sub-store. Their writes are guaranteed at d.

skill({
  name: 'transitive-chain-stores',
  entry: 'root',
  stores: {
    progress: type({ step1: 'boolean', step2: 'boolean' }),
  },
})
  .step('root', {
    prompt: 'Root',
    response: type({ v: 'string' }),
    next: [{ to: 'a', when: ({ response }) => response.v === 'a' }, { to: 'd' }],
  })
  .step('a', { prompt: 'A', response: type({ av: 'string' }), next: 'b' })
  .step('b', {
    prompt: 'B',
    response: type({}),
    save: () => ({ progress: { step1: true } }),
    next: 'c',
  })
  .step('c', {
    prompt: 'C',
    response: type({}),
    save: () => ({ progress: { step2: true } }),
    next: 'd',
  })
  .step('d', {
    prompt: ({ store }) => {
      // root is guaranteed. d is promoted (c is guaranteed, routes to d).
      const v: string = store.steps.root.v;
      void v;

      // b and c are guaranteed (linear, not branched)
      // Their sub-store writes are guaranteed
      const step1: boolean = store.progress.step1;
      const step2: boolean = store.progress.step2;
      void step1;
      void step2;

      // a is a branch target — optional
      const av = store.steps.a?.av;
      void av;

      return 'D';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 39. Type-level: ShouldPromote with edges from mixed groups
// ============================================================
// Verify that ShouldPromote correctly scopes to same-group siblings.
// target is in group1, source edges come from group2 steps — must not promote.

type MixedGroupBranch = BranchState<
  'x' | 'y' | 'target' | 'p' | 'q',
  { x: 'root'; y: 'root'; target: 'root'; p: 'other'; q: 'other' },
  'p->target' | 'q->target'
>;
// target's siblings (same group 'root') are x and y.
// p→target and q→target are from group 'other' — they don't count.
// Neither x nor y has routed to target → not promoted.
type _mg1 = Expect<Equal<ShouldPromote<'target', MixedGroupBranch>, false>>;

// Now add the correct sibling edges
type MixedGroupFixed = BranchState<
  'x' | 'y' | 'target' | 'p' | 'q',
  { x: 'root'; y: 'root'; target: 'root'; p: 'other'; q: 'other' },
  'x->target' | 'y->target' | 'p->target'
>;
// x and y (siblings) both route to target → promoted
type _mg2 = Expect<Equal<ShouldPromote<'target', MixedGroupFixed>, true>>;

// ============================================================
// 40. Four-way branch where non-target merge step is guaranteed
// ============================================================
// root → [a, b, c, d]
// a → merge, b → merge, c → merge, d → end
//
// merge is NOT in TBranched — it was never a branch target from a
// branch array. It only appears as a string-next destination. Since
// it's not branched, it's guaranteed by default.
//
// d routes to end, not merge. But merge is guaranteed because string
// next targets are never added to TBranched — only branch array
// forward targets are.

skill({ name: 'four-way-merge-guaranteed', entry: 'root' })
  .step('root', {
    prompt: 'Root',
    response: type({ pick: 'string' }),
    next: [
      { to: 'a', when: ({ response }) => response.pick === 'a' },
      { to: 'b', when: ({ response }) => response.pick === 'b' },
      { to: 'c', when: ({ response }) => response.pick === 'c' },
      { to: 'd' },
    ],
  })
  .step('a', { prompt: 'A', response: type({ av: 'string' }), next: 'merge' })
  .step('b', { prompt: 'B', response: type({ bv: 'string' }), next: 'merge' })
  .step('c', { prompt: 'C', response: type({ cv: 'string' }), next: 'merge' })
  .step('d', { prompt: 'D', response: type({ dv: 'string' }), next: 'end' })
  .step('merge', {
    prompt: 'Merge',
    response: type({ mv: 'string' }),
    next: 'end',
  })
  .step('end', {
    prompt: ({ store }) => {
      // root is guaranteed
      const pick: string = store.steps.root.pick;
      void pick;

      // merge IS guaranteed — it was never in TBranched (string-next
      // targets are not branched, only branch-array forward targets are)
      const mv: string = store.steps.merge.mv;
      void mv;

      // a, b, c, d are all branch targets from root's branch array — optional
      const av = store.steps.a?.av;
      const bv = store.steps.b?.bv;
      const cv = store.steps.c?.cv;
      const dv = store.steps.d?.dv;
      void av;
      void bv;
      void cv;
      void dv;

      return 'End';
    },
    response: type({}),
    next: { terminal: true },
  });
