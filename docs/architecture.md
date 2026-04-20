# Architecture

How `@contentful/skill-kit` works internally. For the author-facing API, see [api.md](./api.md). For the full specification, see [SPEC.md](../SPEC.md).

---

## The Stateless CLI Protocol

A compiled skill is a binary invoked by agents via Bash — one call per step. Each call is stateless: the agent passes the full conversation history on every invocation. JSON goes to stdout, diagnostics to stderr.

### Lifecycle

**1. Start** — Agent calls `scripts/run start`:

```bash
scripts/run start --context '{"repoPath":"."}' --host claude-code
```

Returns a `PromptResult`:

```json
{
  "preamble": "In this session you will follow a structured workflow...",
  "step": "diagnose",
  "prompt": "Inspect the repository and report failed health checks.",
  "schema": { "type": "object", "properties": { "checks": { ... } } }
}
```

The preamble is emitted once. It establishes session-wide conventions (verb mappings, rendering rules) so that later step prompts can be shorter.

**2. Advance** — Agent submits output, gets next step:

```bash
scripts/run advance \
  --step diagnose \
  --output '{"checks":[{"name":"ci","status":"fail","detail":"no config"}]}' \
  --history '[{"step":"diagnose","output":{...}}]' \
  --host claude-code
```

Returns another `PromptResult` (next step) or a `DoneResult`:

```json
{ "done": true, "finalOutput": { "summary": "..." }, "completed": { "step": "report", "output": { ... } } }
```

**3. Validation error** — If the agent's output doesn't match the step schema:

```json
{ "error": "validation", "step": "diagnose", "message": "Expected object, received string", "retry": true }
```

The agent retries with corrected output. The `retry: true` flag tells the agent the step hasn't advanced.

### CLI Flags

| Flag        | Required     | Description                                                    |
| ----------- | ------------ | -------------------------------------------------------------- |
| `--context` | On `start`   | JSON string validated against the skill's context schema       |
| `--step`    | On `advance` | Name of the step whose output is being submitted               |
| `--output`  | On `advance` | JSON string — the agent's response for the step                |
| `--history` | On `advance` | JSON array of `{ step, output, action? }` — full history       |
| `--host`    | Optional     | Host identifier: `claude-code`, `codex`, `opencode`, `generic` |

### Why stateless

No persistent processes, no stdin piping, no subprocess lifecycle management. The agent makes sequential Bash calls and parses JSON — a pattern every agent host supports today. Statelessness also enables horizontal scaling, resumable workflows, and retry/redo logic without session corruption.

History replay is cheap. The engine reconstructs state (stash, visit counts) from history data without re-executing actions or observers.

---

## The Host-Aware Prose System

### The architectural constraint

The skill CLI cannot call tools. It cannot invoke MCP methods. It cannot cause the host to render UI. Only the model can do those things, and only in response to prose it reads.

When the SDK wants the model to use `AskUserQuestion` on Claude Code, all it can do is return prose that names the tool and describes how to use it. The model reads the prose, decides to call the tool, and passes the answer back on the next invocation. The answer shape is still enforced by the step's Zod schema.

Everything in the host-aware system is downstream of this constraint. Primitives are prose generators with host-aware variants. The "capability system" is a lookup table that picks which variant to emit.

### Two mechanisms

**Preamble at session start.** Generated once per skill invocation. Establishes session conventions:

> _When a step says "ASK_STRUCTURED", use the AskUserQuestion tool with exact options. When a step provides a "Rendered output" block, emit it verbatim. When a step says "SPAWN_SUBTASK", use the Agent tool._

The preamble is generated per host — different tool names, different emphasis, same semantics. Later step prompts can be shorter because the preamble has set the context.

Preambles are best-effort — the model may forget them under context pressure. For critical primitives, per-step prose also names the tool explicitly. Preambles optimize the common case; per-step prose guards correctness.

**Per-step prose generation.** For any step using a primitive (`ask`, `confirm`, `plan`, `tasks`, `subtask`), the SDK generates prose calibrated to the current host. On Claude Code, an `askUser` step emits:

> _Use the AskUserQuestion tool to ask: "Which target?" Options (pass exactly these values): "production", "staging". Do not modify option text._

On a host without a structured-question tool:

> _Ask the user: "Which target?" Present these options and no others: production, staging. Accept only a single answer matching one of those exact strings._

### Prose generator resolution

`resolveProseGenerator(handshake)` picks the generator by checking `handshake.toolsAvailable` for host-identifying tools. Falls back to the `handshake.host` name, then to `generic`.

Each generator implements the `ProseGenerator` interface:

```typescript
interface ProseGenerator {
  askUser(config: AskUserConfig): string;
  confirm(config: ConfirmConfig): string;
  plan(config: PlanConfig): string;
  tasks(config: TasksConfig): string;
  subtask(config: SubtaskConfig): string;
}
```

Implementations exist for `claude-code`, `codex`, `opencode`, and `generic`.

### Why primitives matter

Three reasons, all load-bearing:

1. **Centralized tuning.** The SDK owns the prose that produces reliable behavior per host. One tuning pass benefits every skill.
2. **Host portability.** Authors write intent once; the SDK translates per host. No hardcoded tool names to break on a different agent.
3. **SDK improvements propagate.** Better phrasing for Codex six months from now ships as an SDK update. Every skill using primitives gets it for free.

Skills written against primitives inherit prompt-engineering work done in the SDK. Skills written as raw prose don't.

### Escape hatch

For cases where author-written prose must be host-aware, `PromptContext.host.toolsAvailable` is available in prompt functions:

```typescript
prompt: ({ host }) => {
  if (host.toolsAvailable.includes('WebSearch')) {
    return 'Search the web for recent CVEs affecting this dependency.';
  }
  return 'Check the changelog for known security issues.';
},
```

The lint rule `no-host-tool-names` enforces that raw tool names only appear inside `host.toolsAvailable.includes()` guards.

### Known host tool inventories

**Claude Code:** AskUserQuestion, EnterPlanMode, ExitPlanMode, TaskCreate, TaskUpdate, TaskList, TaskGet, Agent, Skill, Read, Edit, Write, Bash, Glob, Grep, WebFetch, WebSearch, TodoWrite, and others.

**Codex CLI:** shell, apply_patch, update_plan, web_search, view_image, request_permissions, exec_command, write_stdin.

**OpenCode:** bash, read, write, edit, apply_patch, multiedit, glob, grep, list, webfetch, task, todowrite, todoread, skill, optional lsp.

---

## The Build Pipeline

`skill-kit build <entry.ts> -o <dir>` produces a distributable, [agentskills.io](https://agentskills.io/specification)-compliant skill directory.

### Pipeline steps

1. **Load** — Import the entry file, extract the default export (must be a `SkillDefinition` or `ReferenceDefinition`).
2. **Validate** — Run lint checks (cycle guards, schema consistency).
3. **Generate wrapper** — Create a temporary entry point that imports the skill and calls `main()` from `@contentful/skill-kit/cli`.
4. **Compile** — For each target platform, run `bun build --compile --target bun-<platform>`. Individual target failures don't halt the pipeline; zero successful targets does.
5. **Generate scripts/run** — Shell wrapper that detects OS/architecture and delegates to the correct binary in `bin/`.
6. **Generate SKILL.md** — Agent-facing documentation with invocation instructions, step descriptions, and reference pointers.
7. **Generate package.json** — Minimal metadata (name, version).
8. **Copy references/** — Markdown files from the source `references/` directory.
9. **Clean up** — Remove temporary wrapper files.

### Output structure

```
<dir>/
  SKILL.md               ← Agent reads this first
  package.json
  scripts/
    run                  ← Public interface (chmod +x)
  bin/
    <name>-darwin-arm64  ← macOS Apple Silicon
    <name>-darwin-x64    ← macOS Intel
    <name>-linux-x64     ← Linux x86_64
    <name>-linux-arm64   ← Linux ARM
  references/
    *.md                 ← Bundled content files
```

Default targets: `darwin-arm64` and `linux-x64`. Override with `--targets`. Use `--single` for current-platform-only dev builds.

### The scripts/run wrapper

Agents call `scripts/run`, never `bin/` directly. The wrapper detects the current platform, selects the correct binary, and execs it with all arguments forwarded:

```bash
#!/usr/bin/env bash
set -euo pipefail
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in x86_64) ARCH="x64" ;; aarch64|arm64) ARCH="arm64" ;; esac
BIN="$SKILL_DIR/bin/<name>-${OS}-${ARCH}"
exec "$BIN" "$@"
```

This decouples the skill's contract (SKILL.md references `scripts/run`) from its internal layout.

### The compile step

The SDK generates a temporary entry point:

```typescript
import skill from './skill';
import { main } from '@contentful/skill-kit/cli';
main(skill);
```

`bun build --compile` bundles everything — the SDK, Zod, the skill code — into a single self-contained executable. The SDK itself has no Bun runtime dependency; Bun is used only as a build tool.

---

## Engine Internals

The `WorkflowEngine` (`src/runtime/engine.ts`) is the core state machine.

### Lifecycle

**Constructor** — Takes a `SkillDefinition`, `Handshake`, context, and optional `ReferenceLoader`. Initializes the stash store and prose generator.

**`start()`** — Validates the skill structure (parent sentinels resolved, cycle guards present). Generates the preamble. Fires `onStepStart`. Returns the first step's `PromptResult`.

**`advance(stepName, rawOutput)`** — The main loop:

1. **Validate** output against step's Zod schema via `safeParse()`.
2. If invalid: fire `onStepValidationFailed`, return `ValidationErrorResult` with `retry: true`.
3. **Merge stash** via the step's `stash()` callback (if present). Shallow merge into accumulator.
4. **Execute action** (if configured). Action receives typed input and AbortSignal. Result recorded in history.
5. **Freeze** the output object.
6. **Append** to history.
7. Fire `onStepComplete`.
8. **Resolve next step:**
   - `{ terminal: true }` → fire `onSkillComplete`, return `DoneResult`.
   - Function → call with `{ output, attempts }`, get step name.
   - `'self'` → rewrite to current step name.
   - Apply `maxVisits` / `onMaxVisits` throttle.
9. Fire `onTransition`.
10. Return next step's `PromptResult`.

### History replay

`replayHistory(history)` reconstructs engine state from a previous execution. It validates each entry's output against the step schema and re-merges stash, but does not re-execute actions or fire observers. This is how the stateless protocol works — each `advance` call replays the full history to rebuild state before processing the new step.

### StashStore

Merge-only accumulator. Each `stash()` callback returns a partial stash object that's shallow-merged (`Object.assign`) into the current state. Values are frozen after merge. No deletions, no deep merges.

### Observer dispatch

Observers fire sequentially and are awaited (they can be async), but failures are caught and logged — they never block workflow execution. Observers receive read-only snapshots of engine state.

---

## Lint System

`checkSkill(skill, rootDir)` runs static analysis on a skill definition. Returns an array of `LintDiagnostic` objects:

```typescript
interface LintDiagnostic {
  rule: string;
  severity: 'error' | 'warning';
  message: string;
  step?: string;
  file?: string;
}
```

### Rules

**`cycle-guard`** (error) — Detects circular step transitions (self-loops and multi-step cycles) that lack `maxVisits` + `onMaxVisits`. Enforced at validation time, before the engine runs.

**`no-host-tool-names`** (error) — Steps must not reference host tool names directly (e.g., `AskUserQuestion`, `apply_patch`, `TodoWrite`) in prompts without guarding behind `host.toolsAvailable.includes('ToolName')`. Scans both string prompts and function `.toString()` output. The guard pattern exempts the reference.

**`primitive-schema-mismatch`** (error/warning) — For steps with `askUser` structured type: errors if option values are missing from the output Zod enum, warns if the enum has values not present in the options list.

**`orphan-references`** (warning) — Files in the `references/` directory that aren't mentioned in any step prompt. May indicate dead content.

**`unknown-tool-names`** (warning) — `host.toolsAvailable.includes()` calls that reference tool names not in the known registry (40+ tools across Claude Code, Codex, and OpenCode).

**`host-branching-density`** (warning) — Multiple steps branching on `host.toolsAvailable.includes()`. Suggests a missing SDK primitive — if several steps need host-specific logic, the pattern should probably be elevated to a primitive.

---

## Design Decisions

These are non-negotiable choices with specific rationale. For the full list, see [SPEC.md §14](../SPEC.md).

**State is append-only.** Prior step outputs are never mutated. The stash accumulates via shallow merge; history is a linear append. This enables history replay — the engine can reconstruct state from data without re-executing side effects.

**Cycles have implicit bounds.** The cycle guard validator detects potential cycles and applies a default runtime limit (10 visits). Explicit `maxVisits` + `onMaxVisits` provides control over the fallback behavior. Unguarded cycles are a lint warning, not a load-time error — the runtime safety net prevents infinite loops.

**Capabilities are declared, not discovered.** Skills declare what host capabilities they need upfront via the `capabilities` manifest. The harness reads this at install time. No runtime probing.

**Actions are declared, not inferred.** Any CLI-side side effect must exist as a named `action()` with typed input/output schemas. No implicit I/O in step callbacks.

**Steps are named string keys.** The state machine is inspectable as data. Transitions reference step names as strings, not closures. This makes the workflow diffable, serializable, and debuggable.

**Schemas are Zod.** One validator, one source of truth, native TypeScript types. No pluggable schema systems. The SDK re-exports `z` so skills don't need a separate Zod dependency.

**Prose stays prose.** The SDK structures when prose is shown and what contract it satisfies. It never replaces prose with code. Nodes contain freely-written instructions; transitions between nodes are typed and explicit.
