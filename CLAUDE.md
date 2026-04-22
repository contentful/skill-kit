# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`@contentful/skill-kit` — TypeScript SDK for building agent skills with CLI-driven workflows. Companion to `@contentful/agents-kit`.

**Read `SPEC.md` before any substantive work.** It is the source of truth for the SDK's design, primitives, and protocol. The notes below are a reading guide, not a replacement.

## Tech stack

- **Runtime:** Node.js 24+ with tsx for dev
- **Package manager:** pnpm
- **Language:** TypeScript 5.9+ (strict mode, ESM)
- **Schema validation:** Zod 4
- **Test runner:** `node --test --import tsx/esm`, colocated `*.test.ts` files, `node:assert/strict`
- **Formatting:** Prettier (`singleQuote: true`, `printWidth: 120`)
- **Build/distribution:** `--mode bun` (default) uses `bun build --compile` for standalone executables; `--mode node` uses esbuild for lightweight `.mjs` bundles

## Commands

- `pnpm install` — install dependencies
- `pnpm exec tsc --noEmit` — type check
- `node --test --import tsx/esm 'src/**/*.test.ts'` — run all SDK tests
- `node --test --import tsx/esm examples/get-to-know-you/src/skill.test.ts` — run workflow example tests
- `node --test --import tsx/esm examples/ts-patterns/src/skill.test.ts` — run reference example tests
- `pnpm exec prettier --check .` — check formatting
- `pnpm exec prettier --write .` — fix formatting
- `node --import tsx/esm bin/skill-kit.js build <entry.ts> -o <outdir> --single` — build a skill executable (dev, current platform)
- `node --import tsx/esm bin/skill-kit.js build <entry.ts> -o <outdir> --mode node` — build a skill as a Node.js bundle

## Conventions

- Follow agents-kit project conventions (no Nx)
- ESM only (`"type": "module"`)
- Tests colocated next to source files
- No ESLint — Prettier only
- Published to GitHub Packages (`@contentful:registry=https://npm.pkg.github.com/`)

## Workflow

- **Always work on a branch** — never commit or push directly to main, not even single-line fixes. One branch per task, land via PR. Descriptive names: `feat/builder-api`, `fix/preamble-wiring`.
- **Conventional commits, committed frequently.** Commit the task doc first, then the code changes it produced. _Frequent_ means each logical stage gets its own commit as soon as it compiles on its own — not one giant `feat:` at the end containing a whole iteration. Target one commit per coherent slice: a refactor, a new pure module, a data-layer change, a test suite. When in doubt, commit. A reviewer should be able to read the branch top-to-bottom and follow the thinking; they should not have to diff 1200 lines in one shot.
- **Each commit must stand on its own.** Typecheck and tests pass at every commit — not just at the tip. If the stage you're committing depends on something you haven't written yet (e.g., a type export referenced by a module that doesn't exist), land the dependency first. This keeps `git bisect` useful and keeps `git revert` from unravelling the whole iteration.
- **Unrelated cleanups go in their own commit.** A `style:` / `chore:` commit for incidental Prettier or lint fixups on files you didn't otherwise touch. Don't smuggle them into a feature commit where they bloat the diff and muddle the history.
- **Task directories** for non-trivial work: `tasks/YYYY-MM-DD_hhmm_descriptive-kebab-case/TASK.md`. Get the timestamp from `date +%Y-%m-%d_%H%M` — do not guess. A task is a concrete, completable unit, not an epic.
- Every TASK.md has: **Scope** (what's in / explicitly out), **Context** (the _why_ — problem, constraint, user input that triggered it), **Plan** (approach + alternatives rejected + trade-offs), **Steps** (checkbox list), **Notes** (running log of decisions made _during_ implementation, written as you go).
- Task documents are the project's decision log. When someone later asks "why did we do X?", the answer should be findable in Context / Plan / Notes — not locked in a chat transcript.
- Because plan mode often precedes a context clear, the Plan section must capture user inputs, feedback, and explicit design choices verbatim — anything the implementation phase will need after context is gone.

## Build checkpoints

Run typecheck + tests + format-check at each logical checkpoint — finishing a feature, wrapping a refactor step, before every `git push`. Don't batch to the end; compounding breakage is harder to debug. Fix formatting before committing. Do not push code that fails typecheck or tests.

```bash
pnpm exec tsc --noEmit && node --test --import tsx/esm 'src/**/*.test.ts' && pnpm exec prettier --check .
```

## Code style

- **Name non-obvious expressions.** Extract into named variables or constants. No magic numbers — keep thresholds as named constants rather than inline literals.
- **Options objects for 3+ parameters.** Positional args are unreadable at the call site. Define a named interface and pass one object.
- **async/await over `.then()` chains**, including inside callbacks.
- **Comment the _why_, not the _what_.** If a line isn't self-evidently necessary (a seemingly redundant `finally`, a deliberate reset), note why. Don't narrate what the code does.
- **Refactor proactively, don't over-engineer.** When you notice two or three call sites doing the same small transformation — extract a helper before adding the fourth. When a function is growing a second responsibility — split it. You don't need permission for these passes, and you shouldn't wait until a reviewer points it out. The counterweight: don't hoist a helper for a single call site, and don't split files just to feel tidy. "Three similar lines is better than a premature abstraction" still holds — act on repetition that already exists, not repetition you're speculating about.
- **Known future requirements are fair game.** _Hypothetical_ future needs (speculation, "what if we eventually…") don't justify abstractions — but requirements written down in `SPEC.md` or a `TASK.md` are not hypothetical, and designing for them now is usually cheaper than retrofitting later. The rule is: the requirement must be _documented_, not imagined.

## Documentation

The docs site (`docs-site/`) is an Astro static site deployed to GitHub Pages. Its content pages are adapted from `docs/api.md`, `docs/architecture.md`, and the README. These are **not** auto-synced — when you change the markdown docs, update the corresponding MDX pages in `docs-site/src/pages/` and vice versa.

**Known issue:** Pages is private, so GitHub assigns a random `*.pages.github.io` domain and serves at root (no base path). The `contentful.github.io/skill-kit/` URL 301-redirects there. Fix by either making Pages public (serves at `contentful.github.io/skill-kit/`, re-add `base: '/skill-kit/'` to `astro.config.mjs`) or configuring a custom domain.

## Key references

- `SPEC.md` — the full SDK specification
- https://agentskills.io/specification — agentskills.io skill format spec
- `/Users/tim/Development/contentful/agents-kit` — related project for conventions
