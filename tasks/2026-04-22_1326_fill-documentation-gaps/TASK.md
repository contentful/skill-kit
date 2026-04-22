# Fill Documentation Gaps

## Scope

**In:** Fix factual errors in SPEC.md, add missing `checkSkill` to API reference, correct lint severity, clarify `liveModel` status, enrich observer/primitive/validation docs, sync docs-site.

**Out:** No runtime code changes, no new example skill directories, no README rewrite.

## Context

Audit of the full public API surface against all documentation found 8 gaps ranging from phantom function references to missing API sections. Docs are ~85% accurate — this is a targeted fill, not a rewrite.

## Plan

8 commits in order:

1. Fix SPEC.md: `interactiveTable` phantom ref + `Bun.write` example
2. Clarify `liveModel()` status across all doc surfaces
3. Add `checkSkill` to API reference + fix `cycle-guard` severity
4. Sync arrow chars and links in docs-site
5. Add concrete observer hook examples
6. Add validation error handling section to guides
7. Enrich worked examples with `plan`/`tasks` primitives
8. Add testing section to modules guide

## Steps

- [x] Commit 1: SPEC.md fixes
- [x] Commit 2: liveModel status
- [x] Commit 3: checkSkill + cycle-guard severity
- [x] Commit 4: docs-site cosmetic sync
- [x] Commit 5: observer examples
- [x] Commit 6: validation error handling
- [x] Commit 7: plan/tasks primitive examples
- [x] Commit 8: modules testing section
- [x] Final verification: prettier, tsc, astro build

## Notes

- cycle-guard severity: code uses warning for the common case (unguarded cycles), error only when config is invalid. All docs were wrong — fixed everywhere.
- SPEC.md `render.interactiveTable()` replaced with a realistic `render.checklist` / `render.table` host-check example rather than just deleting it.
- deploy-check worked example now demonstrates 5 of 5 primitives (askUser, plan, tasks, confirm, + subtask covered separately in primitives guide).
- Formatting fix needed as a separate commit after the content commits.
