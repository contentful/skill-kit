# API Reference

Full reference for `@contentful/skill-kit`. Start with the [README](../README.md) for an overview.

---

## Workflow Builder

```typescript
import { skill, z } from '@contentful/skill-kit';

skill({ name, entry, context?, stash?, observers?, capabilities?, finalOutput?, skillMd? })
  .step(name, config)                       // add a step
  .extend(name, sharedStep, overrides)      // inherit + override a shared step
  .register(module, { next })               // merge module steps, widen stash type
  .build()                                  // → SkillDefinition (frozen)
```

### `skill()` config

| Field          | Type                                           | Required | Description                                                       |
| -------------- | ---------------------------------------------- | -------- | ----------------------------------------------------------------- |
| `name`         | `string`                                       | yes      | Skill identifier                                                  |
| `entry`        | `string`                                       | yes      | Name of the first step                                            |
| `version`      | `string`                                       | no       | Defaults to `'0.0.0'`                                             |
| `description`  | `string`                                       | no       | Used in generated SKILL.md                                        |
| `context`      | `z.ZodType`                                    | no       | Zod schema for immutable skill-wide context                       |
| `stash`        | `z.ZodType`                                    | no       | Zod schema for mutable cross-step state                           |
| `finalOutput`  | `z.ZodType`                                    | no       | Schema for the terminal step's output                             |
| `capabilities` | `CapabilityManifest`                           | no       | Declares host tools, filesystem, subprocess, env var requirements |
| `observers`    | `ObserverMap`                                  | no       | Lifecycle hooks (see [Observers](#observers))                     |
| `skillMd`      | `string \| (skill: SkillDefinition) => string` | no       | Custom SKILL.md template override                                 |

Context and stash types flow into step callbacks automatically via contextual inference — no annotations needed.

### `.step(name, config)`

Adds a step. Returns the builder for chaining. See [Step Config](#step-config) for the full config shape.

### `.extend(name, base, overrides)`

Inherits a shared step definition and overrides specific fields. The base step's config is shallow-merged with overrides (overrides win).

```typescript
import { step, z } from '@contentful/skill-kit';

const openQuestion = step({
  output: z.object({ answer: z.string() }),
  next: '__parent__',
});

// In the builder:
.extend('ask-stack', openQuestion, {
  ask: askUser({ type: 'open', question: "What's your tech stack?" }),
  prompt: ({ stash }) => `Ask ${stash.name} about their tech stack.`,
  next: 'ask-hobby',
})
```

### `.register(module, { next })`

Merges all steps from a module into the skill. Module steps with `next: '__parent__'` are rewritten to point to `next`. Stash types widen automatically — see [Modules](#modules).

### `.build()`

Validates the skill definition (entry exists, steps non-empty) and returns a frozen `SkillDefinition`. Throws on invalid configuration.

---

## Step Config

The full shape of a step's config object, passed to `.step()` or `step()`:

```typescript
{
  prompt: string | (ctx: PromptContext) => string,
  output: z.ZodType,                                      // required
  next: 'step-name' | ((ctx) => 'step-name') | { terminal: true },  // required
  render?: (ctx: PromptContext) => string,
  action?: ActionDefinition,
  actionInput?: (ctx: { output; stash }) => unknown,
  stash?: (ctx: { output }) => Partial<TStash>,
  afterAction?: (ctx: { output; action }) => Partial<TStash>,
  maxVisits?: number,
  onMaxVisits?: string,
  ask?: AskUserConfig,
  confirm?: ConfirmConfig,
  plan?: PlanConfig,
  tasks?: TasksConfig,
  subtask?: SubtaskConfig,
}
```

### PromptContext

Available in dynamic `prompt` and `render` functions:

| Field      | Type                                                    | Description                                    |
| ---------- | ------------------------------------------------------- | ---------------------------------------------- |
| `prev`     | `unknown`                                               | Output of the previous step                    |
| `history`  | `readonly StepResult[]`                                 | All prior step results                         |
| `getStep`  | `<T, A>(name) => { output: T; action: A } \| undefined` | Typed accessor for a prior step's result       |
| `context`  | `TContext`                                              | Immutable skill context (typed from builder)   |
| `rendered` | `string \| undefined`                                   | Output of this step's `render()`, if present   |
| `refs`     | `ReferenceLoader`                                       | Loader for `references/` files                 |
| `attempts` | `number`                                                | How many times this step has been visited      |
| `host`     | `Handshake`                                             | Current host info and available tools          |
| `stash`    | `Readonly<TStash>`                                      | Accumulated stash (typed from builder, frozen) |

### Transitions

- **Static:** `next: 'step-name'` — always goes to the named step.
- **Dynamic:** `next: ({ output, action, attempts }) => 'step-name'` — choose based on output, action result, or visit count.
- **Terminal:** `next: { terminal: true }` — ends the skill. Output becomes `finalOutput`.
- **Self:** `next: 'self'` or returning the current step name — revisit the same step (requires `maxVisits`).

### Loop guards

Steps in detected cycles have an implicit visit limit (10) enforced at runtime. For explicit control, declare `maxVisits` and `onMaxVisits`:

```typescript
.step('ask-hobby', {
  // ...
  maxVisits: 3,
  onMaxVisits: 'confirm-profile',  // fallback when limit hit
  next: ({ output }) => output.wantsMore ? 'ask-hobby' : 'confirm-profile',
})
```

The cycle guard validator detects potential cycles and reports them as lint warnings. At runtime, exceeding the limit with `onMaxVisits` set redirects; without it, the engine throws.

### Stash merging

The `stash` callback receives the validated output and returns a partial stash object. The return value is shallow-merged into the accumulated stash:

```typescript
stash: ({ output }) => ({ target: output.target }),
```

All outputs and stash values are frozen with `Object.freeze()` to prevent mutation.

---

## Reference Builder

For skills that don't need a workflow — just progressive disclosure of content:

```typescript
import { reference } from '@contentful/skill-kit';

reference({ name, description, version? })
  .topic(name, { label, content: (ctx) => string })
  .build()                                           // → ReferenceDefinition (frozen)
```

### `reference()` config

| Field         | Type     | Required | Description                |
| ------------- | -------- | -------- | -------------------------- |
| `name`        | `string` | yes      | Reference skill identifier |
| `description` | `string` | yes      | Used in generated SKILL.md |
| `version`     | `string` | no       | Defaults to `'0.0.0'`      |

### `.topic(name, config)`

Registers a topic. `content` is a lazy function receiving `{ refs: ReferenceLoader }`:

```typescript
.topic('auth', {
  label: 'Authentication and token management',
  content: ({ refs }) => refs.load('auth.md'),
})
.topic('errors', {
  label: 'Error codes and troubleshooting',
  content: () => render.table(ERROR_CODES, { columns: ['code', 'meaning', 'fix'] }),
})
```

At least one topic is required. `build()` throws if name, description, or topics are missing.

---

## Modules

Composable step groups with their own stash scope:

```typescript
import { module, z } from '@contentful/skill-kit';

const authModule = module({
  name: 'auth',
  entry: 'auth-login',
  stash: z.object({ userId: z.string() }),
})
  .step('auth-login', {
    prompt: 'Ask for credentials.',
    output: z.object({ userId: z.string() }),
    stash: ({ output }) => ({ userId: output.userId }),
    next: '__parent__', // exits back to the registering skill
  })
  .build();
```

Register into a skill — stash types merge automatically:

```typescript
skill({ name: 'app', entry: 'start', stash: z.object({ appName: z.string() }) })
  .step('start', { /* ... */ next: 'auth-login' })
  .register(authModule, { next: 'dashboard' })
  .step('dashboard', {
    // stash is now { appName: string } & { userId: string }
    prompt: ({ stash }) => `Welcome ${stash.userId} to ${stash.appName}`,
    // ...
  })
  .build();
```

### `module()` config

| Field   | Type        | Required | Description                  |
| ------- | ----------- | -------- | ---------------------------- |
| `name`  | `string`    | yes      | Module identifier            |
| `entry` | `string`    | yes      | Entry step within the module |
| `stash` | `z.ZodType` | yes      | Local state schema           |

The `__parent__` sentinel in `next` is rewritten to the `{ next }` value passed to `.register()`. Module steps that don't use `__parent__` pass through unchanged.

---

## Primitives

Interactive building blocks that generate host-aware prose. Authors describe intent; the SDK translates to host-specific tool instructions.

### `askUser` — structured or open

```typescript
import { askUser } from '@contentful/skill-kit';

// Structured — fixed options, host uses best available tool
ask: askUser({
  type: 'structured',
  question: 'Which environment?',
  options: [
    { value: 'production', label: 'Production', description: 'Live traffic' },
    { value: 'staging', label: 'Staging' },
  ],
  multiSelect: false, // optional, defaults to false
});

// Open — free-text conversation, never a structured tool
ask: askUser({
  type: 'open',
  question: "What's your tech stack?",
});
```

### `confirm` — binary approval

```typescript
import { confirm } from '@contentful/skill-kit';

confirm: confirm({
  message: 'This will delete 47 files in .cache/. Continue?',
  destructive: true, // optional — adds warning in prose
  defaultAnswer: 'no', // optional — 'yes' or 'no'
});
```

Step output should include `{ approved: z.boolean() }`.

### `plan` — present and approve

```typescript
import { plan } from '@contentful/skill-kit';

plan: plan({
  summary: 'Migrate database schema',
  steps: ['Backup current schema', 'Run migration', 'Validate'],
});
```

### `tasks` — tracked task list

```typescript
import { tasks } from '@contentful/skill-kit';

tasks: tasks({
  create: [
    { title: 'Lint config', status: 'pending' },
    { title: 'Test suite', status: 'pending' },
  ],
});
```

### `subtask` — spawn isolated sub-agent

```typescript
import { subtask } from '@contentful/skill-kit';

subtask: subtask({
  prompt: 'Review the PR for security issues.',
  output: z.object({ findings: z.array(z.string()) }),
  contextBudget: 'narrow', // optional: 'narrow' | 'normal' | 'wide'
});
```

### Host-aware verb mapping

The SDK uses an abstract verb system. Step prose contains verbs; the preamble (sent once at session start) maps them to host-specific behavior:

| Verb             | Claude Code                      | Codex                   | OpenCode                | Generic                 |
| ---------------- | -------------------------------- | ----------------------- | ----------------------- | ----------------------- |
| `ASK_STRUCTURED` | `AskUserQuestion` tool           | Prose with option list  | Prose with option list  | Prose with option list  |
| `ASK_FREEFORM`   | Plain text conversation          | Plain text conversation | Plain text conversation | Plain text conversation |
| `PRESENT_PLAN`   | `EnterPlanMode` / `ExitPlanMode` | `update_plan`           | Numbered list           | Numbered list           |
| `CREATE_TASKS`   | `TaskCreate` / `TaskUpdate`      | `update_plan` checklist | `todowrite`             | Markdown checklist      |
| `SPAWN_SUBTASK`  | `Agent` tool                     | Focus locally           | `task` tool             | Focus locally           |

Same skill, every host. The preamble handles the translation.

---

## Standalone Steps

For shared, reusable steps defined outside a skill:

```typescript
import { step, z } from '@contentful/skill-kit';

const openQuestion = step({
  output: z.object({ answer: z.string() }),
  next: '__parent__',
});
```

Both `output` and `next` are required. Use via `.extend()` on the builder to get typed overrides that respect the parent skill's context/stash types.

---

## Fragments and Prompts

### `fragment()` — named prose snippet

```typescript
import { fragment } from '@contentful/skill-kit';

const playfulTone = fragment(
  'playful-tone',
  `Keep it light and fun. Use casual language.
   Throw in a joke if it fits.`,
);
```

Creates an immutable `{ name, content }` object. Content is trimmed on creation.

### `prompt` — tagged template literal

```typescript
import { prompt } from '@contentful/skill-kit';

const myPrompt = prompt`
  ${playfulTone}

  Now ask the user about their hobbies.
  Be specific — "sports" is boring, "underwater basket weaving" is a personality.
`;
```

The `prompt` tag:

1. Detects Fragment objects in interpolation slots (duck-typed: `{ name, content }`) and inserts their content
2. Converts non-Fragment values to strings
3. **Auto-dedents** the result: strips leading/trailing empty lines, then removes the minimum shared indentation from all lines

This means you can indent `prompt` blocks naturally in your code without the indentation leaking into the output.

---

## Actions

Side effects that run after a step's output is validated:

```typescript
import { action, z } from '@contentful/skill-kit';

const writeProfile = action({
  name: 'write-profile',
  input: z.object({ profile: ProfileSchema }),
  output: z.object({ path: z.string() }),
  run: async ({ input, signal }) => {
    const path = `/tmp/profile-${Date.now()}.json`;
    await writeFile(path, JSON.stringify(input.profile));
    return { path };
  },
});
```

Attach to a step via the `action` field:

```typescript
.step('save', {
  prompt: 'Generate the profile.',
  output: z.object({ profile: ProfileSchema }),
  action: writeProfile,
  next: { terminal: true },
})
```

**Decoupling action input from step output** — when the model's output doesn't match action input exactly:

```typescript
.step('save', {
  output: z.object({ reasoning: z.string(), profile: ProfileSchema }),
  action: writeProfile,
  actionInput: ({ output }) => ({ profile: output.profile }),
  afterAction: ({ action }) => ({ savedPath: action.path }),
  next: ({ action }) => action.path ? 'confirm' : 'retry',
})
```

- `actionInput` transforms step output into action input (runs before action)
- `afterAction` stashes action results (runs after action, before transition)
- `next` receives action output for conditional routing

### `action()` config

| Field    | Type                                                       | Required | Description                         |
| -------- | ---------------------------------------------------------- | -------- | ----------------------------------- |
| `name`   | `string`                                                   | yes      | Action identifier                   |
| `input`  | `z.ZodType`                                                | yes      | Schema for what the action receives |
| `output` | `z.ZodType`                                                | yes      | Schema for what the action returns  |
| `run`    | `(ctx: { input, signal: AbortSignal }) => Promise<output>` | yes      | Async function with typed I/O       |

The `run` function receives input parsed through the `input` schema and an `AbortSignal`. By default, the step's validated output is parsed as action input; use `actionInput` on the step config to customize. Action results are recorded in history alongside step outputs and available via `getStep()` or the `next` transition function.

---

## Render Helpers

Formatting utilities for generating markdown output in step prompts and render functions:

```typescript
import { render } from '@contentful/skill-kit';
```

### `render.table(rows, opts?)`

```typescript
render.table(
  [
    { name: 'ci', status: 'fail', detail: 'no config' },
    { name: 'lint', status: 'pass', detail: 'eslint configured' },
  ],
  { columns: ['name', 'status', 'detail'] },
);
```

Options: `columns?: string[]` (column order, defaults to first row's keys), `statusIcons?: Record<string, string>` (custom icons for status column values). Returns empty string for empty rows.

### `render.checklist(items)`

```typescript
render.checklist([
  { text: 'TypeScript', done: true },
  { text: 'Bun', done: true },
  { text: 'Deploy script', done: false },
]);
// - [x] TypeScript
// - [x] Bun
// - [ ] Deploy script
```

### `render.code(source, lang?)`

```typescript
render.code('const x = 42;', 'typescript');
```

Wraps in triple-backtick fence with optional language tag.

### `render.kv(pairs)`

```typescript
render.kv({ Name: 'Alice', Role: 'Developer', Stack: 'TypeScript + Bun' });
// Name   Alice
// Role   Developer
// Stack  TypeScript + Bun
```

Keys are padded to the longest key length. Returns empty string for empty input.

### `render.section(title, body)`

```typescript
render.section('Health Checks', render.table(checks));
// ## Health Checks
//
// | name | status | ...
```

### `render.diff(before, after)`

Line-by-line diff with `--- before` / `+++ after` headers. Unchanged lines prefixed with space, removed with `-`, added with `+`.

---

## Observers

Lifecycle hooks for telemetry, logging, or analytics:

```typescript
skill({
  // ...
  observers: {
    onStepStart: ({ step, context }) => {
      /* ... */
    },
    onStepComplete: ({ step, output, durationMs }) => {
      /* ... */
    },
    onStepValidationFailed: ({ step, raw, error, attempt }) => {
      /* ... */
    },
    onTransition: ({ from, to, reason }) => {
      /* ... */
    },
    onSkillComplete: ({ path, finalOutput, durationMs }) => {
      /* ... */
    },
  },
});
```

Observers are fire-and-forget — they don't affect workflow execution. All are optional.

---

## Testing

```typescript
import { runSkill, mockModel } from '@contentful/skill-kit/test';
```

### `runSkill(skill, opts)`

Drives a skill to completion with a model adapter:

```typescript
const result = await runSkill(mySkill, {
  context: { repoPath: '.' }, // optional — parsed against skill's context schema
  model: mockModel({
    /* ... */
  }),
  host: { host: 'claude-code' }, // optional — defaults to generic
});

result.path; // string[] — sequence of step names visited
result.outputs; // Record<string, unknown> — raw model responses by step
result.output; // unknown — final output
result.history; // readonly StepResult[] — validated outputs + action results
```

### `mockModel(map)`

Maps step names to canned responses:

```typescript
mockModel({
  diagnose: { checks: [{ name: 'ci', status: 'fail' }] }, // static value
  remediate: [
    // array — cycles through on repeated visits
    { action: 'add CI' },
    { action: 'fix lint' },
  ],
  report: (prompt) => ({ summary: prompt.includes('fail') ? 'issues found' : 'clean' }), // function
});
```

- **Static value:** returns the same response every visit.
- **Array:** cycles through entries on repeated visits. Throws if exhausted.
- **Function:** called with the step's prompt string. Can return conditional responses.

### `liveModel()`

Interactive testing adapter for manual evaluation. Not yet implemented in v0.1.

---

## CLI Commands

### `skill-kit build`

Compiles a skill into a distributable [agentskills.io](https://agentskills.io/specification)-compliant directory:

```bash
skill-kit build <entry.ts> -o <dir>
skill-kit build <entry.ts> -o <dir> --targets darwin-arm64,linux-x64,linux-arm64
skill-kit build <entry.ts> -o <dir> --single   # current platform only (fast dev builds)
```

| Flag        | Required | Description                                                     |
| ----------- | -------- | --------------------------------------------------------------- |
| `-o, --out` | yes      | Output directory                                                |
| `--targets` | no       | Comma-separated platforms. Defaults to `darwin-arm64,linux-x64` |
| `--single`  | no       | Build only for current platform                                 |

Output:

```
<dir>/
  SKILL.md               ← Generated agent-facing docs
  package.json           ← Name and version
  scripts/run            ← Shell wrapper (public interface)
  bin/<name>-<platform>  ← Compiled Bun executables
  references/            ← Copied from source
```

### `skill-kit run`

Dev mode — run a skill without compiling:

```bash
skill-kit run <entry.ts> start --context '{}' --host claude-code
skill-kit run <entry.ts> advance --step greet --output '{"name":"Alice"}' --history '[]' --host claude-code
```

### `skill-kit check`

Lint a skill for portability and correctness issues:

```bash
skill-kit check <entry.ts>
```

Rules:

| Rule                        | Severity | What it catches                                                                |
| --------------------------- | -------- | ------------------------------------------------------------------------------ |
| `cycle-guard`               | error    | Circular step transitions without `maxVisits` + `onMaxVisits`                  |
| `no-host-tool-names`        | error    | Direct host tool name references without `host.toolsAvailable` guard           |
| `primitive-schema-mismatch` | error    | `askUser` option values missing from output enum (or vice versa)               |
| `orphan-references`         | warning  | Files in `references/` not mentioned in any step prompt                        |
| `unknown-tool-names`        | warning  | `host.toolsAvailable.includes()` checks referencing unrecognized tools         |
| `host-branching-density`    | warning  | Multiple steps branching on `host.toolsAvailable` (suggests missing primitive) |

---

## Worked Example: deploy-check

A complete skill showing context, stash, `askUser`, branching, and terminal steps:

```typescript
import { skill, z, askUser } from '@contentful/skill-kit';

export default skill({
  name: 'deploy-check',
  entry: 'choose',
  context: z.object({ env: z.string().default('staging') }),
  stash: z.object({ target: z.string() }),
})
  .step('choose', {
    ask: askUser({
      type: 'structured',
      question: 'Which environment?',
      options: [
        { value: 'production', label: 'Production' },
        { value: 'staging', label: 'Staging' },
      ],
    }),
    output: z.object({ target: z.enum(['production', 'staging']) }),
    stash: ({ output }) => ({ target: output.target }),
    next: 'verify',
  })
  .step('verify', {
    prompt: ({ stash }) => `Run pre-deploy checks for ${stash.target}. Report any blockers.`,
    output: z.object({ blockers: z.array(z.string()), safe: z.boolean() }),
    next: ({ output }) => (output.safe ? 'deploy' : 'abort'),
  })
  .step('deploy', {
    prompt: 'Execute the deployment.',
    output: z.object({ url: z.string() }),
    next: { terminal: true },
  })
  .step('abort', {
    prompt: 'Report the blockers and explain why deployment was aborted.',
    output: z.object({ summary: z.string() }),
    next: { terminal: true },
  })
  .build();
```

**What's happening:**

1. **`choose`** — Uses `askUser` structured to present environment options. The agent sees the options via host-appropriate tooling (AskUserQuestion on Claude Code, prose list elsewhere). The selected value is stashed for later steps.

2. **`verify`** — Dynamic prompt reads `stash.target` to customize the instruction. Output schema enforces a `safe` boolean that drives the branch.

3. **`deploy` / `abort`** — Two terminal paths. The skill ends cleanly regardless of which path is taken.

**Testing it:**

```typescript
import { runSkill, mockModel } from '@contentful/skill-kit/test';
import deploy from './skill.ts';

const result = await runSkill(deploy, {
  model: mockModel({
    choose: { target: 'staging' },
    verify: { blockers: [], safe: true },
    deploy: { url: 'https://staging.example.com' },
  }),
});

// result.path → ['choose', 'verify', 'deploy']
// result.output → { url: 'https://staging.example.com' }
```

Context and stash types flow end-to-end — `stash.target` in the `verify` prompt is typed as `string`, and the `choose` step's stash callback is checked against the declared stash schema. No type annotations needed anywhere.
