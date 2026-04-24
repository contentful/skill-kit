# Agent Host Reference

Objective inventory of every agent surveyed, their complete tool lists, capabilities, and known parameters. This is a standalone reference — useful whether or not you're building skill-kit primitives.

The final section covers how the SDK maps these tools to its primitives.

**Last updated:** 2026-04-24

---

## 1. Claude Code (Anthropic CLI)

**Source:** Official tools reference at `code.claude.com/docs/en/tools-reference`, tool schema inspection
**Confidence:** High

### Complete Tool List

| Tool                   | Description                                                                                                                                                                                                                                                          | Requires permission |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-----------------: |
| `Read`                 | Reads file contents                                                                                                                                                                                                                                                  |         No          |
| `Write`                | Creates or overwrites files                                                                                                                                                                                                                                          |         Yes         |
| `Edit`                 | Makes targeted edits to specific files                                                                                                                                                                                                                               |         Yes         |
| `Bash`                 | Executes shell commands                                                                                                                                                                                                                                              |         Yes         |
| `PowerShell`           | Executes PowerShell commands natively (Windows, opt-in elsewhere)                                                                                                                                                                                                    |         Yes         |
| `Agent`                | Spawns a subagent with its own context window. Built-in types: Explore (read-only, Haiku), Plan (read-only), general-purpose (all tools)                                                                                                                             |         No          |
| `AskUserQuestion`      | Asks multiple-choice questions. Supports `header` (chip label, max 12 chars), `preview` (rendered markdown for visual comparison), multi-question batching (up to 4), `multiSelect`. User always has an implicit "Other" free-text option. 2–4 options per question. |         No          |
| `TodoWrite`            | Manages session task checklist (non-interactive / Agent SDK mode)                                                                                                                                                                                                    |         No          |
| `TaskCreate`           | Creates a new task in the interactive task list                                                                                                                                                                                                                      |         No          |
| `TaskGet`              | Retrieves full details for a specific task                                                                                                                                                                                                                           |         No          |
| `TaskList`             | Lists all tasks with their current status                                                                                                                                                                                                                            |         No          |
| `TaskUpdate`           | Updates task status, dependencies, details, or deletes tasks                                                                                                                                                                                                         |         No          |
| `TaskStop`             | Kills a running background task                                                                                                                                                                                                                                      |         No          |
| `TaskOutput`           | (Deprecated) Retrieves output from a background task                                                                                                                                                                                                                 |         No          |
| `WebFetch`             | Fetches content from a specified URL                                                                                                                                                                                                                                 |         Yes         |
| `WebSearch`            | Performs web searches                                                                                                                                                                                                                                                |         Yes         |
| `Glob`                 | Finds files based on pattern matching                                                                                                                                                                                                                                |         No          |
| `Grep`                 | Searches for patterns in file contents                                                                                                                                                                                                                               |         No          |
| `LSP`                  | Code intelligence via language servers (definitions, references, type errors)                                                                                                                                                                                        |         No          |
| `NotebookEdit`         | Modifies Jupyter notebook cells                                                                                                                                                                                                                                      |         Yes         |
| `Monitor`              | Runs a background command and feeds output lines back in real-time                                                                                                                                                                                                   |         Yes         |
| `Skill`                | Executes a skill (reusable prompt-based workflow)                                                                                                                                                                                                                    |         Yes         |
| `ToolSearch`           | Searches for and loads deferred tools (MCP tool discovery)                                                                                                                                                                                                           |         No          |
| `EnterPlanMode`        | Switches to plan mode — agent enters read-only exploration phase                                                                                                                                                                                                     |         No          |
| `ExitPlanMode`         | Presents plan for approval and exits plan mode                                                                                                                                                                                                                       |         Yes         |
| `EnterWorktree`        | Creates/switches to an isolated git worktree                                                                                                                                                                                                                         |         No          |
| `ExitWorktree`         | Exits a worktree session and returns to original directory                                                                                                                                                                                                           |         No          |
| `CronCreate`           | Schedules a recurring or one-shot prompt within the session                                                                                                                                                                                                          |         No          |
| `CronDelete`           | Cancels a scheduled task by ID                                                                                                                                                                                                                                       |         No          |
| `CronList`             | Lists all scheduled tasks in the session                                                                                                                                                                                                                             |         No          |
| `SendMessage`          | Sends message to agent team teammate or resumes a subagent (experimental)                                                                                                                                                                                            |         No          |
| `TeamCreate`           | Creates an agent team with multiple teammates (experimental)                                                                                                                                                                                                         |         No          |
| `TeamDelete`           | Disbands an agent team (experimental)                                                                                                                                                                                                                                |         No          |
| `ListMcpResourcesTool` | Lists resources exposed by connected MCP servers                                                                                                                                                                                                                     |         No          |
| `ReadMcpResourceTool`  | Reads a specific MCP resource by URI                                                                                                                                                                                                                                 |         No          |

### Capabilities

| Capability           |                                                                                                                                                   Supported                                                                                                                                                   | Details                                                                                         |
| -------------------- | :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | ----------------------------------------------------------------------------------------------- |
| Structured questions |                                                                                                                                                      Yes                                                                                                                                                      | `AskUserQuestion` — multiple-choice with previews                                               |
| Free-form questions  |                                                                                                                                                      Yes                                                                                                                                                      | Via natural conversation or `AskUserQuestion` with "Other"                                      |
| Task/todo list       |                                                                                                                                                      Yes                                                                                                                                                      | `TaskCreate`/`TaskUpdate`/`TaskList`/`TaskGet` (interactive); `TodoWrite` (non-interactive/SDK) |
| Sub-agents           |                                                                                                                                                      Yes                                                                                                                                                      | `Agent` tool — own context window. Built-in: Explore, Plan, general-purpose                     |
| Agent teams          |                                                                                                                                                      Yes                                                                                                                                                      | `TeamCreate`/`SendMessage`/`TeamDelete` — parallel across sessions (experimental)               |
| Plan mode            |                                                                                                                                                      Yes                                                                                                                                                      | `EnterPlanMode`/`ExitPlanMode` — read-only exploration then approval                            |
| File CRUD            |                                                                                                                                                      Yes                                                                                                                                                      | `Read`, `Write`, `Edit`                                                                         |
| Shell                |                                                                                                                                                      Yes                                                                                                                                                      | `Bash`, `PowerShell`                                                                            |
| Web search           |                                                                                                                                                      Yes                                                                                                                                                      | `WebSearch`                                                                                     |
| URL fetch            |                                                                                                                                                      Yes                                                                                                                                                      | `WebFetch`                                                                                      |
| MCP                  |                                                                                                                                                      Yes                                                                                                                                                      | `ListMcpResourcesTool`, `ReadMcpResourceTool`, `ToolSearch` for deferred MCP tools              |
| Unique               | `Monitor` (background process watching), `LSP` (language server), `NotebookEdit`, `EnterWorktree`/`ExitWorktree` (git worktrees), `CronCreate`/`CronDelete`/`CronList` (scheduled tasks), `Skill` (skill invocation), Hooks (shell commands before/after tool execution), CLAUDE.md (persistent instructions) |

---

## 2. OpenCode (sst/opencode)

**Source:** GitHub `sst/opencode`, tool directory listing
**Confidence:** Medium (tool names verified from source; parameter details sparse)

### Complete Tool List

| Tool          | Description                                                                       |
| ------------- | --------------------------------------------------------------------------------- |
| `read`        | Read file contents                                                                |
| `write`       | Write/create files                                                                |
| `edit`        | Edit existing files                                                               |
| `bash`        | Execute shell commands                                                            |
| `grep`        | Search text in files                                                              |
| `glob`        | File pattern matching                                                             |
| `codesearch`  | Code search functionality                                                         |
| `lsp`         | Language Server Protocol integration                                              |
| `webfetch`    | Fetch web content                                                                 |
| `websearch`   | Web search                                                                        |
| `question`    | Ask user questions (parameter schema not documented)                              |
| `todo`        | Todo list management                                                              |
| `task`        | Task/sub-agent management; also has `@general` subagent for complex tasks         |
| `plan`        | Planning workflow tool; also has a dedicated Plan agent (read-only analysis mode) |
| `skill`       | Skill execution                                                                   |
| `apply_patch` | Apply patches to files                                                            |
| `truncate`    | Content truncation                                                                |

### Capabilities

| Capability           |                                                              Supported                                                               | Details                                              |
| -------------------- | :----------------------------------------------------------------------------------------------------------------------------------: | ---------------------------------------------------- |
| Structured questions |                                                                Likely                                                                | `question` tool exists but parameters not documented |
| Free-form questions  |                                                                 Yes                                                                  | `question` tool                                      |
| Task/todo list       |                                                                 Yes                                                                  | `todo` tool                                          |
| Sub-agents           |                                                                 Yes                                                                  | `task` tool; also `@general` subagent                |
| Plan mode            |                                                                 Yes                                                                  | `plan` tool; dedicated Plan agent                    |
| File CRUD            |                                                                 Yes                                                                  | `read`, `write`, `edit`                              |
| Shell                |                                                                 Yes                                                                  | `bash`                                               |
| Web search           |                                                                 Yes                                                                  | `websearch`                                          |
| URL fetch            |                                                                 Yes                                                                  | `webfetch`                                           |
| MCP                  |                                                             Unconfirmed                                                              | Architecture suggests extensibility                  |
| Unique               | LSP integration, client/server architecture enabling remote operation, multi-provider support (Claude, OpenAI, Google, local models) |

---

## 3. Cursor (AI Code Editor)

**Source:** Cursor docs at `cursor.com/docs/agent` and `cursor.com/docs/mcp`
**Confidence:** Medium (docs only, not verified from source)

### Tools/Capabilities

| Tool/Capability          | Description                                                           |
| ------------------------ | --------------------------------------------------------------------- |
| `codebase_search`        | Semantic search of indexed codebase                                   |
| `read_file`              | Read file contents including images (png, jpg, gif, webp, svg)        |
| `edit_file`              | Edit and create files with automatic diff application                 |
| `run_terminal_command`   | Run terminal commands and monitor output                              |
| `file_search`            | Search files and folders by name                                      |
| `grep_search`            | Search file contents by pattern                                       |
| `list_dir`               | Read directory structures                                             |
| Browser control          | Take screenshots, navigate, interact with elements (experimental)     |
| Web search               | Search the web for information                                        |
| Fetch Rules              | Retrieve specific rules by type/description                           |
| Image generation         | Generate images from text descriptions                                |
| Ask clarifying questions | Ask questions during tasks (conversational, not structured tool call) |
| Checkpoints              | Automatic snapshots before significant changes                        |
| Queued messages          | Stack multiple prompts for sequential execution                       |

### Capabilities

| Capability           |                                                                                                       Supported                                                                                                       | Details                                                                                                                                 |
| -------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | --------------------------------------------------------------------------------------------------------------------------------------- |
| Structured questions |                                                                                                        Limited                                                                                                        | Can ask clarifying questions conversationally, but not structured multi-choice as a tool call                                           |
| Free-form questions  |                                                                                                          Yes                                                                                                          | Conversational                                                                                                                          |
| Task/todo list       |                                                                                                          No                                                                                                           | Not documented                                                                                                                          |
| Sub-agents           |                                                                                                          No                                                                                                           | Not documented as tool-level sub-agents                                                                                                 |
| Plan mode            |                                                                                                          No                                                                                                           | Has "Plan" as a chat persona toggle, not a tool                                                                                         |
| File CRUD            |                                                                                                          Yes                                                                                                          | Full file editing, reading, creating                                                                                                    |
| Shell                |                                                                                                          Yes                                                                                                          | Terminal command execution                                                                                                              |
| Web search           |                                                                                                          Yes                                                                                                          | Built-in                                                                                                                                |
| URL fetch            |                                                                                                          Yes                                                                                                          | `#fetch` context mention                                                                                                                |
| MCP                  |                                                                                                          Yes                                                                                                          | Full MCP support (Tools, Prompts, Resources, Roots, Elicitation, Apps). STDIO, SSE, Streamable HTTP. One-click install from marketplace |
| Unique               | Browser element selection, image generation, Checkpoints (automatic snapshots), queued messages, `@` context mentions (#codebase, #terminalSelection, #fetch, etc.), Cursor Rules (.cursor/rules/), background agents |

---

## 4. Windsurf / Codeium (Cascade)

**Source:** Windsurf docs at `docs.windsurf.com/windsurf/cascade`
**Confidence:** Low (docs only, no tool names exposed)

### Tools/Capabilities

| Capability         | Description                                                        |
| ------------------ | ------------------------------------------------------------------ |
| Web Search         | Search the web                                                     |
| Terminal Access    | Execute shell commands                                             |
| File Operations    | Create, modify, and manage codebase files                          |
| MCP Servers        | Extend capabilities through MCP integrations                       |
| Linter Integration | Automatically fixes linting errors on generated code               |
| Package Management | Detects and installs packages automatically                        |
| Todo Lists         | Tracks complex task progress with user-editable plans              |
| Planning Agent     | Specialized planning agent continuously refines the long-term plan |

### Capabilities

| Capability           |                                                                                                                                        Supported                                                                                                                                         | Details                                                                |
| -------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | ---------------------------------------------------------------------- |
| Structured questions |                                                                                                                                            No                                                                                                                                            | Not documented                                                         |
| Free-form questions  |                                                                                                                                           Yes                                                                                                                                            | Conversational                                                         |
| Task/todo list       |                                                                                                                                           Yes                                                                                                                                            | "Todo Lists: Tracks complex task progress with user-editable plans"    |
| Sub-agents           |                                                                                                                                            No                                                                                                                                            | Not documented                                                         |
| Plan mode            |                                                                                                                                           Yes                                                                                                                                            | "A specialized planning agent continuously refines the long-term plan" |
| File CRUD            |                                                                                                                                           Yes                                                                                                                                            | Full file operations                                                   |
| Shell                |                                                                                                                                           Yes                                                                                                                                            | Terminal access                                                        |
| Web search           |                                                                                                                                           Yes                                                                                                                                            | Built-in                                                               |
| URL fetch            |                                                                                                                                       Unconfirmed                                                                                                                                        | Not documented separately from web search                              |
| MCP                  |                                                                                                                                           Yes                                                                                                                                            | MCP server support                                                     |
| Unique               | Dual modes (Code vs Chat), "Flows" (real-time user action awareness), Checkpoints & Reverts (named snapshots), queued messages, voice input, Explain and Fix (one-click error resolution), cross-conversation references, multiple simultaneous Cascades, up to 20 tool calls per prompt |

---

## 5. Aider

**Source:** GitHub `paul-gauthier/aider`, `aider.chat/docs`
**Confidence:** Medium

Aider uses a fundamentally different model from most agents — file editing through its own edit format (whole-file, diff, architect mode), not through named tool calls. It operates via commands rather than tools.

### Commands

| Command       | Description                                                              |
| ------------- | ------------------------------------------------------------------------ |
| `/code`       | Code editing mode                                                        |
| `/ask`        | Ask questions without making edits                                       |
| `/architect`  | Architect mode — two-model approach (architect plans, editor implements) |
| `/context`    | Context mode                                                             |
| `/add`        | Add files to chat for editing                                            |
| `/drop`       | Remove files from chat                                                   |
| `/read-only`  | Add reference files without edit permission                              |
| `/web`        | Scrape webpages and convert to markdown                                  |
| `/run` or `!` | Execute shell commands                                                   |
| `/test`       | Run shell commands, adding output on failure                             |
| `/lint`       | Lint and fix files                                                       |
| `/git`        | Execute git commands                                                     |
| `/undo`       | Reverse last aider commit                                                |
| `/commit`     | Commit external changes                                                  |
| `/diff`       | Display recent changes                                                   |
| `/voice`      | Voice-to-code recording                                                  |
| `/paste`      | Insert images or text from clipboard                                     |
| `/copy`       | Copy assistant responses                                                 |
| `/editor`     | Open external editor for composing prompts                               |
| `/model`      | Switch main model                                                        |

### Capabilities

| Capability           |                                                                                                                           Supported                                                                                                                            | Details                                                                             |
| -------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | ----------------------------------------------------------------------------------- |
| Structured questions |                                                                                                                               No                                                                                                                               | No tool-based structured questioning                                                |
| Free-form questions  |                                                                                                                              Yes                                                                                                                               | Conversational; `/ask` mode                                                         |
| Task/todo list       |                                                                                                                               No                                                                                                                               | No built-in task list                                                               |
| Sub-agents           |                                                                                                                               No                                                                                                                               | No sub-agent capability                                                             |
| Plan mode            |                                                                                                                            Partial                                                                                                                             | `/architect` uses two models (architect + editor) but is not a tool-level plan mode |
| File CRUD            |                                                                                                                              Yes                                                                                                                               | Core capability — add/edit/create files                                             |
| Shell                |                                                                                                                              Yes                                                                                                                               | `/run`, `/test`, `/lint`, `/git`                                                    |
| Web search           |                                                                                                                               No                                                                                                                               | No built-in web search (only `/web` for scraping specific URLs)                     |
| URL fetch            |                                                                                                                              Yes                                                                                                                               | `/web` scrapes URLs to markdown                                                     |
| MCP                  |                                                                                                                               No                                                                                                                               | Not documented                                                                      |
| Unique               | Voice-to-code, automatic git commits with sensible messages, whole-codebase repository map, watch mode (file monitoring), clipboard integration, multi-model architecture (architect + editor pattern), 100+ language support, editor integration via comments |

---

## 6. Cline (VS Code Extension)

**Source:** GitHub `cline/cline`, `src/shared/tools.ts` (`ClineDefaultTool` enum)
**Confidence:** High (verified from source code)

### Complete Tool List

| Tool                                 | Description                                                                                     | Read-only |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- | :-------: |
| `ASK` / `ask_followup_question`      | Ask followup questions with 2–4 suggested responses. User can pick a suggestion or type freely. |    Yes    |
| `ATTEMPT` / `attempt_completion`     | Signal task completion                                                                          |    No     |
| `BASH` / `execute_command`           | Execute shell commands                                                                          |    No     |
| `FILE_EDIT` / `edit_file`            | Edit existing files                                                                             |    No     |
| `FILE_READ` / `read_file`            | Read file contents                                                                              |    Yes    |
| `FILE_NEW` / `write_to_file`         | Create new files                                                                                |    No     |
| `SEARCH` / `search_files`            | Search files/codebase                                                                           |    Yes    |
| `LIST_FILES` / `list_files`          | List files in directory                                                                         |    Yes    |
| `LIST_CODE_DEF`                      | List code definitions via AST analysis                                                          |    Yes    |
| `BROWSER` / `browser_action`         | Browser control — click, type, scroll, screenshot, console logs                                 |    Yes    |
| `MCP_USE`                            | Use MCP tools                                                                                   |    No     |
| `MCP_ACCESS` / `access_mcp_resource` | Access MCP resources                                                                            |    No     |
| `MCP_DOCS`                           | MCP documentation                                                                               |    No     |
| `NEW_TASK` / `new_task`              | Create new task in different mode                                                               |    No     |
| `PLAN_MODE`                          | Switch to plan mode                                                                             |    No     |
| `ACT_MODE`                           | Switch to act (execution) mode                                                                  |    No     |
| `TODO` / `update_todo_list`          | Update todo list (markdown checklist)                                                           |    No     |
| `WEB_FETCH`                          | Fetch web content                                                                               |    Yes    |
| `WEB_SEARCH`                         | Web search                                                                                      |    Yes    |
| `CONDENSE`                           | Condense conversation to save context                                                           |    No     |
| `SUMMARIZE_TASK`                     | Summarize current task                                                                          |    No     |
| `REPORT_BUG`                         | Report a bug                                                                                    |    No     |
| `NEW_RULE`                           | Create a new rule on the fly                                                                    |    No     |
| `APPLY_PATCH` / `apply_patch`        | Apply patch to files                                                                            |    No     |
| `GENERATE_EXPLANATION`               | Generate explanation of code                                                                    |    No     |
| `USE_SKILL`                          | Use a skill                                                                                     |    Yes    |
| `USE_SUBAGENTS`                      | Spawn subagents                                                                                 |    Yes    |

### Key tool details

- **`ask_followup_question`:** Accepts 2–4 suggested responses. The user can select one or type a custom answer. This is the structured question mechanism.
- **`PLAN_MODE` / `ACT_MODE`:** Toggle between planning (research/design) and acting (executing). Not EnterPlanMode-style with approval — it's a mode switch.
- **`new_task`:** Creates a task in a specified mode (Code, Architect, etc.). Used for sub-task delegation.
- **`USE_SUBAGENTS`:** Spawns subagents with isolated context.

### Capabilities

| Capability           |                                                                                           Supported                                                                                            | Details                                                      |
| -------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | ------------------------------------------------------------ |
| Structured questions |                                                                                              Yes                                                                                               | `ask_followup_question` — 2–4 suggested responses            |
| Free-form questions  |                                                                                              Yes                                                                                               | `ask_followup_question` with custom input                    |
| Task/todo list       |                                                                                              Yes                                                                                               | `update_todo_list` — markdown checklist                      |
| Sub-agents           |                                                                                              Yes                                                                                               | `USE_SUBAGENTS`; `new_task` creates tasks in different modes |
| Plan mode            |                                                                                              Yes                                                                                               | `PLAN_MODE` / `ACT_MODE` toggle                              |
| File CRUD            |                                                                                              Yes                                                                                               | `read_file`, `edit_file`, `write_to_file`, `apply_patch`     |
| Shell                |                                                                                              Yes                                                                                               | `execute_command`                                            |
| Web search           |                                                                                              Yes                                                                                               | `WEB_SEARCH`                                                 |
| URL fetch            |                                                                                              Yes                                                                                               | `WEB_FETCH`                                                  |
| MCP                  |                                                                                              Yes                                                                                               | `MCP_USE`, `MCP_ACCESS`, `MCP_DOCS`                          |
| Unique               | Browser automation (Computer Use), `CONDENSE` (context compression), `LIST_CODE_DEF` (AST), `NEW_RULE`, `GENERATE_EXPLANATION`, approval gates for every action, `SUMMARIZE_TASK`, `USE_SKILL` |

---

## 7. Amazon Q Developer

**Source:** AWS documentation, `aws.amazon.com/q/developer/`
**Confidence:** Low (CLI deprecated in favor of Kiro)

The open-source Amazon Q Developer CLI (`aws/amazon-q-developer-cli`) has been deprecated in favor of **Kiro** (closed-source). Kiro adds spec-driven development, agent hooks, MCP support, and more structured workflows. Tool names not available for Kiro.

### Capabilities (Q Developer)

| Capability             | Description                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| Code generation        | Real-time suggestions from snippets to full functions              |
| File read/write        | Automatically reading and writing files                            |
| Code diffs             | Generating code diffs                                              |
| Shell commands         | Running shell commands                                             |
| Inline chat            | Direct code editor chat                                            |
| CLI completions        | Command-line autocompletions, natural-language-to-bash translation |
| Vulnerability scanning | Security analysis and remediation                                  |
| Unit testing           | Automated test generation                                          |
| Java migration         | Java 8 to Java 17 automated upgrades                               |
| .NET porting           | Windows to Linux transformation                                    |

### Capabilities

| Capability           |                                              Supported                                              | Details                                            |
| -------------------- | :-------------------------------------------------------------------------------------------------: | -------------------------------------------------- |
| Structured questions |                                                 No                                                  | Not documented                                     |
| Task/todo list       |                                                 No                                                  | Not documented                                     |
| Sub-agents           |                                                 No                                                  | Not documented                                     |
| Plan mode            |                                                 No                                                  | Not documented (Kiro adds spec-driven development) |
| File CRUD            |                                                 Yes                                                 | Reading, writing, diffs                            |
| Shell                |                                                 Yes                                                 | Shell commands                                     |
| Web search           |                                                 No                                                  | Not documented                                     |
| MCP                  |                                         No (Q) / Yes (Kiro)                                         | Kiro has native MCP integration                    |
| Unique               | Java version migration agent, .NET porting agent, AWS service integration, natural-language-to-bash |

---

## 8. GitHub Copilot Coding Agent (VS Code)

**Source:** VS Code docs at `code.visualstudio.com`, GitHub docs
**Confidence:** Medium (docs only)

### Tools/Capabilities

| Tool/Capability           | Description                                 |
| ------------------------- | ------------------------------------------- |
| File editing              | Edit and create files across workspace      |
| Terminal commands         | Execute shell commands                      |
| `#codebase`               | Semantic search of indexed codebase         |
| `#` file/folder mentions  | Reference files, folders as context         |
| `#terminalSelection`      | Terminal output as context                  |
| `#fetch`                  | Fetch external data by URL                  |
| Browser element selection | Select elements from browser (experimental) |
| Image/video analysis      | Vision context analysis                     |
| Extensions integration    | Tools from installed VS Code extensions     |
| MCP servers               | Connect external tools via MCP              |

### Capabilities

| Capability           |                                                                                 Supported                                                                                 | Details                                                           |
| -------------------- | :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------: | ----------------------------------------------------------------- |
| Structured questions |                                                                                    No                                                                                     | Not documented as structured tool-call choices                    |
| Free-form questions  |                                                                                    Yes                                                                                    | Multi-turn conversation                                           |
| Task/todo list       |                                                                                    No                                                                                     | Not documented                                                    |
| Sub-agents           |                                                                                  Partial                                                                                  | Background agents, cloud agents (separate execution environments) |
| Plan mode            |                                                                                    Yes                                                                                    | "Plan" persona mode (Agent, Plan, Ask modes)                      |
| File CRUD            |                                                                                    Yes                                                                                    | Full file editing and creation                                    |
| Shell                |                                                                                    Yes                                                                                    | Terminal command execution                                        |
| Web search           |                                                                                Unconfirmed                                                                                | Not explicitly documented as built-in                             |
| URL fetch            |                                                                                    Yes                                                                                    | `#fetch` context variable                                         |
| MCP                  |                                                                                    Yes                                                                                    | Full MCP support including remote MCP servers with OAuth          |
| Unique               | `@vscode` and `@terminal` chat participants, `#` context mentions, extension-provided tools, background/cloud agents, multi-surface (VS Code, GitHub.com, JetBrains, CLI) |

---

## 9. Codex (OpenAI CLI Agent)

**Source:** GitHub `openai/codex` source code, OpenAI developer docs
**Confidence:** Medium (inferred from source)

### Complete Tool List

| Tool                   | Description                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `shell`                | Execute shell commands (sandboxed containers or local)                                                       |
| `apply_patch`          | Apply file patches                                                                                           |
| `web_search`           | Search the web                                                                                               |
| `view_image`           | View/analyze images                                                                                          |
| `exec_command`         | Execute commands                                                                                             |
| `write_stdin`          | Write to stdin of running process                                                                            |
| `ToolRequestUserInput` | Ask user structured questions. Params: `options` array, `isOther` (allow free-text), `isSecret` (mask input) |
| `CollabAgent`          | Sub-agent collaboration. Lifecycle: `spawnAgent`, `sendInput`, `resumeAgent`, `wait`, `closeAgent`           |
| MCP tools              | MCP server tool calls                                                                                        |
| Skills                 | Skill tool dependencies                                                                                      |

### Key tool details

- **`ToolRequestUserInput`:** The only agent besides Claude Code with a purpose-built structured question tool. `options` array for choices, `isOther` flag enables free-text input alongside options, `isSecret` flag masks sensitive input.
- **`CollabAgent`:** Full sub-agent lifecycle — spawn, send input, resume, wait for completion, close. More granular than Claude Code's `Agent` tool.

### Capabilities

| Capability           |                                                                                   Supported                                                                                    | Details                                                       |
| -------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | ------------------------------------------------------------- |
| Structured questions |                                                                                      Yes                                                                                       | `ToolRequestUserInput` with `options`, `isOther`, `isSecret`  |
| Free-form questions  |                                                                                      Yes                                                                                       | `ToolRequestUserInput` with `isOther` flag                    |
| Task/todo list       |                                                                                       No                                                                                       | Not documented                                                |
| Sub-agents           |                                                                                      Yes                                                                                       | `CollabAgent` — full lifecycle (spawn/send/resume/wait/close) |
| Plan mode            |                                                                                       No                                                                                       | Not documented as explicit tool                               |
| File CRUD            |                                                                                      Yes                                                                                       | Via `shell` and `apply_patch`                                 |
| Shell                |                                                                                      Yes                                                                                       | `shell` (sandboxed or local)                                  |
| Web search           |                                                                                      Yes                                                                                       | `web_search`                                                  |
| URL fetch            |                                                                                  Unconfirmed                                                                                   | Not documented separately                                     |
| MCP                  |                                                                                      Yes                                                                                       | MCP server tool calls                                         |
| Unique               | Sandboxed execution (containerized), autonomy levels (suggest, auto-edit, full-auto), non-interactive mode, GitHub/Slack/Linear integrations, cloud-delegated background tasks |

---

## 10. Gemini CLI (Google)

**Source:** GitHub `google-gemini/gemini-cli`, `packages/core/src/tools/tool-names.ts`
**Confidence:** High (verified from source code)

### Complete Tool List

| Tool                     | Description                                                     |
| ------------------------ | --------------------------------------------------------------- |
| `glob`                   | Find files by pattern                                           |
| `grep`                   | Search file contents by pattern                                 |
| `ls`                     | List directory contents                                         |
| `read-file`              | Read a single file                                              |
| `read-many-files`        | Read multiple files at once (batch)                             |
| `write-file`             | Write/create files                                              |
| `edit`                   | Edit existing files                                             |
| `shell`                  | Execute shell commands                                          |
| `web-search`             | Search the web (Google Search grounding)                        |
| `web-fetch`              | Fetch content from URLs                                         |
| `ask-user`               | Ask the user a question (parameter schema not fully documented) |
| `enter-plan-mode`        | Switch to plan mode                                             |
| `exit-plan-mode`         | Exit plan mode                                                  |
| `write-todos`            | Write/manage todo lists                                         |
| `memory`                 | Memory/persistent context management                            |
| `get-internal-docs`      | Retrieve internal documentation                                 |
| `activate-skill`         | Activate a skill                                                |
| `complete-task`          | Mark a task as complete                                         |
| `update-topic`           | Update conversation topic                                       |
| `read-mcp-resource`      | Read an MCP resource                                            |
| `list-mcp-resources`     | List available MCP resources                                    |
| `agent`                  | Spawn a sub-agent                                               |
| `tracker-create-task`    | Create a task in the tracker                                    |
| `tracker-update-task`    | Update a task in the tracker                                    |
| `tracker-get-task`       | Get task details                                                |
| `tracker-list-tasks`     | List all tasks                                                  |
| `tracker-add-dependency` | Add dependency between tasks                                    |
| `tracker-visualize`      | Visualize task dependency graph                                 |

### Key tool details

- **Task tracker system:** Far more sophisticated than any other agent. Supports task dependencies and graph visualization. `tracker-create-task` / `tracker-update-task` for CRUD, `tracker-add-dependency` for dependency chains, `tracker-visualize` for rendering the graph.
- **`memory`:** Persistent context across sessions — unique alongside Claude Code's memory.
- **`read-many-files`:** Batch file reading — no other agent has this as a dedicated tool.

### Capabilities

| Capability           |                                                                                                    Supported                                                                                                    | Details                                                                   |
| -------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | ------------------------------------------------------------------------- |
| Structured questions |                                                                                                     Likely                                                                                                      | `ask-user` tool (parameters not fully confirmed)                          |
| Free-form questions  |                                                                                                       Yes                                                                                                       | `ask-user`                                                                |
| Task/todo list       |                                                                                                       Yes                                                                                                       | `write-todos` AND full tracker system with dependencies and visualization |
| Sub-agents           |                                                                                                       Yes                                                                                                       | `agent` tool                                                              |
| Plan mode            |                                                                                                       Yes                                                                                                       | `enter-plan-mode` / `exit-plan-mode`                                      |
| File CRUD            |                                                                                                       Yes                                                                                                       | `read-file`, `read-many-files`, `write-file`, `edit`                      |
| Shell                |                                                                                                       Yes                                                                                                       | `shell`                                                                   |
| Web search           |                                                                                                       Yes                                                                                                       | `web-search` (Google Search grounding)                                    |
| URL fetch            |                                                                                                       Yes                                                                                                       | `web-fetch`                                                               |
| MCP                  |                                                                                                       Yes                                                                                                       | `read-mcp-resource`, `list-mcp-resources`                                 |
| Unique               | `memory` (persistent context), `get-internal-docs`, `tracker-visualize` (task graph), `read-many-files` (batch), `complete-task`, `GEMINI.md` (project context file), conversation checkpointing, token caching |

---

## 11. Kilo Code

**Source:** GitHub `Kilo-Org/kilocode-legacy`, `kilo.ai` website
**Confidence:** Medium (fork of Cline/Roo Code lineage)

### Complete Tool List

| Tool                    | Description                                                     |
| ----------------------- | --------------------------------------------------------------- |
| `read_file`             | Read file contents                                              |
| `write_to_file`         | Write/create files                                              |
| `edit_file`             | Edit existing files                                             |
| `fast_edit_file`        | Optimized editing (Kilo-specific variant)                       |
| `delete_file`           | Delete files (unique — most agents don't have explicit delete)  |
| `apply_diff`            | Apply diff patches                                              |
| `apply_patch`           | Apply patches                                                   |
| `search_and_replace`    | Search and replace in files                                     |
| `execute_command`       | Execute shell commands                                          |
| `search_files`          | Search files by content                                         |
| `list_files`            | List directory contents                                         |
| `codebase_search`       | Semantic codebase search                                        |
| `browser_action`        | Browser automation                                              |
| `ask_followup_question` | Ask user questions with 2–4 suggested responses (Cline lineage) |
| `attempt_completion`    | Complete task                                                   |
| `new_task`              | Create new task in specified mode                               |
| `switch_mode`           | Switch between modes (Code, Architect, Debug, Ask, custom)      |
| `update_todo_list`      | Update todo list                                                |
| `access_mcp_resource`   | Access MCP resources                                            |
| `mcp_server`            | MCP server interaction                                          |
| `fetch_instructions`    | Fetch instructions/rules                                        |
| `generate_image`        | Generate images                                                 |
| `run_slash_command`     | Execute slash commands                                          |

### Capabilities

| Capability           |                                                                                                Supported                                                                                                | Details                                                            |
| -------------------- | :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | ------------------------------------------------------------------ |
| Structured questions |                                                                                                   Yes                                                                                                   | `ask_followup_question` — 2–4 suggested responses                  |
| Task/todo list       |                                                                                                   Yes                                                                                                   | `update_todo_list`                                                 |
| Sub-agents           |                                                                                                 Partial                                                                                                 | `new_task` creates tasks in different modes; KiloClaw cloud agents |
| Plan mode            |                                                                                                   Yes                                                                                                   | Via mode system (Architect Mode)                                   |
| File CRUD            |                                                                                                   Yes                                                                                                   | `read_file`, `write_to_file`, `edit_file`, `delete_file`           |
| Shell                |                                                                                                   Yes                                                                                                   | `execute_command`                                                  |
| Web search           |                                                                                               Unconfirmed                                                                                               | Not in tool list                                                   |
| MCP                  |                                                                                                   Yes                                                                                                   | `access_mcp_resource`, `mcp_server`                                |
| Unique               | 6+ agent modes, `delete_file`, `fast_edit_file`, `generate_image`, KiloClaw cloud agents (shell/browser/cron/24x7 autonomous), Telegram/Discord/Slack integrations, 500+ model support via Kilo Gateway |

---

## 12. Roo Code

**Source:** GitHub `RooVetGit/Roo-Code`, native-tools directory
**Confidence:** High (verified from source code)

### Complete Tool List

| Tool                    | Description                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `read_file`             | Read file contents                                                                                    |
| `write_to_file`         | Write/create files                                                                                    |
| `edit`                  | Edit files (generic)                                                                                  |
| `edit_file`             | Edit files (specific)                                                                                 |
| `apply_diff`            | Apply diff patches                                                                                    |
| `apply_patch`           | Apply patches                                                                                         |
| `search_replace`        | Search and replace                                                                                    |
| `execute_command`       | Execute shell commands                                                                                |
| `read_command_output`   | Read output from running commands (separate from execute)                                             |
| `search_files`          | Search files by content                                                                               |
| `list_files`            | List directory contents                                                                               |
| `codebase_search`       | Semantic codebase search                                                                              |
| `ask_followup_question` | Ask user questions with 2–4 suggested responses, each with optional `mode` slug for context switching |
| `attempt_completion`    | Signal task completion                                                                                |
| `new_task`              | Create new task in specified mode. Accepts optional initial `todos` parameter                         |
| `switch_mode`           | Switch between modes (code, architect, debug, ask, custom)                                            |
| `update_todo_list`      | Update markdown checklist todo list                                                                   |
| `access_mcp_resource`   | Access MCP resources                                                                                  |
| `mcp_server`            | MCP server interaction                                                                                |
| `generate_image`        | Generate images                                                                                       |
| `run_slash_command`     | Execute slash commands                                                                                |
| `skill`                 | Use skills                                                                                            |

### Key tool details

- **`ask_followup_question`:** Same 2–4 option mechanism as Cline, but each suggestion can include a `mode` slug to trigger mode switching on selection.
- **`new_task`:** Accepts initial `todos` parameter — can pre-populate a todo list when creating a sub-task.
- **`read_command_output`:** Separate from `execute_command` — allows reading output from already-running processes.

### Capabilities

| Capability           |                                                   Supported                                                   | Details                                                                        |
| -------------------- | :-----------------------------------------------------------------------------------------------------------: | ------------------------------------------------------------------------------ |
| Structured questions |                                                      Yes                                                      | `ask_followup_question` — 2–4 responses with mode-switching                    |
| Task/todo list       |                                                      Yes                                                      | `update_todo_list`; `new_task` accepts initial `todos`                         |
| Sub-agents           |                                                    Partial                                                    | `new_task` creates tasks in different modes (not true parallel)                |
| Plan mode            |                                                      Yes                                                      | Via Architect Mode (`switch_mode`)                                             |
| File CRUD            |                                                      Yes                                                      | `read_file`, `write_to_file`, `edit`, `edit_file`, `apply_diff`, `apply_patch` |
| Shell                |                                                      Yes                                                      | `execute_command`, `read_command_output`                                       |
| Web search           |                                                      No                                                       | Not in native tool list                                                        |
| URL fetch            |                                                      No                                                       | Not in native tool list                                                        |
| MCP                  |                                                      Yes                                                      | `access_mcp_resource`, `mcp_server`                                            |
| Unique               | Multiple operational modes, `read_command_output`, mode-switching suggestions, `skill` tool, `generate_image` |

---

## 13. Amp (Sourcegraph)

**Source:** `ampcode.com` website, blog posts
**Confidence:** Low (limited documentation)

### Known Tools/Capabilities

| Tool/Capability               | Description                                          |
| ----------------------------- | ---------------------------------------------------- |
| File editing                  | Multi-file edits                                     |
| Shell commands                | Terminal command execution                           |
| Search Agent / Librarian      | Sub-agent for searching code on GitHub               |
| Code Review Agent             | Sub-agent for reviewing code                         |
| Painter Tool                  | Generate and edit images                             |
| Thread Management             | Fork, handoff, label, and map threads                |
| Secret Redaction              | Identifies and redacts secrets in output             |
| Deep Mode                     | Extended thinking — "thinks for longer, plans more"  |
| Skills System                 | Load Agent Skills on demand                          |
| Custom Tools                  | Create tools using CLI (without writing MCP servers) |
| Diagnostic-Driven Completions | Uses IDE diagnostics for improvements                |
| PDF/Image Analysis            | Analyze PDFs and images                              |

### Capabilities

| Capability           |                                                                                       Supported                                                                                        | Details                                                       |
| -------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | ------------------------------------------------------------- |
| Structured questions |                                                                                      Unconfirmed                                                                                       | Not documented                                                |
| Task/todo list       |                                                                                      Unconfirmed                                                                                       | Not documented                                                |
| Sub-agents           |                                                                                          Yes                                                                                           | Librarian (code search), Code Review Agent, composable agents |
| Plan mode            |                                                                                          Yes                                                                                           | "Deep Mode" — extended planning and reasoning                 |
| File CRUD            |                                                                                          Yes                                                                                           | Multi-file editing                                            |
| Shell                |                                                                                          Yes                                                                                           | Terminal access                                               |
| Web search           |                                                                                      Unconfirmed                                                                                       | Not documented separately                                     |
| MCP                  |                                                                                          Yes                                                                                           | MCP support with permissions and lazy-loading                 |
| Unique               | Thread management (fork, handoff, labels, map), Deep Mode, Librarian sub-agent, custom tools via CLI, secret redaction, diagnostic-driven completions, 1M token context, Skills system |

---

## Cross-Agent Comparison Matrix

| Capability           | CC  |   OC   | Cursor | Wind. | Aider | Cline |  Q   | Copilot | Codex | Gemini | Kilo  |  Roo  | Amp |
| -------------------- | :-: | :----: | :----: | :---: | :---: | :---: | :--: | :-----: | :---: | :----: | :---: | :---: | :-: |
| Structured questions | Yes | Likely |  Ltd   |  No   |  No   |  Yes  |  No  |   No    |  Yes  | Likely |  Yes  |  Yes  |  ?  |
| Free-form questions  | Yes |  Yes   |  Yes   |  Yes  |  Yes  |  Yes  | Yes  |   Yes   |  Yes  |  Yes   |  Yes  |  Yes  | Yes |
| Task/todo list       | Yes |  Yes   |   No   |  Yes  |  No   |  Yes  |  No  |   No    |  No   |  Yes   |  Yes  |  Yes  |  ?  |
| Sub-agents           | Yes |  Yes   |   No   |  No   |  No   |  Yes  |  No  |  Part.  |  Yes  |  Yes   | Part. | Part. | Yes |
| Agent teams          | Yes |   No   |   No   |  No   |  No   |  No   |  No  |   No    |  Yes  |   No   |  No   |  No   | Yes |
| Plan mode            | Yes |  Yes   |  No\*  |  Yes  | Part. |  Yes  |  No  |   Yes   |  No   |  Yes   |  Yes  |  Yes  | Yes |
| File CRUD            | Yes |  Yes   |  Yes   |  Yes  |  Yes  |  Yes  | Yes  |   Yes   |  Yes  |  Yes   |  Yes  |  Yes  | Yes |
| Shell                | Yes |  Yes   |  Yes   |  Yes  |  Yes  |  Yes  | Yes  |   Yes   |  Yes  |  Yes   |  Yes  |  Yes  | Yes |
| Web search           | Yes |  Yes   |  Yes   |  Yes  |  No   |  Yes  |  No  |    ?    |  Yes  |  Yes   |   ?   |  No   |  ?  |
| URL fetch            | Yes |  Yes   |  Yes   |   ?   |  Yes  |  Yes  |  No  |   Yes   |   ?   |  Yes   |   ?   |  No   |  ?  |
| MCP                  | Yes |   ?    |  Yes   |  Yes  |  No   |  Yes  | No\* |   Yes   |  Yes  |  Yes   |  Yes  |  Yes  | Yes |
| LSP                  | Yes |  Yes   |   No   |  No   |  No   |  No   |  No  |   No    |  No   |   No   |  No   |  No   | No  |
| Browser              | No  |   No   |  Yes   |  No   |  No   |  Yes  |  No  |  Exp.   |  No   |   No   |  Yes  |  No   | No  |
| Memory               | Yes |   No   |   No   |  No   |  No   |  No   |  No  |   No    |  No   |  Yes   |  No   |  No   | No  |

\* Cursor has "Plan" as persona, not tool. Amazon Q CLI deprecated; Kiro successor has MCP. `?` = unconfirmed.

---

## SDK Primitive Mapping

This section shows how the agent tools above map to skill-kit's 5 primitives. This informs the `CAPABILITY_MAP` in `src/primitives/prose/index.ts` and the `HOST_REGISTRY` in `src/protocol/host.ts`.

### Capability → Tool Name Lookup

For each SDK primitive, the ordered list of tool names that trigger tool-specific prose. First match wins.

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

### Capabilities not mapped to primitives

These were considered and deliberately excluded. The reasoning follows SPEC.md §14: "If the model already picks the right tool given plain intent, don't add an abstraction."

| Capability           | Agents                               | Why not a primitive                                                                   |
| -------------------- | ------------------------------------ | ------------------------------------------------------------------------------------- |
| File read/write/edit | All 13                               | Universal — model dispatches correctly from plain prose                               |
| Shell commands       | All 13                               | Universal — `Bash` vs `shell` vs `execute_command` handled by model                   |
| Web search/fetch     | 7–8/13                               | Model picks the right tool from "search for X"                                        |
| Browser automation   | 3/13 (Cursor, Cline, Kilo)           | Too host-specific. Use escape hatch: `host.toolsAvailable.includes('browser_action')` |
| Memory/persistence   | 2/13 (CC, Gemini)                    | Cross-session concern, not a workflow primitive. Stash covers within-session state    |
| Image generation     | 4/13 (Cursor, Cline, Kilo, Roo, Amp) | Too host-specific and too varied in interface                                         |
| LSP integration      | 2/13 (CC, OpenCode)                  | IDE concern, not workflow                                                             |
| Notebook editing     | 1/13 (CC)                            | Too specialized                                                                       |
| Git worktrees        | 1/13 (CC)                            | Too specialized                                                                       |
| Scheduled tasks      | 2/13 (CC, Kilo)                      | Session-management concern, not workflow                                              |
| Agent teams          | 3/13 (CC, Codex, Amp)                | Emerging — APIs too divergent for abstraction                                         |

### Design rationale: `confirm` as separate primitive

Despite `confirm` using the same underlying tool as `askUser` on many hosts, it's kept separate because:

- Destructive-op semantics need stronger default-to-no behavior
- Warning framing is distinct from option selection
- Keeps prose tuning independent for the two use cases
