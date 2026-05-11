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
2. `SPEC.md` (canonical spec, 2000 lines)
3. `docs/api.md` (API reference)
4. `docs/architecture.md` (internals)
5. `docs/hosts.md` (host tool mappings)

### `llms.txt` structure

Follows the standard: H1 title, blockquote summary, "Instructions for LLM Agents" section, H2 sections with `- [Title](url): description` links pointing to docs site pages and GitHub source files.

### Integration

- `docs-site/package.json` build script chains the generator
- `.github/workflows/docs.yml` adds `SPEC.md` to trigger paths

### Alternatives rejected

- **Astro integration**: Over-coupled, reads source files not Astro output
- **npm package (astro-llms-md)**: Adds dependency for something achievable in ~80 lines
- **Bundled skill**: Duplication, version drift, harder to update
- **MDX pages as source**: They're adaptations of root docs; root docs are cleaner and more complete

## Steps

- [x] Create task file
- [ ] Create `scripts/generate-llms-txt.mjs`
- [ ] Modify `docs-site/package.json` build script
- [ ] Add `SPEC.md` to docs workflow trigger paths
- [ ] Build and verify output
- [ ] Create branch and commit

## Notes

- Base URL: `https://contentful.github.io/skill-kit/`
- GitHub source URL: `https://github.com/contentful/skill-kit/blob/main/`
- Total llms-full.txt estimate: ~5100 lines / ~130KB — within all major agent context windows
