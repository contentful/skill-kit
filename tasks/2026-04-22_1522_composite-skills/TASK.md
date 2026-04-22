# Composite Skills

## Scope

**In:** Extend `SkillDefinition` and `SkillBuilder` to support sub-skills and topics. Add `RedirectResult` to the engine, a composite CLI entry point, build pipeline support, and test utilities.

**Out:** Example composite skill (follow-up). SPEC.md updates (follow-up). Migration of existing skills.

## Context

Customer-facing Contentful skills overlap in references and purpose. Users want a single skill that bundles a shared reference directory, a dispatcher state machine, and multiple sub-skill state machines. The dispatcher can short-circuit with a reference topic when a full workflow isn't needed.

Design agreed in conversation: extend `skill()` rather than a separate `composite()` builder. Sub-skills are standalone `SkillDefinition`s registered via `.subskill()`. Topics registered via `.topic()`. Routing via `next` returning `'subskill:<name>'` or `'topic:<name>'`. Engine returns `RedirectResult` for unresolvable step targets. Nesting prevented at runtime.

Full plan: `~/.claude/plans/so-we-are-using-lexical-clover.md`

## Plan

Extend existing `SkillDefinition`/`SkillBuilder` rather than introducing a new `CompositeDefinition`.

1. Types & engine — add `SubskillRegistration`, `RedirectResult`, extend `SkillDefinition`, engine redirect check
2. Builder — `.subskill()` and `.topic()` on `SkillBuilder`
3. Entry point — `compositeMain()` handling dispatch, redirect, namespacing, topics, direct sub-skill access
4. Build pipeline — detect subskills, composite wrapper, SKILL.md
5. Test utilities — `runComposite()` helper
6. Lint — validate subskill/topic registrations

## Steps

- [ ] Phase 1: Types & Engine (`src/types.ts`, `src/runtime/engine.ts`)
- [ ] Phase 2: Builder Extensions (`src/skill-builder.ts`, `src/index.ts`)
- [ ] Phase 3: Composite Entry Point (`src/protocol/composite-entry.ts`, `src/cli.ts`)
- [ ] Phase 4: Build Pipeline (`src/build/`)
- [ ] Phase 5: Test Utilities (`src/test.ts`)
- [ ] Phase 6: Lint (`src/lint/index.ts`)

## Notes

- `scripts/run` is always the single entry point (hosts wildcard-allow `scripts/run *`)
- No nesting: `.subskill()` throws if the sub-skill already has subskills (structural typing prevents compile-time enforcement)
- Step names namespaced with `/`: `doctor/diagnose` — engines never see prefixes
