# Dead Code Cleanup & Prose Generator Refactor

## Scope

**In:** Remove `History.find()`, remove `contextBudget`, collapse four identical prose generators into shared default with override slots, add test coverage for `tasks()` and `subtask()`, update architecture docs.

**Out:** Unreachable else branch in engine (harmless). No new features.

## Context

Dead-code audit found code that doesn't deliver on its promise: `History.find()` is never called, `contextBudget` is stored but never read, and four prose generator files are byte-for-byte identical. Additionally, `tasks()` and `subtask()` primitives have zero test coverage.

## Plan

1. Remove `History.find()` — `History.get()` replaces it
2. Remove `contextBudget` from subtask primitive + all docs
3. Collapse prose generators into `default.ts` + override registry
4. Add tests for `tasks()` and `subtask()` primitives
5. Update architecture docs for new prose pattern

## Steps

- [ ] Commit 1: Remove History.find()
- [ ] Commit 2: Remove contextBudget
- [ ] Commit 3: Refactor prose generators
- [ ] Commit 4: Add primitive tests
- [ ] Commit 5: Update architecture docs
- [ ] Final verification

## Notes

_(Running log)_
