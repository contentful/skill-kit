# DX Refactor: Callback Signatures & Naming

## Scope

**In:**

- Rename all callback parameters for naming consistency across the lifecycle
- Widen "thin" callbacks (`next`, `updateStash`, `action.input`) to include `params` and `stash`
- Make `prompt` and `output` optional with proper engine auto-advance behavior
- Add guardrails: stash runtime validation, `Readonly<>` types, `Terminal` type export, build-time action input check

**Out:**

- Changes to `action.run` signature — stays `{ input, signal }`, intentionally portable/context-free

## Context

### User feedback (verbatim, translated from German)

Alexander Braunreuther, internal engineer, 2026-04-28:

> "I'm trying to build a context parse step. What I actually want is that you can either pass flags from outside and if they're not there, an askPrompt appears. For that I just need a script-based step. Is that even possible? As far as I understand the lib, you always need a prompt in the step, right?"

> "The action only gets the output. But I actually need the context from the skill."

> "Or even simpler, that I get it in the next callback: `next: ({context}) => context.optionalParam ? 'ask-for-param-step' : 'do-something-with-param-step'`"

After explanation of stash as workaround:

> "Let's look at it together tomorrow. It's still somewhat confusing."

### Root cause analysis

The SDK's lifecycle callbacks each receive a **different** slice of runtime state. The "rich" callback (`prompt`) gets everything; the "thin" callbacks (`next`, `stash`, `action.input`) are missing data developers naturally expect:

```
prompt(ctx)       → context, stash, prev, history, getStep, refs, attempts, host, act, system
stash(ctx)        → output, action                          ← no context, no current stash
next(ctx)         → output, attempts, action                ← no context, no stash
action.input(ctx) → output, stash                           ← no context
action.run(ctx)   → input, signal                           ← intentionally minimal
```

Compounding the asymmetry, naming is inconsistent:

- "context" means 4 things: skill input schema, runtime input value, callback parameter bag, general concept
- "stash" means 4 things: schema declaration, step merge callback, action merge callback, read accessor
- The action's return is called `result` in `action.stash` but `action` in step `stash`
- `prev` on PromptContext is untyped (`unknown`) and just `history.at(-1)?.output`

### Constraints

- **Breaking changes are fine** — user explicitly said "no backwards compat needed"
- All phases happen on one branch, ship as one version bump

## Plan

### Rejected alternatives

1. **Keep `context` name, fix via docs** — Rejected. Tim chose `params` explicitly. The naming collision is an API problem, not a docs problem. `action: { input: ({ input }) => ... }` would read as "input of input."

2. **Rename to `input` instead of `params`** — Rejected by Tim. `input` collides with `action.input` callback name and HTML form concepts. Tim chose `params` as unambiguous.

3. **Rename to `skillInput` / `stepOutput` for everything** — Tim chose `params` for skill input (shorter, clearer). Chose `stepOutput` + `actionOutput` as fully qualified names for step/action results. The verbosity is worth the zero-ambiguity tradeoff.

4. **New `gate()` constructor for prompt-less steps** — Rejected by Tim: "Why is it a gate, why does it decide? Isn't this just an action without a prompt? Like an LLM-less action?" Instead: make prompt-less steps actually work via engine auto-advance. No new concept to learn.

5. **Output-less steps silently accept any output** — Tim flagged: "we also need to tell the LLM an error if it provides the output. Otherwise we might be hiding bugs." Resolution: when `output` is omitted, no `<schema>` block is emitted (LLM doesn't produce JSON). TypeScript enforces: if `next` destructures `stepOutput` but no output schema exists, compile error (`stepOutput` typed as `undefined`).

### Design: naming overhaul

| Concept                 | Old name(s)                        | New name                        | Rationale                                                                    |
| ----------------------- | ---------------------------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| Skill external input    | `context`                          | **`params`**                    | Short, unambiguous, no collisions with HTML/action concepts                  |
| Step LLM response       | `output`                           | **`stepOutput`**                | Fully qualified — zero ambiguity alongside `actionOutput`                    |
| Action return value     | `result` / `action` (inconsistent) | **`actionOutput`**              | Consistent with `stepOutput`, eliminates collision with action config        |
| Cross-step state (read) | `stash`                            | **`stash`** (unchanged)         | Read accessor name is fine                                                   |
| Merge callbacks         | `stash: (ctx) => ...`              | **`updateStash: (ctx) => ...`** | Distinguishes write callback from read accessor and schema                   |
| Subskill context mapper | `contextMap`                       | **`paramsMap`**                 | Follows `context` → `params` rename                                          |
| Generic type param      | `TContext`                         | **`TParams`**                   | Follows concept rename                                                       |
| `prev` on PromptContext | `prev: unknown`                    | **removed**                     | Untyped, just `history.at(-1)?.output`. Use `getStep()` or `history` instead |

### Design: unified callback signatures

After all changes, every callback in the lifecycle:

```ts
// Prompt — the "rich" callback (everything available)
prompt: (ctx: {
  params: TParams;
  stash: Readonly<TStash>;
  history: readonly StepResult[];
  getStep: <T>(name: string) => { stepOutput: T; actionOutput: unknown } | undefined;
  refs: ReferenceLoader;
  attempts: number;
  host: Handshake;
  act: ActBuilder;
  system: SystemBuilder;
}) => PromptReturn;

// Transition — now includes params + stash
next: (ctx: {
  stepOutput: Readonly<z.infer<TOutput>>;
  actionOutput: TActionOutput;
  attempts: number;
  params: TParams;                  // NEW
  stash: Readonly<TStash>;          // NEW
}) => string;

// Step stash merge — now includes current stash + params
updateStash: (ctx: {
  stepOutput: Readonly<z.infer<TOutput>>;
  actionOutput: TActionOutput;
  stash: Readonly<TStash>;          // NEW — current accumulated stash
  params: TParams;                  // NEW
}) => Partial<TStash>;

// Action input mapper — now includes params
action.input: (ctx: {
  stepOutput: Readonly<z.infer<TOutput>>;
  stash: Readonly<TStash>;
  params: TParams;                  // NEW
}) => unknown;

// Action stash merge
action.updateStash: (ctx: {
  actionOutput: TActionOutput;
}) => Partial<TStash>;

// Action run — unchanged (portable, context-free)
action.run: (ctx: {
  input: z.infer<TInput>;
  signal: AbortSignal;
}) => Promise<z.infer<TOutput>>;
```

### Design: StepResult rename

```ts
// Before:
interface StepResult<TOutput = unknown> {
  readonly step: string;
  readonly output: TOutput;
  readonly action?: unknown;
}

// After:
interface StepResult<TOutput = unknown> {
  readonly step: string;
  readonly stepOutput: TOutput;
  readonly actionOutput?: unknown;
}
```

This propagates to: `PromptResult.completed`, `DoneResult.completed`, `SkillRunResult`, `History`, observer params.

### Design: prompt-less steps (auto-advance)

When `prompt` is omitted from a step:

1. Engine detects absence during `buildPrompt()` — returns a marker/flag
2. Protocol layer (`single-invocation.ts`, `composite-entry.ts`) detects the marker
3. Instead of emitting a prompt to stdout, immediately calls `engine.advance(stepName, {})`
4. If the next step is ALSO prompt-less, loops again (chain resolution)
5. Safety: max 20 auto-advances to prevent infinite loops in misconfigured graphs

The LLM never sees prompt-less steps — they're invisible infrastructure.

### Design: output-less steps

When `output` is omitted from a step:

1. No `<schema>` block in the emitted prompt — LLM produces prose, not JSON
2. Engine skips output validation, uses `{}` internally
3. `updateStash` and `next` receive `stepOutput: undefined` (TypeScript-typed as `undefined`)
4. Compile-time safety: if `next` destructures `stepOutput` properties, TypeScript errors

Combined with prompt-less: a step with neither `prompt` nor `output` is a pure routing/action step.

### Design: guardrails (Phase 3)

**Stash runtime validation:** `StashStore` receives the Zod schema at construction. Each `merge()` call does `schema.safeParse(candidate)` — on failure, `console.warn()` (not throw). Catches silent type drift without breaking existing skills.

**`Terminal` type export:**

```ts
export type Terminal = { readonly terminal: true };
export const terminal: Terminal = Object.freeze({ terminal: true });
export type NextTarget<TOutput, TActionOutput, TParams, TStash> =
  | string
  | TransitionFn<TOutput, TActionOutput, TParams, TStash>
  | Terminal;
```

**Build-time action input check:** In `SkillBuilder.step()`, when `action.input` mapper is omitted, attempt to compare step output schema with action input schema. If incompatible, throw at build time with a clear message.

**`Readonly<>` wrappers:** All `stepOutput` params in callbacks typed as `Readonly<z.infer<TOutput>>`.

## Steps

### Phase 1 — Rename + widen all callback signatures

- [x] `src/types.ts` — all signature renames and widening
- [x] `src/runtime/engine.ts` — pass new params in all callback sites, remove `prev`
- [x] `src/step.ts` — generic param renames
- [x] `src/skill.ts` — factory config rename
- [x] `src/skill-builder.ts` — builder type threading, `updateStash`, `paramsMap`
- [x] `src/runtime/history.ts` — `StepResult` field renames
- [x] `src/runtime/observer-dispatch.ts` — observer param renames (no changes needed — uses ObserverMap types which updated automatically)
- [x] `src/protocol/single-invocation.ts` — protocol output field renames
- [x] `src/protocol/composite-entry.ts` — field renames, `paramsMap`
- [x] `src/protocol/session.ts` — session header rename
- [x] `src/protocol/subskill-engine.ts` — HistoryEntry type rename
- [x] `src/testing/run-skill.ts` — test harness renames
- [x] `src/testing/run-composite.ts` — `contextMap` → `paramsMap`
- [x] `src/index.ts` — verify re-exports
- [x] `src/runtime/engine.test.ts` — update all tests + add tests for widened callbacks
- [x] `src/skill.test.ts` — update builder tests
- [x] `src/protocol/subskill-engine.test.ts` — update protocol tests
- [x] `src/protocol/fixtures/composite-skill.ts` — test fixture renames
- [x] All examples — update for new naming
- [x] Typecheck + test + format

### Phase 2 — Prompt-less and output-less steps

- [x] `src/types.ts` — make `output` optional
- [x] `src/step.ts` — remove `output` required check
- [x] `src/runtime/engine.ts` — auto-advance logic, skip validation when no output
- [x] Protocol layer — auto-advance loop with depth limit (20)
- [x] Tests for prompt-less, output-less, combined, routing gate, action in prompt-less step

### Phase 3 — Guardrails and type polish

- [x] `src/runtime/stash.ts` — schema validation on merge (warn mode)
- [x] `src/terminal.ts` — `Terminal` type export
- [x] `src/skill-builder.ts` — build-time action input schema check via JSON Schema property comparison
- [x] `src/types.ts` — `Readonly<>` on `params` and `stash` in all callback signatures (not on `stepOutput`/`actionOutput` — creates noise with `unknown` erasure in engine internals)

### Phase 4 — Typed getStep (added after user feedback)

- [x] `src/types.ts` — `TSteps` generic on `PromptContext`, `PromptFn`, `StepConfig`, `StepDefinition`
- [x] `src/skill-builder.ts` — `TSteps` accumulates via intersection on each `.step()` call
- [x] `src/step.ts` — thread `TSteps` generic
- [x] Tests — getStep without manual generics, overloaded signature for untyped fallback

### Phase 5 — Documentation

- [x] `SPEC.md` — all renames, new features (prompt-less, output-less, typed getStep)
- [x] `docs/api.md` — all renames, remove legacy comments, new features
- [x] `docs/architecture.md` — lifecycle diagram, auto-advance, composite routing
- [x] `README.md` — hero example, API table, brief new features
- [x] `docs-site/src/components/Hero.astro` — fix broken landing page example
- [x] `docs-site/src/pages/` — all 14 MDX pages updated, docs-site builds clean

## Notes

- `prev` removed from PromptContext. Replaced usage in engine.test.ts with `ctx.history.at(-1)?.stepOutput`.
- `Readonly<>` applied only to `params` and `stash` in callback signatures, not to `stepOutput`/`actionOutput`. Reason: when the engine erases generics to `unknown`, `Readonly<unknown>` is not assignable from `unknown` in strict TypeScript, creating more noise than value. The runtime `Object.freeze()` still prevents mutation.
- Stash validation fires on every `merge()` as a warning. Expected behavior: partial stash (before all fields are populated) triggers warnings. This is by design — catches real type drift while being non-blocking.
- Build-time action input schema check implemented via JSON Schema property-name comparison (`skill-builder.ts:checkActionInputCompat`). Catches the common case (missing required properties) but cannot do structural type compatibility (e.g., step outputs `{ count: string }` but action expects `{ count: number }` — same property name, wrong type). ArkType (https://arktype.io/) has native `extends` checking that would make this trivial and reliable. When we evaluate ArkType as a Zod replacement, this check is a concrete use case where it would improve.
- contentful-help example had a pre-existing test failure caused by build artifacts (`package.json`) creating a separate package boundary that broke `@contentful/skill-kit` resolution. Fixed by adding `examples/.gitignore` for build artifacts.
- `CompositeRunResult.output` kept as `output` (not renamed to `stepOutput`) — it represents the composite's overall output, not a single step's output.
