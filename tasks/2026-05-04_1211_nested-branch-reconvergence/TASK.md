# Fix: Nested branch reconvergence fails to promote shared target

## Scope

**In**: Fix the type-level reconvergence detection to handle nested branches that all converge to a shared target.

**Out**: Runtime changes. The reconvergence detection is purely compile-time.

## Context

When a step is a branch target from one branch point, and then a guaranteed intermediate step creates a second branch that also includes that same target alongside new targets, the type system fails to detect that target as guaranteed.

Failing topology:

```
confirm-creds → [apply-creds, review]         ← branch 1
apply-creds → check-api → triage
triage → [review, choose-entry]               ← branch 2 (triage is guaranteed)
choose-entry → [review, run-inspection]       ← branch 3
run-inspection → review
```

`review` is on ALL execution paths, but `store.diagnosis.status` is `string | undefined` at `report`.

### Root cause — three compounding issues in `src/types/store.ts`

1. **Group corruption**: `groups` accumulates via intersection (`&`). When `review` appears as a branch target from both `confirm-creds` and `triage`, its origin becomes `'confirm-creds' & 'triage'` = `never`. This breaks `SiblingsOf`, so `ShouldPromote` always returns `false`.

2. **Missing edge recording for function/array next**: `ExtractBranchEdge` (line 761) only records edges for string `next`. When `choose-entry` (branched) uses function next → `'review' | 'run-inspection'`, the `choose-entry->review` edge is never recorded.

3. **No mechanism for nested convergence**: Even if groups weren't corrupted, `ShouldPromote` checks if `apply-creds` (review's sibling) has a direct edge to `review`. It doesn't — it routes to `check-api`. The system needs a way to recognize that a guaranteed intermediary's branch paths all converge to the target.

## Plan

### Change 1: Filter already-branched targets from group entries

`ExtractBranchGroupEntries` gets a 4th param `TExistingBranched`. Exclude already-branched targets from new group entries via `Exclude<Targets, TExistingBranched>`. Prevents the `'originA' & 'originB' = never` corruption.

### Change 2: Extend `ExtractBranchEdge` for function-next and branch-array-next

Currently only fires for string next. Extend to also record edges when a branched step's function return type or branch array `to` values include targets in `TBranched`. Uses distributive conditional over the return type union / extracted `to` values.

### Change 3: Add cobranch tracking to `BranchState`

Add 4th field `cobranches: TCobranches` (default `never`). Records `"target~cobranch"` template literals when a guaranteed step branches to both an already-branched target and new targets.

New type `ExtractCobranches<Name, TNext, TBranched, TKnownSteps>`: only fires when `Name` is NOT branched. Produces `"rebranched~newTarget"` entries.

### Change 4: Add cobranch-based promotion to `ShouldPromote`

New helpers:

- `ExtractCobranch<Name, TCobranches>`: extracts cobranch targets for a given rebranched target
- `AllRouteToTarget<Sources, Target, TEdges>`: checks if ALL sources have edges to target
- `CoveredSiblings<Name, Siblings, TBranches>`: if cobranch evidence proves all paths through the guaranteed intermediary converge to Name, returns all Siblings

Update `ShouldPromote` to union `CoveredSiblings` with `RoutingSources` when subtracting accounted-for siblings.

### Change 5: Wire into `AddStepBranches`

Pass `TBranches['branched']` to `ExtractBranchGroupEntries`. Accumulate `ExtractCobranches` into 4th BranchState field.

### Change 6: Update `BranchState<any, any, any>` → `BranchState<any, any, any, any>`

All constraint sites in `store.ts` and `skill-builder.ts`.

## Steps

- [x] Add failing repro test in `sub-store.test-d.ts`
- [x] Implement changes 1-6 in `store.ts`
- [x] Update `BranchState` constraints in `skill-builder.ts`
- [x] Add unit tests for cobranch types in `store.test-d.ts`
- [x] Add builder-level edge case tests in `edge-cases.test-d.ts`
- [x] Verify all tests pass, lint, format

## Notes

- Initial plan had `ExtractBranchEdge` extended to handle function-next and branch-array-next in a single edge set. Testing revealed this is unsound: function next is non-deterministic (`'a' | 'b'` means "goes to a OR b"), while string next is deterministic ("always goes to target"). Recording function-next edges in the sibling reconvergence set incorrectly promoted targets in partial-convergence cases.

- Solution: split into two edge sets. `edges` (deterministic, string next only) powers sibling reconvergence in `ShouldPromote`. `anyEdges` (all routing forms) powers cobranch convergence checking in `CoveredSiblings`. `BranchState` grew from 3 to 5 fields (added `anyEdges` and `cobranches`).

- Also added a multi-hop reconvergence test in `sub-store.test-d.ts` (GuaranteedRouteTarget transitive case). This was always working but wasn't tested with sub-store writes.
