# Primitives Review, Prose Generation, and Showcase Skill

## Scope

**In:**

- Rename `tasks` → `checklist` and `subtask` → `subagent` across the entire SDK
- Update the host registry from 3 to 9 agents with corrected tool names
- Replace the monolithic (and broken) per-host prose resolution with a centralized `CAPABILITY_MAP` + hybrid fallback
- Write per-tool prose functions that encode each tool's specific semantics
- Update the preamble to match new verbs and support new tool names
- Build a `game-jam` showcase skill that exercises all 5 primitives
- Create `docs/hosts.md` — an authoritative reference of all 13 surveyed agents, their tools, primitive mappings, and skipped tools with rationale
- Update all 5 documentation locations

**Out:**

- Adding new primitives (browser, memory, notifications — too host-specific)
- Adding `--tools` flag for hosts to report tools directly (future work)
- MCP elicitation support (future: when hosts expose structured questions via MCP)

## Context

The SDK has 5 interaction primitives that emit prose "verbs" mapped to host-specific tools. Three problems surfaced during review:

1. **Per-step prose is undifferentiated.** The preamble (`preamble.ts`) correctly maps verbs to tools per host. But the per-step prose (`prose/default.ts`) emits bare verbs like `ASK_STRUCTURED: "question?"` for every host — identical output regardless. SPEC.md §14 says per-step prose should also name the tool explicitly for reliability under context pressure. The `resolveProseGenerator()` in `prose/index.ts` has capability checks (AskUserQuestion → claude-code, multiedit → opencode) but all four entries in the `generators` map point to the same `defaultGenerator`.

2. **The host registry is stale and wrong.** `protocol/host.ts` lists 3 hosts with outdated tool names. OpenCode is listed as having `multiedit` (doesn't exist) and `todowrite` — the survey found `question`, `todo`, `plan`, `codesearch`. Codex is missing `ToolRequestUserInput` (structured questions). Gemini CLI, Cline, Roo Code, Kilo Code are missing entirely.

3. **Only `askUser` and `confirm` are exercised in examples.** `plan`, `tasks`, and `subtask` have zero example usage — only unit tests.

Additionally: `subtask` (agent isolation) vs `tasks` (progress checklist) naming is confusing because `subtask` sounds like a child of `tasks`. And `subtask` is not a term any agent uses — they all say "agent."

### Research: 13 agents surveyed

Full survey in `/Users/tim/.claude/plans/we-have-a-bunch-nested-floyd-agent-a90be017114509e63.md`.

Capability adoption:

- Structured questions: 7-8/13 (5 different tool names)
- Plan mode: 10/13
- Todo/task lists: 8/13
- Sub-agents: 7/13
- Web search: 7-8/13
- MCP: 10/13

Key insight: the same capability surfaces under different tool names across hosts. The right resolution strategy is per-primitive capability checking, not monolithic per-host generators.

## Plan

### Renames

**`tasks` → `checklist`:** Parallels `render.checklist()`, matches what users see (checkboxes), avoids collision with Claude Code's `TaskCreate` tool name.

**`subtask` → `subagent`:** Every host calls this concept an "agent" — `Agent` (CC), `agent` (Gemini), `CollabAgent` (Codex), `USE_SUBAGENTS` (Cline), `task` (OpenCode, but semantically spawns a sub-agent). `subagent` communicates exactly what happens.

Verb renames: `CREATE_TASKS` → `CREATE_CHECKLIST`, `SPAWN_SUBTASK` → `SPAWN_SUBAGENT`.

### Hybrid prose resolution with centralized CAPABILITY_MAP

Replace the monolithic `resolveProseGenerator()` with a centralized capability registry:

```typescript
const CAPABILITY_MAP: Record<keyof ProseGenerator, Array<[tool: string, prose: Function]>> = {
  askUser: [
    ['AskUserQuestion', askUserQuestionProse], // CC: header, preview, multi-q
    ['ToolRequestUserInput', toolRequestInputProse], // Codex: isSecret, isOther
    ['ask_followup_question', askFollowupProse], // Cline/Roo/Kilo: 2-4 options
    ['ask-user', geminiAskUserProse], // Gemini CLI
    ['question', opencodeQuestionProse], // OpenCode
  ],
  confirm: [
    ['AskUserQuestion', askUserQuestionConfirmProse],
    ['ask_followup_question', askFollowupConfirmProse],
  ],
  plan: [
    ['EnterPlanMode', enterPlanModeProse], // CC
    ['enter-plan-mode', enterPlanModeProse], // Gemini (same semantics)
    ['update_plan', updatePlanProse], // Codex
    ['plan', planToolProse], // OpenCode
    ['PLAN_MODE', planModeToggleProse], // Cline
  ],
  checklist: [
    ['TaskCreate', taskCreateProse], // CC
    ['tracker-create-task', trackerProse], // Gemini
    ['write-todos', writeTodosProse], // Gemini alt
    ['todo', todoToolProse], // OpenCode
    ['update_todo_list', updateTodoListProse], // Cline/Roo/Kilo
  ],
  subagent: [
    ['Agent', agentToolProse], // CC
    ['agent', agentToolProse], // Gemini (same semantics)
    ['CollabAgent', collabAgentProse], // Codex
    ['task', taskToolProse], // OpenCode
    ['USE_SUBAGENTS', useSubagentsProse], // Cline
    ['new_task', newTaskProse], // Roo/Kilo
  ],
};
```

Hybrid fallback: if `toolsAvailable` is empty, fall back to host registry lookup by `handshake.host`. This means `--host cline` without explicit tools still gets Cline-optimal prose.

Each tool-specific prose function encodes that tool's unique constraints (Cline's 2-4 option limit, Codex's isSecret flag, CC's header/preview support).

### Primitive differentiation

- **`plan`** = "Present a proposed approach. Get user approval before proceeding." Gate semantics.
- **`checklist`** = "Create trackable work items. Update status as each completes." Progress semantics.
- **`subagent`** = "Spawn an isolated agent with its own context to do focused work." Isolation semantics.

### Game-jam showcase skill

Guided Tetris game builder exercising all 5 primitives:

- `askUser` structured (2x): variant choice, renderer choice
- `askUser` open (3x): game name, plan revision, polish requests
- `confirm` (2x): design review gate, final review gate
- `plan` (1x): implementation plan with revision loop
- `checklist` (1x): track 6 implementation tasks
- `subagent` (2x): research renderer best practices, generate CSS theme

Plus `fragment`, `action`, `render`, `refs`, `maxVisits`, conditional branching.

### No new primitives

Research found browser automation (3/13), memory (2/13), image generation (4/13) — too host-specific. Rule from SPEC.md §14: "if the model already picks the right tool given plain intent, don't add an abstraction."

## Steps

- [x] Create branch and task file
- [x] Rename `tasks` → `checklist` and `subtask` → `subagent` across SDK
- [x] Typecheck + test checkpoint (210 pass → 210 pass)
- [x] Update host registry (3 → 9 hosts, fix stale OpenCode/Codex tool names)
- [x] Implement centralized CAPABILITY_MAP (26 tool-specific prose functions + 5 generic fallbacks)
- [x] Replace `resolveProseGenerator` with `buildProseGenerator` (old name deprecated)
- [x] Typecheck + test checkpoint (213 pass — 3 new cross-host prose tests)
- [x] Update preamble for new verbs and all known tools (hybrid fallback)
- [x] Typecheck + test checkpoint (215 pass — 2 new preamble tests)
- [x] Build game-jam showcase skill with tests (3 tests, exercises all 5 primitives)
- [x] Typecheck + test checkpoint (215 SDK + 18 examples = all pass)
- [x] Create docs/hosts.md agent capability reference (13 agents, ~340 lines)
- [x] Update SPEC.md, docs/api.md, docs/architecture.md, docs-site MDX, README.md
- [x] Final typecheck + test + format check (215 SDK + 18 examples, all pass)

## Notes

- The `dist/` directory was stale from a prior build and needed `pnpm run build` to regenerate after the rename. The examples resolve via the `import` condition in package.json exports, which points to dist. Added to build step.
- `unknown-tool-names` lint rule now derives KNOWN_TOOLS from HOST_REGISTRY instead of maintaining a duplicate list.
- `resolveProseGenerator` kept as deprecated alias for backwards compatibility.
- The `prose/default.ts` file still exists but is no longer imported by the prose index — the per-tool files supersede it. Left in place as a reference.
