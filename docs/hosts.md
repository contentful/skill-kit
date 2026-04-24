# Agent Host Capability Reference

This document is the authoritative reference for all surveyed agent hosts, their tools, and how they map to skill-kit primitives. It informs the `HOST_REGISTRY` in `src/protocol/host.ts` and the `CAPABILITY_MAP` in `src/primitives/prose/index.ts`.

**Last updated:** 2026-04-24

---

## Primitive ↔ Tool Name Mapping

This is the canonical mapping used by the prose resolver. For each SDK primitive, the table lists every known tool name that triggers tool-specific prose. Order matters — first match wins.

| Primitive     | Tool name               | Host(s)                    | Prose file                            |
| ------------- | ----------------------- | -------------------------- | ------------------------------------- |
| **askUser**   | `AskUserQuestion`       | Claude Code                | `ask-user/ask-user-question.ts`       |
|               | `ToolRequestUserInput`  | Codex                      | `ask-user/tool-request-user-input.ts` |
|               | `ask_followup_question` | Cline, Roo Code, Kilo Code | `ask-user/ask-followup-question.ts`   |
|               | `ask-user`              | Gemini CLI                 | `ask-user/ask-user-tool.ts`           |
|               | `question`              | OpenCode                   | `ask-user/question-tool.ts`           |
| **confirm**   | `AskUserQuestion`       | Claude Code                | `confirm/ask-user-question.ts`        |
|               | `ask_followup_question` | Cline, Roo Code, Kilo Code | `confirm/ask-followup-question.ts`    |
| **plan**      | `EnterPlanMode`         | Claude Code                | `plan/enter-plan-mode.ts`             |
|               | `enter-plan-mode`       | Gemini CLI                 | `plan/enter-plan-mode.ts`             |
|               | `update_plan`           | Codex                      | `plan/update-plan.ts`                 |
|               | `plan`                  | OpenCode                   | `plan/plan-tool.ts`                   |
|               | `PLAN_MODE`             | Cline                      | `plan/plan-mode-toggle.ts`            |
| **checklist** | `TaskCreate`            | Claude Code                | `checklist/task-create.ts`            |
|               | `tracker-create-task`   | Gemini CLI                 | `checklist/tracker.ts`                |
|               | `write-todos`           | Gemini CLI                 | `checklist/todo-tool.ts`              |
|               | `todo`                  | OpenCode                   | `checklist/todo-tool.ts`              |
|               | `update_todo_list`      | Cline, Roo Code, Kilo Code | `checklist/update-todo-list.ts`       |
| **subagent**  | `Agent`                 | Claude Code                | `subagent/agent-tool.ts`              |
|               | `agent`                 | Gemini CLI                 | `subagent/agent-tool.ts`              |
|               | `CollabAgent`           | Codex                      | `subagent/collab-agent.ts`            |
|               | `task`                  | OpenCode                   | `subagent/task-tool.ts`               |
|               | `USE_SUBAGENTS`         | Cline                      | `subagent/use-subagents.ts`           |
|               | `new_task`              | Roo Code, Kilo Code        | `subagent/new-task.ts`                |

---

## Cross-Agent Capability Matrix

| Capability           | Claude Code | Codex | OpenCode | Gemini CLI | Cline | Roo Code | Kilo Code | Cursor |  Amp  |
| -------------------- | :---------: | :---: | :------: | :--------: | :---: | :------: | :-------: | :----: | :---: |
| Structured questions |     Yes     |  Yes  |  Likely  |   Likely   |  Yes  |   Yes    |    Yes    |   No   |  No   |
| Plan mode            |     Yes     |  No   |   Yes    |    Yes     |  Yes  |  Yes\*   |   Yes\*   |   No   | Yes\* |
| Todo/checklist       |     Yes     |  No   |   Yes    |    Yes     |  Yes  |   Yes    |    Yes    |   No   |  No   |
| Sub-agents           |     Yes     |  Yes  |   Yes    |    Yes     |  Yes  | Partial  |  Partial  |   No   |  Yes  |
| Web search           |     Yes     |  Yes  |   Yes    |    Yes     |  Yes  |    No    |    No     |  Yes   |  No   |
| MCP support          |     Yes     |  Yes  |    ?     |    Yes     |  Yes  |   Yes    |    Yes    |  Yes   |  Yes  |

\* Roo/Kilo have "modes" (Architect, etc.) rather than a dedicated plan tool. Amp has "Deep Mode."

---

## Per-Agent Detail

### Claude Code

**Source:** Official tools reference, tool schema inspection  
**Confidence:** High (verified from source/docs)

**Full tool list:**
`AskUserQuestion`, `EnterPlanMode`, `ExitPlanMode`, `TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet`, `Agent`, `Skill`, `Read`, `Edit`, `Write`, `Bash`, `Glob`, `Grep`, `WebFetch`, `WebSearch`, `TodoWrite`, `SendMessage`, `Monitor`, `LSP`, `NotebookEdit`, `EnterWorktree`, `ExitWorktree`

**Primitive mapping:**

| Primitive | Tool                           | Notes                                                                         |
| --------- | ------------------------------ | ----------------------------------------------------------------------------- |
| askUser   | `AskUserQuestion`              | Supports `header`, `preview`, multi-question batching (up to 4), multiSelect  |
| confirm   | `AskUserQuestion`              | Same tool, options fixed to Yes/No                                            |
| plan      | `EnterPlanMode`/`ExitPlanMode` | Puts agent into read-only exploration mode                                    |
| checklist | `TaskCreate`/`TaskUpdate`      | Visible task list with status tracking                                        |
| subagent  | `Agent`                        | Real context isolation, built-in agent types (Explore, Plan, general-purpose) |

**Skipped tools (not mapped to primitives):**

| Tool                                            | Reason                                                   |
| ----------------------------------------------- | -------------------------------------------------------- |
| `Read`, `Edit`, `Write`, `Bash`, `Glob`, `Grep` | File/shell ops — model picks correctly from plain intent |
| `WebFetch`, `WebSearch`                         | Web ops — model picks correctly                          |
| `Skill`                                         | Meta — invokes other skills, not a workflow primitive    |
| `TodoWrite`                                     | Legacy session checklist, superseded by TaskCreate       |
| `SendMessage`, `Monitor`                        | Agent coordination — too specialized                     |
| `LSP`, `NotebookEdit`                           | IDE integration — too specialized                        |
| `EnterWorktree`, `ExitWorktree`                 | Git worktrees — too specialized                          |

---

### Codex (OpenAI)

**Source:** GitHub `openai/codex`, source code analysis  
**Confidence:** Medium (inferred from source)

**Full tool list:**
`shell`, `apply_patch`, `update_plan`, `web_search`, `view_image`, `exec_command`, `write_stdin`, `ToolRequestUserInput`, `CollabAgent`

**Primitive mapping:**

| Primitive | Tool                   | Notes                                                                              |
| --------- | ---------------------- | ---------------------------------------------------------------------------------- |
| askUser   | `ToolRequestUserInput` | Supports `options` array, `isOther` for open-ended, `isSecret` for sensitive input |
| confirm   | (generic)              | No dedicated confirm — falls back to generic prose                                 |
| plan      | `update_plan`          | Checklist-style plan presentation                                                  |
| checklist | (generic)              | `update_plan` could serve, but it's mapped to plan                                 |
| subagent  | `CollabAgent`          | Full lifecycle: spawnAgent, sendInput, resumeAgent, wait, closeAgent               |

**Skipped tools:**

| Tool                                        | Reason          |
| ------------------------------------------- | --------------- |
| `shell`, `apply_patch`                      | File/shell ops  |
| `web_search`                                | Web ops         |
| `view_image`, `exec_command`, `write_stdin` | Specialized I/O |

---

### OpenCode (sst/opencode)

**Source:** GitHub `sst/opencode`, tool directory listing  
**Confidence:** Medium (verified tool names from source; some parameter details unknown)

**Full tool list:**
`bash`, `read`, `write`, `edit`, `apply_patch`, `glob`, `grep`, `codesearch`, `lsp`, `webfetch`, `websearch`, `question`, `todo`, `task`, `plan`, `skill`

**Primitive mapping:**

| Primitive | Tool       | Notes                                          |
| --------- | ---------- | ---------------------------------------------- |
| askUser   | `question` | Parameters not fully documented                |
| confirm   | (generic)  | No dedicated confirm tool                      |
| plan      | `plan`     | Dedicated planning tool                        |
| checklist | `todo`     | Todo list management                           |
| subagent  | `task`     | Spawns sub-agent; also has `@general` subagent |

**Skipped tools:**

| Tool                                                           | Reason                              |
| -------------------------------------------------------------- | ----------------------------------- |
| `bash`, `read`, `write`, `edit`, `apply_patch`, `glob`, `grep` | File/shell ops                      |
| `codesearch`                                                   | Code search — model picks correctly |
| `lsp`                                                          | IDE integration                     |
| `webfetch`, `websearch`                                        | Web ops                             |
| `skill`                                                        | Meta                                |

---

### Gemini CLI (Google)

**Source:** GitHub `google-gemini/gemini-cli`, `packages/core/src/tools/tool-names.ts`  
**Confidence:** High (verified from source code)

**Full tool list:**
`shell`, `read-file`, `read-many-files`, `write-file`, `edit`, `glob`, `grep`, `ls`, `web-search`, `web-fetch`, `ask-user`, `enter-plan-mode`, `exit-plan-mode`, `write-todos`, `agent`, `tracker-create-task`, `tracker-update-task`, `tracker-list-tasks`, `tracker-get-task`, `memory`, `activate-skill`, `complete-task`

**Primitive mapping:**

| Primitive | Tool                                        | Notes                                                 |
| --------- | ------------------------------------------- | ----------------------------------------------------- |
| askUser   | `ask-user`                                  | Parameters not fully documented                       |
| confirm   | (generic)                                   | No dedicated confirm                                  |
| plan      | `enter-plan-mode`/`exit-plan-mode`          | Same semantics as Claude Code's EnterPlanMode         |
| checklist | `tracker-create-task`/`tracker-update-task` | Full task tracker with dependencies and visualization |
| subagent  | `agent`                                     | Sub-agent spawning                                    |

**Skipped tools:**

| Tool                                                                                | Reason                                                    |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `shell`, `read-file`, `read-many-files`, `write-file`, `edit`, `glob`, `grep`, `ls` | File/shell ops                                            |
| `web-search`, `web-fetch`                                                           | Web ops                                                   |
| `write-todos`                                                                       | Alternative to tracker — mapped as fallback for checklist |
| `memory`                                                                            | Cross-session persistence — not a workflow primitive      |
| `activate-skill`, `complete-task`                                                   | Meta/lifecycle                                            |
| `tracker-list-tasks`, `tracker-get-task`                                            | Read ops for tracker                                      |

---

### Cline

**Source:** GitHub `cline/cline`, `src/shared/tools.ts`  
**Confidence:** High (verified from source code)

**Full tool list:**
`execute_command`, `read_file`, `write_to_file`, `edit_file`, `apply_diff`, `apply_patch`, `search_files`, `list_files`, `codebase_search`, `browser_action`, `ask_followup_question`, `attempt_completion`, `new_task`, `switch_mode`, `update_todo_list`, `WEB_SEARCH`, `WEB_FETCH`, `PLAN_MODE`, `ACT_MODE`, `USE_SUBAGENTS`

**Primitive mapping:**

| Primitive | Tool                    | Notes                                                  |
| --------- | ----------------------- | ------------------------------------------------------ |
| askUser   | `ask_followup_question` | Supports 2-4 suggested responses; user can type freely |
| confirm   | `ask_followup_question` | Same tool, 2 options: Yes/No                           |
| plan      | `PLAN_MODE`/`ACT_MODE`  | Toggle between planning and acting                     |
| checklist | `update_todo_list`      | Markdown checklist                                     |
| subagent  | `USE_SUBAGENTS`         | Sub-agent spawning                                     |

**Skipped tools:**

| Tool                                                                                      | Reason                                                  |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `execute_command`, `read_file`, `write_to_file`, `edit_file`, `apply_diff`, `apply_patch` | File/shell ops                                          |
| `search_files`, `list_files`, `codebase_search`                                           | Search ops                                              |
| `browser_action`                                                                          | Browser automation — 3/13 adoption, too specialized     |
| `attempt_completion`                                                                      | Task lifecycle — agent-internal                         |
| `new_task`                                                                                | Used for subagent on Roo/Kilo; Cline uses USE_SUBAGENTS |
| `switch_mode`                                                                             | Agent mode management                                   |
| `WEB_SEARCH`, `WEB_FETCH`                                                                 | Web ops                                                 |

---

### Roo Code

**Source:** GitHub `RooVetGit/Roo-Code`, native-tools directory  
**Confidence:** High (verified from source code)

**Full tool list:**
`execute_command`, `read_file`, `write_to_file`, `edit_file`, `apply_diff`, `apply_patch`, `search_replace`, `search_files`, `list_files`, `codebase_search`, `ask_followup_question`, `attempt_completion`, `new_task`, `switch_mode`, `update_todo_list`, `access_mcp_resource`, `skill`

**Primitive mapping:**

| Primitive | Tool                    | Notes                                                            |
| --------- | ----------------------- | ---------------------------------------------------------------- |
| askUser   | `ask_followup_question` | 2-4 suggested responses with optional mode-switch slug           |
| confirm   | `ask_followup_question` | Same as Cline                                                    |
| plan      | (generic)               | Uses Architect Mode via `switch_mode`, not a dedicated plan tool |
| checklist | `update_todo_list`      | Markdown checklist; `new_task` accepts initial `todos` parameter |
| subagent  | `new_task`              | Creates tasks in different modes (not true parallel sub-agents)  |

**Skipped tools:**

| Tool                                                                                                        | Reason                |
| ----------------------------------------------------------------------------------------------------------- | --------------------- |
| `execute_command`, `read_file`, `write_to_file`, `edit_file`, `apply_diff`, `apply_patch`, `search_replace` | File/shell ops        |
| `search_files`, `list_files`, `codebase_search`                                                             | Search ops            |
| `attempt_completion`                                                                                        | Task lifecycle        |
| `switch_mode`                                                                                               | Agent mode management |
| `access_mcp_resource`                                                                                       | MCP access            |
| `skill`                                                                                                     | Meta                  |

---

### Kilo Code

**Source:** GitHub `Kilo-Org/kilocode-legacy`, kilo.ai website  
**Confidence:** Medium (fork of Cline/Roo Code lineage)

**Full tool list:**
`execute_command`, `read_file`, `write_to_file`, `edit_file`, `fast_edit_file`, `apply_diff`, `apply_patch`, `delete_file`, `search_and_replace`, `search_files`, `list_files`, `codebase_search`, `browser_action`, `ask_followup_question`, `attempt_completion`, `new_task`, `switch_mode`, `update_todo_list`, `access_mcp_resource`

**Primitive mapping:** Same as Roo Code (shared lineage).

**Unique tools (skipped):**

| Tool             | Reason                                                    |
| ---------------- | --------------------------------------------------------- |
| `fast_edit_file` | Optimized editing — file ops                              |
| `delete_file`    | File ops (unique: most agents don't have explicit delete) |
| `browser_action` | Browser automation — too specialized                      |

---

### Cursor

**Source:** Cursor docs at cursor.com/docs  
**Confidence:** Medium (docs only, not verified from source)

**Full tool list:**
`codebase_search`, `read_file`, `edit_file`, `run_terminal_command`, `file_search`, `grep_search`, `list_dir`

**Primitive mapping:** All generic fallback — Cursor has no structured question, plan, checklist, or subagent tools.

**Notes:** Cursor has MCP support and can ask clarifying questions conversationally, but does not expose these as named tools that the SDK can detect. Skills on Cursor get fully generic prose.

---

### Amp (Sourcegraph)

**Source:** ampcode.com website, blog posts  
**Confidence:** Low (limited documentation)

**Full tool list:**
`shell`, `read`, `write`, `edit`

**Primitive mapping:** All generic fallback — documented tool list is minimal. Amp has sub-agents (Librarian, Code Review Agent) and "Deep Mode" for planning, but these aren't exposed as named tools.

**Notes:** Amp has a Skills system and thread management, but the tool-level API is not well documented.

---

## Agents Not in Registry (Tier 3)

These agents were surveyed but are not in `HOST_REGISTRY` because their tool lists couldn't be reliably verified or they contribute no primitive-relevant tools beyond generic fallback.

### Windsurf / Codeium

**Confidence:** Low (docs only)

Has todo lists and a planning agent, but no documented tool names. MCP support confirmed.

### GitHub Copilot Coding Agent

**Confidence:** Low (docs only)

Has Plan/Ask/Agent modes and MCP support. No documented structured question tool. Background and cloud agents exist but not as named tools.

### Amazon Q Developer / Kiro

**Confidence:** Low

Amazon Q CLI is deprecated in favor of Kiro. Kiro adds spec-driven development, agent hooks, and MCP. No documented tool names available.

### Aider

**Confidence:** Medium

Aider uses a fundamentally different model — file editing through its own edit format (whole-file, diff, architect mode), not through named tools. Has `/web` for URL scraping, `/run` for shell. No structured questions, no task lists, no sub-agents.

---

## Design Decisions

### Why we don't abstract file/shell/search ops

From SPEC.md §14: "If the model already picks the right tool given plain intent, don't add an abstraction." Every agent has file read/write/edit and shell commands. The model dispatches correctly from prose like "open `src/foo.ts`" or "run the tests." No SDK primitive needed.

### Why we don't abstract browser automation

Only 3/13 agents support it (Cursor, Cline, Kilo Code). Too host-specific for a workflow primitive. Use the escape hatch (`host.toolsAvailable.includes('browser_action')`) for skills that need it.

### Why we don't abstract memory/persistence

Only 2/13 agents have a memory tool (Claude Code, Gemini CLI). Cross-session persistence is a host capability, not a workflow primitive. Within-session state is handled by the stash.

### Why we don't abstract web search/fetch

7-8/13 agents support web search, but the model already picks the right tool from prose. Not worth a primitive.

### Why confirm is separate from askUser

Despite both using the same underlying tool on many hosts, `confirm` has distinct semantics: destructive-op warnings, binary-only responses, default-to-no on ambiguity. Keeping it separate lets the SDK tune confirmation prose independently.
