# Docs Site (Astro) + .npmignore

## Scope

**In:**

- Astro documentation site at `docs-site/`, co-located in the repo
- Full content migration from `docs/api.md`, `docs/architecture.md`, README, and example sources
- GitHub Actions workflow for Pages deployment (`docs.yml`) + build check in PR CI
- `.npmignore` to strip test artifacts from published package
- `tsconfig.build.json` fix to exclude test files from compilation

**Out:**

- Per-PR preview deployments (GitHub Pages doesn't support branch previews; no external service chosen)
- SPEC.md migration (linked, not converted — it's an internal spec)
- Changelog generation or automated content sync between `docs/` and `docs-site/`

## Context

The SDK had no public documentation site. All docs lived in markdown files. The npm package also shipped 92 test files and fixture files inside `dist/` — 364KB unpacked when ~223KB sufficed.

User requested: Astro docs site using the frontend-design skill for distinctive aesthetics, co-located in repo, plus `.npmignore` covering both the new site and existing project artifacts.

Design direction chosen: industrial-utilitarian — JetBrains Mono display, Satoshi body, amber accents on near-black with engineering graph-paper grid texture. Dark theme throughout, sharp corners, no border-radius.

User chose Satoshi (over Instrument Sans / General Sans) for body font, and full content migration (over stubs).

## Plan

**Approach:** Standalone Astro project (not pnpm workspace member) with its own dependencies. Static output deployed to GitHub Pages at `contentful.github.io/skill-kit/`. Three-column docs layout (sidebar, content, TOC) with responsive collapse.

**Alternatives rejected:**

- Starlight (Astro's docs theme) — too generic, doesn't match the industrial aesthetic
- Docusaurus — heavier, React-based, less control over design
- Adding to pnpm workspace — unnecessary coupling between SDK and docs dependencies

**Trade-offs:**

- Content drift: docs-site MDX pages are manual copies of `docs/*.md`. Changes to source docs don't auto-propagate. Mitigated by path-filter in `docs.yml` that triggers on `docs/**` changes.
- No PR previews: GitHub Pages only supports single deployment. Accepted trade-off — CI build check catches regressions.

## Steps

- [x] Create `.npmignore` and fix `tsconfig.build.json` to exclude test files
- [x] Update `.gitignore` for docs-site entries
- [x] Scaffold Astro project: package.json, config, design system CSS
- [x] Create BaseLayout, Navbar, Footer components
- [x] Create DocsLayout with sidebar + content + TOC grid
- [x] Create Sidebar and TableOfContents components
- [x] Build landing page: Hero, FeatureCard, feature grid, protocol diagram, examples
- [x] Migrate Getting Started pages (3 MDX)
- [x] Migrate Guide pages (4 MDX)
- [x] Migrate API Reference (1 long MDX from docs/api.md)
- [x] Migrate Architecture (1 long MDX from docs/architecture.md)
- [x] Create Examples pages (3 MDX)
- [x] Create `.github/workflows/docs.yml` for Pages deployment
- [x] Add docs build check to PR CI (`ci.yml`)
- [x] Add `.prettierignore` to skip lockfiles
- [x] Fix trailing slash in base URL config
- [x] Fix MDX layout props (frontmatter injection for headings/title)
- [x] Fix TOC and sidebar readability (higher contrast, solid bg, thicker weights)
- [x] Remove duplicate H1 from MDX pages
- [x] Iterate hero code example: greet → repo-doctor → changelog skill with triggers, askUser, stash, prompt tag

## Notes

- `npm pack --dry-run` confirmed: 351 files (364KB) → 255 files (223KB) after `.npmignore` + `tsconfig.build.json` fix. Zero test files in published package.
- Astro `BASE_URL` does not include trailing slash by default. Had to set `base: '/skill-kit/'` with `trailingSlash: 'always'` to fix broken links.
- MDX `layout` frontmatter injects props as `{ frontmatter, headings }`, not flat props. DocsLayout needed to handle both patterns.
- Grid background texture on `body` bled through content areas making text hard to read. Fixed by adding solid `background: var(--color-bg)` on the docs-grid container.
- Hero code example went through several iterations per user feedback: started with bare greet skill, ended with changelog skill showing triggers, askUser, stash, dynamic prompt with `prompt` template tag. Action was added then removed — it added visual noise and redundant schemas without selling the SDK better.
- Post-merge action required: set repo Settings → Pages → Source to "GitHub Actions".
