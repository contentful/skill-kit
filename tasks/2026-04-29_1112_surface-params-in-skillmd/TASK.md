# Surface skill params in generated SKILL.md

## Scope

**In:** Add a "## Parameters" section to the generated SKILL.md template that documents the skill's params schema — field names, types, required/optional, defaults. Update start command examples to show realistic param values. Document sub-skill params.

**Out:** No CLI commands (like `--schema`), no runtime changes, no protocol changes.

## Context

Agents invoke skills via `--params '{}'` but the generated SKILL.md never documents what params a skill accepts. The Zod schema on `SkillDefinition.params` has all the info — names, types, defaults, optionality — it just needs to be rendered into SKILL.md at build time.

This was surfaced by asking: "Do agents know what the params are that we expect them to pass in the first step?" The answer is no.

## Plan

### Design

Add a `## Parameters` section to `generateSkillMd()` output:

**No params:**
```markdown
## Parameters

This skill takes no parameters. Pass `--params '{}'`.
```

**All optional (all have defaults):**
```markdown
## Parameters

| Name | Type | Required | Default |
|------|------|----------|---------|
| `greeting` | string | No | `"Hey there!"` |

All parameters have defaults — `--params '{}'` is valid.

Example with custom values:

```json
{"greeting": "Hey there!"}
```
```

**Has required params:**
```markdown
## Parameters

| Name | Type | Required | Default |
|------|------|----------|---------|
| `repoPath` | string | **Yes** | — |
| `strictness` | `"lenient"` \| `"normal"` \| `"strict"` | No | `"normal"` |

Example:

```json
{"repoPath": ".", "strictness": "normal"}
```
```

Start command examples use realistic JSON when required params exist. Sub-skill params are documented in the sub-skills section.

### Approach: `toJSONSchema()`

Use Zod 4's `schema.toJSONSchema()` (already used at `skill-builder.ts:17`, `engine.ts:285`) to extract field metadata from the params schema. Wrap in try-catch; fall back to no-params behavior on failure.

### Rejected alternatives

- **Dump raw JSON Schema in SKILL.md**: Too verbose, structural noise (`$schema`, `additionalProperties`). Agents parse structured markdown better.
- **Add a `--schema` CLI command**: Overkill for this problem. The info belongs in the static documentation, not a runtime query.
- **Zod introspection without `toJSONSchema()`**: Fragile, undocumented internals. `toJSONSchema()` is the public API.

## Steps

- [ ] Create task doc (this file)
- [ ] Add `extractParamInfo()`, `generateParamsSection()`, and `buildExampleParamsFlag()` to `skillmd-template.ts`
- [ ] Integrate params section into `generateSkillMd()` body template
- [ ] Pass params example into session/stateless instruction generators
- [ ] Add sub-skill params to `generateSubskillSection()`
- [ ] Add tests to `index.test.ts`
- [ ] Typecheck + tests + prettier
- [ ] Build example skill and verify SKILL.md output

## Notes

_(Running log of decisions during implementation)_

## Files

- `src/build/skillmd-template.ts` — all new logic
- `src/build/index.test.ts` — new test cases
