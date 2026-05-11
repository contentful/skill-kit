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

- `CODE_OF_CONDUCT.md` — Contributor Covenant v2.1
- `.github/CODEOWNERS` — `@contentful/team-optimization`

### Prerequisites (manual, outside PR)

1. Configure `@contentful/skill-kit` on npmjs.org for OIDC trusted publishing from `contentful/skill-kit`
2. Make repo public on GitHub

## Steps

- [x] Create branch and task file
- [ ] Update `.npmrc`
- [ ] Update `package.json` publishConfig
- [ ] Update `.github/workflows/ci.yml`
- [ ] Update `.github/workflows/ci-cd.yml`
- [ ] Update `CLAUDE.md`
- [ ] Create `CODE_OF_CONDUCT.md`
- [ ] Create `.github/CODEOWNERS`
- [ ] Run verification (typecheck, lint, format)
- [ ] Commit and push

## Notes

(Running log of decisions during implementation)
