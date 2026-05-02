/**
 * Store type system — modular type helpers for step-keyed state.
 *
 * The store gives each step access to prior steps' results. The type system
 * tracks which steps are guaranteed (on all paths) vs optional (branch targets).
 *
 * Architecture:
 *   StoreView<TSteps, TGuaranteed>  — the developer-facing accessor type
 *   StoreMethods<TSteps>            — the method-based API (all, ran, history)
 *   RequiredSteps<TSteps, TG>      — mapped type for guaranteed direct access
 *   OptionalSteps<TSteps, TG>      — mapped type for branch-target optional access
 *   ExtractBranchTargets<T>        — extracts branch target names from NextBranch[]
 */

import type { StepResult } from '../types.js';

// ============================================================
// Core accessor types
// ============================================================

/** Methods that don't map to step names. */
export interface StoreMethods<TSteps extends Record<string, unknown>> {
  /** Access all results from a step that may have run multiple times (loops). */
  all<K extends string & keyof TSteps>(step: K): TSteps[K][];
  /** Check whether a step has run at least once. */
  ran<K extends string & keyof TSteps>(step: K): boolean;
  /** Raw step records (escape hatch). */
  readonly history: readonly StepResult[];
}

/** Direct property access for steps guaranteed to have run. */
export type RequiredSteps<TSteps extends Record<string, unknown>, TGuaranteed extends keyof TSteps> = {
  readonly [K in TGuaranteed]: TSteps[K];
};

/** Optional property access for steps that may or may not have run. */
export type OptionalSteps<TSteps extends Record<string, unknown>, TGuaranteed extends keyof TSteps> = {
  readonly [K in Exclude<keyof TSteps, TGuaranteed>]?: TSteps[K];
};

/**
 * The full store accessor: guaranteed keys as required properties,
 * non-guaranteed keys as optional properties, plus utility methods.
 *
 * All step keys are available as optional properties via AllOptional.
 * Guaranteed keys are then narrowed to required via RequiredSteps.
 * The `AllOptional & RequiredSteps` pattern ensures non-guaranteed keys
 * resolve correctly through the builder's accumulated intersection types.
 *
 * Usage:
 *   store.greet.name          // guaranteed — non-optional
 *   store['ask-stack']?.answer // branch target — optional, use ?.
 *   store.all('ask-hobby')    // loop visits — typed array
 *   store.ran('ask-stack')    // boolean check
 */
export type StoreView<
  TSteps extends Record<string, unknown> = Record<string, unknown>,
  TGuaranteed extends keyof TSteps = never,
> = Partial<Readonly<TSteps>> & RequiredSteps<TSteps, TGuaranteed> & StoreMethods<TSteps>;

// ============================================================
// Branch target extraction
// ============================================================

/** Shape matcher for branch entries in ExtractBranchTargets. Uses `any` params to match any callback signature. */
interface BranchEntry {
  readonly to: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly when?: (...args: any[]) => boolean;
}

/**
 * Extract forward branch target names from a NextBranch array type.
 *
 * Only targets that are NOT already in TKnownSteps count as branches.
 * Backward edges (retry loops to already-defined steps) don't create
 * branches — the forward path is still guaranteed.
 *
 * If after filtering backward edges only one forward target remains,
 * there's no actual branch — the forward step is guaranteed.
 */
export type ExtractBranchTargets<
  T,
  TKnownSteps extends string = never,
> = T extends readonly [BranchEntry, BranchEntry, ...BranchEntry[]]
  ? ForwardTargetsOrNever<Exclude<ExtractTo<T[number]>, TKnownSteps>>
  : never;

/** If the union has 2+ members, return it. If 0 or 1, return never (not a real branch). */
type ForwardTargetsOrNever<T extends string> = [T] extends [never]
  ? never
  : IsUnion<T> extends true
    ? T
    : never;

/** True if T is a union (2+ members), false if it's a single literal or never. */
type IsUnion<T, U = T> = [T] extends [never] ? false : T extends U ? ([U] extends [T] ? false : true) : false;

/** Extract the `to` string literal from a union of branch entries. */
type ExtractTo<T> = T extends { readonly to: infer S extends string } ? S : never;

// ============================================================
// Builder accumulator helpers
// ============================================================

/**
 * Compute the next TGuaranteed after adding a step.
 * If the step is a branch target, it stays optional — TGuaranteed unchanged.
 * If it's not branched, it joins the guaranteed set.
 */
export type AddToGuaranteed<
  TGuaranteed extends string,
  TBranched extends string,
  Name extends string,
> = Name extends TBranched ? TGuaranteed : TGuaranteed | Name;

/**
 * Compute the next TBranched after adding a step with a given next value.
 * Merges any new branch targets from the step's next declaration.
 * TKnownSteps are existing step names — backward edges to these are ignored.
 */
export type AddToBranched<TBranched extends string, TNext, TKnownSteps extends string = never> =
  TBranched | ExtractBranchTargets<TNext, TKnownSteps>;

/**
 * Compute the step result type for builder accumulation.
 * If the step has an action, the result type is the action output.
 * Otherwise, it's the response type.
 */
export type StepResultType<TOutput, TAction> = TAction extends { output: { infer: infer TActionOut } }
  ? TActionOut
  : TOutput;
