/**
 * Store type system — modular type helpers for step-keyed and sub-store state.
 *
 * The store has two namespaces:
 *   store.steps.*  — step-keyed results with DAG-based type narrowing
 *   store.*        — sub-store properties (domain-structured state)
 *
 * Architecture:
 *   StoreView<TSteps, TGuaranteed>  — the developer-facing accessor type
 *   StepsView<TSteps, TGuaranteed>  — the step-keyed accessor (under store.steps)
 *   StoreMethods<TSteps>            — method-based API (all, ran, history)
 *   RequiredSteps<TSteps, TG>      — mapped type for guaranteed direct access
 *   OptionalSteps<TSteps, TG>      — mapped type for branch-target optional access
 *   ExtractBranchTargets<T>        — extracts branch target names from NextBranch[]
 */

import type { type } from 'arktype';
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
 * Step-keyed accessor: guaranteed keys as required properties,
 * non-guaranteed keys as optional properties, plus utility methods.
 *
 * Usage:
 *   store.steps.greet.name          // guaranteed — non-optional
 *   store.steps['ask-stack']?.answer // branch target — optional, use ?.
 *   store.steps.all('ask-hobby')    // loop visits — typed array
 *   store.steps.ran('ask-stack')    // boolean check
 */
export type StepsView<
  TSteps extends Record<string, unknown> = Record<string, unknown>,
  TGuaranteed extends keyof TSteps = never,
> = Partial<Readonly<TSteps>> & RequiredSteps<TSteps, TGuaranteed> & StoreMethods<TSteps>;

// ============================================================
// Sub-store types
// ============================================================

/** Recursively makes all properties optional. */
export type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/** Recursively makes all properties readonly. */
export type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

/** Maps a record of ArkType schemas to their inferred TypeScript types. */
export type InferStores<T extends Record<string, type.Any>> = {
  [K in keyof T]: T[K]['infer'];
};

/** Sub-store accessor: each declared store name maps to a deep-partial, deep-readonly view. */
export type SubStoreView<TStores extends Record<string, unknown>> = {
  readonly [K in keyof TStores]?: DeepReadonly<DeepPartial<TStores[K]>>;
};

/**
 * The full store accessor: steps namespaced under `.steps`, sub-stores at top level.
 *
 * TStores is the full declared store schema — all properties are optional via SubStoreView.
 * TStoreWrites is the intersection of save returns from guaranteed predecessors — these
 * override the optional view, making written paths required (same pattern as step narrowing).
 *
 * Usage:
 *   store.steps.greet.name          // step-keyed access
 *   store.steps.all('ask-hobby')    // step methods
 *   store.environment?.apiA?.host   // sub-store: unwritten path (optional)
 *   store.environment.apiA.host     // sub-store: guaranteed predecessor wrote this (required)
 */
export type StoreView<
  TSteps extends Record<string, unknown> = Record<string, unknown>,
  TGuaranteed extends keyof TSteps = never,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  TStores extends Record<string, unknown> = {},
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  TStoreWrites extends Record<string, unknown> = {},
> = { readonly steps: StepsView<TSteps, TGuaranteed> } & SubStoreView<TStores> & DeepReadonly<TStoreWrites>;

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
export type ExtractBranchTargets<T, TKnownSteps extends string = never> = T extends readonly [
  BranchEntry,
  BranchEntry,
  ...BranchEntry[],
]
  ? ForwardTargetsOrNever<Exclude<ExtractTo<T[number]>, TKnownSteps>>
  : never;

/** If the union has 2+ members, return it. If 0 or 1, return never (not a real branch). */
type ForwardTargetsOrNever<T extends string> = [T] extends [never] ? never : IsUnion<T> extends true ? T : never;

/** True if T is a union (2+ members), false if it's a single literal or never. */
type IsUnion<T, U = T> = [T] extends [never] ? false : T extends U ? ([U] extends [T] ? false : true) : false;

/** Extract the `to` string literal from a union of branch entries. */
type ExtractTo<T> = T extends { readonly to: infer S extends string } ? S : never;

// ============================================================
// Grouped state: branching topology and guarantees
// ============================================================

/**
 * Branching topology — tracks which steps are branch targets,
 * which branch point created them, and which siblings route to each other.
 *
 * branched: flat union of all branch target names
 * groups:   maps each target name → the origin step that branched to it
 * edges:    union of "source->target" strings recording sibling-to-sibling routing
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type BranchState<
  TBranched extends string = never,
  TGroups extends Record<string, string> = {},
  TEdges extends string = never,
> = {
  branched: TBranched;
  groups: TGroups;
  edges: TEdges;
};

/**
 * Guarantee state — what the DAG has proven about all-path reachability.
 *
 * steps:       union of step names guaranteed on all paths
 * storeWrites: intersection of save returns from guaranteed steps
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type GuaranteeState<TStepKeys extends string = never, TStoreWrites extends Record<string, unknown> = {}> = {
  steps: TStepKeys;
  storeWrites: TStoreWrites;
};

// ============================================================
// Reconvergence detection
// ============================================================

/** Extract source step names from encoded edges that target a specific step. */
type RoutingSources<Target extends string, TEdges extends string> = TEdges extends `${infer S}->${Target}` ? S : never;

/** Get all branch targets that share the same origin as Name. */
type SiblingsOf<Name extends string, TGroups extends Record<string, string>> = Name extends keyof TGroups
  ? { [K in Extract<keyof TGroups, string>]: TGroups[K] extends TGroups[Name] ? K : never }[Extract<
      keyof TGroups,
      string
    >]
  : never;

/**
 * Check if a branched step should be promoted to guaranteed.
 * True when ALL sibling branch targets (from the same branch group)
 * have routed to Name via string next.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ShouldPromote<
  Name extends string,
  TBranches extends BranchState<any, any, any>,
> = Name extends keyof TBranches['groups']
  ? Exclude<SiblingsOf<Name, TBranches['groups']>, Name> extends infer Siblings extends string
    ? [Siblings] extends [never]
      ? false
      : [Exclude<Siblings, RoutingSources<Name, TBranches['edges']>>] extends [never]
        ? true
        : false
    : false
  : false;

// ============================================================
// Builder accumulator operations
// ============================================================

/** Is Name guaranteed? Either it's not branched, or it's been promoted via reconvergence. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IsGuaranteed<
  Name extends string,
  TBranches extends BranchState<any, any, any>,
> = Name extends TBranches['branched'] ? ShouldPromote<Name, TBranches> : true;

/** Compute the next guarantee state after adding a step. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AddStepGuarantees<
  TGuarantees extends GuaranteeState<any, any>,
  Name extends string,
  TBranches extends BranchState<any, any, any>,
  TSaveStoreWrites extends Record<string, unknown>,
> =
  IsGuaranteed<Name, TBranches> extends true
    ? GuaranteeState<TGuarantees['steps'] | Name, TGuarantees['storeWrites'] & TSaveStoreWrites>
    : TGuarantees;

/** Compute the next branch state after adding a step. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AddStepBranches<
  TBranches extends BranchState<any, any, any>,
  Name extends string,
  TNext,
  TKnownSteps extends string,
> = BranchState<
  TBranches['branched'] | ExtractBranchTargets<TNext, TKnownSteps>,
  TBranches['groups'] & ExtractBranchGroupEntries<TNext, Name, TKnownSteps>,
  TBranches['edges'] | ExtractBranchEdge<Name, TNext, TBranches['branched']>
>;

/** Extract branch group entries from a branch array. Maps each forward target → origin step. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type ExtractBranchGroupEntries<TNext, Origin extends string, TKnownSteps extends string> =
  ExtractBranchTargets<TNext, TKnownSteps> extends infer Targets extends string
    ? [Targets] extends [never]
      ? {}
      : { [K in Targets]: Origin }
    : {};

/** Extract a sibling routing edge: when a branched step's string-next targets another branched step. */
type ExtractBranchEdge<Name extends string, TNext, TBranched extends string> = Name extends TBranched
  ? TNext extends string
    ? TNext extends TBranched
      ? `${Name}->${TNext}`
      : never
    : never
  : never;

/**
 * Compute the step result type for builder accumulation.
 * If the step has an action, the result type is the action output.
 * Otherwise, it's the response type.
 */
export type StepResultType<TOutput, TAction> = TAction extends { output: { infer: infer TActionOut } }
  ? TActionOut
  : TOutput;
