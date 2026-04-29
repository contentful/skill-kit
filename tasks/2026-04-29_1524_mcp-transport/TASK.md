# MCP Transport for skill-kit

## Scope

**In scope:**

- MCP stdio server entry point for simple skills (`mcpMain`)
- MCP stdio server entry point for composite skills (`mcpCompositeMain`)
- `McpSessionManager` + `McpSession` for in-memory stateful workflow management
- `start` / `advance` / `topic` MCP tool registration
- Integration into existing `cli-entry.ts` and `composite-entry.ts` via `mcp` subcommand
- SKILL.md generation with MCP-first + CLI-fallback instructions
- Export from `src/cli.ts`
- Tests using InMemoryTransport
- Documentation updates (SPEC.md, docs/, docs-site/, README)

**Out of scope:**

- Crash recovery / JSONL write-ahead log (deferred)
- MCP resources (topics are tools for now)
- MCP elicitation/sampling (acknowledged in SPEC.md as not fitting our model)
- New build modes or protocol flags

## Context

The stateful file-based protocol requires multiple visible agent operations per step (Bash calls + file reads). MCP stdio servers hide this behind tool calls, making the experience quieter and more magical. SPEC.md deferred persistent stdio to post-v0.1 but the engine interface was designed to accommodate it.

User feedback:

- Multiple skills may be installed simultaneously as separate MCP servers — tools need namespacing. Using short names (`start`, `advance`) since MCP clients namespace by server name.
- Sessions need explicit lifecycle: `start` creates a session, `advance` uses it, completing returns done, advancing a done session errors.
- Zod 4 / MCP SDK Zod 3 conflict resolved by passing raw JSON Schema objects.

## Plan

### Tool surface

Two tools: `start` and `advance`. Short names, namespaced by MCP server name.

**`start` tool:**

```
Input:  { params?: object }
Result: { session: string, status: "prompt", step, prompt, schema, preamble }
```

**`advance` tool:**

```
Input:  { session: string, step: string, output: object }
Result: { status: "prompt", step, prompt, schema }
      | { status: "done", finalOutput }
      | { status: "error", step, message, retry: true }
```

**`topic` tool (composite only):**

```
Input:  { name: string }
Result: { content: string }
```

### Architecture

```
scripts/run mcp --host claude-code
    │
    ▼
cli-entry.ts / composite-entry.ts  (recognizes 'mcp' subcommand)
    │
    ▼
mcp-entry.ts: mcpMain(skill)
    │
    ├── Creates MCP Server (low-level SDK API)
    ├── Registers start/advance tools with raw JSON Schema
    ├── Sets instructions field with preamble + workflow guidance
    └── Connects StdioServerTransport
         │
         ▼
    McpSessionManager (in-memory)
    ├── start() → creates WorkflowEngine, returns first prompt
    └── advance() → calls engine.advance(), handles auto-advance
```

### Zod strategy

Use the MCP SDK's `Server` class (low-level) or check if `McpServer.registerTool()` accepts `inputSchema` as raw JSON Schema. Avoid importing Zod 3.

### State model

`McpSessionManager` holds a `Map<string, McpSession>`. Each `McpSession` owns a `WorkflowEngine` (or `SubskillEngine` after redirect). Sessions are cleaned up after done + a grace period, or on server shutdown.

### Composite skill redirect handling

When `engine.advance()` returns a `RedirectResult`:

1. Resolve the target (subskill or topic)
2. For subskill: create `SubskillEngine`, start it, auto-advance, return the prompt
3. Replace the session's engine reference with the subskill engine
4. Agent continues with prefixed step names transparently

## Steps

- [x] Create task file and branch
- [x] Install `@modelcontextprotocol/sdk` dependency
- [x] Investigate SDK API for raw JSON Schema support
- [x] Implement `src/protocol/mcp-session.ts`
- [x] Implement `src/protocol/mcp-entry.ts` (simple skills)
- [x] Add tests for mcp-session (8 tests)
- [x] Add tests for mcp-entry using InMemoryTransport (6 tests)
- [x] Implement `src/protocol/mcp-composite.ts` + `mcp-composite-session.ts`
- [x] Wire `mcp` subcommand into `cli-entry.ts`
- [x] Wire `mcp` subcommand into `composite-entry.ts`
- [x] Export from `src/cli.ts`
- [x] Update `skillmd-template.ts` with MCP instructions
- [x] Rebuild example skills, verify SKILL.md output
- [x] Verify node builds work (all 5 examples rebuilt)
- [x] Update SPEC.md (new §16, updated §15)
- [x] Update docs/api.md
- [x] Update docs/architecture.md
- [x] Update docs-site pages
- [x] Update README

## Notes

- MCP SDK v1.29 has native Zod 4 support via `zod/v4/core` compat layer. `AnySchema = z3.ZodTypeAny | z4.$ZodType`. We can use `McpServer.registerTool()` with Zod 4 schemas directly — no raw JSON Schema needed.
- SDK's `registerTool` accepts `inputSchema` as either `ZodRawShapeCompat` (raw shape) or `AnySchema` (full Zod schema). We'll use full Zod 4 object schemas.
