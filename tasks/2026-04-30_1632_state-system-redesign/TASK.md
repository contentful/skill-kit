# State System Redesign

## Scope

**In:**

- Replace Zod with ArkType as the schema/type system (Phase 0)
- Rename `output` → `response` (agent contract) and introduce `result` (step contribution to state)
- Replace stash/history/getStep with unified `store` accessor
- Replace opaque `next` functions with declarative branching (`[{ to, when }]`)
- DAG-computed type narrowing for store access (guaranteed vs optional predecessors)
- Remove `updateStash` from StepConfig entirely
- Update all examples, tests, documentation

**Out:**

- Domain-structured store (`store: type({...})` on skill config) — deferred to follow-up task after the step-keyed mode is validated
- Module stash namespacing — deferred until store modes are settled
- Changes to prompt composition (`act.*`, `system`, `view()`, `render.*`) — untouched
- Changes to primitives API — untouched
- Changes to build/distribution — untouched

**Explicitly deferred:**

These are documented design directions from the planning session that we intentionally defer:

1. **Explicit `store` schema for domain-structured state** — where a skill declares a nested store schema and `result` deep-merges into it. This addresses the case where state structure reflects the domain, not the step count (e.g., diagnostics gathering environment configs for 2 APIs). Deferred because step-keyed mode covers most skills and we need to validate the foundation first.

2. **`result` with `set()` for path-based writes** — imperative store mutation for complex nested updates. Deferred because we chose declarative return-based writes for now.

3. **Module store namespacing** — how module steps' results appear in the parent store (namespaced vs flat). Deferred until we have a working step-keyed store.

## Context

### The three-way state problem

The SDK has three state mechanisms that work poorly together:

1. **Stash** — a global flat bag declared once at skill level. All fields conceptually optional until populated. Not branching-aware: if step A or step B runs (never both), the stash type is still the union of both contributions. `updateStash` returns `Partial<TStash>`, so everything downstream is always partial. Developers write `stash.name ?? 'fallback'` everywhere because TypeScript can't prove a field was set. Validation is soft-fail (warns to stderr, doesn't throw).

2. **History / getStep** — `getStep` is only available in `prompt` context (not in `next`, `action.input`, or `updateStash`). Always returns `| undefined` — no path awareness. `actionOutput` is always `unknown`. Raw `history` is a `readonly StepResult[]` requiring casts: `(s.stepOutput as { hobby: string }).hobby`.

3. **updateStash** — imperative per-step boilerplate. Most callbacks just copy fields from stepOutput: `({ stepOutput }) => ({ name: stepOutput.name })`. No type connection between what a step produces and what downstream steps can read.

### The output conflation problem

`output` conflates two distinct concepts:

- **Agent contract** — the schema shown to the model, what it gives back. "Find me all external links" → `{ links: string[] }`.
- **Step result** — what this step contributes to the workflow state. When an action runs HTTP checks on those links, the step result is `{ statuses: [...] }`, not the link list.

Today `stepOutput` in history is always the agent response, even when an action transforms it into something else entirely.

### The Zod limitation

Computing the correct store type per step (which fields are guaranteed vs optional based on the DAG) requires runtime type introspection and manipulation. Zod has no stable API for this:

- No `.props` for iterating fields
- No `.map()` for selectively making fields required/optional
- No deep `.get("a", "b")` for path access
- No structural `extends` checking (identified as a gap in task `2026-04-28_2124_dx-callback-signatures`)

ArkType provides all of these. The migration also gives us:

- Terser schema syntax: `type({ name: 'string' })` vs `z.object({ name: z.string() })`
- String-based type expressions: `"'dev' | 'designer'"` vs `z.enum(['dev', 'designer'])`
- Defaults in type syntax: `'string = "Hey there!"'`
- Structural `extends` for build-time action input validation

### User feedback driving this

From the DX callback signatures task (2026-04-28):

> "The action only gets the output. But I actually need the context from the skill."
> "Let's look at it together tomorrow. It's still somewhat confusing."

The underlying issue: state is scattered across three mechanisms with inconsistent access patterns. A single, well-typed store resolves this.

## Plan

### Phase 0: ArkType migration

Replace Zod with ArkType across the entire SDK. This is a prerequisite that delivers standalone value — terser schemas, runtime type manipulation, structural extends checking.

**Zod API surface to replace** (from codebase audit):

| Zod API                  | Usage count (non-test src) | ArkType equivalent                               |
| ------------------------ | -------------------------- | ------------------------------------------------ |
| `z.ZodType` (type bound) | 49                         | `Type` from arktype                              |
| `z.infer<T>`             | 21                         | `Type["infer"]` or `typeof schema.infer`         |
| `z.object({})`           | 20                         | `type({})`                                       |
| `z.string()`             | 25                         | `'string'`                                       |
| `z.unknown()`            | 4                          | `'unknown'`                                      |
| `z.array(z.T)`           | 1                          | `'T[]'`                                          |
| `z.boolean()`            | 1                          | `'boolean'`                                      |
| `z.record()`             | 1                          | `'Record<string, unknown>'`                      |
| `.safeParse()`           | 4 calls                    | `.allows()` or try/catch on `schema(data)`       |
| `.parse()`               | 2 calls                    | `schema(data)` (throws) or `schema.assert(data)` |
| `.toJSONSchema()`        | 4 calls                    | `schema.toJsonSchema()`                          |

**Files to update** (27 imports total):

SDK core (non-test):

- `src/types.ts` — all type definitions using `z.ZodType`, `z.infer`
- `src/index.ts` — re-exports `z` from zod, becomes `type` from arktype
- `src/skill.ts` — factory generic bounds
- `src/skill-builder.ts` — builder generics, `checkActionInputCompat`
- `src/step.ts` — step factory generics
- `src/module.ts` — module builder generics
- `src/action.ts` — action definition generics
- `src/runtime/engine.ts` — `.safeParse()`, `.parse()`, `.toJSONSchema()`
- `src/runtime/stash.ts` — `.safeParse()`, schema type
- `src/runtime/schema-validator.ts` — `.safeParse()`
- `src/protocol/types.ts` — `z.string().transform()`, `z.array()`
- `src/protocol/mcp-composite.ts` — `z` import
- `src/protocol/mcp-reference.ts` — `z` import
- `src/lint/rules/primitive-schema-mismatch.ts` — `.toJSONSchema()`
- `src/build/skillmd-template.ts` — `.toJSONSchema()`

Tests:

- `src/runtime/engine.test.ts`
- `src/skill.test.ts`
- `src/step.test.ts`
- `src/module.test.ts`
- `src/action.test.ts`
- `src/act.test.ts`
- `src/lint/lint.test.ts`
- `src/protocol/auto-advance.test.ts`

Examples:

- `examples/get-to-know-you/src/skill.ts` + test
- `examples/game-jam/src/skill.ts` + test
- `examples/contentful-help/src/skill.ts` + test
- `examples/primitives-showcase/src/skill.ts` + test
- `examples/ts-patterns/src/skill.ts` + test

**Key mapping decisions:**

1. `z.ZodType` as generic bound → ArkType's `Type` import. The generic constraint `<TOutput extends z.ZodType>` becomes `<TOutput extends Type>`. Need to verify ArkType's `Type` works as a generic bound in the same way.

2. `z.infer<T>` → `T["infer"]` or ArkType's inference mechanism. This is the most pervasive change — it's used 21 times in type definitions.

3. `.safeParse()` → ArkType uses `schema(data)` which returns the validated value or throws `AggregateError`. For soft validation (current stash behavior), wrap in try/catch.

4. `.toJSONSchema()` → ArkType has `.toJsonSchema()` (camelCase difference).

5. `z.string().transform()` in protocol types → ArkType morphs: `type('string').pipe(...)` or inline morph syntax.

6. Re-export: currently `export { z } from 'zod'`. Becomes `export { type } from 'arktype'`. Developers write `type({...})` instead of `z.object({...})`.

### Phase 1: Rename `output` → `response`, introduce `result`

Rename the agent contract field and introduce the step result concept.

**Naming changes:**

| Old                             | New                       | Where                                |
| ------------------------------- | ------------------------- | ------------------------------------ |
| `output` (on StepConfig)        | `response`                | types.ts, builder, engine, all steps |
| `stepOutput` (callback param)   | `response`                | next, action.input, result callbacks |
| `actionOutput` (callback param) | `actionResult`            | next, result callbacks               |
| `StepResult.stepOutput`         | `StepResult.response`     | types.ts, history, engine, protocol  |
| `StepResult.actionOutput`       | `StepResult.actionResult` | types.ts, history, engine, protocol  |

**Result inference rules:**

```
Has response, no action, no result → step result = response value
Has response, has action, no result → step result = action output value
Has response, has action, has result → step result = result() return value
Has action only (no response), no result → step result = action output value
```

The `result` callback receives `{ response, actionResult }` and returns an arbitrary object. Its return type is inferred by TypeScript and becomes the step's contribution to the store.

**StepConfig after this phase:**

```typescript
interface StepConfig<TResponse, TActionResult, TParams, TSteps, TResult> {
  prompt?: string | PromptPiece | PromptPiece[] | PromptFn;
  response?: TResponse; // agent contract (was `output`)
  action?: {
    run: ActionDefinition;
    input?: (ctx: { response; store; params }) => unknown;
  };
  result?: (ctx: { response; actionResult }) => TResult; // explicit transform
  next: NextTarget;
  maxVisits?: number;
  onMaxVisits?: string;
}
```

### Phase 2: Replace stash/history/getStep with `store`

**Remove:**

- `stash` from `SkillBuilderConfig`
- `updateStash` from `StepConfig`
- `action.updateStash` from `StepConfig`
- `getStep` from `PromptContext`
- `history` from `PromptContext`
- `stash` from `PromptContext`
- `TStash` type parameter everywhere
- `StashStore` class
- `History` class (merge into `StateStore`)

**Add:**

- `store` on `PromptContext` — unified state accessor
- `store` on `next` callback context and `action.input` context
- `StateStore` class (replaces both `History` and `StashStore`)

**Store accessor API:**

```typescript
store.greet.name; // guaranteed predecessor — non-optional
store['ask-stack']?.answer; // branch target — optional, use ?.
store.all('ask-hobby'); // → Array<{ hobby: string, wantsMore: boolean }>
store.ran('ask-stack'); // → boolean
store.history; // → readonly StepResult[] (escape hatch)
```

**StateStore runtime implementation:**

Append-only array of `{ step, response, actionResult, result }` records. The `store` accessor is a Proxy:

- Property access → `findLast(r => r.step === prop)?.result`
- `.all(name)` → `filter(r => r.step === name).map(r => r.result)`
- `.ran(name)` → `some(r => r.step === name)`
- `.history` → raw records array

Guaranteed vs optional determined by `StoreView<TSteps, TGuaranteed>` type — `Partial<Readonly<TSteps>> & RequiredSteps<TSteps, TGuaranteed>`.

**Replay simplification:** Just appends records. No callbacks to re-execute, no determinism risk.

### Phase 3: Declarative branching and DAG-computed type narrowing

**Replace opaque `next` functions with declarative branching:**

Three forms of `next`:

```typescript
// Static — single target
next: 'ask-role',

// Terminal
next: { terminal: true },

// Branching — ordered tagged entries, first match wins
next: [
  { to: 'ask-stack', when: ({ response }) => response.role === 'dev' },
  { to: 'ask-tools', when: ({ response }) => response.role === 'designer' },
  { to: 'ask-team-size', when: ({ response }) => response.role === 'manager' },
  { to: 'ask-specialty' },  // no `when` = default
],
```

Array order is deterministic. Evaluated top-to-bottom, first `when` returning true wins. Entry without `when` is the default — must be last. The `to` values are string literals extractable by the builder.

**DAG analysis:**

Because branching targets are statically declared, the builder knows the full step graph. For each step, it computes:

- **Guaranteed predecessors** — steps that are on ALL paths to this step. Their results are non-optional on `store`.
- **Optional predecessors** — steps that are on SOME paths. Accessible via `store.maybe()`.

Example graph:

```
greet → ask-role → ask-stack → profile-card
                 → ask-tools → profile-card
```

At `profile-card`:

- `store.greet.name` → `string` (non-optional, on all paths)
- `store['ask-role'].role` → `string` (non-optional, on all paths)
- `store['ask-stack']?.answer` → `string | undefined` (optional, branch target)
- `store['ask-tools']?.answer` → `string | undefined` (optional, branch target)

**Implementation approach — what we tried and what worked:**

1. ~~ArkType `.map()` for runtime type construction~~ — not needed. The narrowing is purely compile-time via builder generics.
2. ~~`reads` declaration~~ — tried as primary mechanism, abandoned. Works but requires manual annotation. Kept as a possible escape hatch but not implemented.
3. **Builder type-level DAG tracking** — the builder carries `TGuaranteed` and `TBranched` accumulators. `TNext` captures branch targets via `const` modifier. `ExtractBranchTargets` filters backward edges. This is what shipped.
4. ~~`TNext` with complex constraint~~ — tried `TNext extends StepConfig['next']` with default. TS couldn't infer from one arm of a union parameter. Fixed by using `const TNext` and pulling `next:` out of Omit.
5. ~~`TConfig` capture~~ — tried capturing entire config object as generic. Caused "excessively deep" recursion.
6. ~~`TBranches` separate generic~~ — tried matching only the array arm of the `next` union. TS couldn't infer it from a union member.

### Phase 4: Update examples, tests, documentation

- Rewrite all 5 example skills with new API
- Update all test files
- Update SPEC.md (source of truth)
- Update docs/api.md, docs/architecture.md
- Update docs-site MDX pages
- Update README.md

## Steps

### Phase 0: ArkType migration ✅

- [x] Install arktype, keep zod temporarily for side-by-side
- [x] Spike: verify ArkType `Type` works as generic bound, `.infer` works for type extraction, `.toJsonSchema()` output matches current usage
- [x] Migrate all source files (types, builder, engine, protocol, lint, build)
- [x] Migrate all test files and fixtures
- [x] Migrate all example skills
- [x] Typecheck + test (339 pass) + format clean

**Decisions made:**

- `type.Any` is the correct generic bound (replaces `z.ZodType`). Discovered via research — `Type<unknown>` has structural incompatibility with `Type<{name: string}>` due to extra methods on object types. `type.Any` uses `any` default which satisfies all conditional branches.
- Zod retained in 3 MCP protocol files (`mcp-tools.ts`, `mcp-composite.ts`, `mcp-reference.ts`) — the `@modelcontextprotocol/sdk` requires Zod schemas for `registerTool.inputSchema`. These are internal protocol wiring, not developer-facing.
- `type({})` produces `Type<object>` not `Type<unknown>`, so `StepDefinition` needed variance-safe defaults via `type.Any`.
- `cycle-guard.ts` needed `StepDefinition<any>` parameter widening for `type({})` compatibility.
- `skillmd-template.ts` needed `typeof params !== 'object'` guard updated since ArkType types are functions.

### Phase 1: Rename output → response ✅

- [x] Rename `output` → `response` on StepConfig (the schema field)
- [x] Rename `stepOutput` → `response` in all callback params (next, action.input, updateStash)
- [x] Rename `actionOutput` → `actionResult` in all callback params
- [x] Rename StepResult fields: `.stepOutput` → `.response`, `.actionOutput` → `.actionResult`
- [x] Rename `TActionOutput` → `TActionResult`, `InferActionOutput` → `InferActionResult`
- [x] Update all tests, fixtures, examples
- [x] Typecheck + test (339 pass) + format clean

**Not yet done (deferred to Phase 2):**

- `result` field on StepConfig (explicit step result transform)
- Builder type accumulation keyed by result type instead of response type

### Phase 2: Replace stash/history/getStep with store ✅

- [x] Create `src/runtime/state-store.ts` with `StateStore` class and `StoreAccessor` interface
- [x] Remove `stash`, `TStash` from SkillBuilderConfig, SkillDefinition, PromptContext, StepConfig, StepDefinition, TransitionFn, ModuleDefinition
- [x] Remove `updateStash` and `action.updateStash` from StepConfig
- [x] Remove `getStep` and `history` from PromptContext
- [x] Add `store: StoreAccessor<TSteps>` to PromptContext, TransitionFn, action.input
- [x] Wire StateStore in engine — replaces both History and StashStore
- [x] Simplify `replayHistory` — just appends records, no updateStash replay
- [x] Update SubskillRegistration — `paramsMap` receives store accessor
- [x] Delete `src/runtime/stash.ts` and `src/runtime/history.ts`
- [x] Update testing utilities — expose `store` on `SkillRunResult`
- [x] Update all tests — 352 pass
- [x] Update all examples — 22 example tests pass
- [x] Typecheck + test + format clean

**Net effect:** -530 lines removed, +421 lines added. Two files deleted (stash.ts, history.ts). One new file (state-store.ts). All `updateStash` boilerplate gone from examples. Cross-step access via optional properties or guaranteed direct access.

### Phase 3: Declarative branching + DAG narrowing ✅

- [x] Add `NextBranch` type: `{ to: string, when?: (ctx) => boolean }`
- [x] Update `NextTarget` to accept `readonly NextBranch[]`
- [x] Update engine `resolveNext` to evaluate branch array (first match wins)
- [x] Update cycle guard to extract targets from branch arrays
- [x] Convert all examples to declarative branching
- [x] DAG-computed type narrowing via builder accumulators: `TGuaranteed` (on all paths), `TBranched` (branch targets)
- [x] `ExtractBranchTargets` with backward-edge filtering: retry loops don't create false branches
- [x] `const TNext` modifier eliminates need for `as const` at call sites
- [x] `StoreView` type: guaranteed keys as required properties, branch targets as optional
- [x] Removed `maybe()` — replaced with standard optional property access (`?.`)
- [x] `result` callback for step result transforms (response + actionResult → custom shape)
- [x] Builder accumulates action output as step result type when action exists
- [x] `subskill()` passes typed parent store to `paramsMap` (method syntax for bivariance)
- [x] `register()` accumulates module step types into parent `TSteps`
- [x] `tsconfig.examples.json` + `typecheck:examples` / `test:examples` npm scripts
- [x] Modular type system in `src/types/`: test-utils, store, 3 type test files
- [x] Comprehensive type-level tests: linear, branching, retry loops, reconvergent, self-loops, merge points, extend, action results, modules — with negative assertions
- [x] `result` return type flows into `TSteps` via `TResultValue` generic
- [x] `StepConfig` as discriminated union: `response` requires `prompt` (compile-time error otherwise)
- [x] Removed `openQuestionStep` pattern — replaced with inline steps and real `approvalGate` extend example
- [x] contentful-help `check-env` converted to action-only step with `result()` computing `{ ready, missing }`
- [x] 362 SDK tests + 22 example tests, all passing, zero type errors

### Phase 4: Documentation (in progress)

- [x] Update docs/api.md — config tables, builder signatures, store API
- [x] Update docs/architecture.md — pipeline, state flow
- [x] Update README.md — hero example, API overview
- [x] Update SPEC.md — all renames, new concepts, new branching syntax
- [x] Update docs-site key pages (getting-started, index, architecture)
- [ ] Rewrite docs to market features (not changelog-style) — in progress
- [ ] Update remaining docs-site guide pages (workflow-skills, modules, primitives, composite-skills)

### Phase 5: Composable sub-stores

Two structural changes: (1) step access moves to `store.steps.*` so sub-stores can live at the top level, (2) `result` renamed to `save` with `{ step?, ...subStoreWrites }` return shape that mirrors the store read shape.

**Design (from planning session 2026-05-02):**

The save return is `{ step?: TStepResult } & DeepPartial<TStores>`. The `step` key sets the step-keyed result; all other keys are sub-store writes, deep-merged into the named sub-store state. Only two reserved names: `steps` (on store accessor) and `step` (on save return, blocked as a store name).

Sub-stores are declared at skill level with ArkType schemas:

```typescript
skill({ stores: { environment: type({ apiA: { host: 'string' } }) } });
```

MVP: no DAG narrowing for sub-stores — all `DeepPartial<DeepReadonly<T>>`. Step-keyed narrowing continues unchanged.

Type architecture:

- `StepsView<TSteps, TGuaranteed>` — renamed from `StoreView`, same body
- `SubStoreView<TStores>` — `{ readonly [K in keyof TStores]?: DeepReadonly<DeepPartial<TStores[K]>> }`
- `StoreView<TSteps, TGuaranteed, TStores>` = `{ readonly steps: StepsView } & SubStoreView`
- `SaveReturn<TStepResult, TStores>` = `{ step?: TStepResult } & DeepPartial<TStores>`
- Builder gains 5th generic `TStores`, `skill()` factory infers `InferStores<TStoreSchemas>`
- `save` context: `{ response, actionResult, store, params }`

Engine pipeline: save runs, `step` extracted as step result, remaining keys deep-merged into sub-store state via `StateStore.applySave()`. Runtime validation via `schema.partial()` per top-level key, warn to stderr.

**Steps:**

- [x] Move step access to `store.steps` namespace (breaking refactor)
- [x] Add deep-merge utility
- [x] Add sub-store storage to StateStore
- [x] Rename `result` to `save` with `{ step, ...storeWrites }` return
- [x] Add `stores` config and sub-store routing through builder and engine
- [x] Add sub-store type-level tests
- [x] Add engine tests for sub-store behavior
- [x] Update docs for sub-stores and `store.steps`

**Design decisions from planning session (2026-05-02):**

Explored and rejected alternatives before settling on `{ step?, ...subStoreWrites }`:

1. **Imperative store toolkit** (`store.write('foo', value)`, `store.set('path', value)`) — rejected because TypeScript can't narrow types through method calls. No way to propagate write types back to the builder.

2. **Key-name routing in single return** (top-level keys matching store names route to sub-stores, rest becomes step result) — rejected because it's implicit, unreliable, and breaks when a step result key matches a store name.

3. **`{ step, stores: {...} }` wrapper** — initial design, replaced by flat `{ step, ...subStoreWrites }` because the `stores` wrapper is redundant when `store.steps.*` already namespaces step data. The save return mirrors the store read shape: `step` for step data, top-level keys for sub-stores.

4. **Mode switching** (different save return type when skill declares stores vs not) — rejected because it makes steps non-portable. Adding stores to a skill shouldn't break existing steps.

5. **Two callbacks** (`result` + `save`) — rejected because the names are non-obvious, the API surface increases, and developers would ask why two mechanisms for the same operation.

`TStores` default is `{}` not `Record<string, never>` — `keyof Record<string, never>` is `string`, which would make `SubStoreView` add optional string-indexed properties to every store accessor, breaking `steps` property access.

## Notes

- Zod dependency remains for MCP protocol files only (3 files). Not developer-facing.
- Dynamic `next` functions (e.g. `` ({ response }) => `topic:${response.topicName}` ``) are opaque to branch tracking. This is fine — these typically redirect out of the step graph (topic dispatches, subskill routing), so no downstream step needs narrowing based on them.
- `result` callback demonstrated in: primitives-showcase `write-report` (response + action → custom shape) and contentful-help `check-env` (action-only step with computed `{ ready, missing }`). `actionResult` is fully typed from action output schema — no casts needed.
- `result` return type flows into `TSteps` via `TResultValue` generic on the builder's `step()` method. This means downstream steps see the `result()` return type, not the raw response or action output.
- `StepConfig` is a discriminated union: `PromptStep` (prompt required, response optional) | `PromptlessStep` (prompt/response both `never`). Providing `response` without `prompt` is a compile-time error.
- `SubskillRegistration.paramsMap` uses method syntax for bivariant checking — the builder passes the fully typed store, the registration interface accepts any store.
- `ModuleDefinition` carries phantom `TModuleSteps` generic. `register()` merges it into parent `TSteps`.
- `const TNext` modifier on the builder's `step()` preserves literal `to` values from `NextBranch[]` without requiring `as const` at call sites.
- Branch target extraction uses `ExtractBranchTargets` with backward-edge filtering. Known steps (already in `TSteps | Name`) are excluded. Single forward target after filtering = not a real branch (guaranteed).
- `openQuestionStep` pattern removed from examples — it was a forced abstraction. Replaced with inline `.step()` calls. Real `.extend()` demonstrated via `approvalGate` in game-jam (confirm primitive with custom message/routing).
- `tsconfig.examples.json` added for type-checking examples against `dist/`. Scripts: `typecheck:examples`, `test:examples`.
- CLAUDE.md updated: API surface is the product, no casts in examples, type-level code treated as real code.
- Structured sub-stores design documented in `HANDOVER-structured-store.md` for follow-up.
- Initial `TSteps = {}` not `Record<string, never>` — `keyof Record<string, never>` is `string`, making `Extract<keyof TSteps, string>` = `string` and causing all branch targets to look like backward edges. `keyof {}` is `never`, which is correct.
- `StoreView` uses `Partial<Readonly<TSteps>> & RequiredSteps` — not `OptionalSteps & RequiredSteps`. `Exclude<keyof TSteps, TGuaranteed>` in `OptionalSteps` didn't resolve correctly through the builder's accumulated intersection types. `Partial` makes everything optional, then `RequiredSteps` overrides guaranteed keys back to required.
- `BranchEntry.when` uses `(...args: any[]) => boolean` — the real `when` callback has a specific `{ response, actionResult, ... }` parameter. `(...args: unknown[]) => boolean` doesn't match due to contravariance. `any[]` does.
- `step()` extend method uses `as StepConfig` cast internally — spreading a union `{ ...config, ...overrides }` doesn't narrow back to the discriminated union. This is internal to the SDK, not developer-facing.
- Docs must be written from status quo, not as migration/changelog. "The store gives typed access" not "The store replaces the old stash". Nobody reading docs knows or cares about previous versions.
