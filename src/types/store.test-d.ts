/**
 * Type-level tests for store type helpers.
 *
 * Run: pnpm exec tsc --noEmit
 * Passing = compiles silently. Failing = type error.
 */

import type { Expect, Equal, IsNever, IsOptional, IsRequired } from './test-utils.js';
import type {
  StoreView,
  StepsView,
  StoreMethods,
  RequiredSteps,
  OptionalSteps,
  ExtractBranchTargets,
  AddStepGuarantees,
  AddStepBranches,
  BranchState,
  GuaranteeState,
  ShouldPromote,
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
// AddStepGuarantees
// ============================================================

type EmptyG = GuaranteeState;
type EmptyB = BranchState;

// Not branched → joins guaranteed set
type _atg1 = Expect<Equal<AddStepGuarantees<GuaranteeState<'a'>, 'b', EmptyB, {}>['steps'], 'a' | 'b'>>;

// Branched → stays out of guaranteed
type _atg2 = Expect<Equal<AddStepGuarantees<GuaranteeState<'a'>, 'b', BranchState<'b'>, {}>['steps'], 'a'>>;

// First step → joins from empty
type _atg3 = Expect<Equal<AddStepGuarantees<EmptyG, 'first', EmptyB, {}>['steps'], 'first'>>;

// Store writes accumulate for guaranteed steps
type _atg4 = Expect<
  Equal<AddStepGuarantees<EmptyG, 'a', EmptyB, { env: { host: string } }>['storeWrites'], { env: { host: string } }>
>;

// Store writes don't accumulate for branched steps
type _atg5 = Expect<
  Equal<AddStepGuarantees<EmptyG, 'a', BranchState<'a'>, { env: { host: string } }>['storeWrites'], {}>
>;

// ============================================================
// AddStepBranches
// ============================================================

type BranchNext = readonly [{ to: 'a'; when: () => boolean }, { to: 'b' }];

// Branch array → adds targets to branched union
type _atb1 = Expect<Equal<AddStepBranches<EmptyB, 'root', BranchNext, 'root'>['branched'], 'a' | 'b'>>;

// Records branch group entries (target → origin)
type _atb2 = AddStepBranches<EmptyB, 'root', BranchNext, 'root'>['groups'];
type _atb2a = Expect<Equal<_atb2['a'], 'root'>>;
type _atb2b = Expect<Equal<_atb2['b'], 'root'>>;

// String next → no new branches
type _atb3 = Expect<IsNever<AddStepBranches<EmptyB, 'a', 'next-step', 'a'>['branched']>>;

// Records sibling-to-sibling edge when branched step routes to branched step
type _atb4 = AddStepBranches<BranchState<'a' | 'b', { a: 'root'; b: 'root' }>, 'a', 'b', 'a'>['edges'];
type _atb4a = Expect<Equal<_atb4, 'a->b'>>;

// ============================================================
// ShouldPromote (reconvergence detection)
// ============================================================

// 2-target: all siblings route to target → promote
type _sp1 = Expect<Equal<ShouldPromote<'b', BranchState<'a' | 'b', { a: 'root'; b: 'root' }, 'a->b'>>, true>>;

// 3-target: only 1 sibling routes → don't promote
type _sp2 = Expect<
  Equal<ShouldPromote<'c', BranchState<'a' | 'b' | 'c', { a: 'root'; b: 'root'; c: 'root' }, 'a->c'>>, false>
>;

// 3-target: both siblings route → promote
type _sp3 = Expect<
  Equal<ShouldPromote<'c', BranchState<'a' | 'b' | 'c', { a: 'root'; b: 'root'; c: 'root' }, 'a->c' | 'b->c'>>, true>
>;

// Not in any branch group → don't promote
type _sp4 = Expect<Equal<ShouldPromote<'x', BranchState<'a' | 'b', { a: 'root'; b: 'root' }, 'a->b'>>, false>>;

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
// StepsView — step-keyed accessor
// ============================================================

// No guaranteed keys: all step keys are optional properties
type PlainView = StepsView<Steps>;

type _sv1a = Expect<IsOptional<PlainView['greet']>>;
type _sv1b = Expect<IsOptional<PlainView['ask-role']>>;
type _sv1c = Expect<IsOptional<PlainView['ask-stack']>>;

// With guaranteed keys: those are required, rest optional
type NarrowedView = StepsView<Steps, 'greet' | 'ask-role'>;

type _sv2 = Expect<IsRequired<NarrowedView['greet']>>;
type _sv3 = Expect<IsRequired<NarrowedView['ask-role']>>;
type _sv4 = Expect<Equal<NarrowedView['greet'], { name: string }>>;
type _sv5 = Expect<IsOptional<NarrowedView['ask-stack']>>;

// Methods exist on the steps view
type _sv6 = Expect<Equal<'all' extends keyof NarrowedView ? true : false, true>>;
type _sv7 = Expect<Equal<'ran' extends keyof NarrowedView ? true : false, true>>;

// Verify method-only keys don't include step names
type MethodKeys = keyof StoreMethods<Steps>;
type _sv8 = Expect<Equal<MethodKeys, 'all' | 'ran' | 'history'>>;

// ============================================================
// StoreView — combined type with steps namespace
// ============================================================

// StoreView wraps StepsView under .steps
type FullStore = StoreView<Steps, 'greet' | 'ask-role'>;
type _fv1 = Expect<IsRequired<FullStore['steps']>>;
type _fv2 = Expect<Equal<FullStore['steps']['greet'], { name: string }>>;
type _fv3 = Expect<IsOptional<FullStore['steps']['ask-stack']>>;

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
void (0 as unknown as _atb2a);
void (0 as unknown as _atb2b);
void (0 as unknown as _atb3);
void (0 as unknown as _atb4);
void (0 as unknown as _atb4a);
void (0 as unknown as _sp1);
void (0 as unknown as _sp2);
void (0 as unknown as _sp3);
void (0 as unknown as _sp4);
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
void (0 as unknown as _fv1);
void (0 as unknown as _fv2);
void (0 as unknown as _fv3);
void (0 as unknown as _srt1);
void (0 as unknown as _srt2);
