# `@contentful/skill-kit` — SDK Specification

_v0.1 draft. Builds on the Skill CLI PRD. Specs the TypeScript library skill authors import to define stateful, CLI-driven skills._

---

## What this is

A SDK for building agent skills where the workflow is driven by a small bundled CLI rather than by prose alone. If you've only seen the prose-based skill format (a `SKILL.md` file full of instructions the agent reads), this is a different shape. Read this section before the rest.

### The problem it solves

Today's skills are a single blob of prose. This works for one-shot tasks ("rewrite this README in a friendlier tone") but degrades fast for multi-stage workflows. Long prose is hard to review, inconsistent across models, impossible to branch cleanly, and gives no way to enforce strict input/output formats. A 3,000-line prose skill is unpleasant to reason about and slow to improve.

### The shape of the solution

A skill is a folder containing a small CLI program plus supporting prose and reference files. The agent invokes the CLI, the CLI hands back a prompt for the current step, the agent does the thinking, the agent returns its answer to the CLI, and the CLI decides what the next step is. The loop continues until the CLI says the workflow is done.

```
┌─────────────┐   "here is step N's prompt"    ┌─────────────┐
│             │ ─────────────────────────────► │             │
│    Agent    │                                │  Skill CLI  │
│  (Claude,   │   step N's answer, structured  │  (workflow  │
│   Codex,    │ ─────────────────────────────► │   engine)   │
│   etc.)     │                                │             │
│             │   "here is step N+1's prompt"  │             │
│             │ ◄───────────────────────────── │             │
└─────────────┘                                └─────────────┘
```

### Responsibilities, explicitly

**The CLI is the engine.** It owns the workflow's state machine. It decides which step runs next based on the answer to the previous step. It validates the agent's output against a schema. It holds shared state across steps. It does progressive disclosure — the agent only sees the prose for the step it's currently on, never the whole skill.

**The prose is still prose.** Authors write each step's instructions in plain markdown. The SDK doesn't replace prose with code; it just controls when each piece of prose is shown and what shape the agent's answer has to take. Nodes contain freely-written instructions; transitions between nodes are typed and explicit.

**The agent does what agents are good at.** Reading, reasoning, writing, calling host tools, synthesizing. The agent doesn't need to understand the skill's overall structure — it just reads the current prompt, does the work, and returns an answer. The CLI handles everything else.

### Why this is better than pure prose

- **Reviewable.** Each step is small and has an explicit contract. Skills become diffable the way code is diffable.
- **Deterministic where it matters.** Formatting-heavy outputs (tables, reports) are rendered by code and pasted by the model verbatim, not negotiated per turn.
- **Branchable without drift.** The CLI decides next steps from typed outputs, not by hoping the model picks the right path out of a long prose flowchart.
- **Host-portable.** Different agent hosts expose different native tools. The SDK emits XML tags for primitives and maps them to host tools via the preamble, so one skill works everywhere with the best UX the host can offer.
- **Improves over time.** Prompt-engineering work done in the SDK benefits every skill that uses SDK primitives. Authors don't rewrite prose to pick up improvements.

### What authors write

```typescript
// skill.ts
import { skill, z } from '@contentful/skill-kit';

export default skill({
  name: 'repo-doctor',
  entry: 'diagnose',
  params: z.object({ repoPath: z.string().default('.') }),
  stash: z.object({ failCount: z.number() }),
})
  .step('diagnose', {
    prompt: 'Inspect the repository and report failed health checks.',
    output: z.object({ checks: z.array(CheckResult) }),
    updateStash: ({ stepOutput }) => ({ failCount: stepOutput.checks.filter((c) => c.status === 'fail').length }),
    next: ({ stepOutput }) => (stepOutput.checks.some((c) => c.status === 'fail') ? 'remediate' : 'report'),
  })
  .step('remediate', {
    /* ... */
  })
  .step('report', {
    /* ... */
  })
  .build();
```

`skill()` returns a builder. `.step()` chains add steps — params and stash types flow into callbacks via contextual inference. `.build()` produces the final skill definition. `skill-kit build` then bundles it into a distributable skill directory — a bundled executable or JS file, a generated `SKILL.md` (per the [agentskills.io spec](https://agentskills.io/specification)), and a shell wrapper in `scripts/`.

### What authors don't write

- A state machine implementation — the SDK provides it.
- Host-specific tool invocations — the SDK's primitives emit XML tags mapped to tools via the preamble.
- Parsing, validation, retry logic — handled at the boundary by schemas.
- Formatting templates repeated across prompts — `view()`, renderers, and fragments cover that.

### Where to read next

The sections below go in order: primitives (§1), prompts and fragments (§2), transitions (§3), views and rendering (§4), references (§5), modularization (§6), params and state including terminal-output for programmatic consumers (§7), side effects and observers (§8), testing (§9), the CLI invocation protocol (§10), build and distribution (§11), repo layout for skill authors (§12), opinionated decisions (§13), cross-host behavior (§14), and what's out of scope for v0.1 (§15).

If you just want to see the whole shape at once, read §1 and §4, then skim §11–§14.

---

## Design goals

1. **Declarative feel.** A simple skill is ~30 lines. Authors describe a workflow, not write one.
2. **Prose stays prose.** The SDK structures _when_ prose is shown and _what contract_ it satisfies. It never replaces prose with code.
3. **Typed boundaries, untyped interiors.** Step I/O is schema-enforced. What the model does inside a step is freeform.
4. **Node-native, flexible distribution.** `npx tsx skill.ts` works in dev. `skill-kit build` bundles skills for distribution — either as lightweight Node.js bundles (`--mode node`, via esbuild) or standalone executables (`--mode bun`, via `bun build --compile`).
5. **Composable.** Steps, schemas, fragments, and render helpers are importable across skills.
6. **One obvious way.** Opinionated where the cost of choice exceeds the benefit.

---

## 1. Core primitives

### `skill(config)` → `SkillBuilder`

Returns a builder. One per entry file. Params and stash Zod schemas declared here flow into all step callbacks.

```typescript
import { skill, z } from '@contentful/skill-kit';

export default skill({
  name: 'repo-doctor',
  version: '1.0.0',
  system: 'You are a thorough code health inspector. Be precise and actionable.',
  entry: 'diagnose',
  params: z.object({ repoPath: z.string().default('.') }),
  stash: z.object({ failCount: z.number() }),
  package: {
    name: '@contentful/skill-repo-doctor',
    license: 'MIT',
  },
})
  .step('diagnose', {
    /* ... */
  })
  .step('remediate', {
    /* ... */
  })
  .step('report', {
    /* ... */
  })
  .build();
```

### `.step(name, config)` on the builder

Adds a step inline. The prompt callbacks receive typed `params` and `stash` from the builder — no manual annotations.

```typescript
.step("diagnose", {
  prompt: ({ params }) => `Check ${params.repoPath}`,  // repoPath: string ✓
  output: z.object({ /* ... */ }),
  updateStash: ({ stepOutput }) => ({ failCount: stepOutput.checks.length }),
  next: "report",
})
```

The `output` schema is optional. When omitted, no `<schema>` block is emitted in the prompt and output validation is skipped. See [Output-less steps](#output-less-steps) below.

### `step(config)` — standalone function

For shared/reusable steps defined outside a skill. These default to untyped params/stash. Use `.extend()` on the builder to apply typed overrides.

```typescript
import { step, z } from "@contentful/skill-kit";

export const openQuestion = step({
  output: z.object({ answer: z.string() }),
  next: "__parent__",
});

// In a skill:
.extend("ask-name", openQuestion, {
  prompt: ({ stash }) => `${stash.name}, tell me more.`,  // typed via builder
  next: "done",
})
```

### `module(config)` → `ModuleBuilder`

Composable step groups with their own stash scope. Module steps can't access the parent skill's params (enforces portability).

```typescript
import { module, z } from '@contentful/skill-kit';

export const authModule = module({
  name: 'auth',
  entry: 'auth-login',
  stash: z.object({ userId: z.string() }),
})
  .step('auth-login', {
    /* ... next: "__parent__" */
  })
  .build();
```

Register into a skill with `.register()` — stash types merge via intersection:

```typescript
skill({ stash: z.object({ appName: z.string() }), ... })
  .register(authModule, { next: "dashboard" })
  // stash is now { appName: string } & { userId: string }
  .step("dashboard", {
    prompt: ({ stash }) => `${stash.userId} at ${stash.appName}`,  // both typed ✓
    ...
  })
```

### `z`

Zod re-exported so authors don't manage a separate dependency and all schemas come from one source.

---

## 2. Prompts

### Static

```typescript
step({
  prompt: `
    Inspect the repository. Return whether CI is configured
    and which provider is detected.
  `,
  output: z.object({ configured: z.boolean(), provider: z.string().nullable() }),
  next: 'report',
});
```

### Dynamic

A function of the workflow state, returning `string | PromptPiece | PromptPiece[]`. Plain strings are instructions. `system` segments set persona/frame. `act` segments inject primitive directives (see [Composable prompt vocabulary](#composable-prompt-vocabulary) below). The `prompt` field also accepts a single `PromptPiece` or `PromptPiece[]` directly (not wrapped in a function), which is useful for steps that consist entirely of primitive directives.

```typescript
step({
  prompt: ({ params, history }) => {
    const diagnose = history.find((s) => s.step === 'diagnose')!.stepOutput;
    return `
      Failed checks for ${params.repoPath}:
      ${JSON.stringify(diagnose.failedChecks, null, 2)}

      Propose concrete remediation for each.
    `;
  },
  output: RemediationsSchema,
  next: 'report',
});
```

Fields available in the prompt function:

| Field      | Description                                                                                                                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `history`  | All prior step results, typed. Each entry has `.stepOutput` and optional `.actionOutput`.                                                                                                                  |
| `getStep`  | Typed step lookup — `getStep('diagnose')` returns the history entry for that step. When using the builder chain, the return is fully typed based on that step's output schema (no manual generics needed). |
| `params`   | Skill params — the external data passed at invocation (config defaults + runtime overrides)                                                                                                                |
| `stash`    | Current stash state                                                                                                                                                                                        |
| `refs`     | Lazy loader for reference files (§5)                                                                                                                                                                       |
| `attempts` | How many times this step has been visited (for retries)                                                                                                                                                    |
| `act`      | Primitive directive builders (see §2.1)                                                                                                                                                                    |
| `system`   | System segment tag/function for persona/frame (see §2.1)                                                                                                                                                   |

> **Why `params` instead of `context`?** The old name "context" was confusing because "context" is overloaded — callback context, execution context, prompt context, etc. "params" clearly identifies the external data passed to the skill at invocation time, distinct from the internal workflow state.

### Fragments (partials)

For prose that repeats across steps or skills.

```typescript
// fragments/tone.ts
import { fragment } from '@contentful/skill-kit';

export const enterpriseTone = fragment(
  'enterprise-tone',
  `
  Use a professional, concise tone. Avoid jargon unless the user
  introduced it. Prefer concrete recommendations over hedging.
`,
);

export const jsonOutputRules = fragment(
  'json-output',
  `
  Return only valid JSON matching the schema. No preamble,
  no markdown fences, no commentary outside the object.
`,
);
```

Used via a tagged template literal that handles indentation and interpolation:

```typescript
import { prompt } from '@contentful/skill-kit';
import { enterpriseTone, jsonOutputRules } from '../fragments/tone';

step({
  prompt: ({ history }) => {
    const gather = history.find((s) => s.step === 'gather')!.stepOutput;
    return prompt`
      ${enterpriseTone}

      Analyze the dependency tree at ${gather.repoPath}.
      Flag packages with known CVEs.

      ${jsonOutputRules}
    `;
  },
});
```

Fragments are named (first arg) so tooling can track usage, detect duplication, and lint for drift.

`prompt` is the only bit of sugar. It exists because plain template literals in indented TS produce ugly whitespace; everything else is standard functions.

### Composable prompt vocabulary

Prompt functions can return `string | PromptPiece | PromptPiece[]`. A `PromptPiece` is either a plain string (instructions), a `system` segment (persona/frame), or an `act` segment (primitive directive). When a prompt returns an array, the SDK assembles pieces in **author order** — segments appear in the output exactly as written.

The `act` and `system` helpers are injected via `PromptContext`, not imported. Authors destructure them from the prompt function argument:

```typescript
.step('build', {
  prompt: ({ stash, act, system }) => [
    system`You are a game dev mentor. Be methodical.`,
    act.checklist({ create: stash.tasks.map(t => ({ title: t, status: 'pending' })) }),
    prompt`Build the game. Update the checklist as you go.`,
  ],
  output: z.object({ filesCreated: z.array(z.string()) }),
  next: 'done',
})
```

````

**`system`** — creates a system segment for persona or framing. Used as a template tag (`system\`...\``) or called as a function (`system('...')`).

**`act`** — provides methods for each primitive:

- `act.askUser(config)` — structured or open question directive
- `act.confirm(config)` — binary approval directive
- `act.plan(config)` — plan presentation directive
- `act.checklist(config)` — tracked task list directive
- `act.subagent(config)` — sub-agent spawn directive

Each `act` method returns an `act` segment with the primitive's host-aware prose. The returned `PromptPiece` is opaque to authors — the SDK renders it during prompt assembly.

**Assembly** — `resolvePromptValue` calls the prompt function, `normalizePieces` coerces the return to an array of `PromptPiece`, and `assemblePieces` renders each piece as XML: plain strings become `<prompt>` tags, system segments become `<system>` tags, act segments are rendered via `renderPrimitive()` into their respective XML tags (e.g., `<ask-user>`, `<plan>`), and view segments are wrapped in `<rendered>` tags (with an optional `name` attribute). All pieces are concatenated in author order.

The `PromptFn` return type is `PromptReturn` (= `string | PromptPiece | PromptPiece[]`).

#### Simple single-primitive steps

Since `prompt` now accepts `PromptPiece` directly (including `ActSegment`), a step that consists entirely of one primitive needs no wrapper function:

```typescript
.step('choose', {
  prompt: act.askUser({ type: 'structured', question: '...', options: [...] }),
  output: z.object({ choice: z.string() }),
  next: 'next-step',
})
```

The old step-level `act` field has been removed — `prompt` subsumes its role. Any `ActSegment` or `PromptPiece` can be passed directly to `prompt`.

#### Prompt-less steps

When `prompt` is omitted from a step config, the engine auto-advances without an LLM round-trip. The step runs its `updateStash` and `next` callbacks immediately — no prompt is emitted, no model response is expected, and the CLI proceeds directly to the transition.

This is useful for **pure routing gates** — steps that exist solely to branch the workflow based on stash or params, without requiring model reasoning:

```typescript
.step('route', {
  // No prompt, no output — pure routing gate
  next: ({ params, stash }) => stash.failCount > 0 ? 'remediate' : 'report',
})
```

Combine with output-less (no `output` schema) for the lightest-weight step: no prompt emitted, no schema emitted, no validation, no LLM call. The engine evaluates `next` and moves on.

#### Output-less steps

When `output` is omitted from a step config, no `<schema>` block is emitted in the prompt output and validation is skipped. The model's response is not parsed or validated — it passes through as-is.

This is useful for free-form steps where the model produces prose (e.g., a final report or user-facing message) and the workflow doesn't need structured data from the response:

```typescript
.step('present-report', {
  prompt: ({ stash }) => `Present the findings to the user in a clear, readable format.`,
  // No output schema — model response is unstructured
  next: terminal,
})
```

When combined with a prompt-less step (omitting both `prompt` and `output`), the result is a pure routing gate that requires no LLM interaction at all.

---

## 3. Transitions

```typescript
import { terminal } from '@contentful/skill-kit';

// Static
step({ next: 'report' });

// Conditional (stepOutput-based)
step({
  next: ({ stepOutput }) => (stepOutput.checks.some((c) => c.status === 'fail') ? 'remediate' : 'report'),
});

// Conditional (actionOutput-based)
step({
  action: { run: apiAction },
  next: ({ actionOutput }) => (actionOutput.status === 200 ? 'success' : 'retry'),
});

// Terminal (constant shorthand)
step({ next: terminal });

// Terminal (object literal — equivalent)
step({ next: { terminal: true } });

// Bounded loop
step({
  next: ({ stepOutput, attempts }) => (stepOutput.confidence < 0.7 && attempts < 3 ? 'self' : 'report'),
  maxVisits: 3,
  onMaxVisits: 'report', // required fallback
});
```

The `terminal` constant is exported from `@contentful/skill-kit` and is equivalent to `{ terminal: true }`. Use whichever form reads better.

Cycles detected by the graph analyzer apply an implicit visit limit (10) at runtime. Declaring `maxVisits` + `onMaxVisits` provides explicit control: `onMaxVisits` redirects when the limit is hit, while `maxVisits` without `onMaxVisits` throws (fail-closed). Linear workflows with function-based `next` don't need cycle guards — the conservative graph analysis handles safety automatically.

### The `next` callback

When `next` is a function, it receives the following fields:

| Field          | Description                                                                 |
| -------------- | --------------------------------------------------------------------------- |
| `stepOutput`   | The validated output of this step (typed by the step's `output` schema)     |
| `actionOutput` | The action's output, if an action was configured (typed by action's schema) |
| `attempts`     | How many times this step has been visited (for bounded-loop patterns)       |
| `params`       | Skill params — the external data passed at invocation                       |
| `stash`        | Current stash state                                                         |

---

## 4. Rendering (deterministic output)

The pattern that sold the PRD: structured model output → code-rendered artifact → model pastes verbatim.

The `view()` helper wraps content in a `ViewSegment` that renders as a `<rendered>` XML tag. It is a prompt composition helper — use it inside prompt callbacks to inject pre-rendered content inline.

```typescript
import { step, view, render, prompt, terminal } from '@contentful/skill-kit';

step({
  prompt: ({ history }) => {
    const diagnose = history.find((s) => s.step === 'diagnose')!.stepOutput;
    const table = render.table(diagnose.checks, {
      columns: ['name', 'status', 'detail'],
      statusIcons: { pass: '✅', fail: '❌', warn: '⚠️' },
    });
    return [
      view('report', table),
      prompt`
        Output the report above to the user exactly as shown,
        with no preamble or trailing commentary.
      `,
    ];
  },
  output: z.object({ delivered: z.boolean() }),
  next: terminal,
});
```

The `view()` function has two signatures:

- `view(content)` — wraps content in an unnamed `<rendered>` tag
- `view(label, content)` — wraps content in a named `<rendered name="label">` tag

Named views help the model reference specific rendered blocks when a prompt contains multiple views.

### Built-in renderers

A small, opinionated set. Authors can write their own any time.

- `render.table(rows, opts)` — markdown tables with consistent styling
- `render.checklist(items)` — `- [x]` / `- [ ]` lists
- `render.diff(before, after)` — unified diffs
- `render.code(source, lang)` — fenced blocks
- `render.kv(pairs)` — aligned key/value blocks
- `render.section(title, body)` — headers + body

Custom renderers are just `(args) => string`. No registration; anything returning a string works.

---

## 5. References (external files)

Skills often ship supporting docs. The existing `references/` convention stays. The SDK exposes them as lazy loaders so they don't bloat every prompt.

```
skills/repo-doctor/
├── skill.ts
├── references/
│   ├── ci-providers.md
│   ├── security-checklist.md
│   └── severity-rubric.md
└── assets/
    └── schema.json
```

```typescript
step({
  prompt: ({ refs }) => {
    const gather = history.find((s) => s.step === 'gather')!.stepOutput;
    return prompt`
      Classify each finding's severity using this rubric:

      ${refs.load('severity-rubric.md')}

      Findings:
      ${JSON.stringify(gather.findings)}
    `;
  },
});
```

`refs.load()` reads from `references/` relative to the skill file and inlines the content. Resolved at prompt-build time, not skill-load time — conditional steps don't pay for references they never use.

### Asset references

`refs.asset(path)` returns an absolute path for files the CLI or a prompt callback needs on disk (schemas, templates, images).

### Reference lints

- All files under `references/` must be referenced by at least one step. Orphans fail `skill check`.
- Circular fragment includes fail to load.
- Reference files over 8KB emit a warning suggesting split or on-demand loading.

---

## 6. Modularization

Three patterns, in increasing weight.

### A. Shared schemas and fragments

Plain TS imports. No ceremony.

```typescript
// shared/schemas.ts
export const CheckResult = z.object({
  /* ... */
});

// In a skill:
import { CheckResult } from '../../shared/schemas';
```

### B. Reusable step definitions

`step()` creates standalone, portable steps. Use `__parent__` for the transition and `.extend()` on the builder to wire them in with typed overrides.

```typescript
// shared/steps/gather-repo-facts.ts
export const gatherRepoFacts = step({
  prompt: "Inspect the repo and list languages, build tools, CI config.",
  output: RepoFactsSchema,
  next: "__parent__",  // transition decided by importing skill
});

// In a skill — .extend() applies typed params/stash to overrides:
skill({ params: ParamsSchema, stash: StashSchema, ... })
  .extend("gather", gatherRepoFacts, {
    prompt: ({ params }) => `Inspect ${params.repoPath}`,  // typed ✓
    next: "analyze",
  })
```

### C. Modules (composable step groups)

For groups of steps that belong together and have their own stash scope. Modules can't access the parent skill's params — this enforces portability.

```typescript
import { module, z } from '@contentful/skill-kit';

export const authModule = module({
  name: 'auth',
  entry: 'auth-login',
  stash: z.object({ userId: z.string() }),
})
  .step('auth-login', {
    prompt: 'Ask for credentials.',
    output: z.object({ userId: z.string() }),
    updateStash: ({ stepOutput }) => ({ userId: stepOutput.userId }),
    next: '__parent__',
  })
  .build();
```

Register into a skill with `.register()`. The module's `__parent__` exit is wired to the `next` target, and stash types merge via intersection:

```typescript
skill({ stash: z.object({ appName: z.string() }), ... })
  .step("start", { ..., next: "auth-login" })
  .register(authModule, { next: "dashboard" })
  .step("dashboard", {
    // stash: { appName: string } & { userId: string }
    prompt: ({ stash }) => `Welcome ${stash.userId} to ${stash.appName}`,
    ...
  })
  .build();
```

**Opinion:** Modules are for groups of steps that are reused across skills with their own state. Most composition needs are met by shared steps + `.extend()`.

### D. Composite skills (sub-skills and topics)

When related skills share references, params, or user-facing scope, they can be combined into a single composite skill. A composite is a regular `skill()` that has sub-skills and/or topics registered on it.

```typescript
import { skill, z, act } from '@contentful/skill-kit';
import doctorSkill from './subskills/doctor.js';
import setupSkill from './subskills/setup.js';

export default skill({
  name: 'contentful-help',
  entry: 'classify',
  params: z.object({ query: z.string() }),
  stash: z.object({ intent: z.string(), spaceId: z.string() }),
})
  .step('classify', {
    prompt: ({ params }) => `Classify intent: "${params.query}"`,
    output: z.object({ intent: z.string(), confidence: z.number() }),
    updateStash: ({ stepOutput }) => ({ intent: stepOutput.intent, spaceId: '' }),
    next: ({ stepOutput }) => {
      if (stepOutput.confidence < 0.7) return 'clarify';
      return `subskill:${stepOutput.intent}`;
    },
  })
  .step('clarify', {
    /* ask user, then route */
  })
  .topic('rate-limits', {
    label: 'API rate limits',
    content: ({ refs }) => refs.load('rate-limits.md'),
  })
  .subskill('doctor', doctorSkill, {
    params: (_output, stash) => ({ spaceId: stash.spaceId }),
  })
  .subskill('setup', setupSkill)
  .build();
```

**Sub-skills** are standalone `SkillDefinition`s imported and registered via `.subskill(name, def, opts?)`. They have independent state machines, stash, and params. They can be developed and tested independently with `runSkill()`.

**Topics** are reference entries registered via `.topic(name, config)` — same as on `reference()`. They can be resolved as dispatch targets or looked up directly via CLI.

#### Routing

Any step's `next` can return special prefixed targets to exit the dispatcher:

- `'subskill:doctor'` — transitions into the `doctor` sub-skill. The engine returns a `RedirectResult` (the target doesn't exist in the local step map). The composite entry point intercepts the redirect, calls the sub-skill's `paramsMap` to produce params, and starts the sub-skill's engine.
- `'topic:rate-limits'` — resolves the topic and returns its content as a `DoneResult`.
- Regular step names route within the dispatcher as normal.

The dispatcher is a full state machine — it can have as many steps as needed before routing (classify, triage, gather context, ask clarifications).

#### Params mapping

Each `.subskill()` registration accepts an optional `params` function:

```typescript
.subskill('doctor', doctorSkill, {
  params: (stepOutput, stash) => ({ spaceId: stash.spaceId }),
})
```

The function receives the output of the step that triggered the redirect and the dispatcher's accumulated stash. It returns the params object for the sub-skill's engine.

#### Step name namespacing

Sub-skill step names are prefixed with `subskillName/` at the protocol layer:

- Dispatcher steps: `classify`, `clarify` (no prefix)
- Sub-skill steps: `doctor/diagnose`, `setup/configure`

Engines never see prefixes — the composite entry handles prefixing/unprefixing.

#### CLI protocol

All commands go through `scripts/run`:

```bash
scripts/run --params '{...}'                          # dispatcher start
scripts/run advance --step classify --output '{...}'   # dispatcher advance
scripts/run advance --step doctor/diagnose --output ..  # sub-skill advance
scripts/run doctor --params '{...}'                   # direct sub-skill start
scripts/run topics                                     # list reference topics
scripts/run topic rate-limits                          # load a topic
```

#### Constraints

- **No nesting**: `.subskill()` throws at runtime if the sub-skill definition already has subskills.
- **No `/` in dispatcher step names**: the slash is reserved for namespacing.
- **Sub-skills share references**: one `references/` directory, one `ReferenceLoader`.

**Difference from modules:** Modules flatten into the parent's step namespace and merge stash. Sub-skills are independent — isolated stash, own entry points, testable standalone, invokable as CLI subcommands.

---

## 7. Params and state

### Skill params

Declared on the skill, validated on invocation, typed everywhere. Params are the external data passed to the skill at invocation time — the skill's "arguments."

```typescript
skill({
  params: z.object({
    repoPath: z.string().default('.'),
    strictness: z.enum(['lenient', 'normal', 'strict']).default('normal'),
  }),
  // ...
});
```

> **Why "params" and not "context"?** The old name was confusing because "context" is overloaded — callback context, execution context, prompt context, workflow context. "params" clearly identifies the external data passed to the skill at invocation, making it easy to distinguish from internal workflow state like stash.

### Per-step scratchpad

Sometimes a step wants to stash something the model shouldn't see on the next turn, but that a later step needs.

```typescript
step({
  output: SchemaA,
  updateStash: ({ stepOutput }) => ({ rawTimings: stepOutput.debugTimings }),
  next: 'next-step',
});

// later
step({
  prompt: ({ stash }) => [
    view('timings', render.timingsChart(stash.rawTimings)),
    `Present the timings chart above to the user.`,
  ],
  output: z.object({ delivered: z.boolean() }),
  next: terminal,
});
```

Stash is typed per step and not exposed to prompts by default (must be explicitly pulled in). Keeps prompts lean.

### The `updateStash` callback

The `updateStash` callback (formerly `stash` on step config) merges values into the stash after the step completes. It receives:

| Field          | Description                                                                 |
| -------------- | --------------------------------------------------------------------------- |
| `stepOutput`   | The validated output of this step                                           |
| `actionOutput` | The action's output, if an action was configured                            |
| `stash`        | Current stash state (read-only — return the fields to merge)                |
| `params`       | Skill params                                                                |

> **Why `updateStash` instead of `stash`?** The old name `stash` was ambiguous — it collided with the stash _schema declaration_ (`stash: z.object(...)` on the skill config) and the stash _read accessor_ (`({ stash })` in prompt callbacks). `updateStash` clearly identifies this as the merge callback that writes to the stash. The schema declaration remains `stash:`, and the read accessor remains `stash`.

```typescript
step({
  output: z.object({ items: z.array(z.string()), total: z.number() }),
  updateStash: ({ stepOutput, actionOutput, stash }) => ({
    itemCount: stepOutput.total,
    lastWritten: actionOutput?.bytesWritten ?? 0,
  }),
  next: 'report',
});
```

### No globals, no mutation

Steps receive inputs, return outputs. History is append-only. Load-bearing for determinism and replay.

### Terminal output (for programmatic consumers)

A skill can declare a schema for its final result, independent of what any individual step produces. This is the skill's "return value" when invoked programmatically.

```typescript
skill({
  name: 'repo-doctor',
  entry: 'diagnose',
  finalOutput: z.object({
    passed: z.boolean(),
    checks: z.array(CheckResult),
    reportPath: z.string(),
  }),
  steps: {
    /* ... */
  },
});
```

The last step before termination must produce output matching the `finalOutput` schema — either directly, or via its action's output. The CLI surfaces this to the invoker when the workflow reaches a terminal state.

**Why this matters for interop.** Skills aren't always invoked from a chat surface. A programmatic consumer — for example, a larger agent built with the Claude Agent SDK — might invoke a skill and want its result as structured data. The Agent SDK's `query()` has an `outputFormat: { type: 'json_schema', schema }` option that serves the same purpose at the agent level; our skills expose the equivalent at the skill level, using Zod schemas that compile to JSON Schema.

A consumer calling our skill programmatically via `runSkill()` (see §9) gets the validated final output typed as `z.infer<typeof finalOutput>`. A consumer invoking the skill from within an Agent SDK session gets the same data serialized into the agent's transcript.

If `finalOutput` is omitted, the skill's terminal output defaults to the last step's output — useful for quick prototypes, but programmatic consumers will want the explicit schema for stable integration.

---

## 8. Side effects and observers

The SDK has two primitives for things that happen around a step: **actions** (which _do_ things) and **observers** (which _watch_ things). They're in the same section because both attach to a step's lifecycle, but they're deliberately different in intent and power.

### Actions

Steps are pure: inputs in, outputs out, transition declared. When a skill needs to _do_ something — write a file, call an API, spawn a subprocess — it declares an **action**.

An action is **node-side plumbing**, not a tool. The distinction matters.

- A **tool**, in the agent-host sense (Read, Edit, Bash, AskUserQuestion), is something the model decides to call. The model reasons, picks a tool, provides arguments, the host executes, the result goes back into the model's context.
- An **action** is something **the CLI runs deterministically** after a step's output is validated. The model never chooses it. The workflow declares when it runs and with what inputs. The model's only role is producing the step output that parametrizes the action.

Actions are how skills do things; tools are how agents do things. They don't share a surface.

```typescript
import { writeFile } from 'node:fs/promises';
import { action } from '@contentful/skill-kit';

const writeReport = action({
  name: 'write-report',
  input: z.object({ path: z.string(), content: z.string() }),
  output: z.object({ bytesWritten: z.number() }),
  run: async ({ input, signal }) => {
    await writeFile(input.path, input.content);
    return { bytesWritten: input.content.length };
  },
});

step({
  prompt: 'Decide where to write the report and what it should contain.',
  output: z.object({ path: z.string(), content: z.string() }),
  action: { run: writeReport }, // runs CLI-side after validation, before transition
  next: 'confirm',
});
```

**Decoupling action input from step output** — when the model's reasoning output doesn't match what the action needs, use `action.input` to transform. To stash action results, use `action.stash`:

```typescript
step({
  output: z.object({ reasoning: z.string(), fileName: z.string(), body: z.string() }),
  action: {
    run: writeReport,
    input: ({ stepOutput, stash, params }) => ({
      path: `${stash.outDir}/${stepOutput.fileName}`,
      content: stepOutput.body,
    }),
    updateStash: ({ actionOutput }) => ({ lastBytesWritten: actionOutput.bytesWritten }),
  },
  next: ({ actionOutput }) => (actionOutput.bytesWritten > 0 ? 'confirm' : 'retry'),
});
```

**`action.input`** receives `{ stepOutput, stash, params }` — the step's validated output, the current stash, and the skill params. Use it to transform the model's output into the shape the action expects.

**Post-action stash** — `action.stash` runs after the action completes, receiving `{ actionOutput }` (the action output). This replaces the old `afterAction` top-level field.

The top-level `updateStash` callback receives `{ stepOutput, actionOutput? }` — the action result is available alongside the step output, so you can stash values from either source in one place.

The lifecycle of a step with an action: prompt → model → validate(output) → action.input → action.run → action.stash → updateStash → next.

Actions accept an `AbortSignal` so long-running operations can be cancelled cleanly when the skill is interrupted.

**Why not let the model call tools instead?** Because when the effect is deterministic and workflow-mandated, running it CLI-side gives replayability, auditability, and no reliance on the model executing reliably. The model still has access to all of the host's tools for exploration during a step — that hasn't changed. Actions are for things the workflow says must happen, not things the model might choose to do.

Actions are declared alongside their step and have typed input/output schemas, making them auditable and diffable.

### Observers

Observers are read-only callbacks the SDK fires at specific lifecycle points. They're for cross-cutting concerns — logging, telemetry, audit trails, wiring skills into external observability. They receive a frozen snapshot of the relevant state and return nothing. They cannot change what the workflow does.

```typescript
skill({
  // ...
  observers: {
    onStepStart: ({ step, params }) => {
      logger.info({ step: step.name, skill: 'repo-doctor' }, 'step started');
    },
    onStepComplete: ({ step, output, durationMs }) => {
      metrics.histogram('skill.step.duration', durationMs, { step: step.name });
    },
    onStepValidationFailed: ({ step, raw, error, attempt }) => {
      logger.warn({ step: step.name, attempt, error }, 'validation failed');
    },
    onTransition: ({ from, to, reason }) => {
      audit.record({ from, to, reason, timestamp: Date.now() });
    },
    onSkillComplete: ({ path, finalOutput, durationMs }) => {
      metrics.increment('skill.completed', { skill: 'repo-doctor' });
    },
  },
});
```

Available observer events, deliberately kept to five:

| Event                    | Fires when                                                         |
| ------------------------ | ------------------------------------------------------------------ |
| `onStepStart`            | Before the step's prompt is emitted to the model                   |
| `onStepComplete`         | After the step's output is validated (and action, if any, has run) |
| `onStepValidationFailed` | When the model's response doesn't match the schema (before retry)  |
| `onTransition`           | When the CLI routes from one step to another, including terminal   |
| `onSkillComplete`        | When the skill reaches a terminal state, successfully or otherwise |

**Observers do not mutate state.** If you need to transform data between steps, declare a step or an action — the transformation belongs in the workflow, not hidden in an observer. This is load-bearing: observers that mutate create non-local data flow that breaks replay and makes skills hard to reason about.

**Observers are not interceptors.** Some systems (notably the Claude Agent SDK's `PreToolUse`/`PostToolUse` hooks) allow callbacks to block or alter tool calls. We intentionally don't expose that. Those concerns belong to the agent host, which we don't run. An observer can log that a step failed; it cannot prevent a step from running or change what prose the model sees.

**Observers can be async**, but they should be fire-and-forget from the CLI's perspective. A slow observer doesn't block the workflow; the SDK queues them. If an observer throws, the error is logged but the skill continues — observers cannot bring down a skill run.

The word choice is deliberate: "observers," not "hooks." Hooks imply leverage; observers imply telescopes. If you need to intervene in the workflow, that's what steps and actions are for.

---

## 9. Testing

```typescript
// skill.test.ts
import { test, runSkill, mockModel } from '@contentful/skill-kit/test';
import doctor from './skill';

test('routes to remediate when checks fail', async () => {
  const result = await runSkill(doctor, {
    params: { repoPath: './fixtures/broken-repo' },
    model: mockModel({
      diagnose: { checks: [{ name: 'ci', status: 'fail', detail: '...' }] },
      remediate: { remediations: [{ check: 'ci', action: 'add .github/workflows/ci.yml' }] },
    }),
  });
  expect(result.path).toEqual(['diagnose', 'remediate', 'report']);
  expect(result.output).toMatchSnapshot();
});
```

`mockModel` takes either a map of step → canned output or a function.

---

## 10. Runtime / CLI invocation protocol

The compiled skill binary is invoked by agents via Bash — one call per step. Each call is stateless; the agent passes the full conversation history on every invocation. JSON output goes to stdout, diagnostics and errors to stderr.

### Subcommands

**`start`** (default) — Begin the workflow. Returns the first step's prompt and schema. The `start` subcommand is implicit — omitting it defaults to `start`, so agents see `run *` as the base permission pattern.

```bash
./scripts/run --params '{"repoPath":"."}' --host claude-code
```

```json
{ "kind": "prompt", "step": "diagnose", "prompt": "Inspect the repository and report failed health checks.", "schema": {...} }
```

**`advance`** — Submit a step's output and get the next prompt (or done signal).

```bash
./scripts/run advance \
  --step diagnose \
  --output '{"checks":[{"name":"ci","status":"fail","detail":"no CI config found"}]}' \
  --history '[{"step":"diagnose","output":{"checks":[...]}}]' \
  --host claude-code
```

```json
{ "kind": "prompt", "step": "remediate", "prompt": "Fix these issues...", "schema": {...} }
```

**Terminal response:**

```json
{ "kind": "done", "done": true, "finalOutput": {...} }
```

**Validation error:**

```json
{ "kind": "error", "error": "validation", "step": "diagnose", "message": "Expected object, received string", "retry": true }
```

All CLI result types carry a `kind` field that serves as a discriminant for the `CliResult` union: `'prompt'`, `'done'`, `'error'`, or `'redirect'`. The SDK exports type guard helpers (`isPrompt`, `isDone`, `isError`, `isRedirect`) for narrowing.

### Flags

| Flag            | Required     | Description                                                                                                                                                                    |
| --------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--params`     | On `start`   | JSON string. Validated against the skill's params schema.                                                                                                                      |
| `--step`        | On `advance` | Name of the step whose output is being submitted. Not needed with `--session` in file mode.                                                                                    |
| `--output`      | On `advance` | JSON string. The agent's response for the step. Not needed with `--session` in file mode.                                                                                      |
| `--history`     | On `advance` | JSON array of `{"step": string, "output": unknown}` objects. Full conversation history. Not needed with `--session`.                                                           |
| `--host`        | Optional     | Host identifier for tool resolution. Defaults to `generic`. Known values: `claude-code`, `codex`, `opencode`, `gemini-cli`, `cline`, `roo-code`, `kilo-code`, `cursor`, `amp`. |
| `--tools`       | Optional     | Comma-separated list of available tools (merged with host registry; authoritative with `--subagent`). E.g., `--tools AskUserQuestion,EnterPlanMode,TaskCreate,Agent`.           |
| `--subagent`    | Optional     | Boolean flag. Indicates a subagent with a genuine tool subset — `--tools` becomes authoritative (no registry merge).                                                           |
| `--session`     | Optional     | `new` to create a session (start), or session ID (advance). See [Session protocol](#session-protocol-file-based).                                                              |
| `--session-dir` | Optional     | Directory for session files. Default: OS temp directory.                                                                                                                       |
| `--output-mode` | Optional     | `file` (default) or `flag`. How the agent passes step output. Only on start with `--session new`.                                                                              |
| `--help`        | —            | Print usage to stderr, exit 0.                                                                                                                                                 |

### Statelessness

Each invocation reconstructs the workflow engine from the skill definition + history. The binary replays history to rebuild state (stash, visit counts, etc.) without re-executing actions or observers. This is cheap — history is data, not re-execution.

This design means no persistent process, no stdin piping, and no reliance on the agent managing a subprocess lifecycle. The agent makes sequential Bash calls and parses JSON output — a pattern every agent host supports today.

### Composite CLI protocol

Skills with registered sub-skills and/or topics accept additional commands. All go through `scripts/run` (hosts grant `scripts/run *` via "Always allow").

**Direct sub-skill access** — bypass the dispatcher and start a sub-skill directly:

```bash
./scripts/run doctor --params '{"spaceId":"abc"}' --host claude-code
./scripts/run doctor advance --step diagnose --output '{...}' --history '[...]'
```

**Reference topics** — list or load topics:

```bash
./scripts/run topics                 # list all topics with labels
./scripts/run topic rate-limits      # load topic content to stdout
```

**Namespaced step names** — sub-skill steps are prefixed at the protocol layer. The host sees `doctor/diagnose` in the `step` field and passes it back on `advance`. The composite entry strips the prefix before routing to the sub-skill engine.

**RedirectResult** — when the dispatcher's `next` resolves to `subskill:<name>` or `topic:<name>`, the engine returns a `RedirectResult` (the target doesn't exist in the local step map). The composite entry intercepts this and either starts the sub-skill or loads the topic. The host never sees `RedirectResult` — it receives the sub-skill's first `PromptResult` or a `DoneResult` with topic content.

### Script design conventions

The binary follows the [agentskills.io script design conventions](https://agentskills.io/specification):

- Non-interactive (no TTY prompts)
- `--help` for discoverability
- JSON to stdout, diagnostics to stderr
- `--long-name` flags only
- Non-zero exit on failure with descriptive error messages

### Session protocol (file-based)

The stateless protocol works but produces noisy UX — every invocation dumps verbose JSON to stdout (visible in the agent's Bash tool output), and the `--history` flag grows with every step. The session protocol is an opt-in alternative that moves protocol data to a temp file.

**Creating a session:**

```bash
./scripts/run --params '{"repoPath":"."}' --host claude-code --session new
```

Returns a `SessionPointer` to stdout:

```json
{ "sessionId": "abc123", "file": "/tmp/skill-kit-abc123.jsonl", "line": 2 }
```

The session file is JSONL. Line 1 is the header; line 2 is the first prompt.

**Session JSONL format:**

| Line type | `type` field | Description                                                                          |
| --------- | ------------ | ------------------------------------------------------------------------------------ |
| Header    | `header`     | Session metadata: `sessionId`, `skill`, `host`, `params`, `createdAt`, `outputMode`  |
| Prompt    | `prompt`     | Step prompt with `step`, `prompt`, `schema`, optional `preamble` and `completed`     |
| Output    | `output`     | Agent's step response: `step`, `output`                                              |
| Done      | `done`       | Terminal: `done: true`, `finalOutput`, `completed`                                   |
| Error     | `error`      | Validation error: `error`, `step`, `message`, `retry`                                |

Example session file:

```jsonl
{"type":"header","sessionId":"abc123","skill":"doctor","host":"claude-code","params":{},"createdAt":"2026-04-22T10:00:00Z","outputMode":"file"}
{"type":"prompt","step":"diagnose","prompt":"Inspect the repo...","schema":{...},"preamble":"..."}
{"type":"output","step":"diagnose","output":{"checks":[...]}}
{"type":"prompt","step":"remediate","prompt":"Fix these...","schema":{...},"completed":{"step":"diagnose","output":{...}}}
{"type":"output","step":"remediate","output":{"fixed":true}}
{"type":"done","finalOutput":{"fixed":true},"completed":{"step":"remediate","output":{...}}}
```

**Output modes** — how the agent passes its step output back:

- **`file` (default):** The agent appends a `{"type":"output","step":"<name>","output":{...}}` line to the JSONL file, then calls `advance --session <id>` with no `--step` or `--output` flags. The CLI reads the last output line from the file.
- **`flag`:** The agent passes `--step <name> --output '{...}'` on the advance call. The CLI writes the output line to the file itself. Set via `--output-mode flag` at session creation.

**Advancing with a session:**

```bash
# file mode (default) — agent already appended output line
./scripts/run advance --session abc123
# → stdout: 4    (line number of the next prompt/done)

# flag mode — agent passes output as CLI args
./scripts/run advance --step diagnose --output '{...}' --session abc123
# → stdout: 4
```

The line number tells the agent which line to read from the session file.

**History reconstruction:** The CLI reads `completed` fields from `prompt` and `done` lines to rebuild the history array. This matches the existing `--history` format exactly. No `--history` flag is needed with `--session`.

**Session flags:**

| Flag                       | Description                                                         |
| -------------------------- | ------------------------------------------------------------------- |
| `--session new`            | Create a new session (on `start`). Returns `SessionPointer`.        |
| `--session <id>`           | Use existing session (on `advance`). Returns line number.           |
| `--session-dir <path>`     | Override temp directory. Default: `os.tmpdir()`.                    |
| `--output-mode file\|flag` | Set output mode (on `start` with `--session new`). Default: `file`. |

**Composite skills and sessions:** One session spans the entire composite workflow. Subskill step names are prefixed in the session file (e.g., `doctor/diagnose`), same as in the stateless protocol. Direct subskill access (`./scripts/run doctor --session new`) creates a separate session for that subskill.

**The `SessionPointer` type:**

```typescript
interface SessionPointer {
  sessionId: string;
  file: string;
  line: number;
}
```

---

## 11. Build and distribution

### `skill-kit build`

Produces a distributable, [agentskills.io](https://agentskills.io/specification)-compliant skill directory from a skill source file.

```bash
skill-kit build src/skills/repo-doctor/skill.ts -o skills/repo-doctor
```

This:

1. Validates the skill definition (cycle guards, schema consistency)
2. Bundles the skill code (mode-dependent — see below)
3. Generates `scripts/run` shell wrapper (public interface)
4. Generates `SKILL.md` with invocation instructions
5. Generates `package.json` — name, version, and any fields from the `package` config. Merges with existing `package.json` in the output directory if present. When `resolveVersion: true` is set, reads the version from the nearest ancestor `package.json` instead of using the hardcoded `version` field.
6. Copies `references/` from the source directory

### Build modes

The `--mode` flag selects the bundling strategy:

| Mode              | Flag          | Output                                 | Size                 | Requires                |
| ----------------- | ------------- | -------------------------------------- | -------------------- | ----------------------- |
| **bun** (default) | `--mode bun`  | Platform-specific compiled executables | ~50-100MB per target | `bun` installed         |
| **node**          | `--mode node` | Single `.mjs` bundle                   | ~100-500KB           | Node.js ≥ 24 at runtime |

Node mode is the right choice for skills that live inside a Node.js codebase where Node is already available. Bun mode produces standalone executables that work without any runtime dependency.

### Protocol mode

The `--protocol` flag controls which invocation instructions the generated SKILL.md contains:

| Protocol              | Flag                   | SKILL.md instructions                                                              |
| --------------------- | ---------------------- | ---------------------------------------------------------------------------------- |
| **session** (default) | `--protocol session`   | File-based session protocol (see [Session protocol](#session-protocol-file-based)) |
| **stateless**         | `--protocol stateless` | Traditional `--history`-passing protocol                                           |

Session mode is the default and recommended choice — it produces cleaner agent UX and shorter Bash output. Use `--protocol stateless` only for hosts that cannot write to the filesystem (e.g., sandboxed environments where the agent has no Write/echo capability).

The flag only affects the generated SKILL.md. The binary itself always supports both protocols — an agent can use `--session` or `--history` regardless of what the SKILL.md says.

### Output structure

**Bun mode** (default):

```
skills/repo-doctor/
  SKILL.md                       # Generated — agent reads this
  package.json                   # Generated — name, version
  scripts/
    run                          # Shell wrapper — detects OS/arch, delegates to binary
  bin/
    repo-doctor-darwin-arm64     # macOS Apple Silicon
    repo-doctor-linux-x64       # Linux x86_64
  references/                    # Copied from source
    severity-rubric.md
```

Default targets: `darwin-arm64` and `linux-x64`. Override with `--targets`. Use `--single` for fast dev builds (current platform only).

**Node mode** (`--mode node`):

```
skills/repo-doctor/
  SKILL.md                       # Generated — agent reads this
  package.json                   # Generated — name, version
  scripts/
    run                          # Shell wrapper — checks Node ≥ 24, runs bundle
  bin/
    repo-doctor.mjs              # Single ESM bundle (all deps inlined)
  references/                    # Copied from source
    severity-rubric.md
```

One bundle works on all platforms where Node.js ≥ 24 is available. No `--targets` or `--single` flags needed.

### The `scripts/run` wrapper

Following [skill-dev conventions](https://github.com/TimBeyer/agent-skills/blob/main/skills/skill-dev/SKILL.md), the public interface is a shell wrapper in `scripts/` that delegates to `bin/`. The wrapper varies by build mode:

**Bun mode** — detects OS and architecture, dispatches to the correct platform binary:

```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in x86_64) ARCH="x64" ;; aarch64|arm64) ARCH="arm64" ;; esac
BIN="$SKILL_DIR/bin/repo-doctor-${OS}-${ARCH}"
if [[ ! -x "$BIN" ]]; then
  echo "error: no binary for ${OS}-${ARCH}. Available:" >&2
  ls "$SKILL_DIR/bin/" >&2; exit 1
fi
exec "$BIN" "$@"
```

**Node mode** — checks Node.js version, sets `SKILL_DIR` env var for reference resolution, runs the bundle:

```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE_VERSION="$(node -e 'process.stdout.write(process.versions.node.split(".")[0])')"
if [ "$NODE_VERSION" -lt 24 ] 2>/dev/null; then
  echo "error: Node.js >= 24 required" >&2; exit 1
fi
export SKILL_DIR
exec node "$SKILL_DIR/bin/repo-doctor.mjs" "$@"
```

`SKILL.md` references only `scripts/run` — never `bin/` directly. The wrapper decouples the skill's contract from its internal layout.

### Generated SKILL.md

The build generates a SKILL.md with:

- **Frontmatter:** `name`, `description`, `compatibility`, optional `metadata.version`
- **Invocation instructions:** step-by-step pattern for the agent (start → advance loop → parse JSON → follow schema)
- **Step descriptions:** each step's purpose (extracted from the skill definition)
- **Reference pointers:** links to files in `references/` (loaded on demand)

Authors customize via `skill.description` and optional `skill.skillMd` template override.

For composite skills, the generated SKILL.md also includes:

- A **Sub-skills** section listing available sub-skills with descriptions and direct-access commands
- A **Reference topics** section listing topics with `scripts/run topics` and `scripts/run topic <name>` commands
- Context-aware guidance: when a dispatcher exists, the SKILL.md tells the agent to start normally and let the workflow route; direct sub-skill access is presented as a fallback for explicit user requests

### The compile/bundle step

The build generates a temporary entry point:

```typescript
import skill from './skill';
import { main } from '@contentful/skill-kit/cli';
main(skill);
```

**Bun mode:** `bun build --compile` bundles everything — the SDK, Zod, the skill code — into a single self-contained executable per target platform.

**Node mode:** esbuild bundles the same dependency tree into a single `.mjs` file. All dependencies (SDK, Zod) are inlined; only Node.js built-ins are external. The result is a portable ESM module that runs under `node`.

**Composite skills** build identically — same `skill-kit build` command, same output structure. The build pipeline detects `def.subskills` and generates a wrapper calling `compositeMain` instead of `main`. No special flags or separate build step needed.

---

## 12. Repo layout for skill authors

Source and built skills live in separate directories. `src/skills/` is where authors write TypeScript. `skills/` is the distribution output — every subdirectory is a valid, self-contained skill per the agentskills.io spec.

```
my-repo/
  package.json                # @contentful/skill-kit as devDep, build scripts
  src/
    skills/
      repo-doctor/
        skill.ts              # Skill definition (SDK code)
        skill.test.ts         # Tests using runSkill() + mockModel()
        references/           # Reference docs (copied to output on build)
          severity-rubric.md
      deploy-helper/
        skill.ts
        skill.test.ts
  skills/                     # Build output — each subdir is a valid skill
    repo-doctor/              # Built by: skill-kit build src/skills/repo-doctor/skill.ts -o skills/repo-doctor
      SKILL.md
      package.json
      scripts/
        run
      bin/
        repo-doctor.mjs       # --mode node (single bundle)
        # — OR for --mode bun: —
        # repo-doctor-darwin-arm64
        # repo-doctor-linux-x64
      references/
        severity-rubric.md
    some-prose-skill/         # Traditional prose skills coexist
      SKILL.md
      package.json
  CLAUDE.md
  README.md
```

**Why the separation matters:**

- `skills/` is the installation boundary. The `skills` CLI copies skill directories in isolation. Everything outside — source, tests, CI configs — stays out of the installed artifact.
- `src/skills/` contains author code, tests, and source references. It's not distributed.
- `SKILL.md` lives at the skill root as required by the agentskills.io spec. The directory name matches the `name` field.
- Traditional prose skills and skill-kit skills coexist in `skills/` — both are valid skill directories.

**Build wiring** in root `package.json`:

```json
{
  "scripts": {
    "build": "skill-kit build src/skills/repo-doctor/skill.ts -o skills/repo-doctor",
    "build:all": "skill-kit build src/skills/*/skill.ts",
    "test": "node --test --import tsx/esm 'src/skills/**/*.test.ts'"
  }
}
```

**Git distribution:** With `--mode node`, the `.mjs` bundles in `skills/*/bin/` are small enough to commit to git. With `--mode bun`, the compiled executables are large (50-100MB each) — add `skills/*/bin/` to `.gitignore` and build in CI instead.

---

## 13. What the SDK is opinionated about

Non-negotiable, for good reasons:

- **Schemas are Zod.** One validator, one source of truth, native TS types. No pluggable schema systems.
- **Prose is markdown.** Not JSX, not MDX, not templating DSLs. Portable, diffable, model-friendly.
- **State is append-only.** No mutation of prior step outputs. Enables replay.
- **Cycles require explicit bounds.** No unguarded loops.
- **Capabilities are declared, not discovered.** No runtime probing.
- **Actions are declared, not inferred.** Any CLI-side side effect must exist as a named action.
- **Steps are named string keys.** The state machine is inspectable as data, not reconstructed from closures.

Author choices:

- How many steps, how prose is decomposed, what schemas look like.
- Whether to use fragments, references, sub-skills.
- Tone, formatting, domain language.
- Custom render helpers beyond the built-ins.

---

## 14. Cross-host capability model

### The architectural constraint (read this first)

The skill CLI is a compiled binary invoked by the agent via Bash. The agent reads the generated `SKILL.md`, which instructs it to call `scripts/run start` and then `scripts/run advance` in a loop. The CLI returns JSON to stdout — including a `prompt` field containing prose the agent reads and acts on.

The CLI cannot call tools. The CLI cannot invoke MCP methods. The CLI cannot cause the host to render UI. Only the model can do those things, and only in response to its own reasoning about what the text it just read is asking of it.

So when the SDK wants the model to use `AskUserQuestion` on Claude Code, all it can actually do is return prose that names the tool and describes how to use it. The model reads the prose, decides to call the tool, and on its next turn the CLI sees the answer in whatever form the model passes it back. The shape of the answer is still enforced by the step's Zod schema — that's unchanged. What changes from a naive prose skill is _which prose_ gets emitted and _how reliably_ it steers the model.

Everything in the rest of this section is downstream of that constraint. The primitives render XML tags; the preamble maps those tags to host-specific tools via a markdown table. The "capability system" is `resolveTools()` picking which tool name (if any) each primitive gets. There is no secret channel.

### Why primitives still matter

Given that everything is prose, a reasonable question is: why not just let authors write the prose themselves?

Three reasons, all load-bearing:

**1. Centralized tuning.** "Ask the user which option they want" is a request. "Use the AskUserQuestion tool with these exact options, one answer per invocation, do not paraphrase the options" is a specification. The second is the prose that actually produces reliable behavior on Claude Code. Figuring it out takes iteration against real models. When the SDK owns that prose, one tuning pass benefits every skill.

**2. Host portability without rewriting.** If an author hardcodes Claude Code's tool name in their skill, the skill breaks on Codex. If they abstract to a primitive, the SDK swaps the prose per host automatically. The author writes intent once; the SDK translates.

**3. SDK improvements propagate.** This is the biggest argument. If six months from now someone finds a better way to phrase structured-question prose for Codex — fewer tokens, more reliable parsing, cleaner failure modes — the SDK ships the improvement and every skill using `askUser` gets it for free. No skill prose refactoring. The SDK becomes the place where prompt engineering compounds, instead of being re-done inside every skill by every author.

That last point is the real pitch. Skills written against primitives inherit prompt-engineering work done in the SDK. Skills written as raw prose don't.

### Two mechanisms for steering the model

The SDK has two levers for calibrated prose:

**Preamble at session start.** When the CLI starts, it emits a one-time preamble that sets conventions for the session. The preamble is a markdown table mapping XML tags to tools:

```
You are following a structured workflow driven by a skill CLI.
Each step provides a prompt and a JSON schema for the expected output.
Follow the prompt instructions precisely and return output matching the schema.

Step prompts use XML tags. Follow sections in the order they appear.

| Tag | Tool | How to use |
|-----|------|-----------|
| `<system>` | — | Behavioral directives. Follow as persona/tone guidelines. |
| `<prompt>` | — | Task instructions. The work to perform. |
| `<ask-user>` | AskUserQuestion | Present `<option>` children as choices via the tool. ... |
| `<confirm>` | AskUserQuestion | Yes/no via the tool. Respect `default` attribute. ... |
| `<plan>` | EnterPlanMode | Present summary + `<step>` children via the tool. ... |
| `<checklist>` | TaskCreate | Register `<item>` children via the tool. ... |
| `<survey>` | AskUserQuestion | Present `<question>` children sequentially via the tool. ... |
| `<subagent>` | Agent | Spawn isolated agent for enclosed task via the tool. ... |
| `<rendered>` | — | Pre-rendered output from the skill. Emit verbatim. If `name` attr present, reference by name. |
```

The table is generated per host via `preambleRows()` in the registry. Each primitive's `preambleRow(tool)` method receives the resolved tool name (or `undefined` for hosts without a matching tool) and returns tag, tool, and instruction. The `resolveTools(handshake)` function uses a three-way strategy: if no explicit tools are reported, the host registry provides the full list; if explicit tools are reported and `--subagent` is set, those tools are authoritative (the registry is ignored — subagents genuinely have fewer tools); if explicit tools are reported without `--subagent`, they are unioned with the host registry (handles the common case where top-level agents under-report their tools).

Preambles are best-effort — the model may forget them under context pressure. For critical primitives (anything with schema-enforced output), the XML tags in per-step prose are self-describing enough that the model can act on them even without the preamble. Preambles optimize the common case; per-step XML guards correctness.

**Per-step XML output.** For any step using a primitive (via `act` methods in the prompt function or by passing an `ActSegment` directly to `prompt`), the SDK renders the primitive as an XML tag. The `assemblePieces` method in the engine wraps each piece: plain strings become `<prompt>` tags, system segments become `<system>` tags, act segments are rendered via `renderPrimitive()` into their respective XML tags (`<ask-user>`, `<confirm>`, `<plan>`, `<checklist>`, `<subagent>`, `<survey>`), and view segments (from the `view()` helper) are wrapped in `<rendered>` tags with an optional `name` attribute.

On Claude Code, an `askUser` step emits:

```xml
<ask-user type="structured" question="Which deployment target?">
  <option value="production" label="Production">Live, customer-facing</option>
  <option value="staging" label="Staging">Pre-production mirror</option>
  <option value="local" label="Local">Development only</option>
</ask-user>
```

The model reads the tag, looks up `<ask-user>` in the preamble table (which says to use `AskUserQuestion`), and calls the tool with the options. On a host without a structured-question tool, the same XML is emitted, but the preamble's instruction for `<ask-user>` says to present a numbered list and accept only exact value matches.

Same XML. Same skill. The preamble table handles the host-specific translation. The skill author wrote the same three lines in both cases.

### What the major hosts expose (the preamble has to map these)

The SDK maintains a `HOST_REGISTRY` mapping host names to their known tool lists. Each primitive declares the tool names it can use (across all hosts) in its `tools` array. `resolveTools(handshake)` uses a three-way strategy based on the `isSubagent` flag:

- **No `--tools`**: the host registry provides the full list for all primitives.
- **`--tools` + `--subagent`**: explicit tools are authoritative. The registry is ignored entirely — subagents genuinely have fewer tools and the explicit list represents their real capabilities.
- **`--tools` without `--subagent`**: explicit tools are unioned with the host registry. This handles the common case where a top-level agent under-reports its tools (e.g., reporting only `Read,Bash,Agent` but not `AskUserQuestion` or `TaskCreate`). The union also captures extra tools not yet in the registry (MCP tools, future additions).

The resolved tool name (or `undefined` when no match is found) is passed to each primitive's `preambleRow()` to generate the instruction.

**Claude Code.** `AskUserQuestion`, `EnterPlanMode`/`ExitPlanMode`, `TaskCreate`/`TaskUpdate`/`TaskList`/`TaskGet`, `Agent`, `Skill`, `TodoWrite`, standard file/shell/search tools (`Read`, `Edit`, `Write`, `Bash`, `Glob`, `Grep`), `WebFetch`/`WebSearch`, plus `SendMessage`, `Monitor`, `LSP`, `NotebookEdit`, `EnterWorktree`/`ExitWorktree`.

**Codex CLI.** `shell` or `exec_command`/`write_stdin` (config-dependent shell backends), `apply_patch`, `update_plan`, `web_search` (Responses API built-in, config-dependent), `view_image`, `request_user_input` (available in Plan mode only), `spawn_agent`/`send_input`/`wait_agent`/`close_agent` (multi-agent).

**OpenCode.** `bash`, `read`, `write`, `edit`, `apply_patch`, `glob`, `grep`, `codesearch`, `lsp`, `webfetch`, `websearch`, `question`, `todo`, `task`, `plan`, `skill`.

**Gemini CLI.** `shell`, `read-file`, `write-file`, `edit`, `glob`, `grep`, `web-search`, `web-fetch`, `ask-user`, `enter-plan-mode`/`exit-plan-mode`, `write-todos`, `agent`, `tracker-create-task`/`tracker-update-task`, `memory`, `activate-skill`.

**Cline / Roo Code / Kilo Code.** Fork-based ecosystem sharing `execute_command`, `read_file`, `write_to_file`, `edit_file`, `apply_diff`, `search_files`, `list_files`, `codebase_search`, `ask_followup_question`, `attempt_completion`, `new_task`, `switch_mode`, `update_todo_list`. Some add `browser_action`, `access_mcp_resource`, or `PLAN_MODE`/`USE_SUBAGENTS`.

**Cursor.** `codebase_search`, `read_file`, `edit_file`, `run_terminal_command`, `file_search`, `grep_search`, `list_dir`.

**Amp.** `shell`, `read`, `write`, `edit`.

Patterns:

- Structured user questions: Claude Code has `AskUserQuestion`, Codex has `request_user_input` (Plan mode only), Gemini CLI has `ask-user`, Cline/Roo/Kilo have `ask_followup_question`, OpenCode has `question`. Most divergent primitive.
- Planning/TODOs: All major hosts have something, but the semantics differ. Task tracking is convergent; plan-mode-before-execute varies by host.
- File/shell/search: Essentially interchangeable from an XML perspective — the model picks the right tool from the tag context.

### The abstraction principle (unchanged)

Workflow primitives (things that gate state transitions or define deliverable shape) get SDK primitives with host-aware prose. Work primitives (things the model does inside a step to accomplish the job) stay in author-written prose and rely on the host's native tools.

### Concrete SDK primitives

Each primitive is an author-facing TypeScript building block. Authors reason about primitives — "I need an `askUser` step here" — not about host tools. The host-specific prose is a backend implementation detail of the primitive, and the SDK maintains it.

This matters because tool-name-awareness is a leaky abstraction. An author who thinks "I'm wrapping `AskUserQuestion`" will reach for the raw tool name the moment they want something slightly different, and the skill stops being portable. Framing primitives as building blocks keeps the right abstraction boundary: authors describe intent, the SDK produces prose.

Each primitive below is a `definePrimitive()` call exporting: `tag` (XML tag name), `tools` (tool names it can use across hosts), `create` (input to config), `render` (config to XML string), and `preambleRow` (resolved tool to table row). All colocated in one file per primitive (e.g., `src/primitives/ask-user.ts`). The registry (`src/primitives/registry.ts`) loops over `ALL_PRIMITIVES` for rendering and preamble generation.

#### `askUser` — structured or open question

A single primitive with two modes, discriminated by `type`:

```typescript
// Structured — presents fixed options via host-specific tool
.step("choose-target", {
  prompt: act.askUser({
    type: "structured",
    question: "Which deployment target?",
    options: [
      { value: "production", label: "Production", description: "Live, customer-facing" },
      { value: "staging", label: "Staging", description: "Pre-production mirror" },
    ],
  }),
  output: z.object({ target: z.enum(["production", "staging"]) }),
  next: ({ stepOutput }) => `deploy-${stepOutput.target}`,
})

// Open — composed with additional instructions via act
.step("ask-stack", {
  prompt: ({ act }) => [
    act.askUser({ type: "open", question: "What's your go-to tech stack?" }),
    prompt`Ask about their stack — get specific, not generic.`,
  ],
  output: z.object({ answer: z.string() }),
  next: "done",
})
```

The SDK renders primitive directives as XML tags. An `askUser` step with `type: 'structured'` emits:

```xml
<ask-user type="structured" question="Which deployment target?">
  <option value="production" label="Production">Live, customer-facing</option>
  <option value="staging" label="Staging">Pre-production mirror</option>
</ask-user>
```

Options can include a `preview` field, rendered as a `<preview>` child element:

```xml
<ask-user type="structured" question="Which theme?">
  <option value="dark" label="Dark">
    <preview>A dark color scheme with muted tones</preview>
  </option>
  <option value="light" label="Light">
    <preview>A bright, high-contrast color scheme</preview>
  </option>
</ask-user>
```

Structured questions also support a `header` field (max 12 characters) displayed above the options:

```typescript
act.askUser({
  type: 'structured',
  question: 'Pick a color',
  header: 'Colors',
  options: [
    { value: 'red', label: 'Red', preview: 'A warm, vibrant hue' },
    { value: 'blue', label: 'Blue', preview: 'A cool, calming hue' },
  ],
});
```

**Validation:** `header` must be at most 12 characters. Structured questions must have 2 to 4 options.

An `askUser` step with `type: 'open'` emits:

```xml
<ask-user type="open" question="What's your go-to tech stack?" />
```

The preamble (sent once at session start) maps these tags to host-specific tools via a markdown table. On Claude Code with `AskUserQuestion` available, the `<ask-user>` row instructs the model to present options via that tool. On hosts without a structured-question tool, it instructs the model to present a numbered list and accept only exact matches. The model reads the tag, consults the preamble's tool mapping, and acts accordingly.

The `output` schema is the contract regardless of host or mode. Downstream steps don't know how the answer was obtained.

#### `confirm` — binary approval with context

```typescript
step({
  prompt: act.confirm({
    message: 'This will delete 47 files in .cache/. Continue?',
    destructive: true,
    defaultAnswer: 'no',
  }),
  output: z.object({ approved: z.boolean() }),
  next: ({ stepOutput }) => (stepOutput.approved ? 'proceed' : 'abort'),
});
```

The SDK emits:

```xml
<confirm default="no" destructive="true">This will delete 47 files in .cache/. Continue?</confirm>
```

The preamble maps `<confirm>` to the host's tool (e.g., `AskUserQuestion` on Claude Code) or instructs the model to ask "Yes, proceed" / "No, cancel" on hosts without a dedicated tool.

Distinct from `askUser` because destructive-op confirmation needs stronger defaults and warning framing.

#### `plan` — show plan, wait for approval

```typescript
step({
  prompt: act.plan({
    summary: 'Migrate auth from session cookies to JWTs',
    steps: [
      'Add JWT signing and verification helpers',
      'Update login flow to issue JWTs',
      'Add compatibility layer for existing sessions',
      'Update middleware to accept both',
      'Migration script for active sessions',
    ],
  }),
  output: z.object({ approved: z.boolean(), modifications: z.string().optional() }),
  next: ({ stepOutput }) => (stepOutput.approved ? 'execute' : 'revise'),
});
```

The SDK emits:

```xml
<plan summary="Migrate auth from session cookies to JWTs">
  <step>Add JWT signing and verification helpers</step>
  <step>Update login flow to issue JWTs</step>
  <step>Add compatibility layer for existing sessions</step>
  <step>Update middleware to accept both</step>
  <step>Migration script for active sessions</step>
</plan>
```

The preamble maps `<plan>` to the host's tool (e.g., `EnterPlanMode` on Claude Code, `update_plan` on Codex) or instructs the model to present a numbered list and ask to proceed or revise. This is where UX degrades most visibly — Claude Code gets a first-class plan-mode UI, others get markdown. Same skill, coherent behavior across all.

#### `checklist` — tracked task list

```typescript
step({
  prompt: ({ history }) => {
    const remediate = history.find((s) => s.step === 'remediate')!.stepOutput;
    return act.checklist({
      create: remediate.remediations.map((r) => ({ title: r.action, status: 'pending' })),
    });
  },
  output: z.object({ completed: z.boolean() }),
  next: 'execute-tasks',
});
```

The SDK emits:

```xml
<checklist>
  <item status="pending">Add CI config</item>
  <item status="pending">Fix lint warnings</item>
</checklist>
```

The preamble maps `<checklist>` to the host's tool (e.g., `TaskCreate` on Claude Code, `todowrite` on OpenCode) or instructs the model to maintain a visible markdown checklist.

#### `deliverable` — terminal rendered output

Already covered by `view()` + verbatim-paste in §4. Sits in the capability system because future hosts may expose richer structured output (interactive tables, collapsible sections) that view segments can dispatch to via host introspection. For now, the SDK emits "output the following verbatim" prose with host-specific emphasis on what verbatim means for that model.

#### `subagent` — spawn an isolated sub-agent

```typescript
step({
  prompt: act.subagent({
    prompt: 'Research the top 5 CVEs affecting our dependency tree. Return a structured summary.',
    output: ResearchSummary,
  }),
  output: ResearchSummary,
  next: 'incorporate-findings',
});
```

The SDK emits:

```xml
<subagent>Research the top 5 CVEs affecting our dependency tree. Return a structured summary.</subagent>
```

The preamble maps `<subagent>` to the host's tool (e.g., `Agent` on Claude Code, `task` on OpenCode) or instructs the model to focus on the enclosed task and return a structured result. On hosts without real agent isolation, the fallback still produces correct output but doesn't get the context-window benefit.

**Recursion guard:** Subagents have access to the host's full tool set, including the Skill tool, so they _can_ invoke the same skill recursively. By default, `allowRecursion` is `false` and the SDK emits `<subagent no-recurse="skill-name">`, which the preamble tells the agent to respect. Set `allowRecursion: true` to remove the guard — useful when a skill intentionally composes with itself via sub-skills.

```typescript
// Default: subagent won't re-invoke this skill
act.subagent({ prompt: 'Write a README', output: schema });
// → <subagent no-recurse="game-jam">Write a README</subagent>

// Opt-in: subagent CAN re-invoke this skill
act.subagent({ prompt: 'Run the doctor sub-skill', output: schema, allowRecursion: true });
// → <subagent>Run the doctor sub-skill</subagent>
```

#### `survey` — batched multi-question

For steps that need answers to multiple questions in one turn, `act.survey(questions)` batches them:

```typescript
.step('gather-info', {
  prompt: act.survey([
    { type: 'open', question: 'What is your project name?' },
    { type: 'structured', question: 'What language?', options: [
      { value: 'ts', label: 'TypeScript' },
      { value: 'py', label: 'Python' },
    ]},
    { type: 'open', question: 'Describe your use case.' },
  ]),
  output: z.object({ projectName: z.string(), language: z.string(), useCase: z.string() }),
  next: 'configure',
})
```

The SDK emits:

```xml
<survey>
  <question type="open" question="What is your project name?" />
  <question type="structured" question="What language?">
    <option value="ts" label="TypeScript" />
    <option value="py" label="Python" />
  </question>
  <question type="open" question="Describe your use case." />
</survey>
```

The preamble maps `<survey>` to the host's tool (e.g., `AskUserQuestion` on Claude Code — presented as sequential questions). On hosts without a structured-question tool, the model presents a numbered questionnaire and collects all answers.

### What we do _not_ abstract

- **File I/O.** The model picks `Read`/`read`/`cat` correctly from prose like "open `src/foo.ts`".
- **Shell / subprocess.** `Bash` vs `shell` — the model dispatches correctly.
- **Web search and fetch.** Native everywhere.
- **Plain code editing.** `apply_patch`, `Edit`, `multiedit` — all handled correctly from prose describing the edit.

Rule of thumb: if the model already picks the right tool given plain intent, don't add an abstraction.

### Host resolution

The `--host` CLI flag identifies which agent host is invoking the skill. The `--tools` flag optionally provides an explicit comma-separated list of available tools. The `--subagent` flag indicates the caller is a subagent with a genuine subset of the host's tools.

The SDK maintains a `HOST_REGISTRY` mapping host names to their known tool lists. Each primitive declares the tool names it can use in its `tools` array — for example, the ask-user primitive lists `['AskUserQuestion', 'ToolRequestUserInput', 'ask_followup_question', 'ask-user', 'question']`.

`resolveTools(handshake)` uses three-way resolution:

```typescript
function resolveTools(handshake: Handshake): ToolResolver {
  const registryTools = HOST_REGISTRY[handshake.host] ?? [];
  const explicitTools = handshake.toolsAvailable;

  let tools: string[];
  if (explicitTools.length === 0) {
    tools = registryTools;
  } else if (handshake.isSubagent) {
    tools = explicitTools;
  } else {
    tools = [...new Set([...explicitTools, ...registryTools])];
  }

  const resolved: ToolResolver = {};
  for (const p of ALL_PRIMITIVES) {
    resolved[p.tag] = p.tools.find((t) => tools.includes(t));
  }
  return resolved;
}
```

Three cases:

1. **No explicit tools** — the host registry provides the full list. This is the safety net when agents omit `--tools`.
2. **Explicit tools + `--subagent`** — the explicit list is authoritative. Subagents genuinely have fewer tools (e.g., `Bash,Read,Write,Edit`) despite identifying as a known host. The registry is ignored entirely.
3. **Explicit tools without `--subagent`** — the explicit list is unioned with the host registry. This handles the common case where a top-level agent under-reports its tools (e.g., reporting `Read,Bash,Agent` but not `AskUserQuestion` or `TaskCreate`). The union also captures tools not yet in the registry (MCP tools, future additions).

If a primitive's tool names don't appear in the resolved list, it gets `undefined` and its preamble row falls back to generic instructions.

The resolved tool names are passed to `preambleRows()`, which calls each primitive's `preambleRow(tool)` method to build the markdown table. No hidden magic — tool present means the preamble names it; absent means generic instructions.

The generated `SKILL.md` instructs the agent to pass `--host` and `--tools`, with a "Subagent invocations" section explaining when to pass `--subagent`.

### Host guarantees (what the SDK relies on)

The SDK's prose assumes certain things about what a host's named tools actually do. These are worth writing down, because if a host claims `AskUserQuestion` but the tool silently degrades to free text, skills break quietly.

Example expectations for a host whose tool list includes `AskUserQuestion`:

> When Claude calls AskUserQuestion with a list of options, the host MUST:
>
> 1. Present the options in a distinct UI, not merely inject them into the chat stream.
> 2. Return the user's answer as one of the exact option values (not paraphrased).
> 3. Handle cancellation by returning a clear cancellation signal rather than hanging.
>
> The SDK's generated prose assumes these hold. Hosts where they don't should not advertise `AskUserQuestion` in `toolsAvailable`.

Similar expectations exist for `EnterPlanMode`, `TaskCreate`/`TaskUpdate`, `Agent`, `todowrite`, `update_plan`. Writing them down is part of the spec because they're the contract between the SDK and the host ecosystem.

### Escape hatch: inspecting the handshake from prose

For cases where a primitive doesn't cover the need, the handshake is queryable inside prompt functions:

```typescript
step({
  prompt: ({ host }) => {
    const diagnose = history.find((s) => s.step === 'diagnose')!.stepOutput;
    if (host.toolsAvailable.includes('InteractiveCodeReview')) {
      return prompt`
        Use the InteractiveCodeReview tool to present the diff,
        passing findings as annotations.
      `;
    }
    return prompt`
      Present the diff as a markdown code block, then list findings below as numbered items with file:line refs.
    `;
  },
});
```

Escape hatch, not default. Heavy use of host-branching in prompts indicates a missing primitive and is lint-flagged.

### Linting

`skill check` enforces:

1. **No host-specific tool names in author prose.** If a prompt contains `AskUserQuestion`, `apply_patch`, `TodoWrite`, `update_plan`, etc., it's flagged. Use the SDK primitive. Exception: inside an explicit `host.toolsAvailable.includes(...)` branch.
2. **Host-branching density.** More than one step branching on `host.toolsAvailable` across a skill is a soft warning, suggesting a missing primitive.
3. **Primitive-schema mismatch.** `askUser` options must align with the step's `output` enum. Load-time error.
4. **Unknown tool names in escape-hatch prose.** If a prompt references a tool name, the SDK checks it against a registry of known host tools and flags typos. Prevents silent degradation when a misspelled tool name falls through to generic prose forever.
5. **Prose fallback registered for every primitive.** CI rule on the SDK itself — every primitive must have a generic-host prose implementation, not just host-specific ones.

### Worked example: the `askUser` flow end-to-end

Author writes:

```typescript
step({
  prompt: act.askUser({
    type: 'structured',
    question: 'Which deployment target?',
    options: [
      { value: 'production', label: 'Production' },
      { value: 'staging', label: 'Staging' },
      { value: 'local', label: 'Local' },
    ],
  }),
  output: z.object({ target: z.enum(['production', 'staging', 'local']) }),
  next: ({ stepOutput }) => `deploy-${stepOutput.target}`,
});
```

On any host, the CLI's JSON output includes a `prompt` field containing the XML:

```xml
<ask-user type="structured" question="Which deployment target?">
  <option value="production" label="Production"></option>
  <option value="staging" label="Staging"></option>
  <option value="local" label="Local"></option>
</ask-user>
```

The difference between hosts is entirely in the preamble table. On Claude Code, the `<ask-user>` row says: "Present `<option>` children as choices via the tool" with `AskUserQuestion` in the Tool column. The agent reads the XML, consults the preamble, calls `AskUserQuestion`, the host renders native UI, the user picks one, the answer comes back. The agent then calls `scripts/run advance --step deploy-target --output '{"target":"production"}'`. The CLI validates against the Zod schema and routes to the next step.

On Codex, the same `<ask-user>` XML is emitted, but the preamble's Tool column shows `ToolRequestUserInput` and the instruction says to present options via that tool. On hosts without any matching tool, the instruction says to present a numbered list and accept only exact value matches.

Same skill. Same XML. Same contract. The preamble table adapts the behavior per host. And — critically — if the SDK ships a better preamble instruction next month, this skill benefits without changes.

### A note on MCP elicitation

MCP's `elicitation/create` is a protocol-level mechanism for structured user input with schema validation and native UI on the client side — meaningfully better than prose-steering. It's not available to us, because it requires the skill to run as a long-lived MCP server the host connects to, which breaks the skill lifecycle, installation model, and trust model we've built around. Subprocess invocation is the shape that fits how skills are distributed and run.

Worth knowing the alternative exists; not worth designing around it.

### Summary

The CLI can only emit text. The SDK's value is that it emits structured XML tags for primitives and maps them to host-specific tools via a preamble table — naming the right tool on each host, falling back to generic instructions where no native tool exists, and refining the preamble instructions over time without requiring authors to rewrite skills. Primitives are worth having because they're where prompt-engineering effort concentrates and where improvements compound across the ecosystem.

---

## 15. Deliberately not in v0.1

- **Persistent stdio protocol.** The original spec described a stdin/stdout JSON protocol with a long-running skill process. No agent host today natively supports managing a skill as a persistent subprocess. Single-invocation mode (§10) works with every host via plain Bash calls. Stdio can be added later if a harness ever supports it — the engine interface (`start()`/`advance()`) accommodates both equally.
- **Streaming.** One prompt/response per turn. Streaming is a harness concern.
- **Parallel steps / fan-out.** Sequential only. Lands in v0.2 if a real use case emerges.
- **Human-in-the-loop primitive.** Harness-provided for now; SDK may add a typed primitive once patterns stabilize.
- **Visual authoring / flow editor.** Tooling, not SDK.
- **Hot reload during execution.** Restart the run.
- **Observability / metrics beyond stderr logging.** Harness responsibility.

---

## Open questions

1. **Fragment granularity.** Is `import { x } from "..."` enough, or do we need a first-class shared prompt library pattern?
2. **Reference file formats.** Markdown only, or also YAML/JSON with typed loaders?
3. **Action sandboxing.** Does the SDK ship default sandboxes per capability class, or push that entirely to the harness?
4. **Shared-step versioning.** When `gatherRepoFacts` changes its output schema, how do consuming skills pin?
5. **Model-agnosticism.** Does the SDK assume anything about the model, or strictly harness-agnostic?
6. **Skill vs. skill-bundle.** If related skills want to share fragments and actions, is that a monorepo convention or a first-class concept?
````
