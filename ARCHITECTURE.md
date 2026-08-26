# Architecture

This file is the repository-level architecture entry point for `@contentful/skill-kit`. The
detailed architecture already maintained under `docs/` remains authoritative; this page avoids
creating a second copy that could drift.

## Architecture documentation

- [`docs/architecture.md`](docs/architecture.md) explains the implemented CLI and MCP protocols,
  workflow engine, prompt assembly, primitives, and host-aware behavior.
- [`SPEC.md`](SPEC.md) defines the SDK's intended public concepts, contracts, and behavior. When the
  implementation and specification differ, record the discrepancy and reconcile them explicitly.
- [`docs/api.md`](docs/api.md) documents the author-facing API.
- [`docs/ADRs/`](docs/ADRs/) records durable architectural decisions and their consequences.
- [`tasks/`](tasks/) contains scoped implementation plans and historical delivery context. Tasks
  can explain how work was executed, but they do not replace durable architecture documentation.

## System boundary

Skill Kit is a TypeScript SDK and build CLI for defining portable agent skills as typed workflows.
It packages definitions for local execution through CLI or MCP transports; it is not a hosted
service. The workflow engine owns state, validation, transitions, and deterministic actions, while
the agent host performs reasoning and invokes host tools.

## Keeping documentation aligned

Update `docs/architecture.md` when implementation structure or runtime flows change, and update
`SPEC.md` when a public contract changes. Add an ADR for a durable decision whose context and
trade-offs should survive the task that introduced it. Keep task records as implementation history
rather than migrating them wholesale into ADRs.
