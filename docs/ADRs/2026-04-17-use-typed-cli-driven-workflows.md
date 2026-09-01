# Use typed CLI-driven workflows

## Status

Accepted

## Context

Single-file prose skills are easy to start but become difficult to review and execute consistently as workflows gain multiple stages, conditional branches, shared state, and structured outputs. The repository specification describes those limitations and defines an agent-to-CLI loop in which the agent performs reasoning while the SDK controls workflow progression (`SPEC.md`).

The first implementation commits established the project scaffold and then introduced the core `skill`, `step`, fragment, action, and type primitives (`e75e027`, `c1ec1ab`).

## Decision

Represent workflow skills as typed TypeScript definitions executed by a small SDK engine. Each named step declares its prompt, optional response schema, optional deterministic action, and transition. The engine validates boundaries, records append-only state, and selects the next step.

Keep agent reasoning in prose, but let the SDK own control flow, schema validation, state reconstruction, and generated invocation instructions. Package built skills behind `scripts/run` so agent hosts do not depend on the internal bundle layout.

## Consequences

- Workflow branches and response contracts are reviewable as code.
- Skills can provide deterministic actions and rendered output without relying on the model to reproduce procedural steps.
- TypeScript and runtime schema behavior form part of the public API and require compatibility testing.
- Authors must build a skill before distribution, and generated packages include a runtime adapter plus instructions.
- Host portability requires protocol adapters and host-aware prompt primitives in the SDK.
- Simple reference-only use cases remain supported separately through progressive-disclosure reference skills.
