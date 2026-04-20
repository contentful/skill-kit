# Action Data Flow Improvements

## Scope

Improve how actions relate to steps in the skill-kit SDK, based on real-world feedback from building an optimization-doctor skill.

**In scope:**
- `triggers` field auto-appended to description
- `actionInput` mapping function (decouple action input from step output)
- `afterAction` stash hook (post-action stash)
- Action output in `next` transition function
- Typed action output flowing through `StepConfig` generics
- Relaxed cycle guard defaults (runtime safety net vs load-time error)
- Typed `getStep` history accessor

**Out of scope:**
- Multi-action steps
- Conditional step registration
- Full compile-time step-name→type mapping in history

## Context

User built an optimization-doctor skill and found:
1. Action input is coupled to step output — agent must produce plumbing values
2. `next` can't see action results — forces extra triage steps
3. `stash` runs before action — can't stash action results
4. History access is untyped — `as ScanResult` casts everywhere
5. `maxVisits`/`onMaxVisits` boilerplate for linear workflows
6. Trigger keywords crammed into description string

## Plan

See `/Users/tim/.claude/plans/here-s-some-feedback-please-luminous-gem.md` for full implementation plan.

Implementation order:
1. `triggers` field (simplest, isolated)
2. Action output typing + `actionInput` + `afterAction` + `next` (core changes, together)
3. Relaxed cycle guards
4. Typed `getStep`

## Steps

- [ ] Add `triggers` to `SkillBuilderConfig`, auto-append in builder
- [ ] Add `TActionOutput` type param, `TransitionFn` second param, `InferActionOutput` helper
- [ ] Add `actionInput` mapping to engine
- [ ] Add `afterAction` stash hook to engine + replay
- [ ] Pass action output to `resolveNext` / `next` function
- [ ] Update builder `.step()` for action output inference
- [ ] Relax cycle guard to runtime safety net
- [ ] Add `getStep` to `PromptContext` and `History`
- [ ] Update get-to-know-you example to use `getStep`
- [ ] Verify all tests pass, typecheck, format

## Notes

