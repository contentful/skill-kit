# Step Config API Redesign + Primitives Enrichment

## Scope

**In:**

- Remove `StepConfig.act` field — interactions go through `prompt` (accepts segments directly)
- Remove `StepConfig.render` / `PromptContext.rendered` — replaced by `view()` helper in `prompt`
- Restructure `action` from flat `ActionDefinition` to `{ run, input?, stash? }`
- Remove `actionInput` and `afterAction` — functionality absorbed by `action.input` and `action.stash`
- Top-level `stash` receives `{ output, action? }` (runs after `action.stash`)
- New `ViewSegment` type and `view()` helper export
- New `terminal` constant export
- Enrich `AskUserOption` with `preview` field
- Add `header` to `AskStructuredConfig`
- Validation: header ≤12 chars, options 2–4
- New `act.survey()` primitive for batched multi-question interactions
- Three-tier preamble fallback for survey (batch / sequential / conversational)
- Survey overflow: >4 questions splits into multiple blocks (no crash)
- Preview as child `<preview>` element in XML (not attribute)
- Lifecycle JSDoc on `StepConfig`
- Update all docs (SPEC.md, docs/api.md, docs/architecture.md, docs-site MDX, README)

**Out:**

- Renaming `StepConfig.prompt` (stays as `prompt` — see Notes)
- Renaming the `prompt` tagged template (stays as `prompt`)
- Renaming `act` builder namespace or `PromptContext.act` (stays)
- Wire protocol changes beyond view/survey XML additions
- New host registry entries

## Context

User feedback (single internal user) flagged naming collisions and ergonomic friction in the v0.6 API:

- `act: act.askUser()` stutter — step config field and builder namespace share a name
- `prompt: prompt\`...\`` — step config field and tagged template share a name
- `render`/`rendered` asymmetry — define `render`, access `rendered` in PromptContext
- `{ terminal: true }` object literal inconsistency — only place `next` returns an object
- Non-obvious step lifecycle — output → stash → actionInput → action → afterAction → next ordering buried in SPEC.md prose

Root cause: StepConfig grew piecemeal with three prompt input paths (`prompt`, `act`, `render`) and a four-callback action lifecycle (`stash`, `actionInput`, `action`, `afterAction`). Breaking changes approved — single internal user.

Additionally, the askUser primitive only modeled a fraction of what host tools support. Researched capabilities across Claude Code, Codex, OpenCode, Gemini CLI, and Cline family (see host capability matrix below).

## Plan

### New StepConfig shape (7 fields, down from 11)

```typescript
/**
 * Lifecycle: prompt → model → validate(output) → action.input → action.run → action.stash → stash → next
 */
interface StepConfig<TOutput, TContext, TStash, TActionOutput> {
  prompt?: string | PromptPiece | PromptPiece[] | PromptFn<TContext, TStash>;
  output: TOutput;
  action?: {
    run: ActionDefinition;
    input?: (ctx: { output: z.infer<TOutput>; stash: Readonly<TStash> }) => unknown;
    stash?: (ctx: { result: TActionOutput }) => Partial<TStash>;
  };
  stash?: (ctx: { output: z.infer<TOutput>; action: TActionOutput }) => Partial<TStash>;
  next: string | TransitionFn<z.infer<TOutput>, TActionOutput> | { terminal: true };
  maxVisits?: number;
  onMaxVisits?: string;
}
```

### Primitives enrichment

- `AskUserOption` gains `preview?: string` — rendered as `<preview>` child element in XML
- `AskStructuredConfig` gains `header?: string` (≤12 chars)
- Validation at create-time: header ≤12 chars, options 2–4
- New `SurveyConfig` / `SurveyQuestion` types
- New `surveyPrimitive` with three-tier fallback preamble
- Batch-capable tools (tier 1): `AskUserQuestion`, `ToolRequestUserInput`, `question`, `ask-user`
- Single-question tools (tier 2): `ask_followup_question`
- No tool (tier 3): conversational fallback

### Host tool capability matrix

Researched from official docs for Claude Code, Gemini CLI, OpenCode, and hosts.md:

| Capability  | AskUserQuestion (CC) | ToolRequestUserInput (Codex) | question (OpenCode) | ask-user (Gemini) | ask_followup_question (Cline/Roo/Kilo) |
| ----------- | -------------------- | ---------------------------- | ------------------- | ----------------- | -------------------------------------- |
| Batching    | Yes (1–4)            | Yes                          | Yes                 | Yes (1–4)         | No                                     |
| Headers     | Yes (≤12)            | No                           | Yes                 | Yes (≤16)         | No                                     |
| Preview     | Yes                  | No                           | Unknown             | No                | No                                     |
| multiSelect | Yes                  | Unknown                      | Unknown             | Yes               | No                                     |
| Max options | 2–4                  | Unknown                      | Unknown             | 2–4               | 2–4                                    |

SDK uses the strictest common denominator: header ≤12 chars, options 2–4.

### Alternatives rejected

- **Renaming only the `act` step field** (e.g. to `interact` / `primitive`) — too shallow, doesn't fix the structural issue of three separate prompt input paths
- **Renaming `StepConfig.prompt` to `instruct`** — tried and reverted. Made the API more surprising: every type, interface, XML tag, and wire protocol field says `prompt`, but the one place you define it wouldn't. The `prompt: prompt\`...\`` stutter only occurs with the tagged template in callbacks, which is one specific case.
- **Renaming the `prompt` tagged template** to `md` or `text` — loses semantic meaning ("this is prompt content")
- **Making `render.*` return tagged segments directly** — breaks composability (render helpers are building blocks used inside larger strings)
- **Auto-batching adjacent `act.askUser()` calls into survey** — magical, makes preamble generation harder, obscures intent
- **General capability model for host tools** — premature; hosts report tool names not capabilities. Inline BATCH_TOOLS list in survey preambleRow is sufficient for now.

### Trade-offs

- `.extend()` can no longer independently override `act:` — must override the whole `prompt`. Acceptable: base steps in practice have empty prompts that extend fills entirely.
- `action.stash` is convenience sugar — you could put everything in top-level `stash` since it gets `{ output, action? }`. Separating keeps action concerns self-contained.
- `action.input` sees accumulated stash from _prior_ steps only, not this step's `stash` callback (which runs after action). Matches the lifecycle ordering.

### Design decisions from reviewer feedback

- **Top-level `stash` gets `{ output, action? }`** — reviewer pointed out that splitting stash and afterAction into two disconnected places forces logic splitting. Giving top-level stash access to both means developers are never forced to split.
- **Preview as `<preview>` child element** — reviewer flagged that multi-line markdown in an XML attribute is wrong. Child element is the correct structure.
- **Survey overflow: split, don't crash** — reviewer pointed out that dynamic question generation from stash can exceed 4 questions. Renderer splits into multiple `<survey>` blocks silently instead of throwing.
- **Prompt array ordering** — with `act:` removed, the author controls ordering in arrays. Instructions (context for the model) should come before the act segment (interaction mechanism). The old `act:` field always prepended; the new array gives authors control.

## Steps

- [x] Commit task document
- [x] Enrich `AskUserOption` + `AskStructuredConfig` (preview, header, validation, render, preamble)
- [x] Add `act.survey()` primitive (types, primitive file, registry, ActBuilder, validation, overflow, preamble, tests)
- [x] Add `ViewSegment` type and `view()` helper (segment, export, engine handling)
- [x] Add `terminal` constant (new file, export)
- [x] ~~Rename `prompt` → `instruct`~~ — Reverted (see Alternatives rejected)
- [x] Merge `act` field into `prompt` (remove field, remove engine prepending, lint rule, tests, examples)
- [x] Merge `render` into `prompt` via `view()` (remove field, remove rendered from PromptContext, engine, tests, examples)
- [x] Restructure action and stash (nested action, merged stash, engine advance/replay, tests, examples)
- [x] Add lifecycle JSDoc to StepConfig
- [x] Update all docs (SPEC.md, docs/api.md, docs/architecture.md, docs-site MDX, README)

## Notes

- Reverted `prompt` → `instruct` rename after implementing it across all files. The stutter `prompt: prompt\`...\`` only happens with the tagged template in callbacks — one specific case. Every other type (`PromptContext`, `PromptFn`, `PromptPiece`, `PromptReturn`, `PromptResult`), XML tag (`<prompt>`), and wire protocol field (`PromptResult.prompt`, `ModelAdapter.respond(stepName, prompt)`) says `prompt`. Making the step config field the only thing that doesn't say `prompt` was more confusing than the stutter.
- `action.input` runs before the step's `stash` callback. The `action.input` callback sees accumulated stash from _prior_ steps, not from this step's stash. This matches the lifecycle: action runs first, then stash persists results. Updated the `actionInput receives current stash` test to use a two-step setup (prior step sets stash, next step reads it in `action.input`).
- `pnpm build` required before example tests because examples resolve `@contentful/skill-kit` via the package `exports.import` field → `./dist/index.js`. The `source` condition only works for bundlers.
- Three-tier survey fallback uses inline `BATCH_TOOLS` list in `preambleRow()` rather than a general capability model. Hosts report tool names, not capabilities — the batch-capable list is our own knowledge. If a second primitive needs capability branching, extract the pattern then.
