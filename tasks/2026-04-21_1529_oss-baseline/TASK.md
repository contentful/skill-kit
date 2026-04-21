# OSS baseline for repository governance and licensing

## Scope

**In:**

- Add OSS baseline repository documents and templates aligned with `contentful/contentful-mcp-server` and `contentful/skills#23`
- Add issue templates and pull request template under `.github/`
- Add governance docs (`CONTRIBUTING.md`, `SECURITY.md`, `LICENSE`)
- Add license compliance artifacts (`NOTICE`, `AUTOMATION-FOR-LICENSES.md`, `licenses/`)
- Add automated license update script and wire it through `package.json`
- Update README with support, security, and licensing references

**Out:**

- Changes to SDK runtime behavior or API design
- CI workflow changes beyond what is needed for OSS baseline docs/scripts
- Release process refactors unrelated to OSS baseline

## Context

User request:

"We want to make this repo OSS soon. Please based on:

- https://github.com/contentful/contentful-mcp-server
- https://github.com/contentful/skills/pull/23

add the same behaviour to this repo"

The reference PR adds a practical OSS baseline: contributor-facing templates, security and contribution policy docs, and a repeatable license automation flow that updates `NOTICE` and `licenses/` from direct dependencies.

## Plan

- Mirror the behavior from `contentful/skills#23` while adapting language and commands to this repository (`pnpm`, `typecheck`, `test`, `format:check`).
- Introduce a standalone `scripts/update-licenses.mjs` script that scans direct dependencies from `package.json`, reads package metadata from `node_modules`, updates `NOTICE`, and regenerates `licenses/*.txt` by SPDX id.
- Keep implementation intentionally simple and deterministic so contributors can run one command after dependency changes.

Alternatives considered:

- Reusing the exact `contentful-mcp-server` script with `license-checker-rseidelsohn`. Rejected to avoid introducing another dependency when current repo can rely on installed package metadata for direct deps.
- Manual, static NOTICE management. Rejected because it drifts easily as dependencies evolve.

Trade-offs:

- The script focuses on direct dependencies (runtime + dev), matching the referenced behavior and keeping generated output stable.
- Non-SPDX or combined expressions are normalized to `UNKNOWN` and documented for manual follow-up.

## Steps

- [x] Commit task doc
- [x] Add OSS issue/PR templates under `.github`
- [x] Add `CONTRIBUTING.md`, `SECURITY.md`, and `LICENSE`
- [x] Add license automation script and docs
- [x] Generate `NOTICE` and `licenses/` from current dependency set
- [x] Update `package.json` metadata and scripts
- [x] Update `README.md` OSS support/licensing sections
- [x] Run typecheck, tests, format check, and license update command

## Notes

- Starting from branch `chore/oss-baseline`.
- Will keep wording closely aligned with Contentful OSS patterns while adapting repository-specific instructions.
- Added `.github/ISSUE_TEMPLATE/{bug-report.md,feature-request.md,config.yml}` and `.github/pull_request_template.md` aligned to OSS baseline used in the reference PR.
- Added root governance/legal docs: `CONTRIBUTING.md`, `SECURITY.md`, and `LICENSE` (MIT).
- Added `scripts/update-licenses.mjs` plus `AUTOMATION-FOR-LICENSES.md`, then generated `NOTICE` and `licenses/{MIT.txt,Apache-2.0.txt}` with `pnpm run update-licenses`.
- Updated package metadata (`license`, `repository`, `bugs`, `homepage`) and added `update-licenses` script in `package.json`.
- Verification passed: `pnpm exec tsc --noEmit`, `node --test --import tsx/esm 'src/**/*.test.ts'`, and `pnpm exec prettier --check .`.
