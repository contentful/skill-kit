# State System Redesign Documentation Update

## Scope

Update all documentation across 5 locations to reflect the state system redesign:

- SPEC.md, docs/api.md, docs/architecture.md, README.md, docs-site/src/pages/

**In scope:** All references to the old state system (Zod/z, output/stepOutput/actionOutput, stash/updateStash, getStep, history, maybe()), all code examples, type tables, lifecycle diagrams.

**Out of scope:** Code changes, new features, docs-site styling/layout.

## Context

The SDK underwent a complete state system redesign:

- Zod replaced by ArkType (`z.object()` -> `type()`)
- `output` renamed to `response` on step config; `stepOutput` -> `response`, `actionOutput` -> `actionResult` in callbacks
- `stash` removed entirely (no stash field on skill config, no updateStash)
- `store` replaces stash/history/getStep: single typed accessor with DAG-computed type narrowing
- `result` callback on steps: transforms what gets stored (priority: explicit result() > action output > response)
- Declarative branching: `next: [{ to: 'a', when: ... }, { to: 'b' }]` (NextBranch[])
- Automatic type narrowing: guaranteed steps non-optional, branch targets use `?.`
- `response` requires `prompt`: action-only steps can't have a response schema
- Modules accumulate types via register()

## Plan

Systematically update each doc file, preserving structure but replacing:

1. All `z.object()`/`z.string()` etc with `type({})` ArkType syntax
2. All `output` step field refs with `response`
3. All `stepOutput` callback params with `response`
4. All `actionOutput` callback params with `actionResult`
5. All `stash`/`updateStash` references with `store`
6. All `getStep`/`history` access patterns with `store.stepName` access
7. Add `NextBranch[]` declarative branching docs
8. Add `store` / `StoreView` type documentation
9. Add `result` callback documentation
10. Update lifecycle diagrams
11. Emphasize DX story: automatic type narrowing, zero boilerplate

## Steps

- [x] Create branch and task doc
- [ ] Update README.md
- [ ] Update docs/api.md
- [ ] Update docs/architecture.md
- [ ] Update SPEC.md
- [ ] Update docs-site/src/pages/api/index.mdx
- [ ] Update docs-site/src/pages/architecture/index.mdx
- [ ] Update docs-site/src/pages/getting-started/index.mdx
- [ ] Update docs-site/src/pages/guides/workflow-skills.mdx
- [ ] Update docs-site/src/pages/guides/modules.mdx
- [ ] Update docs-site/src/pages/guides/primitives.mdx
- [ ] Update docs-site/src/pages/guides/composite-skills.mdx
- [ ] Update docs-site/src/pages/examples/get-to-know-you.mdx
- [ ] Update docs-site/src/pages/getting-started/testing.mdx
- [ ] Run prettier check
- [ ] Verify no stale references remain

## Notes

- The canonical examples are `examples/get-to-know-you/src/skill.ts` and `examples/game-jam/src/skill.ts`
- ArkType uses string-based type expressions: `type({ name: 'string' })` not `z.object({ name: z.string() })`
- `maybe()` was removed; optional steps use standard `?.` property access
- The `store` accessor uses Proxy-based property access: `store.greet.name` (guaranteed), `store['ask-stack']?.answer` (optional)
- `store.all('step')` for loop visits, `store.ran('step')` for boolean check
- `NextBranch` type: `{ to: string, when?: (ctx) => boolean }[]`
- `response` field on step requires `prompt` to be present (enforced at type level)
