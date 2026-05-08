# Security Hardening: File-Mode Session Storage

## Scope

**In**: Harden CLI file-mode session files with restrictive permissions, private directory, cleanup subcommand, and increased session ID entropy.

**Out**: Stale file GC, encryption at rest, signal handlers, secret redaction. MCP in-memory mode is already safe.

## Context

Security flagged that session files in `/tmp` are world-readable (default 0644 umask) and never automatically cleaned up. Session files contain potentially sensitive data (params, prompts, model outputs). The CLI is stateless — each invocation is a fresh process — so the session file must persist across invocations until explicitly cleaned up.

## Plan

### Deterministic private directory (0700)

Default session directory changes from `os.tmpdir()` to `$TMPDIR/skill-kit-sessions/`:

- Created with `mkdirSync({ recursive: true, mode: 0o700 })`
- Ownership verification: `stat.uid === process.getuid()` and `(mode & 0o777) === 0o700`
- Prevents filename enumeration and symlink pre-placement

### File creation with 0600 + O_EXCL

`SessionManager.create()` uses:

```typescript
openSync(filePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
```

- Atomic creation — fails if file exists (prevents TOCTOU / symlink following)
- Owner-only read/write

### Cleanup subcommand

```
<skill> cleanup --session <id> [--session-dir <dir>]
```

- Calls `SessionManager.cleanup()`, exits 0 regardless (idempotent)
- Host harness calls after observing `done` status

### Session ID entropy (4 → 16 bytes)

`SESSION_ID_LENGTH = 16` → 32-char hex IDs (128-bit). Prevents same-user enumeration.

## Steps

- [x] Create branch `feat/secure-session-files`
- [ ] Create `src/protocol/secure-tmp.ts`
- [ ] Modify `src/protocol/session.ts` (O_EXCL, 0o600, entropy, default dir)
- [ ] Add `cleanup` command to `cli-entry.ts` and `composite-entry.ts`
- [ ] Update `parseArgs` in `single-invocation.ts`
- [ ] Update tests
- [ ] Verify: typecheck + tests + lint + format

## Notes

- `--session-dir` kept as optional override (tests use it for isolation) but not prominently documented
- The `SessionPointer` already includes the absolute file path, so hosts don't need to track the dir separately
- `mkdirSync` with `recursive: true` is a no-op if the dir already exists (just need to verify ownership after)
