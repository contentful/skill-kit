# Fix published bin runtime

## Scope

**In:** Make `npx skill-kit build|run|check` work out of the box when installed from the registry.

**Out:** Changing the CLI's API surface, adding new commands, or restructuring the build pipeline.

## Context

The published `@contentful/skill-kit` binary had two remaining issues after PR #13 fixed the `../src/` → `../dist/` imports:

1. **bun-wrapper-template** resolved `src/cli.ts` as the entry for compiled binaries. Since `src/` isn't shipped (only `dist/` and `bin/`), `bun build --compile` failed for consumers with "Could not resolve".

2. **bin/skill-kit.js** did `await import(absPath)` on `.ts` files under plain Node. Without a tsx loader, TypeScript imports fail. Consumers had to manually invoke `node --import tsx/esm bin/skill-kit.js ...`, defeating the purpose of a bin entry.

## Plan

**Fix 1 — bun-wrapper-template:** Change `resolve(sdkRoot, 'src', 'cli.ts')` → `resolve(sdkRoot, 'dist', 'cli.js')`.

**Fix 2 — auto-load tsx:** The bin script detects whether tsx is already loaded via `process.execArgv`. If not, it re-execs itself with `--import tsx/esm` and forwards all args + exit code. This is necessary because Node 25 doesn't support `register('tsx/esm', ...)` — tsx requires the `--import` hook.

**Fix 3 — move tsx to dependencies:** Required for fix 2 to work at install time.

**Alternative rejected:** Using the shebang to pass `--import tsx/esm` — Linux shebangs don't support multiple arguments. A shell wrapper was considered but adds complexity vs. the re-exec pattern.

## Steps

- [x] Change `src/build/bun-wrapper-template.ts` line 5: `'src', 'cli.ts'` → `'dist', 'cli.js'`
- [x] Add re-exec guard to `bin/skill-kit.js` with exit code forwarding
- [x] Move `tsx` from devDependencies to dependencies in `package.json`
- [x] Verify: `node bin/skill-kit.js` prints help
- [x] Verify: `node bin/skill-kit.js run examples/.../skill.ts start` works without manual tsx
- [x] Verify: `node bin/skill-kit.js build examples/.../skill.ts -o /tmp/... --single` succeeds
- [x] All 123 tests pass, typecheck + prettier clean
- [x] PR #15 created

## Notes

- `register('tsx/esm', import.meta.url)` was the first attempt — fails on Node 25 with "tsx must be loaded with --import instead of --loader". The `--loader` API was deprecated in Node 20.6.
- The re-exec pattern uses `execFileSync` with `stdio: 'inherit'` so stdin/stdout/stderr pass through transparently.
- Detection uses `process.execArgv.some((a) => a.includes('tsx'))` — reliable since tsx is the only loader we use.
- The existing `build:examples` script in package.json still works (it passes `--import tsx/esm` explicitly, which means tsx is already detected as loaded on re-entry — no double re-exec).
