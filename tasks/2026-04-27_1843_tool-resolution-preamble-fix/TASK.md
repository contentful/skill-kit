# Fix unreliable tool resolution and preamble positioning

## Scope

**In scope:**
- Change `resolveTools()` from either/or to union-by-default with `--subagent` opt-out
- Fix preamble serialization order so it appears before prompt in JSON
- Fix composite-entry.ts overwriting engine preamble (losing skill system directive)
- Add `--subagent` flag through all entry points and session persistence
- Update SKILL.md template to document `--subagent` and explain union behavior
- Update subagent primitive preamble instruction to mention `--subagent`
- Update tests and documentation

**Out of scope:**
- Changing the host registry contents
- Changing the primitive resolution algorithm (still first-match in tools array)
- Per-primitive merge strategy (rejected — `--subagent` flag is cleaner)

## Context

Observed in a real skill invocation: a Claude Code agent reported only `["Read","Edit","Write","Bash","Agent"]` via `--tools`, missing `AskUserQuestion`, `EnterPlanMode`, `TaskCreate`, etc. The current `resolveTools()` uses either/or — if ANY explicit tools are given, the host registry is completely ignored. The preamble was generated with `—` for most primitives.

User's key insight: host detection is reliable, tool self-reporting is not. But subagents genuinely have fewer tools, so we can't always merge with the registry. Solution: `--subagent` flag makes the distinction explicit.

Second problem: the `preamble` field appears after `prompt` in JSON serialization because it's set as an afterthought mutation on the PromptResult object. It should come first structurally.

Third problem: composite-entry.ts lines 294 and 343 overwrite `engine.start()`'s preamble (which includes `skill.system`) with a bare `generatePreamble()`, losing the skill-level system directive.

## Plan

### Tool resolution: `--subagent` flag + union-by-default

| Condition | Behavior |
|-----------|----------|
| No `--tools` | Fall back to host registry (unchanged) |
| `--tools` + `--subagent` | Explicit tools are authoritative (current either/or) |
| `--tools` without `--subagent` | Union of explicit tools + host registry |

Top-level agents still pass `--tools` for forward compatibility (new hosts, MCP tools). The union ensures under-reporting is handled gracefully while extra tools are captured.

### Preamble positioning

Ensure `preamble` field appears before `prompt` in serialized JSON:
- Reorder `PromptResult` interface
- `engine.start()` constructs result with preamble before prompt in object literal
- `addTypeField()` in session.ts uses explicit field ordering

### Composite preamble fix

Remove preamble overwrites in composite-entry.ts. The engine's `start()` already handles preamble assembly correctly.

### Types

```typescript
export interface Handshake {
  host: string;
  toolsAvailable: string[];
  isSubagent: boolean;
}

export interface PromptResult {
  step: string;
  preamble?: string;  // before prompt
  prompt: string;
  schema: unknown;
  completed?: StepResult;
}

export interface SessionHeader {
  // ... existing ...
  isSubagent?: boolean;  // backward compat
}
```

### resolveTools()

```typescript
export function resolveTools(handshake: Handshake): ToolResolver {
  const registryTools = HOST_REGISTRY[handshake.host] ?? [];
  const explicitTools = handshake.toolsAvailable;
  let tools: string[];
  if (explicitTools.length === 0) {
    tools = registryTools;
  } else if (handshake.isSubagent) {
    tools = explicitTools;
  } else {
    tools = [...new Set([...explicitTools, ...registryTools])];
  }
  // ... resolve per primitive as before
}
```

### Subagent awareness

Two paths for informing subagents about `--subagent`:
1. SKILL.md template: "Subagent invocations" section
2. `<subagent>` preamble row: mention `--subagent` in instruction text

## Steps

- [ ] Create branch
- [ ] Commit TASK.md
- [ ] types.ts: reorder PromptResult, add isSubagent to Handshake/SessionHeader
- [ ] host.ts: update resolveHost() signature
- [ ] registry.ts: redesign resolveTools() + update tests
- [ ] engine.ts: fix start() preamble ordering
- [ ] session.ts: fix addTypeField ordering + isSubagent persistence + tests
- [ ] composite-entry.ts: remove preamble overwrites + thread isSubagent + tests
- [ ] cli-entry.ts: parse --subagent boolean flag + tests
- [ ] single-invocation.ts: thread isSubagent + update help
- [ ] run-skill.ts + run-composite.ts: add isSubagent default
- [ ] preamble.test.ts: update Handshake objects + add tests
- [ ] subagent.ts: update preamble instruction
- [ ] skillmd-template.ts: update SKILL.md instructions
- [ ] Documentation: SPEC.md, docs/api.md, docs-site/
- [ ] Final verification: typecheck + tests + format

## Notes

(Running log of decisions during implementation)
