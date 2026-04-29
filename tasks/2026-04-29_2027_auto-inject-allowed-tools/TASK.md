# Auto-inject default `allowed-tools` in SKILL.md frontmatter

## Scope

**In:** Auto-inject `Bash(scripts/run *)` and `Read` into `allowed-tools` frontmatter at build time for both workflow and reference skills, merged with author-declared tools.

**Out:** MCP tool names (host can't act on them), primitive-mapped tools (host-specific, already pre-approved), any changes to runtime behavior.

## Context

Every skill needs `Bash` and `Read` pre-approved in CLI mode — `Bash` to invoke `scripts/run`, `Read` to read the JSONL session file. Today `allowedTools` is optional and author-declared, meaning every skill invocation prompts users for permission. The SKILL.md body even says "allow both permanently" — we should just declare them.

The agentskills.io spec supports scoped patterns like `Bash(scripts/run *)` in the `allowed-tools` field.

MCP tool names (`mcp__<name>__start` etc.) are NOT included because there's no host-side mechanism to pre-approve individual MCP tools via frontmatter — MCP server approval is a server-level trust decision in Claude Code settings.

## Plan

Add a `computeAllowedTools()` helper in both template files that merges defaults (`Bash(scripts/run *)`, `Read`) with author-declared tools. Always emit the `allowed-tools` field.

### Type signatures

```typescript
// In skillmd-template.ts
function computeAllowedTools(skill: SkillDefinition): string[];

// In reference-md-template.ts
function computeReferenceAllowedTools(def: ReferenceDefinition): string[];
```

Both return `[...new Set([...defaults, ...authorTools])]`.

The `yamlSpaceSeparated` function already handles `string[]` → space-separated quoted string.

## Steps

- [ ] Create branch
- [ ] Commit task file
- [ ] Implement `computeAllowedTools` in `skillmd-template.ts`
- [ ] Implement `computeReferenceAllowedTools` in `reference-md-template.ts`
- [ ] Update tests in `index.test.ts`
- [ ] Typecheck + test + format
- [ ] Update SPEC.md §11
- [ ] Update docs/api.md
- [ ] Update docs-site pages
- [ ] Rebuild example skills
- [ ] Final checkpoint

## Notes

- `Bash(scripts/run *)` is the idiomatic Claude Code scoped pattern (space before `*`, not colon)
- Defaults go first in the output array so they appear before author tools in the frontmatter
