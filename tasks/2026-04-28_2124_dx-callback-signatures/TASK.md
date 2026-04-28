# DX Refactor: Callback Signatures & Naming

## Scope

**In:** Rename all callback parameters for consistency, widen thin callbacks to include `params` and `stash`, make `prompt` and `output` optional with proper engine behavior, add guardrails.

**Out:** Documentation updates (Phase 4 — separate task after API stabilizes).

## Context

Real user feedback from Alexander Braunreuther while building a context-parsing step:
- Can't route on skill input in `next` callback — `context` not available
- Actions only receive `output` but need skill input
- Can't build prompt-less "script steps"
- Naming is confusing: "context", "stash", "output" all overloaded

Root cause: callback argument asymmetry + inconsistent naming across lifecycle hooks.

## Plan

### Naming overhaul

| Concept | Old name(s) | New name |
|---------|------------|----------|
| Skill external input | `context` | `params` |
| Step LLM response | `output` | `stepOutput` |
| Action return value | `result` / `action` | `actionOutput` |
| Merge callbacks | `stash` | `updateStash` |

### Unified callback signatures

```
prompt(ctx)             → params, stash, history, getStep, refs, attempts, host, act, system
updateStash(ctx)        → stepOutput, actionOutput, stash, params
next(ctx)               → stepOutput, actionOutput, attempts, params, stash
action.input(ctx)       → stepOutput, stash, params
action.updateStash(ctx) → actionOutput
action.run(ctx)         → input, signal  (unchanged)
```

### Phases

1. Rename + widen callbacks (breaking, all at once)
2. Prompt-less + output-less steps (auto-advance engine)
3. Guardrails (stash validation, Readonly<>, Terminal type, build-time checks)
4. Docs (separate task)

## Steps

- [ ] Phase 1: types.ts — all signature renames and widening
- [ ] Phase 1: engine.ts — pass new params in all callback sites
- [ ] Phase 1: step.ts, skill.ts, skill-builder.ts — factory/builder updates
- [ ] Phase 1: history.ts, observer-dispatch.ts — StepResult field renames
- [ ] Phase 1: protocol layer — field renames in CLI output
- [ ] Phase 1: testing harness — run-skill.ts renames
- [ ] Phase 1: engine.test.ts — update all tests + new tests for widened callbacks
- [ ] Phase 1: examples — update all examples for new naming
- [ ] Phase 1: typecheck + test + format
- [ ] Phase 2: make output optional in types + step.ts
- [ ] Phase 2: engine auto-advance for prompt-less steps
- [ ] Phase 2: protocol layer auto-advance loop
- [ ] Phase 2: tests for prompt-less/output-less steps
- [ ] Phase 3: stash runtime validation (warn mode)
- [ ] Phase 3: Terminal type export, NextTarget union
- [ ] Phase 3: build-time action input schema check
- [ ] Phase 3: Readonly<> wrappers on callback output params

## Notes

- Breaking changes OK — no backwards compat needed per user direction
- `action.run` stays as `{ input, signal }` — intentionally portable/context-free
- `prev` removed from PromptContext — use `getStep()` or `history` instead
- `contextMap` in subskill registration → `paramsMap`
