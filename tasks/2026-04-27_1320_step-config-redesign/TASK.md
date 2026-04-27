# Step Config API Redesign + Primitives Enrichment

## Scope

**In:**

- Rename `StepConfig.prompt` → `instruct`; `prompt` tagged template keeps its name
- Remove `StepConfig.act` field — interactions go through `instruct` (accepts segments directly)
- Remove `StepConfig.render` / `PromptContext.rendered` — replaced by `view()` helper in `instruct`
- Restructure `action` from flat `ActionDefinition` to `{ run, input?, stash? }`
- Remove `actionInput` and `afterAction` — functionality absorbed by `action.input` and `stash`
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

- Renaming the `prompt` tagged template (stays as `prompt`)
- Renaming `act` builder namespace or `PromptContext.act` (stays)
- Wire protocol changes beyond view/survey XML additions
- New host registry entries

## Context

User feedback (single internal user) flagged naming collisions and ergonomic friction in the v0.6 API:

- `act: act.askUser()` stutter
- `prompt: prompt\`...\`` double-prompt
- `render`/`rendered` asymmetry
- `{ terminal: true }` object literal inconsistency
- Non-obvious step lifecycle

Root cause: StepConfig grew piecemeal with three prompt input paths (`prompt`, `act`, `render`) and a four-callback action lifecycle. Breaking changes approved — single internal user.

Additionally, the askUser primitive only modeled a fraction of what host tools support (no previews, headers, batching). Researched capabilities across Claude Code, Codex, OpenCode, Gemini CLI, and Cline family.

## Plan

### New StepConfig shape (7 fields, down from 11)

```typescript
interface StepConfig<TOutput, TContext, TStash, TActionOutput> {
  instruct?: string | PromptPiece | PromptPiece[] | PromptFn<TContext, TStash>;
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

- `AskUserOption` gains `preview?: string`
- `AskStructuredConfig` gains `header?: string` (≤12 chars)
- New `SurveyConfig` / `SurveyQuestion` types
- New `surveyPrimitive` with three-tier fallback preamble
- Batch-capable tools (tier 1): `AskUserQuestion`, `ToolRequestUserInput`, `question`, `ask-user`
- Single-question tools (tier 2): `ask_followup_question`
- No tool (tier 3): conversational

### Alternatives rejected

- Renaming only the step-level `act` field (e.g. to `interact` / `primitive`) — too shallow, doesn't fix the structural issue of three prompt input paths
- Renaming the `prompt` tag to `md` or `text` — loses semantic meaning
- Making `render.*` return tagged segments directly — breaks composability (render helpers are building blocks used inside larger strings)
- Auto-batching adjacent `act.askUser()` calls into survey — magical, makes preamble generation harder
- General capability model for host tools — premature; hosts report tool names not capabilities

### Trade-offs

- `.extend()` can no longer independently override `act:` — must override whole `instruct`. Acceptable: base steps in practice have empty prompts that extend fills entirely.
- `action.stash` is convenience sugar — you could put everything in top-level `stash` since it gets `{ output, action? }`. But separating keeps action concerns self-contained.

## Steps

- [x] Commit task document
- [x] Enrich `AskUserOption` + `AskStructuredConfig` (preview, header, validation, render, preamble)
- [x] Add `act.survey()` primitive (types, primitive file, registry, ActBuilder, validation, overflow, preamble, tests)
- [x] Add `ViewSegment` type and `view()` helper (segment, export, engine handling)
- [x] Add `terminal` constant (new file, export)
- [x] ~~Rename `prompt` → `instruct`~~ — Reverted. Renaming only the step field while everything else (PromptContext, PromptFn, PromptResult, XML tags) stays `prompt` made the API more surprising, not less.
- [x] Merge `act` field into `prompt` (remove field, remove engine prepending, lint rule, tests, examples)
- [x] Merge `render` into `prompt` via `view()` (remove field, remove rendered from PromptContext, engine, tests, examples)
- [x] Restructure action and stash (nested action, merged stash, engine advance/replay, tests, examples)
- [x] Add lifecycle JSDoc to StepConfig
- [ ] Update all docs (SPEC.md, docs/api.md, docs/architecture.md, docs-site MDX, README)

## Notes

- Reverted `prompt` → `instruct` rename. The stutter `prompt: prompt\`...\``only happens with the tagged template in callbacks — one specific case. Every other type, interface, XML tag, and wire protocol field says`prompt`. Making the one place you define it the only thing that doesn't say `prompt` was more surprising than the stutter.
- `action.input` runs before the step's `stash` callback. The `action.input` callback sees accumulated stash from _prior_ steps, not from this step's stash. This matches the lifecycle: action runs first, then stash persists results.
- `pnpm build` required before example tests because examples resolve `@contentful/skill-kit` via the package `exports.import` field → `./dist/index.js`.
