/**
 * Type-level tests for builder DAG narrowing.
 *
 * Tests the full builder chain: skill().step().step()...
 * Verifies that the store type inside prompt functions correctly
 * distinguishes guaranteed vs optional step access.
 *
 * Run: pnpm exec tsc --noEmit
 */

import { type } from 'arktype';
import { skill, step, action } from '../index.js';

// ============================================================
// 1. Linear flow: all predecessors guaranteed
// ============================================================

skill({ name: 'linear', entry: 'a' })
  .step('a', {
    prompt: 'A',
    response: type({ name: 'string' }),
    next: 'b',
  })
  .step('b', {
    prompt: ({ store }) => {
      // a is a linear predecessor → guaranteed, non-optional
      const name: string = store.steps.a.name;
      void name;
      return 'B';
    },
    response: type({ role: 'string' }),
    next: 'c',
  })
  .step('c', {
    prompt: ({ store }) => {
      // a and b are both guaranteed
      const name: string = store.steps.a.name;
      const role: string = store.steps.b.role;
      void name;
      void role;
      return 'C';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 2. Branching: targets are optional, pre-branch guaranteed
// ============================================================

skill({ name: 'branch', entry: 'start' })
  .step('start', {
    prompt: 'Start',
    response: type({ name: 'string' }),
    next: 'choose',
  })
  .step('choose', {
    prompt: 'Pick',
    response: type({ path: "'a' | 'b'" }),
    next: [{ to: 'path-a', when: ({ response }) => response.path === 'a' }, { to: 'path-b' }],
  })
  .step('path-a', {
    prompt: ({ store }) => {
      // start and choose are guaranteed (before the branch)
      const name: string = store.steps.start.name;
      const path: string = store.steps.choose.path;
      void name;
      void path;
      return 'A';
    },
    response: type({ resultA: 'string' }),
    next: 'end',
  })
  .step('path-b', {
    prompt: ({ store }) => {
      // start and choose are guaranteed
      const name: string = store.steps.start.name;
      void name;

      // path-a is a branch target → must be optional, use ?.
      const aResult = store.steps['path-a']?.resultA;
      void aResult;

      // NEGATIVE TEST: direct access on branch target should be undefined-able
      // path-a is in TSteps but NOT in TGuaranteed, so store.steps['path-a']
      // is an optional property requiring ?. for field access.

      return 'B';
    },
    response: type({ resultB: 'string' }),
    next: 'end',
  })
  .step('end', {
    prompt: ({ store }) => {
      // start and choose are guaranteed
      const name: string = store.steps.start.name;
      void name;

      // Both path-a and path-b are branch targets → optional
      const a = store.steps['path-a']?.resultA;
      const b = store.steps['path-b']?.resultB;
      void a;
      void b;

      return 'End';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 3. Extend: inherits guaranteed tracking
// ============================================================

const confirmStep = step({
  prompt: 'Confirm to proceed.',
  response: type({ confirmed: 'boolean' }),
  next: '__parent__',
});

skill({ name: 'extend', entry: 'a' })
  .step('a', {
    prompt: 'A',
    response: type({ name: 'string' }),
    next: 'b',
  })
  .extend('b', confirmStep, {
    prompt: ({ store }) => {
      // a is guaranteed
      const name: string = store.steps.a.name;
      void name;
      return 'Confirm for ' + name;
    },
    next: 'c',
  })
  .step('c', {
    prompt: ({ store }) => {
      // a and b are guaranteed (b was added via extend, still linear)
      const name: string = store.steps.a.name;
      const confirmed: boolean = store.steps.b.confirmed;
      void name;
      void confirmed;
      return 'C';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 4. Action result: store carries action output, not response
// ============================================================

const checkLinks = action({
  name: 'check',
  input: type({ urls: 'string[]' }),
  output: type({ statuses: type({ url: 'string', ok: 'boolean' }).array() }),
  run: async ({ input }) => ({
    statuses: input.urls.map((url: string) => ({ url, ok: true })),
  }),
});

skill({ name: 'action-store', entry: 'find' })
  .step('find', {
    prompt: 'Find links',
    response: type({ links: 'string[]' }),
    action: {
      run: checkLinks,
      input: ({ response }) => ({ urls: response.links }),
    },
    next: 'report',
  })
  .step('report', {
    prompt: ({ store }) => {
      // store.steps.find carries the ACTION output, not the response
      const statuses = store.steps.find.statuses;
      void statuses;

      // @ts-expect-error - 'links' is on the response, not the action output
      store.steps.find.links;

      return 'Report';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 5. Three-way branch: all targets optional at merge
// ============================================================

skill({ name: 'three-way', entry: 'root' })
  .step('root', {
    prompt: 'Root',
    response: type({ choice: "'x' | 'y' | 'z'" }),
    next: [
      { to: 'x', when: ({ response }) => response.choice === 'x' },
      { to: 'y', when: ({ response }) => response.choice === 'y' },
      { to: 'z' },
    ],
  })
  .step('x', { prompt: 'X', response: type({ xVal: 'number' }), next: 'join' })
  .step('y', { prompt: 'Y', response: type({ yVal: 'number' }), next: 'join' })
  .step('z', { prompt: 'Z', response: type({ zVal: 'number' }), next: 'join' })
  .step('join', {
    prompt: ({ store }) => {
      // root is guaranteed (before the branch)
      const choice: string = store.steps.root.choice;
      void choice;

      // x, y, z are all branch targets → all optional
      const xv = store.steps.x?.xVal;
      const yv = store.steps.y?.yVal;
      const zv = store.steps.z?.zVal;
      void xv;
      void yv;
      void zv;

      return 'Join';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 6. NEGATIVE: branch targets must NOT be directly accessible
// ============================================================

// This is the critical test. If branch targets are directly accessible
// without ?., the type system is lying about safety.

skill({ name: 'negative-branch', entry: 'root' })
  .step('root', {
    prompt: 'Root',
    response: type({ val: 'string' }),
    next: [{ to: 'left', when: ({ response }) => response.val === 'l' }, { to: 'right' }],
  })
  .step('left', { prompt: 'L', response: type({ leftVal: 'string' }), next: 'end' })
  .step('right', { prompt: 'R', response: type({ rightVal: 'string' }), next: 'end' })
  .step('end', {
    prompt: ({ store }) => {
      // root is guaranteed → direct access should work
      const val: string = store.steps.root.val;
      void val;

      // left is a branch target → direct access MUST be an error
      // @ts-expect-error - left is a branch target, not guaranteed
      const leftDirect: { leftVal: string } = store.steps.left;
      void leftDirect;

      // right is a branch target → direct access MUST be an error
      // @ts-expect-error - right is a branch target, not guaranteed
      const rightDirect: { rightVal: string } = store.steps.right;
      void rightDirect;

      return 'End';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 7. First step: no guaranteed predecessors
// ============================================================

skill({ name: 'first-step', entry: 'only' }).step('only', {
  prompt: ({ store }) => {
    // No prior steps — store should have no guaranteed keys.
    // No prior steps — store has no properties to access.
    void store;
    return 'Only';
  },
  response: type({}),
  next: { terminal: true },
});

// ============================================================
// 8. Branch target that later becomes a linear predecessor
// ============================================================
// When a branch array has only one forward target (the other is a
// backward edge / retry loop), the forward target is NOT a real
// branch — it should become guaranteed when defined.

skill({ name: 'branch-then-linear', entry: 'a' })
  .step('a', {
    prompt: 'A',
    response: type({ val: 'string' }),
    next: 'b',
  })
  .step('b', {
    prompt: 'B',
    response: type({ ok: 'boolean' }),
    // b's next has two targets, but 'a' is already defined (backward edge).
    // Only 'c' is a forward target — single forward target, not a real branch.
    next: [{ to: 'c', when: ({ response }) => response.ok }, { to: 'a' }],
  })
  .step('c', {
    prompt: ({ store }) => {
      // a and b are both guaranteed (linear chain + retry loop filtered)
      const val: string = store.steps.a.val;
      const ok: boolean = store.steps.b.ok;
      void val;
      void ok;
      return 'C';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 9. Reconvergent branch: confirm-profile pattern
// ============================================================
// Models the get-to-know-you flow:
//   root → branch → [left | right] → merge → confirm → end
// Where merge has a retry loop back to itself, and confirm has
// a loop back to merge. Both merge and confirm should be guaranteed at end.

skill({ name: 'reconvergent', entry: 'root' })
  .step('root', {
    prompt: 'Root',
    response: type({ val: 'string' }),
    next: 'branch',
  })
  .step('branch', {
    prompt: 'Branch',
    response: type({ path: "'l' | 'r'" }),
    next: [{ to: 'left', when: ({ response }) => response.path === 'l' }, { to: 'right' }],
  })
  .step('left', {
    prompt: 'Left',
    response: type({ answer: 'string' }),
    next: 'merge',
  })
  .step('right', {
    prompt: 'Right',
    response: type({ answer: 'string' }),
    next: 'merge',
  })
  .step('merge', {
    prompt: 'Merge',
    response: type({ hobby: 'string', more: 'boolean' }),
    maxVisits: 3,
    onMaxVisits: 'confirm',
    // 'merge' is a backward edge (self-loop), 'confirm' is the only forward target
    next: [{ to: 'merge', when: ({ response }) => response.more }, { to: 'confirm' }],
  })
  .step('confirm', {
    prompt: 'Confirm',
    response: type({ approved: 'boolean' }),
    maxVisits: 3,
    onMaxVisits: 'end',
    // 'merge' is backward, 'end' is the only forward target
    next: [{ to: 'end', when: ({ response }) => response.approved }, { to: 'merge' }],
  })
  .step('end', {
    prompt: ({ store }) => {
      // root, branch, merge, confirm are all guaranteed
      const val: string = store.steps.root.val;
      const path: string = store.steps.branch.path;
      const hobby: string = store.steps.merge.hobby;
      const approved: boolean = store.steps.confirm.approved;
      void val;
      void path;
      void hobby;
      void approved;

      // left and right are true branch targets — optional
      const l = store.steps.left?.answer;
      const r = store.steps.right?.answer;
      void l;
      void r;

      return 'End';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 10. NEGATIVE: reconvergent branch targets still optional
// ============================================================
// Even after the branch reconverges at 'merge', the individual
// branch arms (left/right) must remain optional.

skill({ name: 'reconvergent-negative', entry: 'root' })
  .step('root', {
    prompt: 'Root',
    response: type({ val: 'string' }),
    next: [{ to: 'left', when: ({ response }) => response.val === 'l' }, { to: 'right' }],
  })
  .step('left', { prompt: 'L', response: type({ lv: 'string' }), next: 'merge' })
  .step('right', { prompt: 'R', response: type({ rv: 'string' }), next: 'merge' })
  .step('merge', {
    prompt: ({ store }) => {
      // root is guaranteed
      const val: string = store.steps.root.val;
      void val;

      // @ts-expect-error - left is a branch target, not guaranteed
      const leftDirect: { lv: string } = store.steps.left;
      void leftDirect;

      // @ts-expect-error - right is a branch target, not guaranteed
      const rightDirect: { rv: string } = store.steps.right;
      void rightDirect;

      return 'Merge';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 11. Multi-visit step (maxVisits): accessible after first visit
// ============================================================
// A step with maxVisits can run multiple times via .all().
// It should still be guaranteed if it's on the linear path.

skill({ name: 'multi-visit', entry: 'setup' })
  .step('setup', {
    prompt: 'Setup',
    response: type({ name: 'string' }),
    next: 'loop',
  })
  .step('loop', {
    prompt: 'Loop',
    response: type({ item: 'string', done: 'boolean' }),
    maxVisits: 5,
    onMaxVisits: 'end',
    // self-loop (backward edge) + 'end' (single forward) → not a real branch
    next: [{ to: 'loop', when: ({ response }) => !response.done }, { to: 'end' }],
  })
  .step('end', {
    prompt: ({ store }) => {
      // setup and loop are guaranteed
      const name: string = store.steps.setup.name;
      const item: string = store.steps.loop.item;
      void name;
      void item;

      // .all() returns typed array
      const items: Array<{ item: string; done: boolean }> = store.steps.all('loop');
      void items;

      return 'End';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 12. Merge point after branch: pre-branch guaranteed, branch-exclusive optional
// ============================================================
// a → b (branch) → [c, d] → e (merge) → f
// At f: a, b, e are guaranteed. c and d are optional.

skill({ name: 'merge-point', entry: 'a' })
  .step('a', {
    prompt: 'A',
    response: type({ val: 'string' }),
    next: 'b',
  })
  .step('b', {
    prompt: 'B',
    response: type({ choice: "'c' | 'd'" }),
    next: [{ to: 'c', when: ({ response }) => response.choice === 'c' }, { to: 'd' }],
  })
  .step('c', { prompt: 'C', response: type({ cv: 'number' }), next: 'e' })
  .step('d', { prompt: 'D', response: type({ dv: 'number' }), next: 'e' })
  .step('e', {
    prompt: 'E',
    response: type({ merged: 'boolean' }),
    next: 'f',
  })
  .step('f', {
    prompt: ({ store }) => {
      // a, b, e are guaranteed
      const val: string = store.steps.a.val;
      const choice: string = store.steps.b.choice;
      const merged: boolean = store.steps.e.merged;
      void val;
      void choice;
      void merged;

      // c and d are branch targets — optional
      const cv = store.steps.c?.cv;
      const dv = store.steps.d?.dv;
      void cv;
      void dv;

      // @ts-expect-error - c is a branch target, not guaranteed
      const cDirect: { cv: number } = store.steps.c;
      void cDirect;

      return 'F';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 13. response without prompt is a type error
// ============================================================

// @ts-expect-error - response requires prompt
step({ response: type({ val: 'string' }), next: 'b' });

// Promptless step without response is fine
step({ next: 'b' });

// ============================================================
// 14. Reconvergence: branch target IS the merge point
// ============================================================
// gather → [test-staging, test-prod]
// test-staging → test-prod (string next)
// test-prod is on ALL paths → should be guaranteed

skill({ name: 'reconvergence', entry: 'gather' })
  .step('gather', {
    prompt: 'Gather',
    response: type({ val: 'string' }),
    next: [{ to: 'test-staging', when: ({ response }) => response.val === 'staging' }, { to: 'test-prod' }],
  })
  .step('test-staging', {
    prompt: 'Staging',
    response: type({ stagingResult: 'string' }),
    next: 'test-prod',
  })
  .step('test-prod', {
    prompt: ({ store }) => {
      // gather is guaranteed (before the branch)
      const val: string = store.steps.gather.val;
      void val;

      // test-staging is a branch target — optional
      const staging = store.steps['test-staging']?.stagingResult;
      void staging;

      return 'Prod';
    },
    response: type({ prodResult: 'string' }),
    next: 'report',
  })
  .step('report', {
    prompt: ({ store }) => {
      // gather AND test-prod are guaranteed (test-prod promoted via reconvergence)
      const val: string = store.steps.gather.val;
      const prod: string = store.steps['test-prod'].prodResult;
      void val;
      void prod;

      // test-staging is still optional (true branch target)
      const staging = store.steps['test-staging']?.stagingResult;
      void staging;

      return 'Report';
    },
    response: type({}),
    next: { terminal: true },
  });

// ============================================================
// 15. NEGATIVE: partial reconvergence must NOT promote
// ============================================================
// root → [a, b, c], a → c, but b does NOT route to c
// c must remain optional

skill({ name: 'partial-reconvergence', entry: 'root' })
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
  .step('b', { prompt: 'B', response: type({ bv: 'string' }), next: 'end' })
  .step('c', { prompt: 'C', response: type({ cv: 'string' }), next: 'end' })
  .step('end', {
    prompt: ({ store }) => {
      // root is guaranteed
      const choice: string = store.steps.root.choice;
      void choice;

      // a, b, c are all branch targets — optional
      const a = store.steps.a?.av;
      const b = store.steps.b?.bv;
      const c = store.steps.c?.cv;
      void a;
      void b;
      void c;

      // @ts-expect-error - c is NOT promoted (b doesn't route to c)
      const cDirect: { cv: string } = store.steps.c;
      void cDirect;

      return 'End';
    },
    response: type({}),
    next: { terminal: true },
  });
