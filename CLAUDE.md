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
- `pnpm exec prettier --check .` — check formatting
- `pnpm exec prettier --write .` — fix formatting

## Conventions

- Follow agents-kit project conventions (no Nx)
- ESM only (`"type": "module"`)
- Tests colocated next to source files
- No ESLint — Prettier only
- Published to GitHub Packages (`@contentful:registry=https://npm.pkg.github.com/`)

## Commit conventions

- Use conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `build:`
- Commit frequently — after every major chunk of work, not in large batches
- Keep commits focused and atomic

## Key references

- `SPEC.md` — the full SDK specification
- https://agentskills.io/specification — agentskills.io skill format spec
- `/Users/tim/Development/contentful/agents-kit` — related project for conventions
