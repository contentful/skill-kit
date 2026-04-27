# Primitives Review — XML Output, Typed Contracts, Composable Prompts

## Scope

**In:**

- Rename `tasks` → `checklist` and `subtask` → `subagent`
- Expand host registry from 3 to 9 agents with corrected tool names
- Composable prompt vocabulary: `system`, `act.*`, `prompt` — array returns from prompt functions
- Collapse 5 step-level primitive fields into single `act:` field accepting `ActSegment`
- Unified `act` namespace — single barrel for all primitives, exported + context-injected
- Skill-level `system` field for persona/tone
- XML output format replacing natural language prose generation
- Typed `Primitive<TInput, TConfig, TTools>` contract with `definePrimitive()` — colocated builder, renderer, tool candidates, and preamble row per primitive
- Preamble as markdown table mapping XML tags to host tools
- `<rendered>` tag for pre-rendered output from `render` functions
- `--tools` CLI flag for true per-primitive hybrid resolution
- SKILL.md "How this skill works" section explaining XML tags for agents
- `docs/hosts.md` — comprehensive reference of 13 agents
- `game-jam` showcase skill exercising all primitives and composition patterns

**Out:**

- New primitives (browser, memory, notifications — too host-specific)
- MCP elicitation support (future)

## Context

The SDK had 5 interaction primitives producing natural language prose that told agents which tools to use. Three problems:

1. Per-step prose was undifferentiated — identical output regardless of host
2. The host registry was stale (3 hosts, wrong tool names)
3. Only `askUser` and `confirm` were exercised in examples

The review expanded into a full redesign:

- Prose generation replaced by semantic XML — structured, self-describing, consistent across hosts
- Per-primitive `definePrimitive()` contract colocates everything about a primitive in one file
- Composable prompt arrays let steps combine `system`, `act.*`, and instructions without extra round-trips
- True hybrid resolution: `--tools` flag for explicit tool reporting, host registry as per-primitive fallback

## Key Design Decisions

**XML output over prose:** LLMs understand XML natively. Structured tags (`<checklist><item>`, `<plan><step>`) are more direct than prose paragraphs describing the same data. The preamble maps tags to tools once.

**`definePrimitive()` contract:** One object per primitive exports tag, tools, create, render, preambleRow. TypeScript validates consistency. Adding a primitive = one `definePrimitive()` call + one array entry.

**Per-primitive hybrid resolution:** Explicit tools (from `--tools`) checked per-primitive first. If no match, HOST_REGISTRY fallback for that primitive. An agent reporting `AskUserQuestion,Agent` gets those for askUser/subagent while plan/checklist fall back to registry.

**`act` as unified namespace:** `act.askUser()`, `act.confirm()`, etc. Both exported and injected via `PromptContext`. Single injection point for future host-aware evolution.

**Skill-level `system`:** Declared once, prepended to preamble, inherited by all steps. Steps override with `system` in array prompts.

## Steps

- [x] Rename `tasks` → `checklist` and `subtask` → `subagent`
- [x] Expand host registry (3 → 9 hosts)
- [x] Implement centralized CAPABILITY_MAP + hybrid prose resolution
- [x] Update preamble for all known tools
- [x] Build game-jam showcase skill
- [x] Create docs/hosts.md agent capability reference
- [x] Composable prompt vocabulary (system, act, array returns)
- [x] Collapse 5 primitive fields → single `act:` field
- [x] Unify primitive access through `act` namespace
- [x] Add skill-level `system` field
- [x] XML output format replacing prose generation
- [x] Typed `Primitive` contract with `definePrimitive()`
- [x] Colocate primitive definition, rendering, preamble data
- [x] Preamble as tag reference table
- [x] SKILL.md "How this skill works" section
- [x] `<rendered>` tag for render output
- [x] `--tools` CLI flag + per-primitive hybrid resolution
- [x] Registry tests (9 tests covering hybrid fallback, XML rendering, preamble rows)
- [x] Clean up game-jam and get-to-know-you examples
- [ ] Final docs pass (SPEC.md, api.md, architecture.md, docs-site, README)

## Notes

- `prose/` directory deleted entirely — 26 per-tool prose files replaced by XML rendering in each primitive's `render` method
- `ProseGenerator` interface removed — replaced by `renderPrimitive()` from registry
- `resolveProseGenerator`/`buildProseGenerator` removed — replaced by `resolveTools()` returning `Record<string, string | undefined>`
- `dist/` must be rebuilt after type changes for examples to resolve correctly
- `fragment` still exists for reusable text snippets — `system` is for behavioral directives
- Prompt-before-act convention in step configs: prompt (intent) then act (mechanism)
