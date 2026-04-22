# File-Based Session Protocol

## Scope

**In:** File-based session protocol for skill-kit skills. Session JSONL files, two output modes (file-write default, flag fallback), history reconstruction from session files, backward-compatible with existing stateless protocol. All three skill types (single, composite, reference). Generated SKILL.md updates. Documentation across SPEC.md, docs/, docs-site/.

**Out:** Session TTL enforcement. Background cleanup processes. Reference skills (no state to manage — they're already single-call). Changes to the engine itself (WorkflowEngine, StashStore, History).

## Context

When agents run skill-kit skills, every invocation passes the entire conversation history as CLI args and returns verbose JSON to stdout. This causes noisy UX (ugly JSON blobs in Bash tool output visible to users) and growing CLI args (--history re-sends ALL prior step outputs). The goal is a file-based session protocol where the CLI writes to a JSONL session file and the agent reads/writes via host tools (Read/Write), making stdout minimal.

User feedback: Default should be file-write mode (agent appends output to JSONL file), with --output flag as configurable fallback for agents that can't write files reliably.

## Plan

### Design: JSONL Session File

Session file: `/tmp/skill-kit-<sessionId>.jsonl` (8-char hex ID from `crypto.randomBytes(4)`).

```
Line 1: {"type":"header","sessionId":"abc123","skill":"name","host":"claude-code","context":{},"createdAt":"...","outputMode":"file"}
Line 2: {"type":"prompt","step":"choose","prompt":"...","schema":{...},"preamble":"..."}
Line 3: {"type":"output","step":"choose","output":{"choice":"setup"}}            ← written by agent (file mode) or CLI (flag mode)
Line 4: {"type":"prompt","step":"setup/check","prompt":"...","schema":{...},"completed":{"step":"choose","output":{"choice":"setup"}}}
...
Line N: {"type":"done","finalOutput":{...},"completed":{"step":"last","output":{...},"action":{...}}}
```

Each line has a `type` discriminator. Agent output lines are `type: "output"`. Protocol responses are `type: "prompt"`, `type: "done"`, `type: "error"`.

### Design: Output Modes

- **`"file"` (default)**: Agent appends `{"type":"output","step":"<name>","output":{...}}` to JSONL, then calls `advance --session <id>` with no --step/--output. CLI reads last output line from file.
- **`"flag"` (fallback)**: Agent passes `--step <name> --output '{...}'` on advance call. CLI writes the output line itself.

Set via `--output-mode file|flag` at session creation, stored in header.

### Design: CLI Interface

```bash
# Start with session
scripts/run --context '{}' --host claude-code --session new [--output-mode file|flag]
# stdout: {"sessionId":"abc123","file":"/tmp/skill-kit-abc123.jsonl","line":2}

# Advance (file mode — agent already wrote output to file)
scripts/run advance --session abc123
# stdout: 4

# Advance (flag mode)
scripts/run advance --step choose --output '{"choice":"setup"}' --session abc123
# stdout: 4

# Without --session: identical to today (backward compatible)
```

### Design: History Reconstruction

History is built from `completed` fields in `prompt` and `done` lines — these contain `{step, output, action?}` tuples matching what `replayHistory()` expects. The last `output` line (current step's response) is consumed for the current advance but not added to replayed history.

### Design: SessionPointer Type

```typescript
export interface SessionPointer {
  sessionId: string;
  file: string;
  line: number;
}
```

### Rejected Alternatives

1. **Separate history lines in file**: Redundant data, breaks append-only simplicity.
2. **Agent always uses --output flag**: More visible noise in Bash output — user explicitly wanted file-write as default.
3. **stdin pipe protocol**: Requires persistent process management, not supported by all hosts.

## Steps

- [x] Create `src/protocol/session.ts` — SessionManager, SessionFile classes
- [x] Create `src/protocol/session.test.ts` — unit tests (16 tests)
- [x] Add `SessionPointer` to `src/types.ts`, export from `src/index.ts`
- [x] Modify `src/protocol/single-invocation.ts` — session support in start/advance/parseArgs
- [x] Modify `src/protocol/cli-entry.ts` — wire session flags (5 new tests)
- [x] Modify `src/protocol/composite-entry.ts` — session support in composite handlers (6 new tests)
- [x] Update `src/build/skillmd-template.ts` — session-mode instructions in generated SKILL.md
- [x] Update SPEC.md — session protocol specification
- [x] Update docs/architecture.md — expand protocol section
- [x] Update docs/api.md — SessionPointer type, new flags
- [x] Update docs-site pages — architecture, composite-skills, building, api
- [x] Verify: typecheck + tests + format + docs consistency (194 tests, all passing)

## Notes

- History reconstruction reads `completed` fields from prompt/done lines, not output lines. This avoids needing to break append-only semantics when actions produce results.
- Extracted `resolveSessionForCommand` and `resolveAdvanceInput` helpers in composite-entry to share session logic across dispatcher/subskill handler paths.
- Added multi-step-skill.ts fixture for testing full session lifecycle across step boundaries.
- Session file cleanup is not automatic — relies on OS temp cleanup. Explicit cleanup available via `SessionFile.cleanup()` and `SessionManager.cleanup()`.
- `workflow-skills.mdx` had no protocol invocation examples, so no changes needed there.

(Running log — decisions made during implementation)
