/**
 * Type-level tests for store type helpers.
 *
 * Run: pnpm exec tsc --noEmit
 * Passing = compiles silently. Failing = type error.
 */

import type { Expect, Equal, IsNever, IsOptional, IsRequired } from './test-utils.js';
import type {
  StoreView,
  StoreMethods,
  RequiredSteps,
  OptionalSteps,
  ExtractBranchTargets,
  AddToGuaranteed,
  AddToBranched,
  StepResultType,
} from './store.js';

// ============================================================
// ExtractBranchTargets
// ============================================================

// String next → no branch targets
type _ebt1 = Expect<IsNever<ExtractBranchTargets<'single-target'>>>;

// Terminal → no branch targets
type _ebt2 = Expect<IsNever<ExtractBranchTargets<{ terminal: true }>>>;

// Single-entry array → NOT branching (only one path)
type _ebt3 = Expect<IsNever<ExtractBranchTargets<readonly [{ to: 'only' }]>>>;

// Two forward entries → both are branch targets
type _ebt4 = Expect<Equal<ExtractBranchTargets<readonly [{ to: 'a'; when: () => boolean }, { to: 'b' }]>, 'a' | 'b'>>;

// Three forward entries → all are branch targets
type _ebt5 = Expect<
  Equal<
    ExtractBranchTargets<readonly [{ to: 'x'; when: () => boolean }, { to: 'y'; when: () => boolean }, { to: 'z' }]>,
    'x' | 'y' | 'z'
  >
>;

// Function next → no branch targets (opaque)
type _ebt6 = Expect<IsNever<ExtractBranchTargets<() => string>>>;

// Retry loop: one forward + one backward → NOT a real branch (only one forward path)
type _ebt7 = Expect<
  IsNever<ExtractBranchTargets<readonly [{ to: 'forward'; when: () => boolean }, { to: 'backward' }], 'backward'>>
>;

// Two forward + one backward → the two forward targets ARE branches
type _ebt8 = Expect<
  Equal<
    ExtractBranchTargets<
      readonly [{ to: 'a'; when: () => boolean }, { to: 'b'; when: () => boolean }, { to: 'retry' }],
      'retry'
    >,
    'a' | 'b'
  >
>;

// ============================================================
// AddToGuaranteed
// ============================================================

// Not branched → joins guaranteed set
type _atg1 = Expect<Equal<AddToGuaranteed<'a', never, 'b'>, 'a' | 'b'>>;

// Branched → stays out of guaranteed
type _atg2 = Expect<Equal<AddToGuaranteed<'a', 'b', 'b'>, 'a'>>;

// First step → joins from empty
type _atg3 = Expect<Equal<AddToGuaranteed<never, never, 'first'>, 'first'>>;

// Already guaranteed + new non-branched
type _atg4 = Expect<Equal<AddToGuaranteed<'a' | 'b', 'x', 'c'>, 'a' | 'b' | 'c'>>;

// Already guaranteed + new branched
type _atg5 = Expect<Equal<AddToGuaranteed<'a' | 'b', 'x' | 'c', 'c'>, 'a' | 'b'>>;

// ============================================================
// AddToBranched
// ============================================================

// String next → no new branches
type _atb1 = Expect<Equal<AddToBranched<never, 'single'>, never>>;

// Branch array → adds targets
type _atb2 = Expect<Equal<AddToBranched<never, readonly [{ to: 'a'; when: () => boolean }, { to: 'b' }]>, 'a' | 'b'>>;

// Accumulates with prior branches
type _atb3 = Expect<
  Equal<AddToBranched<'x', readonly [{ to: 'a'; when: () => boolean }, { to: 'b' }]>, 'x' | 'a' | 'b'>
>;

// Backward edge filtering: one forward + one backward → no new branches
type _atb4 = Expect<
  Equal<AddToBranched<never, readonly [{ to: 'forward'; when: () => boolean }, { to: 'backward' }], 'backward'>, never>
>;

// Backward edge filtering: two forward + one backward → only forward targets added
type _atb5 = Expect<
  Equal<
    AddToBranched<
      never,
      readonly [{ to: 'a'; when: () => boolean }, { to: 'b'; when: () => boolean }, { to: 'retry' }],
      'retry'
    >,
    'a' | 'b'
  >
>;

// Self-loop + single forward → no new branches (single forward = not a real branch)
type _atb6 = Expect<
  Equal<AddToBranched<never, readonly [{ to: 'self'; when: () => boolean }, { to: 'next' }], 'self'>, never>
>;

// ============================================================
// RequiredSteps / OptionalSteps
// ============================================================

type Steps = {
  greet: { name: string };
  'ask-role': { role: string };
  'ask-stack': { answer: string };
};

// RequiredSteps: only guaranteed keys present, all required
type _rs1 = RequiredSteps<Steps, 'greet'>;
type _rs1_check = Expect<Equal<_rs1['greet'], { name: string }>>;
type _rs1_keys = Expect<Equal<keyof _rs1, 'greet'>>;

// OptionalSteps: non-guaranteed keys, all optional
type _os1 = OptionalSteps<Steps, 'greet'>;
type _os1_check = Expect<IsOptional<_os1['ask-role']>>;
type _os1_keys = Expect<Equal<keyof _os1, 'ask-role' | 'ask-stack'>>;

// ============================================================
// StoreView — combined type
// ============================================================

// No guaranteed keys: all step keys are optional properties
type PlainView = StoreView<Steps>;

type _sv1a = Expect<IsOptional<PlainView['greet']>>;
type _sv1b = Expect<IsOptional<PlainView['ask-role']>>;
type _sv1c = Expect<IsOptional<PlainView['ask-stack']>>;

// With guaranteed keys: those are required, rest optional
type NarrowedView = StoreView<Steps, 'greet' | 'ask-role'>;

type _sv2 = Expect<IsRequired<NarrowedView['greet']>>;
type _sv3 = Expect<IsRequired<NarrowedView['ask-role']>>;
type _sv4 = Expect<Equal<NarrowedView['greet'], { name: string }>>;
type _sv5 = Expect<IsOptional<NarrowedView['ask-stack']>>;

// Methods exist on the store type
type _sv6 = Expect<Equal<'all' extends keyof NarrowedView ? true : false, true>>;
type _sv7 = Expect<Equal<'ran' extends keyof NarrowedView ? true : false, true>>;

// Verify method-only keys don't include step names
type MethodKeys = keyof StoreMethods<Steps>;
type _sv8 = Expect<Equal<MethodKeys, 'all' | 'ran' | 'history'>>;

// ============================================================
// StepResultType
// ============================================================

// No action → response type
type _srt1 = Expect<Equal<StepResultType<{ name: string }, undefined>, { name: string }>>;

// With action → action output type
type _srt2 = Expect<
  Equal<StepResultType<{ links: string[] }, { output: { infer: { statuses: boolean[] } } }>, { statuses: boolean[] }>
>;

// Suppress unused type warnings
void (0 as unknown as _ebt1);
void (0 as unknown as _ebt2);
void (0 as unknown as _ebt3);
void (0 as unknown as _ebt4);
void (0 as unknown as _ebt5);
void (0 as unknown as _ebt6);
void (0 as unknown as _ebt7);
void (0 as unknown as _ebt8);
void (0 as unknown as _atg1);
void (0 as unknown as _atg2);
void (0 as unknown as _atg3);
void (0 as unknown as _atg4);
void (0 as unknown as _atg5);
void (0 as unknown as _atb1);
void (0 as unknown as _atb2);
void (0 as unknown as _atb3);
void (0 as unknown as _atb4);
void (0 as unknown as _atb5);
void (0 as unknown as _atb6);
void (0 as unknown as _rs1_check);
void (0 as unknown as _rs1_keys);
void (0 as unknown as _os1_check);
void (0 as unknown as _os1_keys);
void (0 as unknown as _sv1a);
void (0 as unknown as _sv1b);
void (0 as unknown as _sv1c);
void (0 as unknown as _sv2);
void (0 as unknown as _sv3);
void (0 as unknown as _sv4);
void (0 as unknown as _sv5);
void (0 as unknown as _sv6);
void (0 as unknown as _sv7);
void (0 as unknown as _sv8);
void (0 as unknown as _srt1);
void (0 as unknown as _srt2);
