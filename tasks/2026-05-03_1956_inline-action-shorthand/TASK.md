# Inline Action Shorthand

## Scope

**In:**

- `action` field on `StepConfig` becomes a discriminated union: inline function or reusable object
- Rename `action.input` → `action.mapInput` on the reusable form
- Type inference for inline action return type flows to `actionResult` in `save` / `TResultValue`
- Engine branching for inline vs. reusable action execution
- Update all existing usages: `action.input` → `action.mapInput` (engine tests, skill tests, examples, fixtures, type tests)
- Update `InferActionResult` helper or add parallel helper for inline actions
- Update docs: SPEC.md, docs/api.md, docs/architecture.md, README.md, docs-site

**Out:**

- Input/output schema validation on inline actions (by design)
- Input compatibility check (`checkActionInputCompat`) for inline actions (not applicable)

## Context

The existing `action: { run, input }` API forces double-wrapping for single-use side effects:
a `name`, `input` schema, `output` schema, separate `input` mapper — all for a one-off file read.
The inline form makes the common single-use case concise while keeping the reusable form for
shared, schema-validated actions. The rename from `input` → `mapInput` makes the mapper's
purpose explicit.

User-requested design (verbatim from conversation):

```typescript
// Inline form
.step('foo', {
  action: async ({ response, store, params, signal }) => {
    const data = await fetch(store.steps.gather.host);
    return { status: data.status };
  },
  save: ({ actionResult }) => ({ step: { status: actionResult.status } }),
  next: 'report',
})

// Reusable form (mapInput replaces input)
.step('foo', {
  action: {
    run: checkLinks,
    mapInput: ({ response, store, params }) => ({ urls: response.links }),
  },
  save: ({ actionResult }) => ({ step: { broken: actionResult.broken } }),
  next: 'report',
})
```

## Plan

### Type changes

#### `InferActionResult<A>` helper — generalize

Current: `A extends ActionDefinition<any, infer TOut> ? TOut['infer'] : undefined`

New: two-form conditional:

```typescript
export type InferActionResult<A> = A extends (...args: any[]) => Promise<infer R>
  ? R
  : A extends ActionDefinition<any, infer TOut>
    ? TOut['infer']
    : undefined;
```

#### `BaseStepFields.action` union type (`src/types.ts`)

```typescript
action?:
  | ((ctx: {
      response: TOutput['infer'];
      store: StoreAccessor<TSteps, never, TStores, TStoreWrites>;
      params: TParams;
      signal: AbortSignal;
    }) => Promise<unknown>)
  | {
      run: ActionDefinition;
      mapInput?: (ctx: {
        response: TOutput['infer'];
        store: StoreAccessor<TSteps, never, TStores, TStoreWrites>;
        params: Readonly<TParams>;
      }) => unknown;
    };
```

#### `SkillBuilder.step()` generic `A` (`src/skill-builder.ts`)

Current: `A extends ActionDefinition<any, any> | undefined = undefined`

New: `A extends ActionDefinition<any, any> | ((...args: any[]) => Promise<unknown>) | undefined = undefined`

The `TResultValue` conditional already handles the inline case via `InferActionResult<A>` — once `InferActionResult` is updated, it falls through correctly.

The `action?` field in the `configOrDef` object also needs to accept the inline function form:

```typescript
action?: A extends ActionDefinition<any, any>
  ? { run: A; mapInput?: (...) => unknown }
  : A extends (...args: any[]) => Promise<unknown>
    ? A
    : undefined;
```

#### `checkActionInputCompat` guard — reusable form only

The guard `if (config.action && !config.action.input && config.response)` must change to:

- Only run when action is the reusable object form
- Check `!config.action.mapInput` instead of `!config.action.input`

### Engine changes (`src/runtime/engine.ts`)

In `advance()`, action execution branch:

```typescript
if (typeof stepDef.config.action === 'function') {
  actionResult = await stepDef.config.action({
    response,
    store: this.state.buildAccessor(),
    params: this.skillParams,
    signal: this.abortController.signal,
  });
} else if (stepDef.config.action) {
  const { run: actionDef, mapInput } = stepDef.config.action;
  const rawActionInput = mapInput
    ? mapInput({ response, store: this.state.buildAccessor(), params: this.skillParams })
    : response;
  const actionInput = actionDef.input.assert(rawActionInput);
  actionResult = await actionDef.run({ input: actionInput, signal: this.abortController.signal });
}
actionResult = actionResult !== undefined ? Object.freeze(actionResult) : undefined;
```

Replay path is unchanged — it never re-runs actions.

### Rename `input` → `mapInput`

All files with `action: { run, input }`:

- `src/runtime/engine.ts` (destructuring)
- `src/runtime/engine.test.ts` (test cases using `input:`)
- `src/skill-builder.ts` (type definition + compat guard)
- `src/skill.test.ts` (`action.input` test description + usage)
- `src/types.ts` (field name in `BaseStepFields`)
- `src/types/edge-cases.test-d.ts`
- `src/protocol/fixtures/composite-skill.ts`
- `src/protocol/subskill-engine.test.ts`
- `examples/game-jam/src/skill.ts`

### Lifecycle comment update

The comment on `BaseStepFields` currently says:
`Lifecycle: prompt → model → validate(response) → action.input → action.run → result → next`
Update to:
`Lifecycle: prompt → model → validate(response) → action(inline) or action.mapInput+action.run → save → next`

## Steps

- [x] Create TASK.md and commit
- [x] Update `src/types.ts`: union action type, rename `input` → `mapInput`, update `InferActionResult`
- [x] Update `src/skill-builder.ts`: generalize `A` generic, update action field type, update compat guard
- [x] Update `src/runtime/engine.ts`: inline action branch, `input` → `mapInput`
- [x] Update test files: `engine.test.ts`, `skill.test.ts`, type test-d files, fixtures, subskill-engine.test.ts
- [x] Update examples: `game-jam/src/skill.ts`
- [x] Run typecheck + tests + format — pass
- [x] Update docs: SPEC.md, docs/api.md, docs/architecture.md, README.md, docs-site MDX
- [x] Final typecheck + tests + format — pass

## Notes

- `input` inside `ActionConfig` / `ActionDefinition` (the action's own input schema field) is NOT renamed — only the step-level mapper `action.input` → `action.mapInput`
- The builder uses two separate generics (`TReusableAction` + `TInlineAction`) instead of one conditional generic for the action field. This is required because TypeScript cannot infer a type parameter from a conditional position (`T extends X ? ... : T`) when the default resolves first. With two generics, each has its own inference site in the `action?` union.
- The `action?` union includes a broad `((ctx: InlineActionContext<...>) => Promise<unknown>)` member alongside `TInlineAction` to provide contextual typing for inline function parameters (response, store, params, signal) — without this, TypeScript requires explicit `ctx: any` annotation.
- The `checkActionInputCompat` function still validates reusable actions when `mapInput` is absent
- Inline actions get full context including `signal` for cancellation; reusable actions already have `signal` via their `run` ctx
