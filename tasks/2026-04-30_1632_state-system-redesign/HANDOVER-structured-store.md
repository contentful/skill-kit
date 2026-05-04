# Structured Store — Design Handover

This document captures the design direction for composable structured state, to be picked up in a follow-up task. The step-keyed store (Phase 2-3) is the foundation; this extends it.

## The problem

The step-keyed store works when data maps 1:1 to steps. But some skills have domain-structured state that doesn't:

```typescript
// A diagnostics skill gathers config for 2 APIs in one step,
// runs health checks in another, writes results in a third.
// The data structure is about the domain, not the step count.
{
  environment: {
    apiA: { host: 'api-a.example.com', key: 'abc' },
    apiB: { host: 'api-b.example.com', key: 'xyz' },
  },
  diagnostics: {
    apiA: { latency: 42, healthy: true },
    apiB: { latency: 150, healthy: false },
  },
}
```

Forcing this into step-keyed state means the developer accesses `store['gather-config']?.aHost` instead of `store.environment.apiA.host`. The data shape doesn't match the mental model.

## Design direction: composable sub-stores

Rather than two mutually exclusive modes, sub-stores extend the step-keyed store. The developer can declare named structured regions alongside the automatic step-keyed state:

```typescript
skill({
  name: 'api-doctor',
  entry: 'gather-config',
  stores: {
    environment: type({
      apiA: { host: 'string', key: 'string' },
      apiB: { host: 'string', key: 'string' },
    }),
    diagnostics: type({
      apiA: { latency: 'number', healthy: 'boolean' },
      apiB: { latency: 'number', healthy: 'boolean' },
    }),
  },
});
```

Step-keyed access (`store['gather-config']`) continues to work. Named sub-stores are additional typed regions that steps write to via `result`:

```typescript
.step('gather-config', {
  action: { run: readEnvVars },
  result: ({ actionResult }) => ({
    // Step-keyed result (automatic, from return value):
    // store['gather-config'] = this whole object

    // Sub-store writes (explicit):
    $environment: {
      apiA: { host: actionResult.aHost, key: actionResult.aKey },
      apiB: { host: actionResult.bHost, key: actionResult.bKey },
    },
  }),
  next: 'run-diagnostics',
})
```

Or maybe the sub-store writes are a separate field:

```typescript
.step('gather-config', {
  action: { run: readEnvVars },
  save: ({ actionResult }) => ({
    environment: {
      apiA: { host: actionResult.aHost, key: actionResult.aKey },
    },
  }),
  next: 'run-diagnostics',
})
```

And reading from sub-stores:

```typescript
.step('run-diagnostics', {
  prompt: ({ store }) => {
    // Step-keyed access (automatic):
    store['gather-config']; // action result

    // Sub-store access (typed from schema):
    store.environment.apiA.host; // guaranteed if gather-config ran
  },
})
```

## Open questions

### 1. `result` vs `save` — one field or two?

**One field (`result`):** The return value both becomes the step-keyed result AND writes to sub-stores. Some kind of convention separates step data from sub-store writes (e.g., `$`-prefixed keys, or a wrapper like `{ step: {...}, stores: {...} }`).

**Two fields (`result` + `save`):** `result` sets the step-keyed value (already implemented). `save` writes to sub-stores via deep merge. Cleaner separation but more API surface.

Leaning toward two fields. `result` already has a well-defined meaning (step result = what the store returns for this step name). `save` is a new concept for structured writes.

### 2. Deep merge semantics

When two steps write to the same sub-store region:

```typescript
// Step 1 writes:
save: () => ({ environment: { apiA: { host: 'a.com', key: 'abc' } } });

// Step 2 writes:
save: () => ({ environment: { apiB: { host: 'b.com', key: 'xyz' } } });
```

Deep merge should produce `{ apiA: { host, key }, apiB: { host, key } }`. This is the intuitive behavior. The runtime deep-merges `save` returns into the sub-store.

**Edge case:** What if step 2 overwrites a field step 1 set? Last write wins (same as any mutable state). No conflict detection.

### 3. Type narrowing for sub-stores

Sub-stores are declared at the skill level with full types. But they start empty and get populated incrementally. How does the type system track what's been written?

**Option A: Always fully typed.** The sub-store is `Readonly<FullType>` from the start. Fields that haven't been written yet are `undefined` at runtime but the type says they exist. Unsafe — same problem as the old stash.

**Option B: Partial until proven.** Sub-stores start as `Partial<DeepPartial<FullType>>` and `save` narrows them. This requires tracking which paths have been written per step — complex.

**Option C: Schema-level reads.** Similar to the step-keyed `reads` idea (which we ended up not needing). The developer declares which sub-store keys a step needs, and the runtime validates they've been populated. The type narrows to required for those keys.

**Option D: DAG-based narrowing on sub-store keys.** The builder tracks which steps `save` to which sub-store keys, and computes guaranteed keys the same way it computes guaranteed step names. This is the most ambitious but matches our existing approach.

Leaning toward D — it's consistent with the step-keyed narrowing. But the `save` return is a function body, not a static declaration, so the builder can't see which keys are written at the type level. We'd need the save function's return type to carry the key information.

One possible approach: `save` declares its target paths in the type:

```typescript
save: {
  paths: ['environment.apiA', 'environment.apiB'] as const,
  from: ({ actionResult }) => ({
    environment: {
      apiA: { host: actionResult.aHost, key: actionResult.aKey },
      apiB: { host: actionResult.bHost, key: actionResult.bKey },
    },
  }),
}
```

But this duplicates the structure. Alternatively, infer the paths from the return type of `from`:

```typescript
save: ({ actionResult }) => ({
  environment: {
    apiA: { host: actionResult.aHost, key: actionResult.aKey },
  },
});
// Builder infers: writes to environment.apiA.host and environment.apiA.key
```

If `save` returns `DeepPartial<Store>`, the return type tells the builder which paths are populated. The builder accumulates these and narrows the sub-store type downstream. This matches the step-keyed pattern: the builder sees the type, not the value.

### 4. ArkType's role

ArkType's runtime type manipulation could help:

- `.get('environment', 'apiA')` for deep path access on the schema
- `.map()` for selectively making parts required/optional
- `.partial()` / `.required()` for narrowing

But the type narrowing is primarily compile-time (builder generics). ArkType helps with runtime validation — checking that the `save` return actually matches the declared sub-store schema.

### 5. Composability with step-keyed store

The two should compose without conflict:

- `store['step-name']` → step-keyed (automatic)
- `store.environment` → sub-store (from `stores` config)
- Name conflicts: sub-store names must not collide with step names. The builder should error at compile time if they do.
- Methods (`all`, `ran`, `history`) operate on step-keyed data only. Sub-stores are accessed as properties.

### 6. The minimal viable version

Start with the simplest useful thing:

1. `stores` field on skill config with ArkType schemas
2. `save` field on step config — returns `DeepPartial<Stores>`, deep-merged at runtime
3. Sub-store properties on `store` — typed as `Partial` initially
4. No narrowing (everything optional on sub-stores) — add narrowing later
5. Validate `save` returns against schema at runtime (ArkType `.partial()` + validation)

This is useful immediately (structured state with runtime validation) and the narrowing can be added incrementally.

## Prior art from the conversation

- Immer-style draft mutation was discussed and rejected (needs pre-initialized skeleton, adds dependency)
- `set('path', value)` imperative API was discussed — declarative return preferred
- `reads` on top-level sub-store keys was discussed as a narrowing mechanism
- The nesting lives in the schema; the SDK doesn't impose flatness

## Dependencies

- Step-keyed store (done)
- `result` callback (done)
- ArkType `.partial()` for runtime validation of deep-partial save returns
- Deep merge utility (new)
