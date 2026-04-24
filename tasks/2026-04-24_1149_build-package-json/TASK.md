# Build: Improved package.json Generation

## Scope

**In:** Version resolution from ancestor package.json (opt-in), `package` config for output metadata, merge with existing package.json, type-safe version strategy.

**Out:** CLI flag changes, SKILL.md generation changes, scripts/run changes.

## Context

The build pipeline generates a minimal `package.json` with only `name` and `version` from the skill definition. This is limiting for three reasons:

1. Version management tools (`release-it`) bump the root `package.json`, but the build ignores it — requiring manual sync.
2. No way to set `description`, `license`, `files`, scoped package names, or other npm fields.
3. The build overwrites any existing `package.json` in the output directory, losing manually-added fields.

User feedback: version resolution must be **opt-in** (not implicit) to avoid surprising filesystem walks. The version strategy should be enforced at the type level: either `version` or `resolveVersion`, never both. The `version` parameter to `generatePackageJson` should be separate from `PackageJsonOptions` since version is a managed property.

## Plan

### Types

Add `PackageConfig` (output-only bag) and `VersionStrategy` (discriminated union) to `src/types.ts`:

```typescript
export interface PackageConfig {
  name?: string;
  description?: string;
  license?: string;
  files?: string[];
  [key: string]: unknown;
}

type VersionStrategy = { version?: string; resolveVersion?: never } | { version?: never; resolveVersion: true };
```

`SkillBuilderConfig` and `ReferenceBuilderConfig` become intersections with `VersionStrategy` and gain `package?: PackageConfig`. `SkillDefinition` and `ReferenceDefinition` gain `readonly resolveVersion: boolean` and `readonly package: PackageConfig | undefined`.

### Version resolution utility

New `src/build/resolve-version.ts`: walks up from `dirname(entryPath)` to find nearest `package.json` with a version. Returns `{ version, source }` or `undefined`. No external deps — simple dirname loop.

### Package.json generation

Rewrite `src/build/package-json-template.ts`:

```typescript
export interface PackageJsonOptions {
  name: string;
  packageConfig?: PackageConfig;
  existingPath?: string;
}

export function generatePackageJson(version: string, opts: PackageJsonOptions): string;
```

`version` is a standalone managed parameter. Merge order: existing (base) -> packageConfig (override) -> name/version (authoritative).

### Build orchestrator

Update `src/build/index.ts`: if `def.resolveVersion`, call `resolveVersionFromAncestor`; otherwise use `def.version`. Pass `def.package` through to `generatePackageJson`.

### Key design choices

- `version` and `resolveVersion` mutually exclusive via union type — no runtime divergence warning needed
- `PackageConfig` is output-only — no build directives mixed in
- `version` param to `generatePackageJson` is separate from options (managed property)
- Both skills and references support `package` + `resolveVersion`
- SKILL.md unchanged — still uses `def.version` for metadata

## Steps

- [ ] Add `PackageConfig`, `VersionStrategy` types; update config/definition interfaces
- [ ] Export `PackageConfig` from `src/index.ts`
- [ ] Thread `resolveVersion` and `package` through `SkillBuilder` and `ReferenceBuilder`
- [ ] Create `src/build/resolve-version.ts` with tests
- [ ] Rewrite `src/build/package-json-template.ts` and update tests
- [ ] Update `src/build/index.ts` orchestrator
- [ ] Verify: typecheck + tests + format + manual build

## Notes
