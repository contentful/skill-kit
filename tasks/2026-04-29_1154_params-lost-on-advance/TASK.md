# Params lost on advance

## Scope

**In:** Fix `handleAdvance` dropping params; forward `session.header.params` on session advance; add `--params` support for stateless advance; improve params validation error message.

**Out:** Changes to how params are stored in sessions (already works). Changes to the agent host behavior.

## Context

When a skill has required `params` (e.g., `target: z.string()`), the agent correctly passes `--params` on `start`. The session header stores these params. But `handleAdvance` in `single-invocation.ts:40` always constructs the engine with `{}` instead of the stored params. This means any skill with required params fails on every advance call with "Invalid input: expected string, received undefined".

The error message itself is also too cryptic — it doesn't include the field name or skill name, making it hard for agents to self-correct when params are genuinely wrong.

Reported via a `wiki:fetch-v2` skill with `params: z.object({ target: z.string(), wiki: z.string().optional() })` where the entry step is a prompt-less dispatcher.

## Plan

### 1. `src/protocol/single-invocation.ts` — forward params

Add `params: unknown` to `handleAdvance` signature, pass to `WorkflowEngine` constructor.

### 2. `src/protocol/cli-entry.ts` — wire params from callers

- Session path: pass `session.header.params`
- Stateless path: parse `--params` flag, default to `{}`
- Update `printHelp` for stateless advance

### 3. `src/build/skillmd-template.ts` — stateless advance example

Add `--params` to the stateless advance bash example so agents know to pass them.

### 4. `src/runtime/engine.ts` — better error message

Include skill name and field paths in the params validation error.

### 5. Tests

- Update existing param validation test in `engine.test.ts`
- Add regression test for params surviving advance

## Steps

- [x] Create task doc
- [x] Fix `handleAdvance` to accept and forward params
- [x] Wire params from `cli-entry.ts` callers
- [x] Fix same bug in `composite-entry.ts` (dispatcher + direct subskill advance paths)
- [x] Update help text and SKILL.md template
- [x] Improve params error message in engine
- [x] Update/add tests
- [x] Update docs across all 5 locations
- [x] Verify: typecheck + tests + format

## Notes

- The same bug existed in `composite-entry.ts` on three paths: dispatcher advance (line 316), subskill advance via redirect (line 307), and direct subskill advance (line 360). The redirect path intentionally passes `{}` because subskill params are derived from stash during the redirect — only the dispatcher and direct subskill paths needed fixing.
- Session mode stores params in the header and now reads them back on advance — agents don't need to pass `--params` on session advance. Stateless mode requires `--params` on every call.
- History does NOT include params — it only stores `{ step, stepOutput, actionOutput }`. Params are validated in the engine constructor and available via `ctx.params` in callbacks.
