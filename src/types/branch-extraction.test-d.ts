/**
 * Focused test: builder branch extraction.
 *
 * Minimal reproduction based on the working pattern:
 *   function foo<TNext extends Next>(next: TNext): TNext extends Branch[] ? Extract<TNext> : never
 */

import { type } from 'arktype';
import { skill } from '../index.js';
import type { SkillBuilder } from '../skill-builder.js';
import type { Expect, Equal, IsNever } from './test-utils.js';

// --- Test 1: basic branch extraction from builder ---

const afterBranch = skill({ name: 'test', entry: 'a' }).step('a', {
  prompt: 'A',
  response: type({ val: 'string' }),
  next: [{ to: 'b', when: ({ response }) => response.val === 'x' }, { to: 'c' }],
});

type AfterBranch = typeof afterBranch;
type Branched =
  AfterBranch extends SkillBuilder<infer _P, infer _S, infer _G, infer B, infer _St> ? B['branched'] : 'FAIL';

// TBranched should include 'b' and 'c'
type _t1 = Expect<Equal<Branched, 'b' | 'c'>>;
void (0 as unknown as _t1);

// --- Test 2: string next produces no branches ---

const afterLinear = skill({ name: 'test', entry: 'a' }).step('a', {
  prompt: 'A',
  response: type({ val: 'string' }),
  next: 'b',
});

type AfterLinear = typeof afterLinear;
type LinearBranched =
  AfterLinear extends SkillBuilder<infer _P, infer _S, infer _G, infer B, infer _St> ? B['branched'] : 'FAIL';
type _t2 = Expect<IsNever<LinearBranched>>;
void (0 as unknown as _t2);

// --- Test 3: terminal next produces no branches ---

const afterTerminal = skill({ name: 'test', entry: 'a' }).step('a', {
  prompt: 'A',
  response: type({ val: 'string' }),
  next: { terminal: true },
});

type AfterTerminal = typeof afterTerminal;
type TerminalBranched =
  AfterTerminal extends SkillBuilder<infer _P, infer _S, infer _G, infer B, infer _St> ? B['branched'] : 'FAIL';
type _t3 = Expect<IsNever<TerminalBranched>>;
void (0 as unknown as _t3);

// --- Test 4: branch targets are optional, pre-branch guaranteed ---

skill({ name: 'full', entry: 'root' })
  .step('root', {
    prompt: 'Root',
    response: type({ val: 'string' }),
    next: [{ to: 'left', when: ({ response }) => response.val === 'l' }, { to: 'right' }],
  })
  .step('left', { prompt: 'L', response: type({ lv: 'string' }), next: 'end' })
  .step('right', { prompt: 'R', response: type({ rv: 'string' }), next: 'end' })
  .step('end', {
    prompt: ({ store }) => {
      // root is guaranteed
      const val: string = store.steps.root.val;
      void val;

      // left and right are branch targets — optional
      const lv: string | undefined = store.steps.left?.lv;
      const rv: string | undefined = store.steps.right?.rv;
      void lv;
      void rv;

      return 'End';
    },
    response: type({}),
    next: { terminal: true },
  });

// --- Test 5: retry loop — only one forward target, not a real branch ---

skill({ name: 'retry', entry: 'first' })
  .step('first', {
    prompt: 'First',
    response: type({ val: 'string' }),
    next: 'review',
  })
  .step('review', {
    prompt: 'Review',
    response: type({ approved: 'boolean' }),
    next: [
      { to: 'proceed', when: ({ response }) => response.approved },
      { to: 'first' }, // backward edge — retry
    ],
  })
  .step('proceed', {
    prompt: ({ store }) => {
      // first and review are guaranteed (linear chain + retry loop)
      const val: string = store.steps.first.val;
      const approved: boolean = store.steps.review.approved;
      void val;
      void approved;
      return 'Done';
    },
    response: type({}),
    next: { terminal: true },
  });

// --- Test 6: self-loop + forward target — forward step is guaranteed ---

const afterSelfLoop = skill({ name: 'self-loop', entry: 'collect' }).step('collect', {
  prompt: 'Collect',
  response: type({ item: 'string', done: 'boolean' }),
  maxVisits: 5,
  onMaxVisits: 'summarize',
  next: [
    { to: 'collect', when: ({ response }) => !response.done }, // self-loop (backward)
    { to: 'summarize' }, // single forward target
  ],
});

type AfterSelfLoop = typeof afterSelfLoop;
type SelfLoopBranched =
  AfterSelfLoop extends SkillBuilder<infer _P, infer _S, infer _G, infer B, infer _St> ? B['branched'] : 'FAIL';
type SelfLoopGuaranteed =
  AfterSelfLoop extends SkillBuilder<infer _P, infer _S, infer G, infer _B, infer _St> ? G['steps'] : 'FAIL';

// Self-loop filtered out → single forward target → not a real branch
type _t6a = Expect<IsNever<SelfLoopBranched>>;
// collect should be guaranteed (defined step, not in TBranched)
type _t6b = Expect<Equal<SelfLoopGuaranteed, 'collect'>>;
void (0 as unknown as _t6a);
void (0 as unknown as _t6b);

// Verify the forward target becomes guaranteed when defined
afterSelfLoop.step('summarize', {
  prompt: ({ store }) => {
    // collect is guaranteed
    const item: string = store.steps.collect.item;
    void item;
    return 'Summary';
  },
  response: type({}),
  next: { terminal: true },
});

// --- Test 7: two backward edges + one forward → forward is guaranteed ---

skill({ name: 'multi-backward', entry: 'a' })
  .step('a', {
    prompt: 'A',
    response: type({ val: 'string' }),
    next: 'b',
  })
  .step('b', {
    prompt: 'B',
    response: type({ val: 'string' }),
    next: 'c',
  })
  .step('c', {
    prompt: 'C',
    response: type({ choice: 'string' }),
    // Two backward edges (a, b) + one forward (d) → not a real branch
    next: [
      { to: 'a', when: ({ response }) => response.choice === 'restart' },
      { to: 'b', when: ({ response }) => response.choice === 'redo' },
      { to: 'd' },
    ],
  })
  .step('d', {
    prompt: ({ store }) => {
      // a, b, c are all guaranteed
      const av: string = store.steps.a.val;
      const bv: string = store.steps.b.val;
      const cc: string = store.steps.c.choice;
      void av;
      void bv;
      void cc;
      return 'D';
    },
    response: type({}),
    next: { terminal: true },
  });
