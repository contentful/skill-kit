# README Redesign + docs/ Folder

## Scope

**In:**
- Rewrite README.md — restructure, trim API section, add examples section, add badges
- Create `docs/api.md` — full API reference with worked deploy-check example, modules, fragments, actions, render helpers
- Create `docs/architecture.md` — stateless protocol, host-aware system, build pipeline, engine internals

**Out:**
- No changes to source code, SPEC.md, or CLAUDE.md
- No new examples or tests
- No license field addition to package.json

## Context

The current README (378 lines) is technically solid but front-loads too much API reference, buries the reference-skill type below the fold, never links the two working examples, and has no visual identity. The SPEC.md (1285 lines) covers architecture exhaustively but isn't user-facing docs.

User requested the `/readme-design` skill to review and improve the README, plus creation of a `docs/` folder for content that would bloat the landing page.

User choices:
- Keep API section condensed in README (not moved to docs entirely)
- Replace deploy-check Quick Start with a minimal ~15-line example
- Create docs/architecture.md for protocol/host/build/engine details

## Plan

Restructure README to ~200 lines with developer-direct progressive-disclosure:
1. Header with badges (TS 5.9+, Node 24+, Zod 4) and nav links
2. Problem statement + hero code (keep as-is — it's the strongest part)
3. Quick Start with minimal example, test, build
4. Two skill types section (moved up from line 207)
5. How It Works (keep ASCII diagram, trim host table, remove modules)
6. Examples section (new — surface get-to-know-you and ts-patterns)
7. API condensed (builder signatures, primitives table, testing, CLI, step config in collapsible)
8. Key Decisions (trimmed from 7 to 5)
9. Footer with doc links

Create docs/api.md with full API reference: workflow builder, reference builder, modules, primitives, standalone steps, fragments, actions, render helpers, testing, CLI, worked deploy-check example.

Create docs/architecture.md: stateless protocol, host-aware prose system, build pipeline, engine internals, lint system, design decisions.

**Alternatives rejected:**
- Moving API entirely to docs — user preferred keeping it condensed in README
- Mermaid diagrams — ASCII renders everywhere, audience is comfortable with it
- Separate getting-started tutorial — Quick Start + worked example in api.md covers it

## Steps

- [ ] Commit TASK.md
- [ ] Create docs/api.md
- [ ] Create docs/architecture.md
- [ ] Rewrite README.md
- [ ] Run prettier, typecheck, verify links
- [ ] Commit each logical piece

## Notes

(Running log of decisions during implementation)
