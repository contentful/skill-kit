# API Reference

Full reference for `@contentful/skill-kit`. Start with the [README](../README.md) for an overview.

---

## Workflow Builder

```typescript
import { skill, z } from '@contentful/skill-kit';

skill({ name, entry, context?, stash?, observers?, finalOutput?, skillMd? })
  .step(name, config)                       // add a step
  .extend(name, sharedStep, overrides)      // inherit + override a shared step
  .register(module, { next })               // merge module steps, widen stash type
  .build()                                  // → SkillDefinition (frozen)
```

### `skill()` config

| Field            | Type                                           | Required | Description                                                                             |
| ---------------- | ---------------------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| `name`           | `string`                                       | yes      | Skill identifier                                                                        |
| `entry`          | `string`                                       | yes      | Name of the first step                                                                  |
| `version`        | `string`                                       | no       | Defaults to `'0.0.0'`. Mutually exclusive with `resolveVersion`                         |
| `resolveVersion` | `true`                                         | no       | Resolve version from nearest ancestor `package.json`. Mutually exclusive with `version` |
| `description`    | `string`                                       | no       | Used in generated SKILL.md                                                              |
| `triggers`       | `string[]`                                     | no       | Keywords appended to description for agent discoverability                              |
| `context`        | `z.ZodType`                                    | no       | Zod schema for immutable skill-wide context                                             |
| `stash`          | `z.ZodType`                                    | no       | Zod schema for mutable cross-step state                                                 |
| `finalOutput`    | `z.ZodType`                                    | no       | Schema for the terminal step's output                                                   |
| `observers`      | `ObserverMap`                                  | no       | Lifecycle hooks (see [Observers](#observers))                                           |
| `skillMd`        | `string \| (skill: SkillDefinition) => string` | no       | Custom SKILL.md template override                                                       |
| `package`        | `PackageConfig`                                | no       | Fields written to the output `package.json` (see [Package Config](#package-config))     |

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
  prompt: ({ stash, act }) => [
    act.askUser({ type: 'open', question: "What's your tech stack?" }),
    `Ask ${stash.name} about their tech stack.`,
  ],
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
  prompt: string | PromptFn,                               // string, or function returning PromptReturn
  output: z.ZodType,                                      // required
  next: 'step-name' | ((ctx) => 'step-name') | { terminal: true },  // required
  render?: (ctx: PromptContext) => string,
  action?: ActionDefinition,
  actionInput?: (ctx: { output; stash }) => unknown,
  stash?: (ctx: { output }) => Partial<TStash>,
  afterAction?: (ctx: { output; action }) => Partial<TStash>,
  maxVisits?: number,
  onMaxVisits?: string,
  primitive?: PrimitiveConfig,                             // shorthand for single-primitive steps
}
```

`PromptFn` is `(ctx: PromptContext) => PromptReturn`, where `PromptReturn = string | PromptPiece | PromptPiece[]`.

A `PromptPiece` is one of:

- A plain `string` — instructions
- A `system` segment — persona/frame, created via the `system` template tag or `system(text)` function from PromptContext
- An `act` segment — primitive directive, created via `act.askUser()`, `act.confirm()`, `act.plan()`, `act.checklist()`, `act.subagent()` from PromptContext

When a prompt function returns an array, pieces are assembled in **author order**.

The `primitive` field provides a shorthand for steps that consist entirely of one primitive with no additional prose. When set, no `prompt` is needed — the SDK generates the full prompt from the primitive config. This replaces the old `ask`, `confirm`, `plan`, `checklist`, and `subagent` step-level fields.

### PromptContext

Available in dynamic `prompt` and `render` functions:

| Field      | Type                                                    | Description                                                      |
| ---------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| `prev`     | `unknown`                                               | Output of the previous step                                      |
| `history`  | `readonly StepResult[]`                                 | All prior step results                                           |
| `getStep`  | `<T, A>(name) => { output: T; action: A } \| undefined` | Typed accessor for a prior step's result                         |
| `context`  | `TContext`                                              | Immutable skill context (typed from builder)                     |
| `rendered` | `string \| undefined`                                   | Output of this step's `render()`, if present                     |
| `refs`     | `ReferenceLoader`                                       | Loader for `references/` files                                   |
| `attempts` | `number`                                                | How many times this step has been visited                        |
| `host`     | `Handshake`                                             | Current host info and available tools                            |
| `stash`    | `Readonly<TStash>`                                      | Accumulated stash (typed from builder, frozen)                   |
| `act`      | `ActContext`                                            | Primitive directive builders: `askUser`, `confirm`, `plan`, etc. |
| `system`   | `SystemTag`                                             | System segment tag/function for persona/frame                    |

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

reference({ name, description, version?, resolveVersion?, package? })
  .topic(name, { label, content: (ctx) => string })
  .build()                                           // → ReferenceDefinition (frozen)
```

### `reference()` config

| Field            | Type            | Required | Description                                                                             |
| ---------------- | --------------- | -------- | --------------------------------------------------------------------------------------- |
| `name`           | `string`        | yes      | Reference skill identifier                                                              |
| `description`    | `string`        | yes      | Used in generated SKILL.md                                                              |
| `version`        | `string`        | no       | Defaults to `'0.0.0'`. Mutually exclusive with `resolveVersion`                         |
| `resolveVersion` | `true`          | no       | Resolve version from nearest ancestor `package.json`. Mutually exclusive with `version` |
| `package`        | `PackageConfig` | no       | Fields written to the output `package.json` (see [Package Config](#package-config))     |

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

## Package Config

Both `skill()` and `reference()` accept an optional `package` field that controls the generated `package.json`:

```typescript
export default skill({
  name: 'my-skill',
  resolveVersion: true,
  entry: 'start',
  package: {
    name: '@org/skill-my-skill',
    license: 'MIT',
    files: ['SKILL.md', 'scripts/**', 'bin/**'],
  },
});
```

### `PackageConfig` fields

| Field         | Type       | Description                                         |
| ------------- | ---------- | --------------------------------------------------- |
| `name`        | `string`   | Override package name (default: skill name)         |
| `description` | `string`   | Written to `package.json`                           |
| `license`     | `string`   | Written to `package.json`                           |
| `files`       | `string[]` | Written to `package.json`                           |
| `[key]`       | `unknown`  | Any other field is passed through to `package.json` |

### Version strategy

Version is set via one of two mutually exclusive fields (enforced at the type level):

- **`version`** — Explicit version string (e.g., `version: '1.0.0'`). Defaults to `'0.0.0'` if omitted.
- **`resolveVersion: true`** — The build walks up from the entry file's directory to find the nearest ancestor `package.json` with a `version` field and uses that. Useful when a version manager like `release-it` bumps the root `package.json`.

### Merge behavior

If a `package.json` already exists in the output directory, the build merges rather than overwrites: existing fields are preserved, `package` config fields override, and `name`/`version` are always authoritative.

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

## Composite Skills

Combine related skills into a single artifact with shared references. A composite is a regular `skill()` with sub-skills and topics registered on it.

### `.subskill(name, definition, opts?)`

Register a standalone `SkillDefinition` as a sub-skill:

```typescript
import doctorSkill from './subskills/doctor.js';

skill({ name: 'helper', entry: 'classify', ... })
  .step('classify', {
    output: z.object({ intent: z.string() }),
    next: ({ output }) => `subskill:${output.intent}`,
  })
  .subskill('doctor', doctorSkill, {
    context: (_output, stash) => ({ spaceId: stash.spaceId }),
  })
  .build();
```

| Option    | Type                             | Required | Description                                |
| --------- | -------------------------------- | -------- | ------------------------------------------ |
| `context` | `(stepOutput, stash) => unknown` | no       | Maps dispatcher state to sub-skill context |

### `.topic(name, config)`

Register a reference topic (same as on `reference()`):

```typescript
.topic('rate-limits', {
  label: 'API rate limits',
  content: ({ refs }) => refs.load('rate-limits.md'),
})
```

| Field     | Type                                         | Required | Description       |
| --------- | -------------------------------------------- | -------- | ----------------- |
| `label`   | `string`                                     | yes      | Short description |
| `content` | `(ctx: { refs: ReferenceLoader }) => string` | yes      | Content generator |

### Routing from `next`

Any step's `next` can return prefixed targets:

- `'subskill:<name>'` — redirect to a registered sub-skill
- `'topic:<name>'` — resolve a topic and return as `DoneResult`
- Regular step names route within the dispatcher

### `RedirectResult`

When the engine's `next` resolves to a target not in the local step map, it returns:

```typescript
interface RedirectResult {
  redirect: string; // e.g. 'subskill:doctor'
  completed: StepResult; // the step that triggered the redirect
  stash: unknown; // dispatcher's accumulated stash
}
```

The composite entry point handles this — the host never sees `RedirectResult` directly.

### CLI protocol for composites

Session mode (recommended):

```bash
scripts/run --context '{...}' --session new           # dispatcher start → SessionPointer
scripts/run advance --session <id>                     # advance (agent wrote output to file)
scripts/run doctor --context '{...}' --session new     # direct sub-skill start
```

Stateless mode (fallback):

```bash
scripts/run --context '{...}'                          # dispatcher start
scripts/run advance --step doctor/diagnose --output .. # sub-skill advance
scripts/run doctor --context '{...}'                   # direct sub-skill start
scripts/run topics                                     # list topics
scripts/run topic rate-limits                          # load a topic
```

Sub-skill step names are prefixed `<subskill>/<step>` at the protocol layer.

### `SessionPointer`

Returned by `--session new` on start:

```typescript
interface SessionPointer {
  sessionId: string; // 8-char hex ID
  file: string; // path to the JSONL session file
  line: number; // line number to read for the first prompt
}
```

See [Architecture — Session mode](./architecture.md#session-mode-recommended) for the full session lifecycle.

### Testing composites

```typescript
import { runComposite, mockModel } from '@contentful/skill-kit/test';

const result = await runComposite(skill, {
  context: { query: 'help' },
  refs, // optional ReferenceLoader for topic content
  model: mockModel({
    choose: { choice: 'doctor' },
    'get-space': { spaceId: 'abc' },
    'doctor/diagnose': { issues: [], healthy: true },
    'doctor/report-clean': { summary: 'All good!' },
  }),
});

assert.equal(result.redirectedTo?.name, 'doctor');
```

| Option           | Type              | Required | Description                                           |
| ---------------- | ----------------- | -------- | ----------------------------------------------------- |
| `model`          | `ModelAdapter`    | yes      | Provides responses for dispatcher and sub-skill steps |
| `context`        | `object`          | no       | Dispatcher context                                    |
| `refs`           | `ReferenceLoader` | no       | For topic content resolution (defaults to no-op)      |
| `host`           | `Handshake`       | no       | Host identity. Defaults to generic                    |
| `directSubskill` | `string`          | no       | Skip dispatcher, start a sub-skill directly           |

The return value adds `redirectedTo?: { kind: 'subskill' | 'topic', name: string }` alongside the standard `path`, `outputs`, `output`, and `history` fields.

---

## Primitives

Interactive building blocks that generate host-aware prose. Authors describe intent; the SDK translates to host-specific tool instructions. Primitives can be used two ways:

1. **Step-level `primitive` field** — shorthand for steps that consist entirely of one primitive with no additional prose.
2. **`act` methods in prompt functions** — composable directives mixed with other prompt pieces.

### `askUser` — structured or open

```typescript
import { askUser } from '@contentful/skill-kit';

// Step-level shorthand — simple single-primitive step
.step('choose-env', {
  primitive: askUser({
    type: 'structured',
    question: 'Which environment?',
    options: [
      { value: 'production', label: 'Production', description: 'Live traffic' },
      { value: 'staging', label: 'Staging' },
    ],
    multiSelect: false, // optional, defaults to false
  }),
  output: z.object({ env: z.enum(['production', 'staging']) }),
  next: 'deploy',
})

// Composed with other prompt pieces via act
.step('ask-stack', {
  prompt: ({ act }) => [
    act.askUser({ type: 'open', question: "What's your tech stack?" }),
    `Get specific — frameworks, build tools, deployment targets.`,
  ],
  output: z.object({ answer: z.string() }),
  next: 'done',
})
```

### `confirm` — binary approval

```typescript
import { confirm } from '@contentful/skill-kit';

// Step-level shorthand
primitive: confirm({
  message: 'This will delete 47 files in .cache/. Continue?',
  destructive: true, // optional — adds warning in prose
  defaultAnswer: 'no', // optional — 'yes' or 'no'
});

// Or via act in a prompt function
prompt: ({ act }) => [
  act.confirm({ message: 'Delete .cache/?', destructive: true }),
  `Explain what will happen before confirming.`,
],
```

Step output should include `{ approved: z.boolean() }`.

### `plan` — present and approve

```typescript
import { plan } from '@contentful/skill-kit';

// Step-level shorthand
primitive: plan({
  summary: 'Migrate database schema',
  steps: ['Backup current schema', 'Run migration', 'Validate'],
});

// Or via act in a prompt function
prompt: ({ act }) => act.plan({ summary: '...', steps: [...] }),
```

### `checklist` — tracked task list

```typescript
import { checklist } from '@contentful/skill-kit';

// Step-level shorthand
primitive: checklist({
  create: [
    { title: 'Lint config', status: 'pending' },
    { title: 'Test suite', status: 'pending' },
  ],
});

// Or via act in a prompt function
prompt: ({ stash, act }) => [
  act.checklist({ create: stash.tasks.map(t => ({ title: t, status: 'pending' })) }),
  `Work through each task. Update the checklist as you go.`,
],
```

### `subagent` — spawn isolated sub-agent

```typescript
import { subagent } from '@contentful/skill-kit';

// Step-level shorthand
primitive: subagent({
  prompt: 'Review the PR for security issues.',
  output: z.object({ findings: z.array(z.string()) }),
});

// Or via act in a prompt function
prompt: ({ act }) => act.subagent({ prompt: 'Review the PR.', output: FindingsSchema }),
```

### Composable prompt vocabulary

Prompt functions can return `string | PromptPiece | PromptPiece[]`. When returning an array, pieces are assembled in author order:

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

- **`system`** (from PromptContext) — creates a system segment for persona/frame. Template tag or function call.
- **`act`** (from PromptContext) — provides `.askUser()`, `.confirm()`, `.plan()`, `.checklist()`, `.subagent()` methods that return act segments.
- **plain strings** — instructions, including the existing `prompt` template tag.

### Host-aware verb mapping

The SDK uses an abstract verb system. Primitive directives contain verbs; the preamble (sent once at session start) maps them to host-specific behavior:

| Verb               | Claude Code                      | Codex                   | OpenCode                | Generic                 |
| ------------------ | -------------------------------- | ----------------------- | ----------------------- | ----------------------- |
| `ASK_STRUCTURED`   | `AskUserQuestion` tool           | Prose with option list  | Prose with option list  | Prose with option list  |
| `ASK_FREEFORM`     | Plain text conversation          | Plain text conversation | Plain text conversation | Plain text conversation |
| `PRESENT_PLAN`     | `EnterPlanMode` / `ExitPlanMode` | `update_plan`           | Numbered list           | Numbered list           |
| `CREATE_CHECKLIST` | `TaskCreate` / `TaskUpdate`      | `update_plan` checklist | `todowrite`             | Markdown checklist      |
| `SPAWN_SUBAGENT`   | `Agent` tool                     | Focus locally           | `task` tool             | Focus locally           |

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
      console.error(`→ entering "${step}"`);
    },
    onStepComplete: ({ step, output, durationMs }) => {
      console.error(`✓ "${step}" completed in ${durationMs}ms`);
    },
    onStepValidationFailed: ({ step, raw, error, attempt }) => {
      console.error(`✗ "${step}" attempt ${attempt}: ${error}\n  raw: ${JSON.stringify(raw)}`);
    },
    onTransition: ({ from, to, reason }) => {
      console.error(`  ${from} → ${to} (${reason})`);
    },
    onSkillComplete: ({ path, finalOutput, durationMs }) => {
      console.error(`done in ${durationMs}ms, path: ${path.join(' → ')}`);
    },
  },
});
```

Observers are fire-and-forget — they don't affect workflow execution. All are optional. They write to `stderr` by convention so they don't interfere with the JSON protocol on `stdout`.

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

---

## CLI Commands

### `skill-kit build`

Compiles a skill into a distributable [agentskills.io](https://agentskills.io/specification)-compliant directory:

```bash
skill-kit build <entry.ts> -o <dir>                        # default (bun mode, session protocol)
skill-kit build <entry.ts> -o <dir> --mode node             # Node.js bundle
skill-kit build <entry.ts> -o <dir> --protocol stateless    # stateless invocation instructions
skill-kit build <entry.ts> -o <dir> --targets darwin-arm64,linux-x64,linux-arm64
skill-kit build <entry.ts> -o <dir> --single                # current platform only (fast dev builds)
```

| Flag         | Required | Description                                                                     |
| ------------ | -------- | ------------------------------------------------------------------------------- |
| `-o, --out`  | yes      | Output directory                                                                |
| `--mode`     | no       | `bun` (default, platform-specific executables) or `node` (single `.mjs` bundle) |
| `--protocol` | no       | `session` (default) or `stateless`. Controls SKILL.md invocation instructions   |
| `--targets`  | no       | Comma-separated platforms. Defaults to `darwin-arm64,linux-x64`. Bun mode only. |
| `--single`   | no       | Build only for current platform. Bun mode only.                                 |

Output (bun mode):

```
<dir>/
  SKILL.md               ← Generated agent-facing docs
  package.json           ← Name, version, and package config fields
  scripts/run            ← Shell wrapper (platform dispatcher)
  bin/<name>-<platform>  ← Compiled Bun executables
  references/            ← Copied from source
```

Output (node mode):

```
<dir>/
  SKILL.md               ← Generated agent-facing docs
  package.json           ← Name, version, and package config fields
  scripts/run            ← Shell wrapper (Node version check)
  bin/<name>.mjs         ← Single ESM bundle
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

| Rule                           | Severity      | What it catches                                                                                                                                                      |
| ------------------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cycle-guard`                  | warning/error | Warning when cycles lack `maxVisits` (implicit limit applies at runtime); error when cycle-guard config is invalid (e.g., `onMaxVisits` targets a non-existent step) |
| `no-host-tool-names`           | error         | Direct host tool name references without `host.toolsAvailable` guard                                                                                                 |
| `primitive-schema-mismatch`    | error         | `askUser` option values missing from output enum (or vice versa)                                                                                                     |
| `orphan-references`            | warning       | Files in `references/` not mentioned in any step prompt                                                                                                              |
| `unknown-tool-names`           | warning       | `host.toolsAvailable.includes()` checks referencing unrecognized tools                                                                                               |
| `host-branching-density`       | warning       | Multiple steps branching on `host.toolsAvailable` (suggests missing primitive)                                                                                       |
| `composite-step-name`          | error         | Dispatcher step name contains `/` (reserved for sub-skill namespacing)                                                                                               |
| `composite-duplicate-subskill` | error         | Duplicate sub-skill name                                                                                                                                             |
| `composite-duplicate-topic`    | error         | Duplicate topic name                                                                                                                                                 |

For composite skills, `checkSkill` also recursively lints each registered sub-skill. Sub-skill diagnostics are prefixed with `[subskill:<name>]`.

---

## Linting (`checkSkill`)

The `checkSkill` function validates a skill definition programmatically. It is the same check `skill-kit check` runs under the hood.

```typescript
import { checkSkill } from '@contentful/skill-kit';
import type { LintDiagnostic } from '@contentful/skill-kit';

const diagnostics: LintDiagnostic[] = checkSkill(skill.build(), '.');

for (const d of diagnostics) {
  console.error(`[${d.severity}] ${d.rule}: ${d.message}`);
}
```

**Parameters:**

| Parameter | Type              | Description                                                        |
| --------- | ----------------- | ------------------------------------------------------------------ |
| `skill`   | `SkillDefinition` | A built skill definition (the return value of `.build()`)          |
| `rootDir` | `string`          | Root directory of the skill project (for `orphan-references` rule) |

**Returns:** `LintDiagnostic[]` — an array of diagnostics, each with:

- `rule` — which lint rule fired
- `severity` — `'error'` or `'warning'`
- `message` — human-readable explanation
- `step?` — the step name involved (when applicable)
- `file?` — the file path involved (when applicable)

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
    primitive: askUser({
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

1. **`choose`** — Uses `primitive: askUser(...)` to present environment options. The agent sees the options via host-appropriate tooling (AskUserQuestion on Claude Code, prose list elsewhere). The selected value is stashed for later steps.

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
