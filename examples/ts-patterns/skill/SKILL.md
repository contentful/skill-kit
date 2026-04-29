---
name: ts-patterns
description: "TypeScript patterns and idioms reference. Use when writing TypeScript and need a quick refresher on generics, discriminated unions, builder patterns, or error handling."
metadata:
  version: "1.0.0"
argument-hint: "[topic]"
paths: "**/*.ts"
---

# ts-patterns

This skill provides reference information on demand.

## MCP mode (preferred)

If you have MCP tools for this skill (e.g., `mcp__ts-patterns__topic`), use them:

- Call `topics` to list available reference topics.
- Call `topic` with a topic name to retrieve its content.

Present the content to the user. Do not show raw tool calls.

## CLI mode (fallback)

Resolve the **absolute path** to `scripts/run`
from this SKILL.md file's directory. Use the absolute path in all commands — do not `cd` into the
skill directory. In the examples below, `<skill>/scripts/run` is a placeholder for this absolute path.

- `<skill>/scripts/run topic generics` — Generics cheat sheet — constraints, conditional types, mapped types, infer
- `<skill>/scripts/run topic discriminated-unions` — Discriminated unions — type narrowing with literal discriminants
- `<skill>/scripts/run topic builder-pattern` — Builder pattern — fluent APIs with type accumulation
- `<skill>/scripts/run topic error-handling` — Error handling — Result types, custom errors, exhaustive matching

To list all available topics: `<skill>/scripts/run`
