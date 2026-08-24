# Agent Guide

Read [`SPEC.md`](./SPEC.md) before substantive changes. It is the design source of truth for the SDK's builder API, workflow semantics, protocol, and build output.

| What you need                     | Where to look                                             |
| --------------------------------- | --------------------------------------------------------- |
| System structure and data flow    | [`ARCHITECTURE.md`](./ARCHITECTURE.md)                    |
| Setup and verification            | [`CONTRIBUTING.md`](./CONTRIBUTING.md)                    |
| Detailed author-facing behavior   | [`SPEC.md`](./SPEC.md) and [`docs/api.md`](./docs/api.md) |
| Historical decisions              | [`docs/ADRs/`](./docs/ADRs/) and [`tasks/`](./tasks/)     |
| Public overview and examples      | [`README.md`](./README.md)                                |
| Detailed task and commit workflow | [`CLAUDE.md`](./CLAUDE.md)                                |

## Guardrails

- Use pnpm and the Node.js 24 release pinned in `.nvmrc` for development. `package.json` declares the published package's Node.js 24+ minimum; `.npmrc` enforces it for local installs and disables dependency install scripts.
- Preserve ESM and NodeNext module semantics. Source imports use `.js` extensions so compiled output resolves correctly.
- Treat the public TypeScript types as product behavior. Fix incorrect inference instead of adding casts or `any` workarounds.
- Keep workflow state append-only. Changes to state, transitions, or replay must preserve deterministic reconstruction.
- Keep `ARCHITECTURE.md`, `SPEC.md`, `README.md`, `docs/`, and matching `docs-site/src/pages/` content synchronized when public behavior changes.
- Do not hand-edit generated example skill output without also changing its source or build generator.
- Keep stdout machine-readable for CLI protocol operations; write diagnostics to stderr.
- Preserve both protocol families: MCP and CLI share the same workflow engine, and the CLI must retain both session and stateless modes.
- Treat `src/skill-builder.ts`, `src/types.ts`, `src/types/`, `src/runtime/engine.ts`, `src/protocol/`, and `src/build/` as high-blast-radius surfaces. Run the full verification set for changes there; if generated output changes, also run `pnpm build:examples` and review the generated skill diffs.
- For non-trivial work, keep a timestamped `tasks/YYYY-MM-DD_hhmm_<slug>/TASK.md` as the durable record of scope, context, plan, steps, and implementation decisions.
- Use conventional commits in coherent slices that compile independently; keep unrelated cleanup in a separate commit.
- Ask before changing release credentials, package registry configuration, or GitHub Actions permissions.
- Never commit or push directly to `main`; use a focused branch and pull request.

## Safety and permissions

- Session files contain model responses and parameters. Preserve the private-directory, exclusive-create, and restrictive-permission protections in `src/protocol/secure-tmp.ts` and `src/protocol/session.ts`.
- Build code writes temporary wrappers and generated output. Confirm target paths before changing deletion or overwrite behavior.
- Do not include secrets, credentials, private URLs, or internal incident details in this public repository.

## Verification

```sh
pnpm typecheck && pnpm test && pnpm lint && pnpm run format:check && pnpm build
pnpm run typecheck:examples && pnpm run test:examples
pnpm --dir docs-site install --frozen-lockfile && pnpm --dir docs-site run build
```

This is the full review-ready check set; `CONTRIBUTING.md` lists the shorter contributor baseline.
