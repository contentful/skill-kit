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

**The CLI is the engine.** It owns the workflow's state machine. It decides which step runs next based on the answer to the previous step. It validates the agent's output against a schema. It holds shared context across steps. It does progressive disclosure — the agent only sees the prose for the step it's currently on, never the whole skill.

**The prose is still prose.** Authors write each step's instructions in plain markdown. The SDK doesn't replace prose with code; it just controls when each piece of prose is shown and what shape the agent's answer has to take. Nodes contain freely-written instructions; transitions between nodes are typed and explicit.

**The agent does what agents are good at.** Reading, reasoning, writing, calling host tools, synthesizing. The agent doesn't need to understand the skill's overall structure — it just reads the current prompt, does the work, and returns an answer. The CLI handles everything else.

### Why this is better than pure prose

- **Reviewable.** Each step is small and has an explicit contract. Skills become diffable the way code is diffable.
- **Deterministic where it matters.** Formatting-heavy outputs (tables, reports) are rendered by code and pasted by the model verbatim, not negotiated per turn.
- **Branchable without drift.** The CLI decides next steps from typed outputs, not by hoping the model picks the right path out of a long prose flowchart.
- **Host-portable.** Different agent hosts expose different native tools. The SDK emits prose calibrated to whichever host invoked the CLI, so one skill works everywhere with the best UX the host can offer.
- **Improves over time.** Prompt-engineering work done in the SDK benefits every skill that uses SDK primitives. Authors don't rewrite prose to pick up improvements.

### What authors write

```typescript
// skill.ts
import { skill, z } from '@contentful/skill-kit';

export default skill({
  name: 'repo-doctor',
  entry: 'diagnose',
  context: z.object({ repoPath: z.string().default('.') }),
  stash: z.object({ failCount: z.number() }),
})
  .step('diagnose', {
    prompt: 'Inspect the repository and report failed health checks.',
    output: z.object({ checks: z.array(CheckResult) }),
    stash: ({ output }) => ({ failCount: output.checks.filter((c) => c.status === 'fail').length }),
    next: ({ output }) => (output.checks.some((c) => c.status === 'fail') ? 'remediate' : 'report'),
  })
  .step('remediate', {
    /* ... */
  })
  .step('report', {
    /* ... */
  })
  .build();
```

`skill()` returns a builder. `.step()` chains add steps — context and stash types flow into callbacks via contextual inference. `.build()` produces the final skill definition. `skill-kit build` then bundles it into a distributable skill directory — a bundled executable or JS file, a generated `SKILL.md` (per the [agentskills.io spec](https://agentskills.io/specification)), and a shell wrapper in `scripts/`.

### What authors don't write

- A state machine implementation — the SDK provides it.
- Host-specific tool invocations — the SDK's primitives emit the right prose per host.
- Parsing, validation, retry logic — handled at the boundary by schemas.
- Formatting templates repeated across prompts — renderers and fragments cover that.

### Where to read next

The sections below go in order: primitives (§1), prompts and fragments (§2), transitions (§3), rendering (§4), references (§5), modularization (§6), context and state including terminal-output for programmatic consumers (§7), side effects and observers (§8), capability manifest (§9), testing (§10), the CLI invocation protocol (§11), build and distribution (§12), repo layout for skill authors (§13), opinionated decisions (§14), cross-host behavior (§15), and what's out of scope for v0.1 (§16).

If you just want to see the whole shape at once, read §1 and §4, then skim §12–§15.

---

## Design goals

1. **Declarative feel.** A simple skill is ~30 lines. Authors describe a workflow, not write one.
2. **Prose stays prose.** The SDK structures _when_ prose is shown and _what contract_ it satisfies. It never replaces prose with code.
3. **Typed boundaries, untyped interiors.** Step I/O is schema-enforced. What the model does inside a step is freeform.
4. **Node-native, flexible distribution.** `npx tsx skill.ts` works in dev. `skill-kit build` bundles skills for distribution — either as lightweight Node.js bundles (`--mode node`, via esbuild) or standalone executables (`--mode bun`, via `bun build --compile`).
5. **Composable.** Steps, schemas, fragments, and renderers are importable across skills.
6. **One obvious way.** Opinionated where the cost of choice exceeds the benefit.

---

## 1. Core primitives

### `skill(config)` → `SkillBuilder`

Returns a builder. One per entry file. Context and stash Zod schemas declared here flow into all step callbacks.

```typescript
import { skill, z } from '@contentful/skill-kit';

export default skill({
  name: 'repo-doctor',
  version: '1.0.0',
  entry: 'diagnose',
  context: z.object({ repoPath: z.string().default('.') }),
  stash: z.object({ failCount: z.number() }),
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

Adds a step inline. The prompt and render callbacks receive typed `context` and `stash` from the builder — no manual annotations.

```typescript
.step("diagnose", {
  prompt: ({ context }) => `Check ${context.repoPath}`,  // repoPath: string ✓
  output: z.object({ /* ... */ }),
  stash: ({ output }) => ({ failCount: output.checks.length }),
  next: "report",
})
```

### `step(config)` — standalone function

For shared/reusable steps defined outside a skill. These default to untyped context/stash. Use `.extend()` on the builder to apply typed overrides.

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

Composable step groups with their own stash scope. Module steps can't access the parent skill's context (enforces portability).

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

A function of the workflow context, returning a string.

```typescript
step({
  prompt: ({ prev, context }) => `
    Failed checks for ${context.repoPath}:
    ${JSON.stringify(prev.failedChecks, null, 2)}

    Propose concrete remediation for each.
  `,
  output: RemediationsSchema,
  next: 'report',
});
```

Fields available in the prompt function:

| Field      | Description                                                |
| ---------- | ---------------------------------------------------------- |
| `prev`     | Typed output of the immediately preceding step             |
| `history`  | All prior step results, typed                              |
| `context`  | Global skill context (config defaults + runtime overrides) |
| `rendered` | Output of this step's `render()`, if defined               |
| `refs`     | Lazy loader for reference files (§5)                       |
| `attempts` | How many times this step has been visited (for retries)    |

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
  prompt: ({ prev }) => prompt`
    ${enterpriseTone}

    Analyze the dependency tree at ${prev.repoPath}.
    Flag packages with known CVEs.

    ${jsonOutputRules}
  `,
});
```

Fragments are named (first arg) so tooling can track usage, detect duplication, and lint for drift.

`prompt` is the only bit of sugar. It exists because plain template literals in indented TS produce ugly whitespace; everything else is standard functions.

---

## 3. Transitions

```typescript
// Static
step({ next: 'report' });

// Conditional (output-based)
step({
  next: ({ output }) => (output.checks.some((c) => c.status === 'fail') ? 'remediate' : 'report'),
});

// Conditional (action result-based)
step({
  action: apiAction,
  next: ({ action }) => (action.status === 200 ? 'success' : 'retry'),
});

// Terminal
step({ next: { terminal: true } });

// Bounded loop
step({
  next: ({ output, attempts }) => (output.confidence < 0.7 && attempts < 3 ? 'self' : 'report'),
  maxVisits: 3,
  onMaxVisits: 'report', // required fallback
});
```

Cycles detected by the graph analyzer apply an implicit visit limit (10) at runtime. Declaring `maxVisits` + `onMaxVisits` provides explicit control: `onMaxVisits` redirects when the limit is hit, while `maxVisits` without `onMaxVisits` throws (fail-closed). Linear workflows with function-based `next` don't need cycle guards — the conservative graph analysis handles safety automatically.

---

## 4. Rendering (deterministic output)

The pattern that sold the PRD: structured model output → code-rendered artifact → model pastes verbatim.

```typescript
import { step, render, prompt } from '@contentful/skill-kit';

step({
  prompt: ({ rendered }) => prompt`
    Output the following report to the user exactly as shown,
    with no preamble or trailing commentary:

    ${rendered}
  `,
  render: ({ history }) => {
    const diagnose = history.find((s) => s.step === 'diagnose')!.output;
    return render.table(diagnose.checks, {
      columns: ['name', 'status', 'detail'],
      statusIcons: { pass: '✅', fail: '❌', warn: '⚠️' },
    });
  },
  next: { terminal: true },
});
```

### Built-in renderers

A small, opinionated set. Authors can write their own any time.

- `render.table(rows, opts)` — markdown tables with consistent styling
- `render.checklist(items)` — `- [x]` / `- [ ]` lists
- `render.diff(before, after)` — unified diffs
- `render.code(source, lang)` — fenced blocks
- `render.kv(pairs)` — aligned key/value blocks
- `render.section(title, body)` — headers + body

Custom renderers are just `(args) => string`. No registration; anything returning a string works.

### Host-aware rendering

For cases where a host can render something richer than markdown (e.g., an interactive table on Claude Code vs. a plain markdown table elsewhere), the `render` function can inspect what the current host offers:

```typescript
step({
  render: ({ host, history }) => {
    if (host.toolsAvailable.includes('InteractiveTable')) {
      return render.interactiveTable(rows); // host-specific prose
    }
    return render.table(rows); // markdown fallback
  },
});
```

The runtime resolves host info from the handshake (see §13). Authors don't detect models — they check what the host advertises. Most skills will never need this — the built-in renderers cover the common cases and the SDK's primitives handle host-aware prose for workflow steps. This is an escape hatch for rendered output where native hooks exist.

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
  prompt: ({ refs, prev }) => prompt`
    Classify each finding's severity using this rubric:

    ${refs.load('severity-rubric.md')}

    Findings:
    ${JSON.stringify(prev.findings)}
  `,
});
```

`refs.load()` reads from `references/` relative to the skill file and inlines the content. Resolved at prompt-build time, not skill-load time — conditional steps don't pay for references they never use.

### Asset references

`refs.asset(path)` returns an absolute path for files the CLI or a render function needs on disk (schemas, templates, images).

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

// In a skill — .extend() applies typed context/stash to overrides:
skill({ context: ContextSchema, stash: StashSchema, ... })
  .extend("gather", gatherRepoFacts, {
    prompt: ({ context }) => `Inspect ${context.repoPath}`,  // typed ✓
    next: "analyze",
  })
```

### C. Modules (composable step groups)

For groups of steps that belong together and have their own stash scope. Modules can't access the parent skill's context — this enforces portability.

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
    stash: ({ output }) => ({ userId: output.userId }),
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

---

## 7. Context and state

### Global context

Declared on the skill, validated on invocation, typed everywhere.

```typescript
skill({
  context: z.object({
    repoPath: z.string().default('.'),
    strictness: z.enum(['lenient', 'normal', 'strict']).default('normal'),
  }),
  // ...
});
```

### Per-step scratchpad

Sometimes a step wants to stash something the model shouldn't see on the next turn, but that a later step or render function needs.

```typescript
step({
  output: SchemaA,
  stash: ({ output }) => ({ rawTimings: output.debugTimings }),
  next: 'next-step',
});

// later
step({
  render: ({ stash }) => render.timingsChart(stash.rawTimings),
});
```

Stash is typed per step and not exposed to prompts by default (must be explicitly pulled in). Keeps prompts lean.

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

A consumer calling our skill programmatically via `runSkill()` (see §10) gets the validated final output typed as `z.infer<typeof finalOutput>`. A consumer invoking the skill from within an Agent SDK session gets the same data serialized into the agent's transcript.

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
import { action } from '@contentful/skill-kit';

const writeReport = action({
  name: 'write-report',
  input: z.object({ path: z.string(), content: z.string() }),
  output: z.object({ bytesWritten: z.number() }),
  run: async ({ input, signal }) => {
    await Bun.write(input.path, input.content);
    return { bytesWritten: input.content.length };
  },
});

step({
  prompt: 'Decide where to write the report and what it should contain.',
  output: z.object({ path: z.string(), content: z.string() }),
  action: writeReport, // runs CLI-side after validation, before transition
  next: 'confirm',
});
```

**Decoupling action input from step output** — when the model's reasoning output doesn't match what the action needs, use `actionInput` to transform:

```typescript
step({
  output: z.object({ reasoning: z.string(), fileName: z.string(), body: z.string() }),
  action: writeReport,
  actionInput: ({ output, stash }) => ({ path: `${stash.outDir}/${output.fileName}`, content: output.body }),
  afterAction: ({ action }) => ({ lastBytesWritten: action.bytesWritten }),
  next: ({ action }) => (action.bytesWritten > 0 ? 'confirm' : 'retry'),
});
```

**Post-action stash** — `afterAction` runs after the action completes, allowing you to stash action results without type casts from history.

The lifecycle of a step with an action: prompt emitted → model responds → CLI validates output → `stash` callback → `actionInput` mapping (or output directly) → action runs → `afterAction` callback → history append → `next` transition (receives action output).

Actions accept an `AbortSignal` so long-running operations can be cancelled cleanly when the skill is interrupted.

**Why not let the model call tools instead?** Because when the effect is deterministic and workflow-mandated, running it CLI-side gives replayability, auditability, and no reliance on the model executing reliably. The model still has access to all of the host's tools for exploration during a step — that hasn't changed. Actions are for things the workflow says must happen, not things the model might choose to do.

Actions are declared in the capability manifest (§9) so the harness can approve or deny them at install time.

### Observers

Observers are read-only callbacks the SDK fires at specific lifecycle points. They're for cross-cutting concerns — logging, telemetry, audit trails, wiring skills into external observability. They receive a frozen snapshot of the relevant state and return nothing. They cannot change what the workflow does.

```typescript
skill({
  // ...
  observers: {
    onStepStart: ({ step, context }) => {
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

## 9. Capability manifest

Declared once, enforced everywhere.

```typescript
skill({
  capabilities: {
    fs: { read: ['./**'], write: ['./report.md', './.repo-doctor/**'] },
    net: ['api.github.com'],
    subprocess: ['git', 'npm'],
    env: ['GITHUB_TOKEN'],
  },
  // ...
});
```

The harness reads this at install time and grants or denies. At runtime the CLI enforces it — actions exceeding declared capabilities error before executing.

Enterprise review becomes tractable: one block, machine-readable, diff-able between versions.

---

## 10. Testing

```typescript
// skill.test.ts
import { test, runSkill, mockModel } from '@contentful/skill-kit/test';
import doctor from './skill';

test('routes to remediate when checks fail', async () => {
  const result = await runSkill(doctor, {
    context: { repoPath: './fixtures/broken-repo' },
    model: mockModel({
      diagnose: { checks: [{ name: 'ci', status: 'fail', detail: '...' }] },
      remediate: { remediations: [{ check: 'ci', action: 'add .github/workflows/ci.yml' }] },
    }),
  });
  expect(result.path).toEqual(['diagnose', 'remediate', 'report']);
  expect(result.output).toMatchSnapshot();
});
```

`mockModel` takes either a map of step → canned output or a function. For real-model eval, swap `mockModel` for `liveModel` and run against recorded fixtures.

---

## 11. Runtime / CLI invocation protocol

The compiled skill binary is invoked by agents via Bash — one call per step. Each call is stateless; the agent passes the full conversation history on every invocation. JSON output goes to stdout, diagnostics and errors to stderr.

### Subcommands

**`start`** (default) — Begin the workflow. Returns the first step's prompt and schema. The `start` subcommand is implicit — omitting it defaults to `start`, so agents see `run *` as the base permission pattern.

```bash
./scripts/run --context '{"repoPath":"."}' --host claude-code
```

```json
{ "step": "diagnose", "prompt": "Inspect the repository and report failed health checks.", "schema": {...} }
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
{ "step": "remediate", "prompt": "Fix these issues...", "schema": {...} }
```

**Terminal response:**

```json
{ "done": true, "finalOutput": {...} }
```

**Validation error:**

```json
{ "error": "validation", "step": "diagnose", "message": "Expected object, received string", "retry": true }
```

### Flags

| Flag        | Required     | Description                                                                                                               |
| ----------- | ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `--context` | On `start`   | JSON string. Validated against the skill's context schema.                                                                |
| `--step`    | On `advance` | Name of the step whose output is being submitted.                                                                         |
| `--output`  | On `advance` | JSON string. The agent's response for the step.                                                                           |
| `--history` | On `advance` | JSON array of `{"step": string, "output": unknown}` objects. Full conversation history.                                   |
| `--host`    | Optional     | Host identifier for host-aware prose generation. Defaults to `generic`. Known values: `claude-code`, `codex`, `opencode`. |
| `--help`    | —            | Print usage to stderr, exit 0.                                                                                            |

### Statelessness

Each invocation reconstructs the workflow engine from the skill definition + history. The binary replays history to rebuild state (stash, visit counts, etc.) without re-executing actions or observers. This is cheap — history is data, not re-execution.

This design means no persistent process, no stdin piping, and no reliance on the agent managing a subprocess lifecycle. The agent makes sequential Bash calls and parses JSON output — a pattern every agent host supports today.

### Script design conventions

The binary follows the [agentskills.io script design conventions](https://agentskills.io/specification):

- Non-interactive (no TTY prompts)
- `--help` for discoverability
- JSON to stdout, diagnostics to stderr
- `--long-name` flags only
- Non-zero exit on failure with descriptive error messages

---

## 12. Build and distribution

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
5. Generates `package.json` with name and version
6. Copies `references/` from the source directory

### Build modes

The `--mode` flag selects the bundling strategy:

| Mode              | Flag          | Output                                 | Size                 | Requires                |
| ----------------- | ------------- | -------------------------------------- | -------------------- | ----------------------- |
| **bun** (default) | `--mode bun`  | Platform-specific compiled executables | ~50-100MB per target | `bun` installed         |
| **node**          | `--mode node` | Single `.mjs` bundle                   | ~100-500KB           | Node.js ≥ 24 at runtime |

Node mode is the right choice for skills that live inside a Node.js codebase where Node is already available. Bun mode produces standalone executables that work without any runtime dependency.

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

### The compile/bundle step

The build generates a temporary entry point:

```typescript
import skill from './skill';
import { main } from '@contentful/skill-kit/cli';
main(skill);
```

**Bun mode:** `bun build --compile` bundles everything — the SDK, Zod, the skill code — into a single self-contained executable per target platform.

**Node mode:** esbuild bundles the same dependency tree into a single `.mjs` file. All dependencies (SDK, Zod) are inlined; only Node.js built-ins are external. The result is a portable ESM module that runs under `node`.

---

## 13. Repo layout for skill authors

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

## 14. What the SDK is opinionated about

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
- Custom renderers beyond the built-ins.

---

## 15. Cross-host capability model

### The architectural constraint (read this first)

The skill CLI is a compiled binary invoked by the agent via Bash. The agent reads the generated `SKILL.md`, which instructs it to call `scripts/run start` and then `scripts/run advance` in a loop. The CLI returns JSON to stdout — including a `prompt` field containing prose the agent reads and acts on.

The CLI cannot call tools. The CLI cannot invoke MCP methods. The CLI cannot cause the host to render UI. Only the model can do those things, and only in response to its own reasoning about what the text it just read is asking of it.

So when the SDK wants the model to use `AskUserQuestion` on Claude Code, all it can actually do is return prose that names the tool and describes how to use it. The model reads the prose, decides to call the tool, and on its next turn the CLI sees the answer in whatever form the model passes it back. The shape of the answer is still enforced by the step's Zod schema — that's unchanged. What changes from a naive prose skill is _which prose_ gets emitted and _how reliably_ it steers the model.

Everything in the rest of this section is downstream of that constraint. The primitives are prose generators with host-aware variants. The "capability system" is a lookup table that picks which variant to emit. There is no secret channel.

### Why primitives still matter

Given that everything is prose, a reasonable question is: why not just let authors write the prose themselves?

Three reasons, all load-bearing:

**1. Centralized tuning.** "Ask the user which option they want" is a request. "Use the AskUserQuestion tool with these exact options, one answer per invocation, do not paraphrase the options" is a specification. The second is the prose that actually produces reliable behavior on Claude Code. Figuring it out takes iteration against real models. When the SDK owns that prose, one tuning pass benefits every skill.

**2. Host portability without rewriting.** If an author hardcodes Claude Code's tool name in their skill, the skill breaks on Codex. If they abstract to a primitive, the SDK swaps the prose per host automatically. The author writes intent once; the SDK translates.

**3. SDK improvements propagate.** This is the biggest argument. If six months from now someone finds a better way to phrase structured-question prose for Codex — fewer tokens, more reliable parsing, cleaner failure modes — the SDK ships the improvement and every skill using `askUser` gets it for free. No skill prose refactoring. The SDK becomes the place where prompt engineering compounds, instead of being re-done inside every skill by every author.

That last point is the real pitch. Skills written against primitives inherit prompt-engineering work done in the SDK. Skills written as raw prose don't.

### Two mechanisms for steering the model

The SDK has two levers for calibrated prose:

**Preamble at session start.** When the CLI starts, it emits a one-time preamble that sets conventions for the session. Something like:

> _In this session you will be following a structured workflow. When a step's prose says "ask the user", you MUST use the AskUserQuestion tool, not free-text. When a step provides a `Rendered output` block, you MUST emit it verbatim with no preamble, no commentary, no added markdown. When a step says "spawn a subtask", use the Agent tool. Failure to follow these conventions will cause the workflow to error._

The preamble is generated per host — different tool names, different emphasis, same semantics. Later step prose can then be shorter and more intent-focused ("ask the user which deployment target") because the preamble has already established what "ask" means. This saves tokens and reduces drift across repeated instructions.

Preambles are best-effort — the model may forget them under context pressure. For critical primitives (anything with schema-enforced output), step-level prose should still name the tool explicitly. Preambles optimize the common case; per-step prose guards correctness.

**Per-step prose.** For any step using a primitive, the SDK generates prose calibrated for the current host. On Claude Code, an `askUser` step emits prose like:

> _Use the AskUserQuestion tool to ask the user: "Which deployment target?" Options (pass exactly these values): "production", "staging", "local". Do not modify option text. Do not add options. Expect exactly one answer._

On a host without a structured-question tool, the same primitive emits:

> _Ask the user: "Which deployment target?" Present these options and no others: production, staging, local. Accept only a single answer matching one of those exact strings. If the response is ambiguous or doesn't match, ask again with the same options._

The skill author wrote the same three lines in both cases. The SDK handled the rest.

### What the major hosts expose (the prose has to name these)

**Claude Code.** `AskUserQuestion` for structured multiple-choice. `EnterPlanMode`/`ExitPlanMode` for plan-then-approve flows. `TaskCreate`/`TaskUpdate`/`TaskList`/`TaskGet` for tracked subtasks. `TodoWrite` for session checklists. `Agent` for spawning subagents with isolated context. `Skill` for invoking skills. Standard file/shell/search tools (`Read`, `Edit`, `Write`, `Bash`, `Glob`, `Grep`) plus `WebFetch`/`WebSearch`.

**Codex CLI.** `shell`-first philosophy with `apply_patch` invoked through it. `update_plan` for TODOs. `web_search`, `view_image`, `request_permissions`, `exec_command`/`write_stdin`. No dedicated structured-question tool — for subprocess-invoked skills, structured questions fall back to prose.

**OpenCode.** `bash`, `read`, `write`, `edit`, `apply_patch`, `multiedit`, `glob`, `grep`, `list`, `webfetch`, `task` (subagent), `todowrite`/`todoread`, `skill`, optional `lsp`. Permissions via `allow`/`ask`/`deny` per tool.

Patterns:

- Structured user questions: Claude Code has a first-class tool, the others need MCP elicitation or prose fallback. Most divergent primitive.
- Planning/TODOs: All three have something, but the semantics differ. Task tracking is convergent; plan-mode-before-execute is Claude-specific.
- File/shell/search: Essentially interchangeable from a prose perspective.

### The abstraction principle (unchanged)

Workflow primitives (things that gate state transitions or define deliverable shape) get SDK primitives with host-aware prose. Work primitives (things the model does inside a step to accomplish the job) stay in author-written prose and rely on the host's native tools.

### Concrete SDK primitives

Each primitive is an author-facing TypeScript building block. Authors reason about primitives — "I need an `askUser` step here" — not about host tools. The host-specific prose is a backend implementation detail of the primitive, and the SDK maintains it.

This matters because tool-name-awareness is a leaky abstraction. An author who thinks "I'm wrapping `AskUserQuestion`" will reach for the raw tool name the moment they want something slightly different, and the skill stops being portable. Framing primitives as building blocks keeps the right abstraction boundary: authors describe intent, the SDK produces prose.

Each primitive below has a prose-generation table indicating what the SDK emits per host. Treat the prose as indicative — tuning it over time is the SDK's responsibility, not the author's.

#### `askUser` — structured or open question

A single primitive with two modes, discriminated by `type`:

```typescript
// Structured — presents fixed options via host-specific tool
.step("choose-target", {
  ask: askUser({
    type: "structured",
    question: "Which deployment target?",
    options: [
      { value: "production", label: "Production", description: "Live, customer-facing" },
      { value: "staging", label: "Staging", description: "Pre-production mirror" },
    ],
  }),
  output: z.object({ target: z.enum(["production", "staging"]) }),
  next: ({ output }) => `deploy-${output.target}`,
})

// Open — free-text conversation, never a structured tool
.step("ask-stack", {
  ask: askUser({ type: "open", question: "What's your go-to tech stack?" }),
  prompt: "Ask about their stack — get specific, not generic.",
  output: z.object({ answer: z.string() }),
  next: "done",
})
```

The SDK uses an abstract verb system. Step prose contains `ASK_STRUCTURED` or `ASK_FREEFORM` verbs. The preamble (sent once at session start) maps these verbs to host-specific behavior:

| Verb             | Claude Code                               | Codex / OpenCode / Generic                 |
| ---------------- | ----------------------------------------- | ------------------------------------------ |
| `ASK_STRUCTURED` | `AskUserQuestion` tool with exact options | Prose with option list, re-ask on mismatch |
| `ASK_FREEFORM`   | Plain text conversation, no tool          | Plain text conversation, no tool           |

The `output` schema is the contract regardless of host or mode. Downstream steps don't know how the answer was obtained.

#### `confirm` — binary approval with context

```typescript
step({
  confirm: {
    message: 'This will delete 47 files in .cache/. Continue?',
    destructive: true,
    defaultAnswer: 'no',
  },
  output: z.object({ approved: z.boolean() }),
  next: ({ output }) => (output.approved ? 'proceed' : 'abort'),
});
```

| Host         | Prose the SDK emits (summarized)                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code  | "Use the AskUserQuestion tool to confirm: '<msg>'. Options: 'Yes, proceed' / 'No, cancel'. Default to no on any ambiguity."             |
| Codex        | "Confirm with the user: '<msg>'. Accept only a clear yes or clear no. Default to no on any ambiguity. This is a destructive operation." |
| OpenCode     | Same as Codex                                                                                                                           |
| Unknown host | Same as Codex                                                                                                                           |

Distinct from `askUser` because destructive-op confirmation needs stronger defaults and warning framing.

#### `plan` — show plan, wait for approval

```typescript
step({
  plan: {
    summary: 'Migrate auth from session cookies to JWTs',
    steps: [
      'Add JWT signing and verification helpers',
      'Update login flow to issue JWTs',
      'Add compatibility layer for existing sessions',
      'Update middleware to accept both',
      'Migration script for active sessions',
    ],
  },
  output: z.object({ approved: z.boolean(), modifications: z.string().optional() }),
  next: ({ output }) => (output.approved ? 'execute' : 'revise'),
});
```

| Host         | Prose the SDK emits (summarized)                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| Claude Code  | "Use the EnterPlanMode tool with this plan: <plan>. Wait for the user to approve via ExitPlanMode before proceeding." |
| Codex        | "Present this plan to the user using update_plan: <plan>. Then ask explicitly whether to proceed or revise."          |
| OpenCode     | "Present this plan as a checklist using todowrite: <plan>. Then ask explicitly whether to proceed or revise."         |
| Unknown host | "Present this plan to the user as a numbered list: <plan>. Ask whether to proceed or revise before continuing."       |

This is where UX degrades most visibly — Claude Code gets a first-class plan-mode UI, others get markdown. Same skill, coherent behavior across all.

#### `tasks` — tracked subtask list

```typescript
step({
  tasks: {
    create: prev.remediations.map((r) => ({ title: r.action, status: 'pending' })),
  },
  next: 'execute-tasks',
});
```

| Host         | Prose the SDK emits (summarized)                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------ |
| Claude Code  | "Use TaskCreate to register these tasks: <list>. Use TaskUpdate as each completes."              |
| Codex        | "Use update_plan with these checklist items: <list>. Update status as each completes."           |
| OpenCode     | "Use todowrite to register these todos: <list>. Update status as each completes."                |
| Unknown host | "Maintain this checklist in the visible output, updating status as each item completes: <list>." |

#### `deliverable` — terminal rendered output

Already covered by `render` + verbatim-paste in §4. Sits in the capability system because future hosts may expose richer structured output (interactive tables, collapsible sections) that `render` can dispatch to via host introspection. For now, the SDK emits "output the following verbatim" prose with host-specific emphasis on what verbatim means for that model.

#### `subtask` — spawn an isolated sub-agent

```typescript
step({
  subtask: {
    prompt: 'Research the top 5 CVEs affecting our dependency tree. Return a structured summary.',
    output: ResearchSummary,
    contextBudget: 'narrow',
  },
  next: 'incorporate-findings',
});
```

| Host         | Prose the SDK emits (summarized)                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Claude Code  | "Use the Agent tool to spawn a subagent with this prompt: <prompt>. Return its final output."        |
| Codex        | "Spawn a subagent for this task: <prompt>. Return its final output."                                 |
| OpenCode     | "Use the task tool to spawn a subagent for: <prompt>. Return its final output."                      |
| Unknown host | "Focus on this subtask and return a structured summary: <prompt>. Then return to the main workflow." |

On hosts without real agent isolation, the prose fallback still produces correct output but doesn't get the context-window benefit.

### What we do _not_ abstract

- **File I/O.** The model picks `Read`/`read`/`cat` correctly from prose like "open `src/foo.ts`".
- **Shell / subprocess.** `Bash` vs `shell` — the model dispatches correctly.
- **Web search and fetch.** Native everywhere.
- **Plain code editing.** `apply_patch`, `Edit`, `multiedit` — all handled correctly from prose describing the edit.

Rule of thumb: if the model already picks the right tool given plain intent, don't add an abstraction.

### Host resolution

The `--host` CLI flag identifies which agent host is invoking the skill. The SDK maintains a registry mapping host names to their known tool lists:

```typescript
const HOST_REGISTRY: Record<string, string[]> = {
  'claude-code': ['AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode', 'TaskCreate', 'TaskUpdate', 'Agent'],
  codex: ['shell', 'apply_patch', 'update_plan', 'web_search'],
  opencode: ['bash', 'read', 'write', 'edit', 'todowrite', 'task'],
};
```

When `--host claude-code` is passed, the SDK resolves the host name to its tool list and selects the appropriate prose variant per primitive. Unknown host names get the generic fallback (no tool-specific prose).

The lookup is mechanical:

```typescript
function resolveAskProse(host: Handshake): (p: AskPayload) => string {
  if (host.toolsAvailable.includes('AskUserQuestion')) {
    return renderAskForClaudeCode;
  }
  return renderAskGenericProse;
}
```

No hidden magic. Tool name present → prose names it. Absent → generic prose.

The generated `SKILL.md` instructs the agent to pass the correct `--host` flag. For Claude Code this is straightforward; for other hosts the SKILL.md includes detection guidance.

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
  prompt: ({ host, prev }) => {
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
  ask: askUser({
    question: 'Which deployment target?',
    options: [
      { value: 'production', label: 'Production' },
      { value: 'staging', label: 'Staging' },
      { value: 'local', label: 'Local' },
    ],
  }),
  output: z.object({ target: z.enum(['production', 'staging', 'local']) }),
  next: ({ output }) => `deploy-${output.target}`,
});
```

On Claude Code (`--host claude-code`), the CLI's JSON output includes a `prompt` field like:

> _Use the AskUserQuestion tool to ask the user: "Which deployment target?" Provide these options, unchanged, as the tool's option list: "Production" (value: production), "Staging" (value: staging), "Local" (value: local). Expect exactly one answer. Return the answer verbatim in the value field._

The agent reads this prompt, calls `AskUserQuestion`, the host renders native UI, the user picks one, the answer comes back. The agent then calls `scripts/run advance --step deploy-target --output '{"target":"production"}' --history '[...]'`. The CLI validates against the Zod schema and routes to the next step.

On Codex (`--host codex`), the same skill's prompt field contains:

> _Ask the user: "Which deployment target?" Present these three options and no others: Production, Staging, Local. Accept only a single answer matching one of those exact labels. If the user's response is ambiguous or doesn't match, ask again with the same options. Return the answer to me as { "target": "production" | "staging" | "local" }._

Same skill. Same contract. Degraded but coherent UX. And — critically — if the SDK ships a better version of either prose variant next month, this skill benefits without changes.

### A note on MCP elicitation

MCP's `elicitation/create` is a protocol-level mechanism for structured user input with schema validation and native UI on the client side — meaningfully better than prose-steering. It's not available to us, because it requires the skill to run as a long-lived MCP server the host connects to, which breaks the skill lifecycle, installation model, and trust model we've built around. Subprocess invocation is the shape that fits how skills are distributed and run.

Worth knowing the alternative exists; not worth designing around it.

### Summary

The CLI can only emit prose. The SDK's value is that it emits _calibrated_ prose per host — naming the right tool on each host, falling back to generic prose where no native tool exists, and sharpening that prose over time without requiring authors to rewrite skills. Primitives are worth having because they're where prompt-engineering effort concentrates and where improvements compound across the ecosystem.

---

## 16. Deliberately not in v0.1

- **Persistent stdio protocol.** The original spec described a stdin/stdout JSON protocol with a long-running skill process. No agent host today natively supports managing a skill as a persistent subprocess. Single-invocation mode (§11) works with every host via plain Bash calls. Stdio can be added later if a harness ever supports it — the engine interface (`start()`/`advance()`) accommodates both equally.
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
