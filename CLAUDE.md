# CLAUDE.md

## Project

`@contentful/skill-kit` — TypeScript SDK for building agent skills with CLI-driven workflows. Companion to `@contentful/agents-kit`.

## Tech stack

- **Runtime:** Node.js 24+ with tsx for dev
- **Package manager:** pnpm
- **Language:** TypeScript 5.9+ (strict mode, ESM)
- **Schema validation:** Zod 4
- **Test runner:** `node --test --import tsx/esm`, colocated `*.test.ts` files, `node:assert/strict`
- **Formatting:** Prettier (`singleQuote: true`, `printWidth: 120`)
- **Build/distribution:** `bun build --compile` for producing skill executables

## Commands

- `pnpm install` — install dependencies
- `pnpm exec tsc --noEmit` — type check
- `node --test --import tsx/esm 'src/**/*.test.ts'` — run all tests
- `node --test --import tsx/esm examples/get-to-know-you/src/skill.test.ts` — run example tests
- `pnpm exec prettier --check .` — check formatting
- `pnpm exec prettier --write .` — fix formatting
- `node --import tsx/esm bin/skill-kit.js build <entry.ts> -o <outdir> --single` — build a skill (dev, current platform)

## Conventions

- Follow agents-kit project conventions (no Nx)
- ESM only (`"type": "module"`)
- Tests colocated next to source files
- No ESLint — Prettier only
- Published to GitHub Packages (`@contentful:registry=https://npm.pkg.github.com/`)

## Workflow

- **Always work on a branch** for non-trivial changes. One branch per task. Descriptive names: `feat/builder-api`, `fix/preamble-wiring`.
- **Conventional commits:** `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `build:`
- **Commit each logical stage** as soon as it compiles — not one giant commit at the end. Target one commit per coherent slice: a refactor, a new module, a data-layer change, a test suite. When in doubt, commit.
- **Each commit must stand on its own.** Typecheck and tests pass at every commit, not just at the tip. If the stage you're committing depends on something you haven't written yet, land the dependency first.
- **Unrelated cleanups go in their own commit.** A `style:` / `chore:` commit for incidental Prettier fixups. Don't smuggle them into a feature commit.
- **Task directories** for non-trivial work: `tasks/YYYY-MM-DD_hhmm_descriptive-kebab-case/TASK.md`. Every TASK.md has: Scope, Context, Plan, Steps (checkbox list), Notes (running log of decisions during implementation).

## Build checkpoints

Run typecheck + tests + format-check at each logical checkpoint — finishing a feature, wrapping a refactor step, before every `git push`. Don't batch to the end; compounding breakage is harder to debug.

```bash
pnpm exec tsc --noEmit && node --test --import tsx/esm 'src/**/*.test.ts' && pnpm exec prettier --check .
```

## Code style

- **Name non-obvious expressions.** Extract into named variables or constants. No magic numbers — keep thresholds as named constants rather than inline literals.
- **Options objects for 3+ parameters.** Positional args are unreadable at the call site. Define a named interface and pass one object.
- **async/await over `.then()` chains**, including inside callbacks.
- **Comment the _why_, not the _what_.** If a line isn't self-evidently necessary, note why. Don't narrate what the code does.
- **Refactor proactively, don't over-engineer.** When you notice two or three call sites doing the same transformation — extract a helper before adding the fourth. When a function is growing a second responsibility — split it. Don't hoist a helper for a single call site, and don't split files just to feel tidy. Three similar lines is better than a premature abstraction — act on repetition that already exists, not repetition you're speculating about.
- **Known future requirements are fair game.** Requirements written down in `SPEC.md` or task docs are not hypothetical, and designing for them now is usually cheaper than retrofitting later. _Imagined_ future needs don't justify abstractions.

## Key references

- `SPEC.md` — the full SDK specification
- https://agentskills.io/specification — agentskills.io skill format spec
- `/Users/tim/Development/contentful/agents-kit` — related project for conventions
