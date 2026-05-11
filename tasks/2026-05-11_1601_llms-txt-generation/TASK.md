# Add llms.txt and llms-full.txt to docs site

## Scope

**In:** Generate `llms.txt` (curated index) and `llms-full.txt` (full content dump) from existing markdown sources, served from the docs site for AI coding agents.

**Out:** MCP server, bundled skill, AGENTS.md, or any runtime documentation service. This is static file generation only.

## Context

Skill-kit provides tooling for building agent skills, but agents themselves have no good way to learn about skill-kit when helping developers. The `llms.txt` standard (900+ sites, including Anthropic/Stripe/Vercel) is the de facto way to make docs AI-accessible. We already have clean markdown sources — no conversion needed.

## Plan

### Approach

A standalone post-build script (`scripts/generate-llms-txt.mjs`) using only `node:fs/promises` and `node:path`. Chained after `astro build` in docs-site's build script. Writes to `docs-site/dist/`.

### Sources for `llms-full.txt`

1. `README.md` (HTML badges stripped)
2. `docs/api.md` (API reference)

Excluded after sub-agent evaluation showed ~35-40% redundancy with API reference:

- `SPEC.md` — design rationale duplicates API content; agents need signatures, not philosophy
- `docs/architecture.md` — internals not needed to build skills
- `docs/hosts.md` — host tool inventories not needed for skill authoring

### `llms.txt` structure

Follows the standard: H1 title, blockquote summary, "Instructions for LLM Agents" section, Quick Start snippets (all three skill types), H2 sections with `- [Title](url): description` links pointing to docs site pages and GitHub source files.

### Integration

- `docs-site/package.json` build script chains the generator
- `.github/workflows/docs.yml` adds `SPEC.md` and `scripts/generate-llms-txt.mjs` to trigger paths

### Alternatives rejected

- **Astro integration**: Over-coupled, reads source files not Astro output
- **npm package (astro-llms-md)**: Adds dependency for something achievable in ~80 lines
- **Bundled skill**: Duplication, version drift, harder to update
- **MDX pages as source**: They're adaptations of root docs; root docs are cleaner and more complete

## Steps

- [x] Create task file
- [x] Create `scripts/generate-llms-txt.mjs`
- [x] Modify `docs-site/package.json` build script
- [x] Add `SPEC.md` and script to docs workflow trigger paths
- [x] Build and verify output
- [x] Create branch and commit
- [x] Sub-agent evaluation round 1 (7/7) — identified redundancy from SPEC
- [x] Remove SPEC, architecture, hosts from full dump
- [x] Sub-agent evaluation round 2 (8/9) — suggested ArkType primer, refs docs, retry docs
- [x] Add ArkType schema syntax primer to api.md
- [x] Add `references/` directory conventions to api.md
- [x] Add response validation retry semantics to api.md
- [x] Add reference + composite snippets to llms.txt Quick Start
- [x] Sub-agent evaluation round 3 — confirmed improvements
- [x] Fix stray 4-backtick fence in SPEC.md
- [x] Push and open PR (#73)

## Notes

- Base URL: `https://contentful.github.io/skill-kit/`
- GitHub source URL: `https://github.com/contentful/skill-kit/blob/main/`
- Final sizes: `llms.txt` = 3.6 KB, `llms-full.txt` = 74.5 KB
- Sub-agent evaluation progression: 7/7 → 8/9 → 8/10 (llms.txt) and 9/10 (llms-full.txt)
- Key insight: public interface only (README + API reference) eliminates redundancy while retaining everything needed to build all three skill types
- SPEC.md had a rendering bug (stray 4-backtick fence at line 317 wrapping ~1700 lines in a code block) — fixed as a drive-by
