# CI/CD & Release Pipeline

## Scope

**In:** GitHub Actions CI (PR checks) and CI/CD (push-to-main release) workflows, release-it configuration, build tsconfig, vault-secrets.

**Out:** Nx adoption, changes to the skill build system (bun vs Node SEA), README updates.

## Context

skill-kit has no CI/CD. The sibling agents-kit project uses `contentful/assemblies` reusable workflows tightly coupled to `@contentful/nx`. Since skill-kit is a single package (not a monorepo), we write self-contained workflows using `release-it` for automated versioning and publishing to GitHub Packages. User has experience with release-it and prefers it over semantic-release.

## Plan

**Approach:** Two workflow files (`ci.yml`, `ci-cd.yml`) matching agents-kit naming conventions, with `release-it` for version bumps, GitHub Releases, and npm publish.

**Rejected:**

- Nx + assemblies reusable workflows: too coupled, unnecessary for a single package
- semantic-release: user prefers release-it
- bun as npm/peer dependency: `.npmrc` has `ignore-scripts=true` which blocks the bun npm package postinstall; also considering Node SEA as alternative — separate concern

**Trade-offs:** Self-contained workflows mean we maintain CI config ourselves rather than inheriting from assemblies. Worth it for simplicity and independence from Nx.

## Steps

- [x] Create `tsconfig.build.json` + add `build` script to package.json
- [x] Verify build produces correct dist/ output
- [x] Install release-it deps + create `.release-it.json`
- [x] Create `.contentful/vault-secrets.yaml`
- [x] Create `.github/workflows/ci.yml`
- [x] Create `.github/workflows/ci-cd.yml`
- [x] Run full checkpoint (typecheck + test + format)
- [ ] Bootstrap `v0.1.0` tag on main

## Notes

- Dropped `@release-it/conventional-changelog` — no CHANGELOG needed. release-it uses GitHub's auto-generated release notes instead (`autoGenerate: true`).
- No `tslib` references in build output — `importHelpers: true` with `target: es2022` emits no helpers.
- Pre-existing formatting issues in examples/ and pnpm-lock.yaml fixed in separate commit.
