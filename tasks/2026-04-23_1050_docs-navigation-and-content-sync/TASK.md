# Docs Navigation & Content Sync

## Scope

**In:** Fix 7 documentation issues where composite skills content exists but isn't surfaced — sidebar navigation gaps, homepage claims, API reference content drift, and a broken README link.

**Out:** No new documentation pages. No content changes to existing guide/example MDX files. No changes to the SDK code itself.

## Context

Composite skills documentation has been written across the codebase — a guide page (`composite-skills.mdx`), an example page (`contentful-help.mdx`), and an API reference section in `docs/api.md`. But none of these are wired into the site navigation, the homepage undersells the SDK by only mentioning two patterns, the "How it works" section only describes stateless mode (session mode is recommended), and the README links to a raw MDX source file.

User requested a full docs review. Audit found 7 issues, all fixable in 5 files.

## Plan

### 1. Sidebar.astro — Add missing nav entries

- Add "Composite Skills" to Guides section (after Reference Skills, before Modules)
- Add "contentful-help" to Examples section (after ts-patterns)

### 2. Hero.astro — Fix "Both" claim

- Update subtitle to mention all three patterns (workflow, reference, composite)
- "Both compile to..." → "All three compile to..."

### 3. index.astro (homepage) — Multiple fixes

- Update "Composable Modules" feature card → "Compose & Combine" covering modules + composites
- Update "How it works" text to describe session mode (recommended) + stateless mode
- Add contentful-help example card
- Update CSS: 3-column example grid, wider container, tablet breakpoint

### 4. api/index.mdx — Sync Composite Skills section

- Insert `## Composite Skills` between Modules and Primitives
- Content adapted from `docs/api.md` lines 230-359
- Covers: `.subskill()`, `.topic()`, routing, RedirectResult, CLI protocol, testing with `runComposite`

### 5. README.md — Fix broken link

- Line 178: `./docs-site/src/pages/guides/composite-skills.mdx` → `./docs/api.md#composite-skills`

## Steps

- [x] Create branch and task file
- [x] Fix Sidebar.astro (issues #1, #2)
- [x] Fix Hero.astro (issue #6)
- [x] Fix index.astro homepage (issues #2, #5, #7)
- [x] Sync api/index.mdx with docs/api.md (issue #3)
- [x] Fix README.md link (issue #4)
- [x] Verify: prettier, dev server build, dev server smoke test

## Notes

- Astro files (.astro) don't have a Prettier parser configured — only MDX/MD/TS files are formatted. This is expected.
- The Composite Skills content inserted into api/index.mdx is a direct copy from docs/api.md with one link adjusted: `./architecture.md#session-mode-recommended` → `/architecture/#session-mode-recommended` (site-relative URL).
- Dev server smoke test confirmed all three new strings render on their respective pages.
