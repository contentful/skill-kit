# Release pipeline recovery

## Scope

**In:** Repair the release pipeline after package version `1.10.2` was published without a matching version commit,
tag, or GitHub Release; serialize release creation; publish packages only from published GitHub Releases; add a manual
publish recovery path; document and verify the release invariants.

**Out:** Changing registries, credentials, Vault paths, package visibility, release note formatting, or the semantic
version calculation rules.

## Context

Two dependency PRs were merged to `main` 27 seconds apart on 2026-07-15. CI/CD run `29429280821` calculated
`1.10.2`, published it to GitHub Packages, created its local version commit and tag, then failed to push `main` because
the second merge had advanced the branch. `release-it` rolled back the tag and local changes, but a published package
version cannot be rolled back. Run `29429313525` and every later release run then calculated `1.10.2` again and failed
because that package version already exists.

The current workflow lets one `release-it` invocation perform all release effects in this order:

```text
version package -> publish package -> commit -> tag -> push -> create GitHub Release
```

The package publish therefore becomes visible before the durable GitHub source reference exists. The workflow also has
no concurrency group, so multiple main-branch release jobs can execute concurrently.

User request: bring GitHub releases back in sync, add at least a concurrency group, and assess splitting release
creation from package publishing so a release can be recovered manually.

## Plan

### Design

Keep CI and release creation in `.github/workflows/ci-cd.yml`, but make release creation stop after the version commit,
tag, push, and GitHub Release:

```json
{
  "npm": {
    "publish": false
  }
}
```

Serialize the `release` job across main-branch runs with a repository-scoped concurrency group, preserve queued runs,
and check out the latest `main` after the job acquires the concurrency slot. Later queued runs may find no additional
releasable commits, which is safe.

Add `.github/workflows/publish.yml` with these entry points:

```yaml
on:
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      tag: # existing published GitHub Release tag, e.g. v1.10.2
```

The publish job checks out the immutable release tag, requires `v<package.json version>` to match, verifies that the
GitHub Release is published, builds the package, and publishes that exact version. It first checks the registry and
returns success if the version already exists, making recovery idempotent. The release event supports releases created
through automation or manually in GitHub; `workflow_dispatch` provides a direct retry path if an event is missed or a
publish run fails.

The first run after this change lands will calculate `1.10.2` from `v1.10.1`, create the missing version commit, tag,
and GitHub Release, then trigger the publish workflow. Since `1.10.2` already exists in the registry, the publish job
will verify it and finish without attempting to overwrite it. This restores GitHub and the repository to the registry's
current version.

### Release invariants

- A package is published only from a published GitHub Release and its immutable tag.
- The tag version must equal `package.json#version` at that tag.
- Retrying a publish for an existing version is a successful no-op.
- Release creation is serialized; an in-progress release is never canceled.
- The release workflow retains the existing Vault token and registry configuration.

### Alternatives rejected

- **Concurrency only:** prevents overlapping release jobs, but a new merge can still advance `main` after an older job
  checks out. More importantly, the existing release-it order still publishes before pushing the source tag, so any git
  push failure can recreate the same split-brain state.
- **Publish on tag push:** improves the ordering, but can publish before GitHub Release creation finishes. Triggering on
  `release.published` gives maintainers a visible, manually creatable gate and a clearer recovery path.
- **Keep package publishing inside release-it and add a special one-time `1.10.2` bypass:** repairs this incident but
  preserves the failure mode.
- **Create `v1.10.2` immediately on the current `main`:** the tagged source would still contain package version
  `1.10.1`. Letting the repaired release workflow make the version commit preserves the tag/version invariant.

### Trade-offs

- A release now uses two workflow runs, so package availability follows GitHub Release creation by a short delay.
- The automation bot token from Vault must continue to create the release event; the manual publish dispatch remains a
  fallback if GitHub suppresses or loses that event.
- Registry existence checks make retries safe, but they intentionally do not compare package tarball contents because
  registries do not expose a canonical source archive for byte-for-byte verification.

## Steps

- [x] Read `SPEC.md` and existing release task/history
- [x] Reconstruct the failing run sequence from GitHub Actions logs
- [x] Commit this task record
- [x] Disable npm publishing in release-it and serialize release creation
- [x] Add release-triggered and manually dispatchable package publishing workflow
- [x] Validate YAML, formatting, and the repository checkpoint
- [x] Review the diff and update implementation notes
- [x] Commit each coherent workflow change
- [x] Push the branch and open a PR

## Notes

- GitHub Actions logs show `npm publish` for `1.10.2` completed at 2026-07-15 15:44:16 UTC. The subsequent `git push`
  created the remote tag but failed to update `main` with a non-fast-forward error; release-it then deleted the remote
  tag. The next run reached npm at 15:44:52 UTC and was rejected because `1.10.2` already existed.
- GitHub currently has release/tag `v1.10.1` and no `v1.10.2`; `main` contains package version `1.10.1`. All CI/CD
  release jobs since the incident fail while trying to republish `1.10.2`.
- Unrelated user changes in `docs-site/src/layouts/BaseLayout.astro`, `docs-site/src/styles/global.css`, and `.DS_Store`
  were present before this task and must remain untouched.
- The release job uses `queue: max` so a burst of main pushes keeps all pending release jobs. It also checks out the
  latest `main` only after acquiring the concurrency slot, allowing the first queued job to release all commits that
  have landed by then. Subsequent jobs safely find no additional release when appropriate.
- The publish workflow uses `release.published` rather than tag push as its automatic gate. A maintainer can create a
  missing GitHub Release from an existing tag to trigger publishing, or dispatch the Publish workflow with that tag to
  retry directly. Both paths require the GitHub Release to exist and be non-draft.
- A release-it dry run calculated `1.10.2`, included all commits since `v1.10.1`, performed the version/commit/tag/push
  phases, and did not include `npm publish`. The current `v1.10.1` release passed the new tag/version/non-draft
  validation logic locally.
- The required checkpoint passed on Node 24.21.0 and pnpm 10.34.5: TypeScript, oxlint (19 existing warnings, no
  errors), all 427 SDK tests, and repository-wide Prettier.
- Review-ready verification also passed: package build, example typecheck, all 22 example tests, and the Astro docs
  production build with all 15 pages generated.
