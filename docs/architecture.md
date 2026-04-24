# Architecture

How `@contentful/skill-kit` works internally. For the author-facing API, see [api.md](./api.md). For the full specification, see [SPEC.md](../SPEC.md).

---

## CLI Protocol

A built skill is invoked by agents via Bash — one call per step. The SDK supports two invocation modes: **session mode** (recommended) which uses a temp file for communication, and **stateless mode** (fallback) which passes everything via CLI args and stdout.

### Session mode (recommended)

Session mode moves protocol data to a JSONL temp file, reducing noise in the agent's Bash output and eliminating the growing `--history` flag.

**1. Start** — Agent creates a session:

```bash
scripts/run --context '{"repoPath":"."}' --host claude-code --session new
```

Returns a minimal `SessionPointer` to stdout:

```json
{ "sessionId": "abc123", "file": "/tmp/skill-kit-abc123.jsonl", "line": 2 }
```

The agent reads line 2 from the session file (via the host's Read tool) to get the prompt, schema, and preamble.

**2. Write output** — Agent appends its response to the session file:

```bash
echo '{"type":"output","step":"diagnose","output":{"checks":[...]}}' >> /tmp/skill-kit-abc123.jsonl
```

**3. Advance** — Agent calls advance with just the session ID:

```bash
scripts/run advance --session abc123
```

Returns a line number (e.g., `4`). The agent reads that line for the next prompt or done signal.

**4. Repeat** until the line contains `"type":"done"`.

The session file is JSONL with typed lines: `header`, `prompt`, `output`, `done`, `error`. See [SPEC.md §10](../SPEC.md) for the full session file format.

### Stateless mode (fallback)

In stateless mode, the agent passes the full conversation history on every invocation. JSON goes to stdout.

**1. Start** — Agent calls `scripts/run` (defaults to `start`):

```bash
scripts/run --context '{"repoPath":"."}' --host claude-code
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

The preamble is emitted once. It establishes session-wide conventions (XML tag-to-tool mappings, rendering rules) so that later step prompts can be shorter.

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

| Flag            | Required     | Description                                                                                                                                                                                                                          |
| --------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--context`     | On `start`   | JSON string validated against the skill's context schema                                                                                                                                                                             |
| `--step`        | On `advance` | Name of the step being submitted. Not needed with `--session` in file mode                                                                                                                                                           |
| `--output`      | On `advance` | JSON string — the agent's response. Not needed with `--session` in file mode                                                                                                                                                         |
| `--history`     | On `advance` | JSON array of `{ step, output, action? }`. Not needed with `--session`                                                                                                                                                               |
| `--host`        | Optional     | Host identifier: `claude-code`, `codex`, `opencode`, `gemini-cli`, `cline`, `roo-code`, `kilo-code`, `cursor`, `amp`, `generic`                                                                                                      |
| `--tools`       | Optional     | Comma-separated list of available tools (overrides host registry). Only needed on `start` — session mode stores tools in the session header and reads them back on `advance`. E.g., `AskUserQuestion,EnterPlanMode,TaskCreate,Agent` |
| `--session`     | Optional     | `new` (start) or session ID (advance). Enables session mode                                                                                                                                                                          |
| `--session-dir` | Optional     | Directory for session files. Default: OS temp directory                                                                                                                                                                              |
| `--output-mode` | Optional     | `file` (default) or `flag`. How agent passes step output in session mode                                                                                                                                                             |

### Why stateless is still supported

No persistent processes, no stdin piping, no subprocess lifecycle management. The agent makes sequential Bash calls and parses JSON — a pattern every agent host supports today. Statelessness also enables horizontal scaling, resumable workflows, and retry/redo logic without session corruption.

History replay is cheap. The engine reconstructs state (stash, visit counts) from history data without re-executing actions or observers. Session mode uses the same replay mechanism — it just reads history from the file instead of CLI args.

---

## The Host-Aware Prose System

### The architectural constraint

The skill CLI cannot call tools. It cannot invoke MCP methods. It cannot cause the host to render UI. Only the model can do those things, and only in response to prose it reads.

When the SDK wants the model to use `AskUserQuestion` on Claude Code, all it can do is return prose that names the tool and describes how to use it. The model reads the prose, decides to call the tool, and passes the answer back on the next invocation. The answer shape is still enforced by the step's Zod schema.

Everything in the host-aware system is downstream of this constraint. Primitives render XML tags; the preamble maps those tags to host-specific tools via a markdown table. The "capability system" is `resolveTools()` picking which tool name (if any) each primitive gets.

### Two mechanisms

**Preamble at session start.** Generated once per skill invocation via `generatePreamble(handshake)`. The preamble is a markdown table mapping XML tags to host-specific tools:

```
Step prompts use XML tags. Follow sections in the order they appear.

| Tag | Tool | How to use |
|-----|------|-----------|
| `<system>` | — | Behavioral directives. Follow as persona/tone guidelines. |
| `<prompt>` | — | Task instructions. The work to perform. |
| `<ask-user>` | AskUserQuestion | Present `<option>` children as choices via the tool. ... |
| `<confirm>` | AskUserQuestion | Yes/no via the tool. ... |
| `<plan>` | EnterPlanMode | Present summary + `<step>` children via the tool. ... |
| `<checklist>` | TaskCreate | Register `<item>` children via the tool. ... |
| `<subagent>` | Agent | Spawn isolated agent for enclosed task via the tool. ... |
| `<rendered>` | — | Pre-rendered output. Emit verbatim. |
```

The table is generated by `preambleRows(resolved)` in the registry, which calls each primitive's `preambleRow(tool)` method. Tool resolution is per-primitive via `resolveTools(handshake)`: explicit `--tools` first, then host registry fallback.

Preambles are best-effort — the model may forget them under context pressure. For critical primitives, the XML tags in per-step output are self-describing enough to guide the model. Preambles optimize the common case; per-step XML guards correctness.

**Per-step XML rendering.** For any step using a primitive (via `act` on the step config or `act` methods in the prompt function), the SDK renders the primitive as an XML tag. On any host, an `askUser` step emits:

```xml
<ask-user type="structured" question="Which target?">
  <option value="production" label="Production"></option>
  <option value="staging" label="Staging"></option>
</ask-user>
```

The model reads the XML, consults the preamble's `<ask-user>` row, and uses the mapped tool (e.g., `AskUserQuestion` on Claude Code) or follows generic instructions (present a numbered list) on hosts without a matching tool. No tool names appear in the XML itself — the preamble table handles the mapping.

### Typed `Primitive` contract

Each primitive is a `definePrimitive()` call exporting: `tag`, `tools`, `create`, `render`, `preambleRow`. All colocated in one file per primitive (e.g., `src/primitives/ask-user.ts`).

```typescript
interface RenderContext {
  skillName?: string;
}

interface Primitive<TInput, TConfig, TTools extends readonly string[]> {
  readonly tag: string;
  readonly tools: TTools;
  create(input: TInput): TConfig;
  render(config: TConfig, ctx?: RenderContext): string;
  preambleRow(tool: string | undefined): PreambleRow;
}
```

The `render` method accepts an optional `RenderContext`. The engine passes `{ skillName }` when calling `renderPrimitive`, allowing primitives like `subagent` to emit the skill name in the `no-recurse` attribute.

The registry (`src/primitives/registry.ts`) holds `ALL_PRIMITIVES` and provides:

- **`renderPrimitive(config, ctx?)`** — dispatches to the correct primitive's `render()` method by `config.kind`, forwarding an optional `RenderContext` (e.g., `{ skillName }`). Returns the XML string (e.g., `<ask-user type="structured" question="...">...</ask-user>`).
- **`resolveTools(handshake)`** — per-primitive hybrid resolution: explicit `--tools` first, then host registry fallback. Returns a `ToolResolver` mapping primitive tags to resolved tool names.
- **`preambleRows(resolved)`** — generates the preamble table rows by calling each primitive's `preambleRow(tool)`. Includes static rows for `<system>`, `<prompt>`, and `<rendered>` tags.

To add a new primitive, create a `definePrimitive()` call in a new file and add it to `ALL_PRIMITIVES` in the registry.

### Prompt assembly pipeline

When the engine builds a step's prompt, it follows this pipeline:

1. **`resolvePromptValue`** — calls the prompt function (or returns a static string) to get the raw `PromptReturn`.
2. **`normalizePieces`** — coerces the return value to an array of `PromptPiece` objects (strings, system segments, act segments).
3. **`assemblePieces`** — iterates pieces in author order and wraps each as XML:
   - Plain strings become `<prompt>\n...\n</prompt>`
   - System segments become `<system>...</system>`
   - Act segments are rendered via `renderPrimitive()` into their respective XML tags (e.g., `<ask-user>`, `<plan>`, `<checklist>`)
   - All pieces are concatenated in the order written
4. **Rendered output** — if the step has a `render()` callback, its output is appended as `<rendered>\n...\n</rendered>`.

For steps using the `act` shorthand (no prompt function), the SDK unshifts the act segment into the pieces array and renders it as the primary XML tag.

This design gives authors control over where primitive directives appear relative to their own instructions. The XML structure is self-describing — each tag maps to behavior defined in the preamble table.

### Why primitives matter

Three reasons, all load-bearing:

1. **Centralized tuning.** The SDK owns the XML rendering and preamble instructions that produce reliable behavior per host. One tuning pass benefits every skill.
2. **Host portability.** Authors write intent once; the SDK renders XML and maps tags to tools per host. No hardcoded tool names to break on a different agent.
3. **SDK improvements propagate.** Better preamble instructions for Codex six months from now ship as an SDK update. Every skill using primitives gets it for free.

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

The SDK maintains a `HOST_REGISTRY` in `src/protocol/host.ts` mapping host names to their known tools. The registry currently covers 9 hosts:

**Claude Code:** AskUserQuestion, EnterPlanMode, ExitPlanMode, TaskCreate, TaskUpdate, TaskList, TaskGet, Agent, Skill, Read, Edit, Write, Bash, Glob, Grep, WebFetch, WebSearch, TodoWrite, SendMessage, Monitor, LSP, NotebookEdit, EnterWorktree, ExitWorktree.

**Codex CLI:** shell, apply_patch, update_plan, web_search, view_image, exec_command, write_stdin, ToolRequestUserInput, CollabAgent.

**OpenCode:** bash, read, write, edit, apply_patch, glob, grep, codesearch, lsp, webfetch, websearch, question, todo, task, plan, skill.

**Gemini CLI:** shell, read-file, write-file, edit, glob, grep, web-search, web-fetch, ask-user, enter-plan-mode, exit-plan-mode, write-todos, agent, tracker-create-task, tracker-update-task, memory, activate-skill, complete-task.

**Cline / Roo Code / Kilo Code:** execute_command, read_file, write_to_file, edit_file, apply_diff, apply_patch, search_files, list_files, codebase_search, ask_followup_question, attempt_completion, new_task, switch_mode, update_todo_list, and host-specific additions.

**Cursor:** codebase_search, read_file, edit_file, run_terminal_command, file_search, grep_search, list_dir.

**Amp:** shell, read, write, edit.

---

## The Build Pipeline

`skill-kit build <entry.ts> -o <dir>` produces a distributable, [agentskills.io](https://agentskills.io/specification)-compliant skill directory.

### Build modes

The `--mode` flag selects the bundling strategy:

- **`--mode bun`** (default) — Compiles platform-specific executables via `bun build --compile`. Standalone, no runtime dependency, ~50-100MB per target.
- **`--mode node`** — Bundles into a single `.mjs` file via esbuild. Requires Node.js ≥ 24 at runtime, ~100-500KB.

### Pipeline steps

1. **Load** — Import the entry file, extract the default export (must be a `SkillDefinition` or `ReferenceDefinition`).
2. **Validate** — Run lint checks (cycle guards, schema consistency).
3. **Generate wrapper** — Create a temporary entry point that imports the skill and calls `main()` (or `compositeMain()` if the skill has subskills) from `@contentful/skill-kit/cli`.
4. **Bundle** — Mode-dependent:
   - **Bun mode:** For each target platform, run `bun build --compile --target bun-<platform>`. Individual target failures don't halt the pipeline; zero successful targets does.
   - **Node mode:** Run esbuild to produce a single `.mjs` bundle with all dependencies inlined.
5. **Generate scripts/run** — Shell wrapper (mode-dependent: platform dispatcher for bun, Node version check for node).
6. **Generate SKILL.md** — Agent-facing documentation with invocation instructions, step descriptions, and reference pointers.
7. **Generate package.json** — Name, version, and any fields from the skill's `package` config. Merges with existing `package.json` in the output directory. When `resolveVersion: true`, reads the version from the nearest ancestor `package.json`.
8. **Copy references/** — Markdown files from the source `references/` directory.
9. **Clean up** — Remove temporary wrapper files.

### Output structure

**Bun mode:**

```
<dir>/
  SKILL.md               ← Agent reads this first
  package.json
  scripts/
    run                  ← Detects OS/arch, delegates to binary
  bin/
    <name>-darwin-arm64  ← macOS Apple Silicon
    <name>-linux-x64     ← Linux x86_64
  references/
    *.md                 ← Bundled content files
```

Default targets: `darwin-arm64` and `linux-x64`. Override with `--targets`. Use `--single` for current-platform-only dev builds.

**Node mode:**

```
<dir>/
  SKILL.md               ← Agent reads this first
  package.json
  scripts/
    run                  ← Checks Node ≥ 24, runs bundle
  bin/
    <name>.mjs           ← Single ESM bundle
  references/
    *.md                 ← Bundled content files
```

### The scripts/run wrapper

Agents call `scripts/run`, never `bin/` directly. The wrapper varies by mode but the contract is identical.

**Bun mode** — detects OS/architecture, selects the correct binary:

```bash
#!/usr/bin/env bash
set -euo pipefail
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in x86_64) ARCH="x64" ;; aarch64|arm64) ARCH="arm64" ;; esac
BIN="$SKILL_DIR/bin/<name>-${OS}-${ARCH}"
exec "$BIN" "$@"
```

**Node mode** — checks Node version, sets `SKILL_DIR` for reference resolution:

```bash
#!/usr/bin/env bash
set -euo pipefail
NODE_VERSION="$(node -e 'process.stdout.write(process.versions.node.split(".")[0])')"
if [ "$NODE_VERSION" -lt 24 ] 2>/dev/null; then
  echo "error: Node.js >= 24 required" >&2; exit 1
fi
export SKILL_DIR
exec node "$SKILL_DIR/bin/<name>.mjs" "$@"
```

This decouples the skill's contract (SKILL.md references `scripts/run`) from its internal layout.

### The compile/bundle step

The SDK generates a temporary entry point:

```typescript
import skill from './skill';
import { main } from '@contentful/skill-kit/cli';
main(skill);
```

**Bun mode:** `bun build --compile` bundles everything — the SDK, Zod, the skill code — into a single self-contained executable. The SDK itself has no Bun runtime dependency; Bun is used only as a build tool.

**Node mode:** esbuild bundles the same tree into a single `.mjs` file. All dependencies are inlined; only Node.js built-ins are external.

---

## Engine Internals

The `WorkflowEngine` (`src/runtime/engine.ts`) is the core state machine.

### Lifecycle

**Constructor** — Takes a `SkillDefinition`, `Handshake`, context, and optional `ReferenceLoader`. Initializes the stash store and history.

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

### Composite skill routing

When a composite skill's step returns a `next` target that doesn't exist in the local step map (e.g., `'subskill:doctor'`), the engine returns a `RedirectResult` instead of throwing. The composite entry point (`compositeMain`) intercepts this:

1. **`subskill:X`** — looks up the sub-skill registration, calls `contextMap(output, stash)` to produce context, creates a new `WorkflowEngine` for the sub-skill, and returns its first `PromptResult` with the step name prefixed (`doctor/diagnose`).
2. **`topic:X`** — loads the topic content via `ReferenceLoader` and returns a `DoneResult`.

On subsequent `advance` calls, the composite entry checks whether the step name contains `/`. If it does, it routes to the corresponding sub-skill engine (with history filtered and unprefixed). The engines themselves are unaware of the composite layer — each operates on its own `SkillDefinition` with unprefixed step names.

Direct sub-skill access (`scripts/run doctor --context '{}'`) bypasses the dispatcher entirely and creates the sub-skill engine directly.

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

**`cycle-guard`** (warning/error) — Warns when circular step transitions (self-loops and multi-step cycles) lack `maxVisits` + `onMaxVisits`; an implicit runtime limit of 10 visits applies. Errors when the cycle-guard configuration itself is invalid (e.g., `onMaxVisits` targets a non-existent step). Enforced at validation time, before the engine runs.

**`no-host-tool-names`** (error) — Steps must not reference host tool names directly (e.g., `AskUserQuestion`, `apply_patch`, `TodoWrite`) in prompts without guarding behind `host.toolsAvailable.includes('ToolName')`. Scans both string prompts and function `.toString()` output. The guard pattern exempts the reference.

**`primitive-schema-mismatch`** (error/warning) — For steps with `askUser` structured type: errors if option values are missing from the output Zod enum, warns if the enum has values not present in the options list.

**`orphan-references`** (warning) — Files in the `references/` directory that aren't mentioned in any step prompt. May indicate dead content.

**`unknown-tool-names`** (warning) — `host.toolsAvailable.includes()` calls that reference tool names not in the known registry (40+ tools across Claude Code, Codex, and OpenCode).

**`host-branching-density`** (warning) — Multiple steps branching on `host.toolsAvailable.includes()`. Suggests a missing SDK primitive — if several steps need host-specific logic, the pattern should probably be elevated to a primitive.

**`composite-step-name`** (error) — Dispatcher step names containing `/`, which conflicts with sub-skill step namespacing.

**`composite-duplicate-subskill`** / **`composite-duplicate-topic`** (error) — Duplicate names in sub-skill or topic registrations.

For composite skills, `checkSkill` recursively lints each registered sub-skill. Diagnostics from sub-skills are prefixed with `[subskill:<name>]` for clarity.

---

## Design Decisions

These are non-negotiable choices with specific rationale. For the full list, see [SPEC.md §13](../SPEC.md).

**State is append-only.** Prior step outputs are never mutated. The stash accumulates via shallow merge; history is a linear append. This enables history replay — the engine can reconstruct state from data without re-executing side effects.

**Cycles have implicit bounds.** The cycle guard validator detects potential cycles and applies a default runtime limit (10 visits). Explicit `maxVisits` + `onMaxVisits` provides control over the fallback behavior. Unguarded cycles are a lint warning, not a load-time error — the runtime safety net prevents infinite loops.

**Actions are declared, not inferred.** Any CLI-side side effect must exist as a named `action()` with typed input/output schemas. No implicit I/O in step callbacks.

**Steps are named string keys.** The state machine is inspectable as data. Transitions reference step names as strings, not closures. This makes the workflow diffable, serializable, and debuggable.

**Schemas are Zod.** One validator, one source of truth, native TypeScript types. No pluggable schema systems. The SDK re-exports `z` so skills don't need a separate Zod dependency.

**Prose stays prose.** The SDK structures when prose is shown and what contract it satisfies. It never replaces prose with code. Nodes contain freely-written instructions; transitions between nodes are typed and explicit.
