# Protocol Layer Refactor: Structure & Data Ownership

## Scope

**In scope:** Restructure the internal protocol layer (`src/protocol/`) and runtime result types to eliminate the class of bugs caused by ad-hoc state derivation, fragile result discrimination, and duplicated logic. Six phases, each independently shippable.

**Out of scope:** Public SDK API (builder, types, primitives), CLI invocation format, session file format, build pipeline, lint rules, SPEC.md.

## Context

Several recent bugs share a root cause — the protocol layer is procedural spaghetti:

- **Params-lost-on-advance (PR #47):** `handleAdvance` constructed the engine with `{}` because each handler independently re-derives state from raw flags, and one path was wrong.
- **Preamble positioning:** Result object mutation order caused preamble to appear after prompt.
- **Callback signature asymmetry:** Different callbacks had different views of runtime state.

The pattern: no centralized invocation context, no shared engine interface, no type-safe result discrimination, and duplicated logic across 5+ locations. The fix for each bug was small, but the architecture guarantees the class of bug will recur.

User feedback: "It's not okay to maintain a complex application made out of random functions from random modules. We need structure, shared state, interfaces, abstractions."

## Plan

### Phase 1: Add `kind` discriminant to CliResult

Add `readonly kind: 'prompt' | 'done' | 'error' | 'redirect'` to the four CliResult variant interfaces. Replace all ad-hoc discrimination (`'step' in current && !('error' in current) && ...`) with `result.kind` switches. Add type guard helpers (`isPrompt`, `isDone`, `isError`, `isRedirect`).

**Why:** Lowest-risk, highest-leverage. Eliminates fragile 4-way negation pattern. Makes every subsequent phase easier.

**Files:** `src/types.ts`, `src/runtime/engine.ts`, `src/protocol/auto-advance.ts`, `src/protocol/subskill-engine.ts`, `src/protocol/session.ts`, `src/protocol/composite-entry.ts`, `src/testing/run-skill.ts`, `src/testing/run-composite.ts`, all test files constructing CliResult.

### Phase 2: Shared SkillEngine interface + HistoryEntry consolidation

Define `SkillEngine` interface (`start`, `advance`, `isPromptless`, `replayHistory`). Both `WorkflowEngine` and `SubskillEngine` implement it. Delete duplicate `Advanceable` (auto-advance.ts, run-composite.ts) and duplicate `HistoryEntry` (composite-entry.ts:19, subskill-engine.ts:13). Import canonical `HistoryEntry` from `protocol/types.ts`.

**Why:** Single contract for engine-like objects. Eliminates 3 type duplications.

### Phase 3: InvocationContext — centralize runtime state derivation

New `InvocationContext` / `StartContext` / `AdvanceContext` types with factory functions. Each handler receives a complete, validated context instead of independently re-deriving handshake/params/tools/session from raw flags. `handleStart` goes from 6 positional params to `(skill, ctx: StartContext)`. `handleAdvance` goes from 9 positional params to `(skill, ctx: AdvanceContext)`.

**Why:** Eliminates the entire class of "params-lost" bugs. Makes it impossible to construct an engine without first assembling complete state.

### Phase 4: OutputWriter — consolidate output writing

New `OutputWriter` interface with `writeStart`, `writeAdvance`, `writeIntermediate`. Single `createOutputWriter(session)` factory replaces 4 duplicated output-writing patterns.

**Why:** Eliminates the start-vs-advance pointer confusion and session-vs-stdout duplication.

### Phase 5: Validate history at engine boundary

Use existing `HistoryEntrySchema` to validate history in `replayHistory()`, `reconstructHistory()`, and the `--history` flag parser. Warn-and-skip pattern (matching stash.ts).

**Why:** Prevents corrupted session files or malformed flags from causing confusing deep errors.

### Phase 6: Decompose composite-entry.ts

Split the 464-line god module into: `arg-parser.ts`, `dispatcher-handler.ts`, `subskill-handler.ts`, `topic-handler.ts`, `help-printer.ts`. Deduplicate `drainPromptless` (copy-pasted in run-skill.ts and run-composite.ts).

**Why:** Each module has a single responsibility, is independently testable, and the main entry becomes a ~40-line dispatcher.

### Alternatives rejected

- **Full pipeline abstraction** (a Pipeline class that owns the entire start→advance→output flow): Over-engineering for the current codebase size. InvocationContext + OutputWriter achieve the same goal without introducing a god object.
- **Event-driven architecture** (emitting events instead of direct calls): Adds indirection without benefit. The protocol layer is request/response, not event-driven.
- **Breaking CliResult backward compatibility** (removing old properties like `done: true`): Unnecessary risk. Adding `kind` is additive.

## Steps

- [x] Create branch `refactor/protocol-layer-structure`
- [x] Commit task document
- [x] Phase 1: Add `kind` discriminant to CliResult
- [x] Phase 2: SkillEngine interface + HistoryEntry consolidation
- [x] Phase 3: InvocationContext
- [x] Phase 4: OutputWriter
- [x] Phase 5: History validation
- [x] Phase 6: Decompose composite-entry.ts

## Notes

- Phase 1: Also found a manually-constructed `DoneResult` in `handleRedirect` (topic path) that was missing `kind`, causing session serialization to write `type: undefined`. Fixed by adding `kind: 'done'`.
- Phase 1: The `{ ...startResult, completed: redirect.completed }` spread on subskill redirect needed type narrowing — `startResult` is a `CliResult` union, and adding `completed` to a `ValidationErrorResult` is invalid. Added `kind` check before spreading.
- Phase 3: Kept `resolveSessionForCommand` in composite-entry.ts since session creation logic differs between composite and single entry points (composite passes tools/isSubagent from flags to session header). Extracted shared helpers (`parseTools`, `parseJsonFlag`, `resolveHandshake`, `resolveParams`) to invocation-context.ts.
- Phase 6: Kept `resolveSession` in composite-entry.ts (session creation is entry-point-specific). Extracted 5 new modules. `drainPromptless` dedup deferred — the run-skill.ts version tracks `path` (string array) while autoAdvance doesn't, so they're not trivially interchangeable without changing the test harness API.
