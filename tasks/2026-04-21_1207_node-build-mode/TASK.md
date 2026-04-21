# Node build mode + CLI default command

## Scope

**In:**

- Add `--mode node` to `skill-kit build` — produces a single esbuild-bundled `.mjs` file instead of platform-specific Bun executables
- Make `start` the default subcommand for skills — `run --context ...` works, so Claude suggests `run *` covering both `start` and `advance`
- Add esbuild as explicit dependency

**Out:**

- Changing the existing bun build mode behavior
- @swc/core or other tooling additions

## Context

Two UX problems:

1. Compiled Bun executables are 50-100MB per target. For skills in Node.js codebases where Node is already available, this is wasteful. A bundled JS file is ~100-300KB.
2. Claude's permission system suggests `run start *` on first invocation, which doesn't cover `run advance *`. Defaulting `run` → `run start` means the first command has no subcommand, so Claude suggests `run *`.

## Plan

### Part 1: CLI default command

- `parseArgs` in `cli-entry.ts`: when first arg starts with `--`, default command to `start`
- `reference-entry.ts`: when first arg is not a known command, default to `topics`
- Update SKILL.md template to use `run --context ...` (no explicit `start`)
- Update reference template similarly
- Update tests

### Part 2: Node build mode

- Add esbuild as explicit dependency
- New `node-wrapper-template.ts` and `node-scripts-run-template.ts`
- Refactor `buildSkill()` to dispatch on `mode: 'bun' | 'node'`
- Parse `--mode` in `bin/skill-kit.js`
- Tests for new templates

## Steps

- [x] Commit task doc
- [x] Part 1: CLI default command (parseArgs, templates, tests)
- [x] Part 2: Add esbuild dependency
- [x] Part 2: New templates (node-wrapper, node-scripts-run)
- [x] Part 2: Refactor buildSkill() + CLI --mode flag
- [x] Part 2: Tests for node build mode
- [x] Build checkpoint: typecheck + tests + format
- [x] Manual verification: build example with --mode node

## Notes

- Node wrapper template points at `src/cli.ts` (not `dist/cli.js`) so esbuild can follow imports and bundle from source
- Reference skills use `process.env.SKILL_DIR` (set by the delegator script) instead of `process.execPath` to find the references directory
- Bundle size for get-to-know-you example: ~559KB vs ~55MB (bun executable) — 100x reduction
- esbuild imported dynamically in `compileNodeBundle()` so bun mode doesn't require it
- Verified: both skill and reference examples work in node mode, bun mode unchanged
