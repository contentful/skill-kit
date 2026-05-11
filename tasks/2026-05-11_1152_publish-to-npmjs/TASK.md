# Publish to npmjs + Open-Source Readiness

## Scope

**In:** Switch package publishing from GitHub Packages to npmjs.org (public), add community files for open-source readiness.

**Out:** Changing release tooling (keep release-it), removing internal infra files (catalog-info.yaml, vault-secrets.yaml stay).

## Context

`@contentful/skill-kit` is being open-sourced. GitHub Packages requires credentials to install — public users need the package on npmjs.org. contentful.js already publishes to npmjs using OIDC trusted publishing (GitHub Actions mints ephemeral identity tokens that npm accepts, no stored npm token). We adopt the same approach.

## Plan

### Registry switch

- `.npmrc`: point `@contentful:registry` to `https://registry.npmjs.org`
- `package.json`: set `publishConfig` to `{ "registry": "https://registry.npmjs.org/", "access": "public" }`
- Workflows: change `registry-url` to npmjs, remove `NODE_AUTH_TOKEN` from install steps

### npm auth model (OIDC trusted publishing)

- `id-token: write` permission (already present) enables GitHub Actions to mint OIDC tokens
- `actions/setup-node` with `registry-url` configures npm to use OIDC automatically
- No `NODE_AUTH_TOKEN` needed for publish — npm authenticates via OIDC identity
- Vault continues to provide GitHub token for release-it (GitHub releases, git push)

### Community files

- `CODE_OF_CONDUCT.md` — Contentful standard (links to contentful.com/developers/code-of-conduct/)
- `.github/CODEOWNERS` — `@TimBeyer`

### Prerequisites (manual, outside PR)

1. Configure `@contentful/skill-kit` on npmjs.org for OIDC trusted publishing from `contentful/skill-kit`
2. Make repo public on GitHub

## Steps

- [x] Create branch and task file
- [x] Update `.npmrc`
- [x] Update `package.json` publishConfig
- [x] Update `.github/workflows/ci.yml`
- [x] Update `.github/workflows/ci-cd.yml`
- [x] Update `CLAUDE.md`
- [x] Create `CODE_OF_CONDUCT.md`
- [x] Create `.github/CODEOWNERS`
- [x] Run verification (typecheck, lint, format)
- [x] Commit and push
- [x] Open PR

## Notes

- CODE_OF_CONDUCT.md uses Contentful's standard format (from github.com/contentful/.github) rather than inlining the full Contributor Covenant. This matches other Contentful open-source repos.
- CODEOWNERS set to `@TimBeyer` rather than a team for now.
- Removed the "Restore .npmrc" step from ci-cd.yml release job — it was only needed to undo pnpm's injection of GitHub Packages auth into .npmrc.
- Audited against Confluence's "Open Source Repository Guidelines" (page 5567283282). All items pass except branch protections (GitHub setting) and SAST (currently disabled in catalog-info.yaml).
- NPM org access is managed by IT (admin: Michael Pearce). OIDC trusted publishing must be configured on npmjs.org before first release — see https://contentful.atlassian.net/wiki/pages/viewpage.action?pageId=776045263
- PR: https://github.com/contentful/skill-kit/pull/68
