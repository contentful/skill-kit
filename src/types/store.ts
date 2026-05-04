/**
 * Type-level DAG analysis for workflow builder store access.
 *
 * ## The problem
 *
 * A skill workflow is a directed acyclic graph (DAG) of steps. When a step's
 * `prompt` function accesses the store, it can read results from earlier steps.
 * But not all steps are guaranteed to have run — the workflow may have branched,
 * and only one branch arm executes at runtime. We need the type system to tell
 * developers which step results are safe to access directly (guaranteed on all
 * execution paths) vs. which require optional chaining (might not have run).
 *
 * The same analysis applies to sub-store writes: when a guaranteed predecessor
 * calls `save({ env: { host: 'x' } })`, downstream steps can access
 * `store.env.host` without `?.`. Branch-target writes remain optional.
 *
 * ## The algorithm (abstract)
 *
 * As the developer chains `.step()` calls on the builder, the type system
 * processes each step in declaration order:
 *
 * 1. **Classify the step**: is its name in the "branched" set? If not, it's
 *    guaranteed. If it is branched, check for reconvergence (all sibling
 *    branches route to it) — if so, promote it to guaranteed.
 *
 * 2. **Extract branch targets**: if the step's `next` is a branch array
 *    (2+ entries), identify forward targets (excluding backward edges to
 *    already-defined steps). If 2+ forward targets remain, mark them all
 *    as branched. If only 0-1 forward targets remain (the rest were retry
 *    loops), it's not a real branch.
 *
 * 3. **Record routing edges**: when a branched step uses a string `next`
 *    pointing to another branched step, record that edge. These edges power
 *    reconvergence detection — a branched step becomes guaranteed when ALL
 *    its siblings have routed to it.
 *
 * 4. **Accumulate state**: the builder carries two grouped state types —
 *    `GuaranteeState` (guaranteed step names + sub-store writes) and
 *    `BranchState` (branched names + group membership + routing edges).
 *    Each `.step()` call returns a builder with updated state types.
 *
 * ## How it maps to TypeScript
 *
 * Each "algorithm step" above is a conditional type or mapped type:
 * - Classification: `IsGuaranteed` checks membership in `BranchState['branched']`
 * - Branch extraction: `ExtractBranchTargets` uses tuple matching + `Exclude`
 * - Routing edges: `ExtractBranchEdge` builds template literal `"source->target"` strings
 * - Reconvergence: `ShouldPromote` uses `SiblingsOf` + `RoutingSources` to check all-path coverage
 * - Accumulation: `AddStepGuarantees` / `AddStepBranches` compute the next state types
 *
 * The final accessor types (`StepsView`, `StoreView`) use the accumulated
 * guarantee set to split properties into required (guaranteed) vs. optional
 * (branch targets), giving developers correct autocomplete and type errors.
 *
 * ## Reconvergence: two complementary rules
 *
 * Branch targets are promoted to guaranteed via two rules:
 *
 * 1. **Sibling reconvergence**: all siblings from the same branch point route
 *    to the target via string next. Detected by `ShouldPromote`.
 *
 * 2. **Guaranteed-step routing**: a guaranteed step (not branched, or already
 *    promoted) routes to a branch target via string next. Since the guaranteed
 *    step runs on all paths, the target is also on all paths. Detected by
 *    `GuaranteedRouteTarget`, which removes the target from `TBranched`.
 *
 * Together these handle transitive chains: A → [B, E], B → C → D → E.
 * B and E enter TBranched. C and D are never branched (guaranteed). When D
 * is defined with next: 'E', rule 2 fires — D is guaranteed, E is removed
 * from TBranched, so E becomes guaranteed when defined.
 */

import type { type } from 'arktype';
import type { StepResult } from '../types.js';

// ============================================================
// Section 1: Core accessor types
//
// These types define the developer-facing store API. The store
// is what step prompt functions receive to read results from
// earlier steps and sub-store data. The key insight is splitting
// step properties into "required" (guaranteed to have run) and
// "optional" (might not have run due to branching).
// ============================================================

/**
 * Utility methods available on `store.steps` alongside step properties.
 *
 * These provide escape hatches for cases where property access isn't enough:
 * - `all(step)` returns every result from a step that ran multiple times (loops)
 * - `ran(step)` checks existence without accessing the value
 * - `history` gives raw access to the underlying step records
 */
export interface StoreMethods<TSteps extends Record<string, unknown>> {
  /** Access all results from a step that may have run multiple times (loops). */
  all<K extends string & keyof TSteps>(step: K): TSteps[K][];
  /** Check whether a step has run at least once. */
  ran<K extends string & keyof TSteps>(step: K): boolean;
  /** Raw step records (escape hatch). */
  readonly history: readonly StepResult[];
}

/**
 * Mapped type for steps guaranteed to have run — all properties are required.
 *
 * Maps only the keys in `TGuaranteed` to their result types, all readonly.
 * These become non-optional properties on the store, so `store.steps.greet.name`
 * works without `?.`.
 *
 * Example: RequiredSteps<{ greet: { name: string }, ask: { role: string } }, 'greet'>
 *   → { readonly greet: { name: string } }
 */
export type RequiredSteps<TSteps extends Record<string, unknown>, TGuaranteed extends keyof TSteps> = {
  readonly [K in TGuaranteed]: TSteps[K];
};

/**
 * Mapped type for steps that may not have run — all properties are optional.
 *
 * Maps all step keys EXCEPT those in `TGuaranteed`, making them optional with `?`.
 * These require `?.` access: `store.steps['ask-stack']?.answer`.
 *
 * Uses `Exclude<keyof TSteps, TGuaranteed>` to compute the set difference.
 * This is only used internally to construct `StepsView` — it is NOT directly
 * intersected in the final type. See the `StepsView` comment for why.
 *
 * Example: OptionalSteps<{ greet: { name: string }, ask: { role: string } }, 'greet'>
 *   → { readonly ask?: { role: string } }
 */
export type OptionalSteps<TSteps extends Record<string, unknown>, TGuaranteed extends keyof TSteps> = {
  readonly [K in Exclude<keyof TSteps, TGuaranteed>]?: TSteps[K];
};

/**
 * The developer-facing type for `store.steps` — the step-keyed accessor.
 *
 * Combines guaranteed (required) and non-guaranteed (optional) step access
 * with utility methods like `all()`, `ran()`, and `history`.
 *
 * Usage:
 *   store.steps.greet.name          // guaranteed — non-optional
 *   store.steps['ask-stack']?.answer // branch target — optional, use ?.
 *   store.steps.all('ask-hobby')    // loop visits — typed array
 *   store.steps.ran('ask-stack')    // boolean check
 *
 * ## Why `Partial<Readonly<TSteps>> & RequiredSteps` instead of `OptionalSteps & RequiredSteps`
 *
 * The naive approach would be: `OptionalSteps<TSteps, TG> & RequiredSteps<TSteps, TG>`.
 * This doesn't work correctly. `OptionalSteps` uses `Exclude<keyof TSteps, TG>` in its
 * mapped type key, and when intersected with `RequiredSteps`, TypeScript doesn't simplify
 * the `Exclude` — it sees both types mapping the same key space and produces confusing
 * hover types and broken autocomplete.
 *
 * Instead, we use `Partial<Readonly<TSteps>>` — which makes ALL keys optional — then
 * intersect with `RequiredSteps` which overrides the guaranteed keys to be required.
 * In TypeScript intersection types, a required property wins over an optional one for
 * the same key. So the guaranteed keys become required, and the rest stay optional.
 * This gives clean hover types and correct narrowing.
 */
export type StepsView<
  TSteps extends Record<string, unknown> = Record<string, unknown>,
  TGuaranteed extends keyof TSteps = never,
> = Partial<Readonly<TSteps>> & RequiredSteps<TSteps, TGuaranteed> & StoreMethods<TSteps>;

// ============================================================
// Section 2: Sub-store types
//
// Sub-stores are named, schema-validated state buckets that live
// alongside step results. While step results are keyed by step
// name and carry prompt responses/action outputs, sub-stores
// hold domain-structured data (e.g., `environment`, `config`).
//
// Sub-stores are always deep-partial (any property could be
// unset at runtime) and deep-readonly (steps can't mutate
// store data directly — mutations go through `save()`).
// When a guaranteed predecessor writes to a sub-store via save,
// those specific paths become non-optional downstream.
// ============================================================

/**
 * Recursively makes all properties optional.
 *
 * Used for sub-store views because any sub-store property might not have been
 * written yet at the point where a step reads it.
 *
 * Example: DeepPartial<{ a: { b: string } }> → { a?: { b?: string } }
 */
export type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/**
 * Recursively makes all properties readonly.
 *
 * Prevents steps from accidentally mutating store data. All store access
 * is read-only — writes go through the `save()` callback.
 *
 * Example: DeepReadonly<{ a: { b: string } }> → { readonly a: { readonly b: string } }
 */
export type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;

/**
 * Maps a record of ArkType schemas to their inferred TypeScript types.
 *
 * The `stores` option in `skill()` accepts ArkType schemas. This type
 * extracts the TypeScript type from each schema using ArkType's `infer` property.
 *
 * Example: InferStores<{ env: type<{ host: string }> }> → { env: { host: string } }
 */
export type InferStores<T extends Record<string, type.Any>> = {
  [K in keyof T]: T[K]['infer'];
};

/**
 * Base sub-store accessor: every declared store name maps to a deeply optional,
 * deeply readonly view. This is the "pessimistic" view — nothing is guaranteed
 * to have been written. The `StoreView` type layers guaranteed writes on top.
 *
 * Example: SubStoreView<{ env: { host: string } }>
 *   → { readonly env?: DeepReadonly<DeepPartial<{ host: string }>> }
 *   — i.e., store.env?.host is `string | undefined`
 */
export type SubStoreView<TStores extends Record<string, unknown>> = {
  readonly [K in keyof TStores]?: DeepReadonly<DeepPartial<TStores[K]>>;
};

/**
 * The top-level store accessor — the type that step prompt functions receive.
 *
 * Combines three layers via intersection:
 * 1. `{ steps: StepsView }` — step results namespaced under `.steps`
 * 2. `SubStoreView<TStores>` — all sub-store properties as deeply optional
 * 3. `DeepReadonly<TStoreWrites>` — guaranteed sub-store writes as required
 *
 * The third layer is the sub-store narrowing mechanism. `TStoreWrites` is the
 * intersection of all `save()` return types from guaranteed predecessors. When
 * intersected with `SubStoreView`, the required properties from `TStoreWrites`
 * override the optional ones — the same pattern used for step narrowing in
 * `StepsView`. This means if a guaranteed step wrote `{ env: { host: 'x' } }`,
 * downstream steps can access `store.env.host` without `?.`.
 *
 * Usage:
 *   store.steps.greet.name          // step-keyed access (guaranteed)
 *   store.steps['ask-stack']?.answer // step-keyed access (branch target)
 *   store.steps.all('ask-hobby')    // step methods
 *   store.env?.nested?.host         // sub-store: path not proven written (optional)
 *   store.env.host                  // sub-store: guaranteed predecessor wrote this (required)
 *
 * ## Why `TStores` and `TStoreWrites` default to `{}` instead of `Record<string, never>`
 *
 * Using `Record<string, never>` as the default would make every string key
 * resolve to `never` when intersected, poisoning the entire type. The empty
 * object type `{}` is the identity element for intersection — `T & {}` is `T`.
 * This means skills that don't declare stores get clean types with no phantom
 * properties.
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
// Section 3: Branch target extraction
//
// When a step's `next` is a branch array (e.g., `[{ to: 'a', when: ... }, { to: 'b' }]`),
// we need to extract which step names are branch targets. Branch targets become
// optional in the store because only one branch arm runs at runtime.
//
// The extraction has three subtleties:
// 1. We must require 2+ entries — a single-entry array isn't a real branch.
// 2. Backward edges (targets that are already-defined steps, like retry loops)
//    must be filtered out — they don't create branches.
// 3. After filtering, if only 0-1 forward targets remain, it's not a real
//    branch either (e.g., one forward target + one retry loop).
// ============================================================

/**
 * Shape matcher for branch entries in ExtractBranchTargets.
 *
 * Uses `any` for the `when` callback parameters because we only care about the
 * structural shape (has a `to` string and optional `when` function), not the
 * specific callback signature. This lets the type match any BranchEntry variant.
 */
interface BranchEntry {
  readonly to: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly when?: (...args: any[]) => boolean;
}

/**
 * Extract forward branch target names from a step's `next` configuration.
 *
 * This is the entry point for branch detection. Given a `next` value of any
 * shape, it returns either a union of branch target names or `never`.
 *
 * **How it works, step by step:**
 *
 * **Path 1 — Branch array**: `T extends readonly [BranchEntry, BranchEntry, ...BranchEntry[]]`
 * checks that T is a tuple with at least 2 BranchEntry elements. A single-entry
 * array doesn't match — that's not a branch, just a conditional next with one option.
 *
 * 1. **Union extraction**: `T[number]` distributes a tuple into a union of its element
 *    types. For `readonly [{ to: 'a' }, { to: 'b' }]`, `T[number]` gives
 *    `{ to: 'a' } | { to: 'b' }`. Then `ExtractTo` pulls out just the `to` strings:
 *    `'a' | 'b'`.
 *
 * 2. **Backward-edge filtering**: `Exclude<..., TKnownSteps>` removes any target
 *    names that are already defined steps (backward edges / retry loops). A branch
 *    like `[{ to: 'forward' }, { to: 'already-defined' }]` with `'already-defined'`
 *    in TKnownSteps reduces to just `'forward'`.
 *
 * 3. **Single-target check**: `ForwardTargetsOrNever` checks if 2+ forward targets
 *    remain. If only one forward target survived filtering, there's no actual branch
 *    — that step will always run. Returns `never` in that case.
 *
 * **Path 2 — Function next**: `T extends (...args: any[]) => infer R` extracts the
 * function's return type. TypeScript infers literal return types from conditional
 * expressions — e.g. `({ response }) => response.ok ? 'a' : 'b'` infers as
 * `() => "a" | "b"`. The extracted union `R` then flows through the same
 * backward-edge filtering and single-target check as branch arrays.
 *
 * The `[R] extends [string]` guard wraps `R` in a tuple to prevent distributive
 * evaluation. Without it, `R extends string` would distribute over the union members
 * individually, evaluating the conditional branch for each member separately. The
 * tuple wrapper ensures the full union is tested as a unit: "is the entire return
 * type assignable to string?"
 *
 * String next and terminal next fall through to `never` (no branching).
 *
 * Examples:
 *   ExtractBranchTargets<readonly [{ to: 'a', when: ... }, { to: 'b' }]>
 *     → 'a' | 'b'
 *
 *   ExtractBranchTargets<readonly [{ to: 'forward', when: ... }, { to: 'retry' }], 'retry'>
 *     → never  (only one forward target after filtering backward edge)
 *
 *   ExtractBranchTargets<() => 'escalate' | 'auto-fix'>
 *     → 'escalate' | 'auto-fix'
 *
 *   ExtractBranchTargets<'next-step'>
 *     → never  (string next, not a branch)
 */
export type ExtractBranchTargets<T, TKnownSteps extends string = never> = T extends readonly [
  BranchEntry,
  BranchEntry,
  ...BranchEntry[],
]
  ? ForwardTargetsOrNever<Exclude<ExtractTo<T[number]>, TKnownSteps>>
  : // eslint-disable-next-line @typescript-eslint/no-explicit-any -- function next: extract literal return type
    T extends (...args: any[]) => infer R
    ? [R] extends [string]
      ? ForwardTargetsOrNever<Exclude<R, TKnownSteps>>
      : never
    : never;

/**
 * Returns the union T if it has 2+ members, otherwise `never`.
 *
 * A single forward target isn't a real branch — the workflow will always reach
 * that step. This helper enforces the "2+ forward targets" requirement.
 *
 * Uses `[T] extends [never]` (wrapped in a tuple) as the never-guard. The naive
 * `T extends never` doesn't work because it's a distributive conditional — when
 * T is `never`, the conditional distributes over zero members and produces `never`
 * without evaluating either branch. Wrapping in `[T]` prevents distribution.
 * See the `IsUnion` comment for more on this pattern.
 */
type ForwardTargetsOrNever<T extends string> = [T] extends [never] ? never : IsUnion<T> extends true ? T : never;

/**
 * Detects whether T is a union type (2+ members) at the type level.
 *
 * Returns `true` for unions like `'a' | 'b'`, `false` for single literals
 * like `'a'`, and `false` for `never`.
 *
 * **The distributive conditional trick:**
 *
 * The key insight is `T extends U` where `U = T`. In a distributive conditional,
 * TypeScript evaluates `T extends U` separately for each union member. Inside each
 * branch, `T` is narrowed to a single member, but `U` retains the full original union
 * (because it was captured before distribution). So `[U] extends [T]` asks: "does the
 * full union fit inside this single member?" — which is only true when there's exactly
 * one member.
 *
 * Example trace for `IsUnion<'a' | 'b'>`:
 *   U = 'a' | 'b'
 *   Distributes to: ('a' extends 'a' | 'b') and ('b' extends 'a' | 'b')
 *   For 'a': [U] = ['a' | 'b'], [T] = ['a'] → ['a' | 'b'] extends ['a']? No → true
 *   For 'b': [U] = ['a' | 'b'], [T] = ['b'] → ['a' | 'b'] extends ['b']? No → true
 *   Result: true | true = true
 *
 * **Why `[T] extends [never]` is the first check:**
 *
 * Without this guard, `IsUnion<never>` would distribute over zero members and
 * return `never` (not `false`). Wrapping `T` in a tuple `[T]` disables distributive
 * behavior for the never check: `[never] extends [never]` is `true`, so we short-circuit
 * to `false`. This "tuple wrapper to prevent distribution" pattern appears throughout
 * this file wherever we need to reliably detect or handle `never`.
 */
type IsUnion<T, U = T> = [T] extends [never] ? false : T extends U ? ([U] extends [T] ? false : true) : false;

/**
 * Extracts the `to` string literal from a union of branch entry objects.
 *
 * Uses a distributive conditional type: when T is a union like
 * `{ to: 'a' } | { to: 'b' }`, the conditional distributes over each member,
 * extracting 'a' from the first and 'b' from the second, producing `'a' | 'b'`.
 *
 * The `infer S extends string` pattern (introduced in TS 4.7) both infers S and
 * constrains it to string in one step, avoiding a separate conditional check.
 */
type ExtractTo<T> = T extends { readonly to: infer S extends string } ? S : never;

// ============================================================
// Section 4: Grouped state types
//
// The builder carries two state "containers" through its generic
// parameters. These group related type information into named
// fields rather than using separate generics for each piece.
// This keeps the builder's generic parameter list manageable
// (5 params instead of 8+).
//
// ## Why `{}` as default instead of `Record<string, never>`
//
// Both `BranchState` and `GuaranteeState` use `{}` as the default
// for their record-typed fields. This is deliberate:
// - `{}` is the intersection identity: `T & {} = T`. When a skill
//   has no branches or no store writes, intersecting with `{}`
//   leaves the type unchanged.
// - `Record<string, never>` would map every string key to `never`.
//   Intersecting with it would make every property `never`, which
//   poisons the entire type. A skill with no stores would get
//   `store.anything` typed as `never` instead of being absent.
// ============================================================

/**
 * Accumulated branching topology — tracks the DAG structure as steps are added.
 *
 * This type is carried as a generic parameter on the builder and updated by
 * `AddStepBranches` each time a `.step()` is called.
 *
 * Fields:
 * - `branched`: flat union of all step names that are branch targets.
 *   Example: `'path-a' | 'path-b'` after a step branches to those targets.
 *
 * - `groups`: maps each branch target name to the origin step that created
 *   the branch. Used by reconvergence detection to find siblings.
 *   Example: `{ 'path-a': 'choose', 'path-b': 'choose' }` — both targets
 *   came from the 'choose' step.
 *
 * - `edges`: union of `"source->target"` template literal strings recording
 *   deterministic routing — when a branched step routes to another branched
 *   step via string `next`. These edges power sibling reconvergence detection
 *   in `ShouldPromote`.
 *   Example: `'path-a->merge' | 'path-b->merge'` — both siblings route to 'merge'.
 *
 * - `anyEdges`: union of `"source->target"` template literal strings recording
 *   ALL routing from branched steps to branched steps — including non-deterministic
 *   routing via function-next and branch-array-next. A function returning `'a' | 'b'`
 *   records edges for each union member in TBranched. These are used by cobranch
 *   convergence checking but NOT by sibling reconvergence (which requires deterministic
 *   routing).
 *
 * - `cobranches`: union of `"target~cobranch"` template literal strings recording
 *   when a guaranteed (non-branched) step re-branches an already-branched target
 *   alongside new targets. Used for nested branch reconvergence: if all cobranch
 *   targets eventually route to the target, the target is reachable on all paths
 *   through the guaranteed intermediary.
 *   Example: guaranteed step 'triage' branches to `[review, choose-entry]` where
 *   'review' is already branched → `'review~choose-entry'`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type BranchState<
  TBranched extends string = never,
  TGroups extends Record<string, string> = {},
  TEdges extends string = never,
  TAnyEdges extends string = never,
  TCobranches extends string = never,
> = {
  branched: TBranched;
  groups: TGroups;
  edges: TEdges;
  anyEdges: TAnyEdges;
  cobranches: TCobranches;
};

/**
 * Accumulated guarantee state — what the DAG analysis has proven about all-path reachability.
 *
 * This type is carried as a generic parameter on the builder and updated by
 * `AddStepGuarantees` each time a `.step()` is called.
 *
 * Fields:
 * - `steps`: union of step names proven to run on all execution paths.
 *   These become required properties in `StepsView`. Grows monotonically
 *   as steps are added.
 *   Example: `'greet' | 'ask-role'` — these steps are guaranteed.
 *
 * - `storeWrites`: intersection of all `save()` return types from guaranteed
 *   steps. Uses intersection (`&`) because each save call may write different
 *   sub-store paths, and all of them are guaranteed to have happened.
 *   Example: if step A saves `{ env: { host: string } }` and step B saves
 *   `{ env: { port: number } }`, the accumulated writes are
 *   `{ env: { host: string } } & { env: { port: number } }`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type GuaranteeState<TStepKeys extends string = never, TStoreWrites extends Record<string, unknown> = {}> = {
  steps: TStepKeys;
  storeWrites: TStoreWrites;
};

// ============================================================
// Section 5: Reconvergence detection
//
// Reconvergence is when all branches from a branch point eventually
// route to the same step. That step is then reachable on ALL execution
// paths and can be promoted from "branched" (optional) to "guaranteed"
// (required).
//
// Example: step 'root' branches to ['left', 'right']. Both 'left' and
// 'right' use `next: 'merge'`. At step 'merge', the branches have
// reconverged — 'merge' will always run regardless of which branch
// was taken. So 'merge' gets promoted to guaranteed.
//
// The detection works by checking: for a given branch target Name,
// have ALL its sibling targets (from the same branch group) recorded
// a routing edge to Name? If yes, Name is on all paths → promote.
//
// This is complemented by `GuaranteedRouteTarget` in `AddStepBranches`,
// which handles transitive cases by removing branch targets when a
// guaranteed step routes to them. See the file-level comment.
// ============================================================

/**
 * Extract the source step names from routing edges that target a specific step.
 *
 * Uses template literal type inference to parse `"source->target"` edge strings.
 * When TEdges is a union, the conditional distributes over each member, collecting
 * all sources that route to Target.
 *
 * Example: RoutingSources<'merge', 'left->merge' | 'right->merge' | 'a->b'>
 *   → 'left' | 'right'
 *
 * The `${infer S}->${Target}` pattern is a template literal inference — TypeScript
 * matches the string pattern and binds the part before `->` to S. Only edges
 * ending in `->merge` (or whatever Target is) produce a result; others fall to `never`
 * and vanish from the union.
 */
type RoutingSources<Target extends string, TEdges extends string> = TEdges extends `${infer S}->${Target}` ? S : never;

/**
 * Find all branch targets that share the same origin (branch point) as Name.
 *
 * Looks up Name's origin in TGroups, then finds all other keys in TGroups with
 * the same origin value. The result includes Name itself (filtered out by the caller).
 *
 * Uses a mapped type with conditional values to filter, then indexes with
 * `[Extract<keyof TGroups, string>]` to collect the non-never values into a union.
 * This is the standard "filter keys of a record by value" pattern in TypeScript:
 *   { [K in Keys]: Condition<K> ? K : never }[Keys]
 *
 * Example: SiblingsOf<'left', { left: 'root', right: 'root', other: 'x' }>
 *   → 'left' | 'right'  (both have origin 'root')
 */
type SiblingsOf<Name extends string, TGroups extends Record<string, string>> = Name extends keyof TGroups
  ? { [K in Extract<keyof TGroups, string>]: TGroups[K] extends TGroups[Name] ? K : never }[Extract<
      keyof TGroups,
      string
    >]
  : never;

/**
 * Extract cobranch targets for a specific rebranched target.
 *
 * When a guaranteed step branches to `[already-branched, new-target]`,
 * a cobranch entry `"already-branched~new-target"` is recorded. This type
 * extracts all `new-target` values for a given `already-branched` Name.
 *
 * Example: ExtractCobranch<'review', 'review~choose-entry' | 'review~other'>
 *   → 'choose-entry' | 'other'
 */
type ExtractCobranch<Name extends string, TCobranches extends string> = TCobranches extends `${Name}~${infer CoBranch}`
  ? CoBranch
  : never;

/**
 * Check if ALL members of Sources have routing edges to Target.
 *
 * Returns `true` when every source step has recorded an edge to Target,
 * `false` otherwise. Used by cobranch promotion to verify that all
 * alternative paths through a guaranteed intermediary converge to the target.
 */
type AllRouteToTarget<Sources extends string, Target extends string, TEdges extends string> = [Sources] extends [never]
  ? false
  : [Exclude<Sources, RoutingSources<Target, TEdges>>] extends [never]
    ? true
    : false;

/**
 * Returns all Siblings when cobranch evidence proves that all paths through
 * a guaranteed intermediary converge to Name.
 *
 * When a guaranteed step G branches to `[Name, C1, C2, ...]`, cobranch entries
 * `"Name~C1"`, `"Name~C2"` etc. are recorded. If ALL cobranch targets (C1, C2, ...)
 * have routing edges to Name, then every path through G reaches Name. Since G is
 * guaranteed (on all paths), this means Name is also on all paths — so all of
 * Name's siblings from its original branch group are "covered".
 *
 * Returns the full Siblings union when cobranch evidence is sufficient (allowing
 * them to be subtracted from the uncovered set in ShouldPromote), or `never` if not.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CoveredSiblings<
  Name extends string,
  Siblings extends string,
  TBranches extends BranchState<any, any, any, any, any>,
> =
  ExtractCobranch<Name, TBranches['cobranches']> extends infer CoBranched extends string
    ? [CoBranched] extends [never]
      ? never
      : AllRouteToTarget<CoBranched, Name, TBranches['anyEdges']> extends true
        ? Siblings
        : never
    : never;

/**
 * Determines if a branched step should be promoted to guaranteed.
 *
 * Returns `true` when ALL sibling branch targets (from the same branch group,
 * excluding Name itself) are accounted for — either by direct routing edges
 * to Name, or by cobranch coverage from a guaranteed intermediary.
 *
 * **Algorithm:**
 * 1. Check Name is in a branch group (is it a key in TGroups?). If not → false.
 * 2. Find siblings: all targets from the same branch point, excluding Name itself.
 * 3. If there are no siblings (Name is alone in its group) → false.
 * 4. Subtract siblings accounted for by:
 *    a. Direct routing edges (RoutingSources) — sibling→Name edge exists
 *    b. Cobranch coverage (CoveredSiblings) — a guaranteed intermediary's nested
 *       branches all converge to Name, proving all paths through it reach Name
 * 5. If no siblings remain → true (promote). Otherwise → false.
 *
 * Uses `[T] extends [never]` (tuple-wrapped) for never checks throughout,
 * to avoid the distributive conditional pitfall described in the IsUnion comment.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ShouldPromote<
  Name extends string,
  TBranches extends BranchState<any, any, any, any, any>,
> = Name extends keyof TBranches['groups']
  ? Exclude<SiblingsOf<Name, TBranches['groups']>, Name> extends infer Siblings extends string
    ? [Siblings] extends [never]
      ? false
      : [
            Exclude<Siblings, RoutingSources<Name, TBranches['edges']> | CoveredSiblings<Name, Siblings, TBranches>>,
          ] extends [never]
        ? true
        : false
    : false
  : false;

// ============================================================
// Section 6: Builder accumulator operations
//
// These types are called from the builder's `.step()` return type to
// compute the updated state after each step is added. The builder's
// `.step()` method returns:
//
//   SkillBuilder<TParams,
//     TSteps & { [K in Name]: ResultType },
//     AddStepGuarantees<TGuarantees, Name, TBranches, StoreWrites>,
//     AddStepBranches<TBranches, Name, TNext, TKnownSteps>,
//     TStores>
//
// This is the core of the type-level algorithm: each step declaration
// feeds forward into the next step's type context, accumulating what's
// known about the DAG.
// ============================================================

/**
 * Classifies a step as guaranteed or not.
 *
 * A step is guaranteed if either:
 * - It's NOT in the branched set (it was never a branch target → linear path)
 * - It IS in the branched set but has been promoted via reconvergence
 *   (all siblings route to it → it's on all paths)
 *
 * This is the single decision point that determines whether a step's result
 * becomes a required or optional property in the store.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IsGuaranteed<
  Name extends string,
  TBranches extends BranchState<any, any, any, any, any>,
> = Name extends TBranches['branched'] ? ShouldPromote<Name, TBranches> : true;

/**
 * Compute the next `GuaranteeState` after adding a step to the builder.
 *
 * If the step is guaranteed (via `IsGuaranteed`):
 * - Add its name to the guaranteed steps union (`steps | Name`)
 * - Intersect its sub-store writes into the accumulated writes (`storeWrites & TSaveStoreWrites`)
 *
 * If the step is NOT guaranteed (it's a branch target without reconvergence):
 * - Return the state unchanged — neither the step name nor its writes are accumulated.
 *
 * `TSaveStoreWrites` comes from the step's `save()` return type with the `step` key
 * stripped (via `ExtractStoreWrites` in the builder). If the step has no `save()` or
 * only writes to `step`, this is `{}` — intersecting with `{}` is a no-op.
 *
 * Example: adding guaranteed step 'init' that saves `{ env: { host: string } }`:
 *   AddStepGuarantees<GuaranteeState<'root'>, 'init', EmptyBranches, { env: { host: string } }>
 *     → GuaranteeState<'root' | 'init', {} & { env: { host: string } }>
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AddStepGuarantees<
  TGuarantees extends GuaranteeState<any, any>,
  Name extends string,
  TBranches extends BranchState<any, any, any, any, any>,
  TSaveStoreWrites extends Record<string, unknown>,
> =
  IsGuaranteed<Name, TBranches> extends true
    ? GuaranteeState<TGuarantees['steps'] | Name, TGuarantees['storeWrites'] & TSaveStoreWrites>
    : TGuarantees;

/**
 * Compute the next `BranchState` after adding a step to the builder.
 *
 * Updates all five BranchState fields:
 *
 * 1. `branched`: union the existing branched set with any new forward branch targets
 *    extracted from this step's `next`.
 *
 * 2. `groups`: intersect the existing groups with new group entries mapping each
 *    NEW forward target to this step (the origin). Targets already in `branched`
 *    are excluded to prevent group corruption when a target appears in multiple
 *    branch points.
 *
 * 3. `edges`: union the existing deterministic edges with any new routing edge.
 *    Only recorded for string `next` from a branched step to another branched step.
 *
 * 4. `anyEdges`: union the existing any-routing edges with edges from all `next`
 *    forms (string, function, branch array) from branched steps to branched targets.
 *    Used by cobranch convergence checking.
 *
 * 5. `cobranches`: union existing cobranch entries with new ones from guaranteed
 *    steps that re-branch an already-branched target alongside new targets.
 *
 * Additionally, if the current step is guaranteed and routes to a branch target
 * via string next, that target is removed from `branched` (`GuaranteedRouteTarget`).
 *
 * `TKnownSteps` is the set of step names already defined in the builder (including
 * the current step). It's used by `ExtractBranchTargets` to identify backward edges.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AddStepBranches<
  TBranches extends BranchState<any, any, any, any, any>,
  Name extends string,
  TNext,
  TKnownSteps extends string,
> = BranchState<
  | Exclude<TBranches['branched'], GuaranteedRouteTarget<Name, TNext, TBranches['branched']>>
  | ExtractBranchTargets<TNext, TKnownSteps>,
  TBranches['groups'] & ExtractBranchGroupEntries<TNext, Name, TKnownSteps, TBranches['branched']>,
  TBranches['edges'] | ExtractBranchEdge<Name, TNext, TBranches['branched']>,
  TBranches['anyEdges'] | ExtractAnyEdge<Name, TNext, TBranches['branched']>,
  TBranches['cobranches'] | ExtractCobranches<Name, TNext, TBranches['branched'], TKnownSteps>
>;

/**
 * If a guaranteed (non-branched) step routes via string next to a branch target,
 * that target is on all paths — remove it from TBranched.
 *
 * A guaranteed step has been proven to run on every possible execution path.
 * If it routes to a branch target, that target is also on every path.
 * This handles transitive reconvergence: A → [B, E], B → C → D → E.
 * When D (guaranteed) is defined with next: 'E', E is removed from TBranched.
 */
type GuaranteedRouteTarget<Name extends string, TNext, TBranched extends string> = Name extends TBranched
  ? never
  : TNext extends string
    ? TNext extends TBranched
      ? TNext
      : never
    : never;

/**
 * Maps each forward branch target to its origin step name.
 *
 * Used to build the `groups` field of `BranchState`. If the step's `next` produces
 * forward branch targets (via `ExtractBranchTargets`), creates a record mapping
 * each target to Origin. If there are no forward targets, returns `{}` (no-op
 * when intersected).
 *
 * Targets already in `TExistingBranched` are excluded from the mapping. This prevents
 * group corruption when the same step appears as a branch target from multiple branch
 * points: without filtering, intersecting `{ review: 'origin-a' } & { review: 'origin-b' }`
 * collapses review's origin to `never`, breaking `SiblingsOf`.
 *
 * Uses `[Targets] extends [never]` (tuple-wrapped never check) to handle the
 * case where `ExtractBranchTargets` returned `never`.
 *
 * Example: ExtractBranchGroupEntries<readonly [{ to: 'a' }, { to: 'b' }], 'root', never>
 *   → { a: 'root', b: 'root' }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type ExtractBranchGroupEntries<
  TNext,
  Origin extends string,
  TKnownSteps extends string,
  TExistingBranched extends string = never,
> =
  ExtractBranchTargets<TNext, TKnownSteps> extends infer Targets extends string
    ? [Targets] extends [never]
      ? {}
      : { [K in Exclude<Targets, TExistingBranched>]: Origin }
    : {};

/**
 * Records a deterministic sibling-to-sibling routing edge for reconvergence.
 *
 * Only produces an edge when ALL of these conditions hold:
 * 1. The current step (Name) is itself a branch target (in TBranched)
 * 2. Its `next` is a plain string (deterministic routing)
 * 3. That string target is also in TBranched (another branch target)
 *
 * String next is deterministic — the step always routes there. Function next
 * and branch arrays are non-deterministic (conditional), so they are recorded
 * in `ExtractAnyEdge` instead.
 *
 * Uses template literal types to encode the edge as `"Name->TNext"`.
 *
 * Example: step 'left' (branched) with `next: 'merge'` where 'merge' is also branched:
 *   ExtractBranchEdge<'left', 'merge', 'left' | 'right' | 'merge'>
 *     → 'left->merge'
 */
type ExtractBranchEdge<Name extends string, TNext, TBranched extends string> = Name extends TBranched
  ? TNext extends string
    ? TNext extends TBranched
      ? `${Name}->${TNext}`
      : never
    : never
  : never;

/**
 * Records ALL routing edges from a branched step to branched targets,
 * including non-deterministic routing via function-next and branch-array-next.
 *
 * Unlike `ExtractBranchEdge` (deterministic only), this captures every possible
 * routing relationship. Used by `CoveredSiblings` for cobranch convergence
 * checking, where we need to know if a target APPEARS in a step's possible
 * destinations (not that it's the ONLY destination).
 *
 * Handles three forms of `next`:
 * - **String**: same as ExtractBranchEdge
 * - **Function**: `next: () => 'a' | 'b'` → records an edge for each return type
 *   member that is in TBranched (distributive conditional over the union)
 * - **Branch array**: `next: [{ to: 'a' }, { to: 'b' }]` → records an edge for
 *   each `to` value that is in TBranched
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExtractAnyEdge<Name extends string, TNext, TBranched extends string> = Name extends TBranched
  ? TNext extends string
    ? TNext extends TBranched
      ? `${Name}->${TNext}`
      : never
    : TNext extends (...args: any[]) => infer R
      ? R extends TBranched
        ? `${Name}->${R}`
        : never
      : TNext extends readonly [BranchEntry, BranchEntry, ...BranchEntry[]]
        ? ExtractTo<TNext[number]> extends infer Targets extends string
          ? Targets extends TBranched
            ? `${Name}->${Targets}`
            : never
          : never
        : never
  : never;

/**
 * Records cobranch relationships when a guaranteed (non-branched) step
 * re-branches an already-branched target alongside new targets.
 *
 * When a guaranteed intermediary branches to `[already-branched, new1, new2]`,
 * this records `"already-branched~new1" | "already-branched~new2"`. The cobranch
 * entries tell `CoveredSiblings` which targets must converge to the re-branched
 * target for nested branch reconvergence to hold.
 *
 * Only fires when Name is NOT branched (guaranteed intermediary). If Name is
 * itself branched, its branch doesn't prove all-paths reachability.
 *
 * Example: guaranteed step 'triage' branches to `[review, choose-entry]`
 * where 'review' is already in TBranched:
 *   ExtractCobranches<'triage', fn → 'review' | 'choose-entry', 'review' | ..., ...>
 *     → 'review~choose-entry'
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExtractCobranches<
  Name extends string,
  TNext,
  TBranched extends string,
  TKnownSteps extends string,
> = Name extends TBranched
  ? never
  : ExtractBranchTargets<TNext, TKnownSteps> extends infer AllTargets extends string
    ? [AllTargets] extends [never]
      ? never
      : Extract<AllTargets, TBranched> extends infer Rebranched extends string
        ? [Rebranched] extends [never]
          ? never
          : Exclude<AllTargets, TBranched> extends infer NewTargets extends string
            ? [NewTargets] extends [never]
              ? never
              : `${Rebranched}~${NewTargets}`
            : never
        : never
    : never;

/**
 * Determines what type a step's result has in the store.
 *
 * When a step has an action, the store carries the action's output type (not the
 * prompt response type), because the action transforms the response before storing.
 * When there's no action, the store carries the response type directly.
 *
 * This matches the runtime behavior: `store.steps.find` gives you the action result
 * if the step had an action, or the prompt response otherwise.
 *
 * Uses structural matching on TAction: if it has an `output.infer` property (the
 * ArkType schema pattern), we extract the inferred type. Otherwise, fall back to TOutput.
 *
 * Example:
 *   StepResultType<{ links: string[] }, { output: { infer: { statuses: boolean[] } } }>
 *     → { statuses: boolean[] }  (action output wins)
 *
 *   StepResultType<{ name: string }, undefined>
 *     → { name: string }  (no action, response type used)
 */
export type StepResultType<TOutput, TAction> = TAction extends { output: { infer: infer TActionOut } }
  ? TActionOut
  : TOutput;
