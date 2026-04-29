# Add frontmatter extension fields to skill() builder

## Scope

**In:** Add `argumentHint`, `allowedTools`, `paths`, and `context` to `SkillBuilderConfig` and `SkillDefinition`, emit them as YAML frontmatter in generated SKILL.md, add tests, update all docs.

**Out:** `compatibility` field (mentioned in SPEC.md but not requested). Validation of `context` values. Changes to reference skills. Changes to `skillMd` override wiring.

## Context

The `skill()` builder currently emits only `name`, `description`, and optional `metadata.version` in generated SKILL.md frontmatter. Skill authors need four additional fields to control host behavior without hand-writing SKILL.md:

| TypeScript (camelCase) | YAML (kebab-case) | Type                 | Source spec    |
| ---------------------- | ----------------- | -------------------- | -------------- |
| `argumentHint`         | `argument-hint`   | `string`             | Claude Code    |
| `allowedTools`         | `allowed-tools`   | `string \| string[]` | agentskills.io |
| `paths`                | `paths`           | `string \| string[]` | Claude Code    |
| `context`              | `context`         | `string`             | Claude Code    |

## Plan

### Design

- **camelCase in TS, kebab-case in YAML** — matches existing convention (`skillMd` → custom template, `finalOutput`).
- **Fields on both `SkillBuilderConfig` (input) and `SkillDefinition` (output)** — same pattern as `description`, `system`.
- **Array serialization**: string → YAML scalar; string[] → YAML block sequence. Both valid per specs.
- **Empty arrays treated as unset** — skip emission, matching `triggers` precedent.
- **No validation of `context` values** — host-dependent per spec.
- **Reference skills unchanged** — these fields are about invocation behavior.

### Type signatures

```typescript
// SkillBuilderConfig additions (all optional)
argumentHint?: string;
allowedTools?: string | string[];
paths?: string | string[];
context?: string;

// SkillDefinition additions (readonly, undefined when unset)
readonly argumentHint: string | undefined;
readonly allowedTools: string | string[] | undefined;
readonly paths: string | string[] | undefined;
readonly context: string | undefined;
```

### YAML output examples

```yaml
# string values
argument-hint: "Describe the issue"
allowed-tools: "Bash Read Write"
paths: "**/*.config.ts"
context: "fork"

# array values
allowed-tools:
  - "Bash"
  - "Read"
paths:
  - "src/**/*.ts"
  - "tests/**/*.test.ts"
```

### Alternatives rejected

1. **Emit arrays as space-separated strings** — agentskills.io shows this for `allowed-tools`, but YAML lists are unambiguous and both specs accept them.
2. **Validate `context` as `'fork'` enum** — too restrictive; hosts may add values.
3. **Add to reference skills too** — these fields don't apply to reference skill invocation.

## Steps

- [x] Create branch and task file
- [x] Add fields to `SkillBuilderConfig` and `SkillDefinition` in `src/types.ts`
- [x] Wire fields through `build()` in `src/skill-builder.ts`, add builder tests in `src/skill.test.ts`
- [x] Add `yamlStringOrList` helper and emit logic in `src/build/skillmd-template.ts`, add generation tests in `src/build/index.test.ts`
- [x] Add fields to `ReferenceBuilderConfig`, `ReferenceDefinition`, and `generateReferenceMd` (user follow-up request)
- [x] Update docs: SPEC.md, docs/api.md, docs-site workflow-skills.mdx, reference-skills.mdx, api/index.mdx
- [x] Verify: typecheck + all tests + prettier + build an example
- [x] Add practical-tier fields: license, compatibility, agent, model, effort, disableModelInvocation, userInvocable
- [x] Add arguments field
- [x] Refactor YAML output: allowed-tools → space-separated string, paths/arguments → inline arrays
- [x] Add example values to example skills
- [x] Final docs pass: all 5 locations updated for all 12 fields

## Fields implemented

| TypeScript               | YAML                       | Type                 | Format                 |
| ------------------------ | -------------------------- | -------------------- | ---------------------- |
| `argumentHint`           | `argument-hint`            | `string`             | quoted scalar          |
| `arguments`              | `arguments`                | `string \| string[]` | inline array           |
| `allowedTools`           | `allowed-tools`            | `string \| string[]` | space-separated string |
| `paths`                  | `paths`                    | `string \| string[]` | inline array           |
| `context`                | `context`                  | `string`             | quoted scalar          |
| `license`                | `license`                  | `string`             | quoted scalar          |
| `compatibility`          | `compatibility`            | `string`             | quoted scalar          |
| `agent`                  | `agent`                    | `string`             | quoted scalar          |
| `model`                  | `model`                    | `string`             | quoted scalar          |
| `effort`                 | `effort`                   | `string`             | quoted scalar          |
| `disableModelInvocation` | `disable-model-invocation` | `boolean`            | bare YAML              |
| `userInvocable`          | `user-invocable`           | `boolean`            | bare YAML              |

## Notes

- `skillMd` custom override is not wired in `buildSkill()` — the build always calls `generateSkillMd()`. Separate issue; new fields are still accessible to custom `skillMd` functions via the `skill` parameter.
- Added reference skill support per user follow-up request after initial plan was approved.
- `arguments` field emits in frontmatter but `$name` substitution in the generated SKILL.md body is not wired up — the body is auto-generated, not hand-written. Follow-up to explore deriving arguments from skill params.
