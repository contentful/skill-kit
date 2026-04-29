# API Reference

Full reference for `@contentful/skill-kit`. Start with the [README](../README.md) for an overview.

---

## Workflow Builder

```typescript
import { skill, z } from '@contentful/skill-kit';

skill({ name, entry, system?, params?, stash?, observers?, finalOutput?, skillMd?, argumentHint?, allowedTools?, paths?, context? })
  .step(name, config)                       // add a step
  .extend(name, sharedStep, overrides)      // inherit + override a shared step
  .register(module, { next })               // merge module steps, widen stash type
  .build()                                  // → SkillDefinition (frozen)
```

### `skill()` config

| Field                    | Type                                           | Required | Description                                                                                                          |
| ------------------------ | ---------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `name`                   | `string`                                       | yes      | Skill identifier                                                                                                     |
| `entry`                  | `string`                                       | yes      | Name of the first step                                                                                               |
| `system`                 | `string`                                       | no       | System-level persona prepended to the preamble. Steps inherit it; steps can override with `system` in array prompts  |
| `version`                | `string`                                       | no       | Defaults to `'0.0.0'`. Mutually exclusive with `resolveVersion`                                                      |
| `resolveVersion`         | `true`                                         | no       | Resolve version from nearest ancestor `package.json`. Mutually exclusive with `version`                              |
| `description`            | `string`                                       | no       | Used in generated SKILL.md                                                                                           |
| `triggers`               | `string[]`                                     | no       | Keywords appended to description for agent discoverability                                                           |
| `params`                 | `z.ZodType`                                    | no       | Zod schema for immutable skill-wide params                                                                           |
| `stash`                  | `z.ZodType`                                    | no       | Zod schema for mutable cross-step state                                                                              |
| `finalOutput`            | `z.ZodType`                                    | no       | Schema for the terminal step's output                                                                                |
| `observers`              | `ObserverMap`                                  | no       | Lifecycle hooks (see [Observers](#observers))                                                                        |
| `skillMd`                | `string \| (skill: SkillDefinition) => string` | no       | Custom SKILL.md template override                                                                                    |
| `package`                | `PackageConfig`                                | no       | Fields written to the output `package.json` (see [Package Config](#package-config))                                  |
| `argumentHint`           | `string`                                       | no       | Autocomplete hint text. Emitted as `argument-hint` in SKILL.md frontmatter                                           |
| `arguments`              | `string \| string[]`                           | no       | Named positional arguments for `$name` substitution in skill content. Emitted as `arguments` in SKILL.md frontmatter |
| `allowedTools`           | `string \| string[]`                           | no       | Additional pre-approved tools. Build always includes `Bash(scripts/run *)` and `Read`; author tools are merged        |
| `paths`                  | `string \| string[]`                           | no       | Glob patterns for file-based auto-activation. Emitted as `paths` in SKILL.md frontmatter                             |
| `context`                | `string`                                       | no       | Execution context (e.g. `'fork'`). Emitted as `context` in SKILL.md frontmatter                                      |
| `license`                | `string`                                       | no       | License name or reference. Emitted as `license` in SKILL.md frontmatter                                              |
| `compatibility`          | `string`                                       | no       | Environment requirements. Emitted as `compatibility` in SKILL.md frontmatter                                         |
| `agent`                  | `string`                                       | no       | Subagent type when `context: 'fork'`. Emitted as `agent` in SKILL.md frontmatter                                     |
| `model`                  | `string`                                       | no       | Model override while skill is active. Emitted as `model` in SKILL.md frontmatter                                     |
| `effort`                 | `string`                                       | no       | Effort level override. Emitted as `effort` in SKILL.md frontmatter                                                   |
| `disableModelInvocation` | `boolean`                                      | no       | Prevent auto-loading by the agent. Emitted as `disable-model-invocation` in SKILL.md frontmatter                     |
| `userInvocable`          | `boolean`                                      | no       | Whether visible in `/` menu. Emitted as `user-invocable` in SKILL.md frontmatter                                     |

Params and stash types flow into step callbacks automatically via contextual inference — no annotations needed.

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
  prompt?: string | PromptPiece | PromptPiece[] | PromptFn,       // optional — omit for auto-advance steps
  output?: z.ZodType,                                             // optional — omit for pass-through steps
  next: string | TransitionFn | { terminal: true },               // required
  action?: {
    run: ActionDefinition,
    input?: (ctx: { stepOutput; stash; params }) => unknown,
    updateStash?: (ctx: { actionOutput; stash; params }) => Partial<TStash>,
  },
  updateStash?: (ctx: { stepOutput; actionOutput?; stash; params }) => Partial<TStash>,
  maxVisits?: number,
  onMaxVisits?: string,
}
```

`PromptFn` is `(ctx: PromptContext) => PromptReturn`, where `PromptReturn = string | PromptPiece | PromptPiece[]`.

A `PromptPiece` is one of:

- A plain `string` — instructions
- A `system` segment — persona/frame, created via the `system` template tag or `system(text)` function from PromptContext
- An `act` segment — primitive directive, created via `act.askUser()`, `act.confirm()`, `act.plan()`, `act.checklist()`, `act.subagent()`, `act.survey()` from PromptContext
- A `view` segment — pre-rendered content, created via the `view()` helper

When a prompt function returns an array, pieces are assembled in **author order**.

The `prompt` field accepts `PromptPiece` directly (including `ActSegment`), so single-primitive steps need no wrapper function — pass the result of `act.askUser(...)`, `act.confirm(...)`, etc. straight to `prompt`.

### PromptContext

Available in dynamic `prompt` functions:

| Field      | Type                                                              | Description                                                                           |
| ---------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `history`  | `readonly StepResult[]`                                           | All prior step results                                                                |
| `getStep`  | `<T, A>(name) => { stepOutput: T; actionOutput: A } \| undefined` | Typed accessor for a prior step's result (infers output types from the builder chain) |
| `params`   | `TParams`                                                         | Immutable skill params (typed from builder)                                           |
| `refs`     | `ReferenceLoader`                                                 | Loader for `references/` files                                                        |
| `attempts` | `number`                                                          | How many times this step has been visited                                             |
| `host`     | `Handshake`                                                       | Current host info and available tools                                                 |
| `stash`    | `Readonly<TStash>`                                                | Accumulated stash (typed from builder, frozen)                                        |
| `act`      | `ActContext`                                                      | Primitive directive builders: `askUser`, `confirm`, `plan`, `survey`, etc.            |
| `system`   | `SystemTag`                                                       | System segment tag/function for persona/frame                                         |

### Transitions

- **Static:** `next: 'step-name'` — always goes to the named step.
- **Dynamic:** `next: ({ stepOutput, actionOutput, attempts, params, stash }) => 'step-name'` — choose based on output, action result, or visit count.
- **Terminal:** `next: terminal` — ends the skill. Output becomes `finalOutput`. The `terminal` constant is exported from `@contentful/skill-kit` and is equivalent to `{ terminal: true }`.
- **Self:** `next: 'self'` or returning the current step name — revisit the same step (requires `maxVisits`).

### Loop guards

Steps in detected cycles have an implicit visit limit (10) enforced at runtime. For explicit control, declare `maxVisits` and `onMaxVisits`:

```typescript
.step('ask-hobby', {
  // ...
  maxVisits: 3,
  onMaxVisits: 'confirm-profile',  // fallback when limit hit
  next: ({ stepOutput }) => stepOutput.wantsMore ? 'ask-hobby' : 'confirm-profile',
})
```

The cycle guard validator detects potential cycles and reports them as lint warnings. At runtime, exceeding the limit with `onMaxVisits` set redirects; without it, the engine throws.

### Stash merging

The `updateStash` callback receives the validated output (and optionally the action result) and returns a partial stash object. The return value is shallow-merged into the accumulated stash:

```typescript
updateStash: ({ stepOutput }) => ({ target: stepOutput.target }),

// With action result:
updateStash: ({ stepOutput, actionOutput }) => ({ target: stepOutput.target, savedPath: actionOutput?.path }),
```

All outputs and stash values are frozen with `Object.freeze()` to prevent mutation.

### Prompt-less and output-less steps

**Prompt-less steps** omit the `prompt` field entirely. The engine skips model invocation and immediately advances to `next`. Use these for routing or orchestration steps that branch based on stash or params without needing a model turn:

```typescript
.step('route', {
  next: ({ stash }) => stash.intent === 'help' ? 'help-flow' : 'main-flow',
})
```

**Output-less steps** omit the `output` schema. The step still renders a prompt and invokes the model, but the model's response is not validated or recorded. Use these for fire-and-forget instructions where the step's value is in the model's side effects (e.g., delivering a message to the user) rather than in a structured response:

```typescript
.step('deliver', {
  prompt: ({ stash }) => `Tell the user: ${stash.summary}`,
  next: terminal,
})
```

Both patterns can be combined: a step with neither `prompt` nor `output` is a pure routing node.

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

| Field                    | Type                 | Required | Description                                                                                                          |
| ------------------------ | -------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `name`                   | `string`             | yes      | Reference skill identifier                                                                                           |
| `description`            | `string`             | yes      | Used in generated SKILL.md                                                                                           |
| `version`                | `string`             | no       | Defaults to `'0.0.0'`. Mutually exclusive with `resolveVersion`                                                      |
| `resolveVersion`         | `true`               | no       | Resolve version from nearest ancestor `package.json`. Mutually exclusive with `version`                              |
| `package`                | `PackageConfig`      | no       | Fields written to the output `package.json` (see [Package Config](#package-config))                                  |
| `argumentHint`           | `string`             | no       | Autocomplete hint text. Emitted as `argument-hint` in SKILL.md frontmatter                                           |
| `arguments`              | `string \| string[]` | no       | Named positional arguments for `$name` substitution in skill content. Emitted as `arguments` in SKILL.md frontmatter |
| `allowedTools`           | `string \| string[]` | no       | Additional pre-approved tools. Build always includes `Bash(scripts/run *)` and `Read`; author tools are merged        |
| `paths`                  | `string \| string[]` | no       | Glob patterns for file-based auto-activation. Emitted as `paths` in SKILL.md frontmatter                             |
| `context`                | `string`             | no       | Execution context (e.g. `'fork'`). Emitted as `context` in SKILL.md frontmatter                                      |
| `license`                | `string`             | no       | License name or reference. Emitted as `license` in SKILL.md frontmatter                                              |
| `compatibility`          | `string`             | no       | Environment requirements. Emitted as `compatibility` in SKILL.md frontmatter                                         |
| `agent`                  | `string`             | no       | Subagent type when `context: 'fork'`. Emitted as `agent` in SKILL.md frontmatter                                     |
| `model`                  | `string`             | no       | Model override while skill is active. Emitted as `model` in SKILL.md frontmatter                                     |
| `effort`                 | `string`             | no       | Effort level override. Emitted as `effort` in SKILL.md frontmatter                                                   |
| `disableModelInvocation` | `boolean`            | no       | Prevent auto-loading by the agent. Emitted as `disable-model-invocation`                                             |
| `userInvocable`          | `boolean`            | no       | Whether visible in `/` menu. Emitted as `user-invocable`                                                             |

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
    updateStash: ({ stepOutput }) => ({ userId: stepOutput.userId }),
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
    next: ({ stepOutput }) => `subskill:${stepOutput.intent}`,
  })
  .subskill('doctor', doctorSkill, {
    params: (_stepOutput, stash) => ({ spaceId: stash.spaceId }),
  })
  .build();
```

| Option   | Type                             | Required | Description                               |
| -------- | -------------------------------- | -------- | ----------------------------------------- |
| `params` | `(stepOutput, stash) => unknown` | no       | Maps dispatcher state to sub-skill params |

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
  kind: 'redirect';
  redirect: string; // e.g. 'subskill:doctor'
  completed: StepResult; // the step that triggered the redirect
  stash: unknown; // dispatcher's accumulated stash
}
```

The composite entry point handles this — the host never sees `RedirectResult` directly.

### CLI protocol for composites

Session mode (recommended):

```bash
scripts/run --params '{...}' --session new           # dispatcher start → SessionPointer
scripts/run advance --session <id>                     # advance (agent wrote output to file)
scripts/run doctor --params '{...}' --session new     # direct sub-skill start
```

Stateless mode (fallback):

```bash
scripts/run --params '{...}'                          # dispatcher start
scripts/run advance --step doctor/diagnose --output .. # sub-skill advance
scripts/run doctor --params '{...}'                   # direct sub-skill start
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
  params: { query: 'help' },
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
| `params`         | `object`          | no       | Dispatcher params                                     |
| `refs`           | `ReferenceLoader` | no       | For topic content resolution (defaults to no-op)      |
| `host`           | `Handshake`       | no       | Host identity. Defaults to generic                    |
| `directSubskill` | `string`          | no       | Skip dispatcher, start a sub-skill directly           |

The return value adds `redirectedTo?: { kind: 'subskill' | 'topic', name: string }` alongside the standard `path`, `outputs`, `output`, and `history` fields.

---

## Primitives

Interactive building blocks that render as XML tags with host-aware tool mappings via the preamble. Authors describe intent; the SDK renders XML and maps tags to host-specific tools. All primitive creation goes through the `act` namespace. Primitives can be used two ways:

1. **Direct `prompt` value** — pass an `ActSegment` directly to `prompt` for steps that consist entirely of one primitive with no additional prose.
2. **`act` methods in prompt functions** — composable directives mixed with other prompt pieces.

### `act.askUser` — structured or open

```typescript
import { act } from '@contentful/skill-kit';

// Direct prompt value — simple single-primitive step
.step('choose-env', {
  prompt: act.askUser({
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

// Composed with other prompt pieces via act (from PromptContext)
.step('ask-stack', {
  prompt: ({ act }) => [
    act.askUser({ type: 'open', question: "What's your tech stack?" }),
    `Get specific — frameworks, build tools, deployment targets.`,
  ],
  output: z.object({ answer: z.string() }),
  next: 'done',
})
```

#### `AskUserOption` fields

Options in structured questions accept:

| Field         | Type     | Required | Description                                                |
| ------------- | -------- | -------- | ---------------------------------------------------------- |
| `value`       | `string` | yes      | The value returned in the step output                      |
| `label`       | `string` | yes      | Display label                                              |
| `description` | `string` | no       | Longer description text                                    |
| `preview`     | `string` | no       | Preview content rendered as a `<preview>` child in the XML |

#### `AskStructuredConfig` fields

| Field         | Type              | Required | Description                                         |
| ------------- | ----------------- | -------- | --------------------------------------------------- |
| `type`        | `'structured'`    | yes      | Discriminant                                        |
| `question`    | `string`          | yes      | The question text                                   |
| `options`     | `AskUserOption[]` | yes      | 2 to 4 options                                      |
| `header`      | `string`          | no       | Short header displayed above options (max 12 chars) |
| `multiSelect` | `boolean`         | no       | Allow multiple selections (default `false`)         |

**Validation:** `header` must be at most 12 characters. Structured questions must have 2 to 4 options.

### `act.confirm` — binary approval

```typescript
import { act } from '@contentful/skill-kit';

// Direct prompt value
prompt: act.confirm({
  message: 'This will delete 47 files in .cache/. Continue?',
  destructive: true, // optional — adds warning in prose
  defaultAnswer: 'no', // optional — 'yes' or 'no'
}),

// Or via act in a prompt function
prompt: ({ act }) => [
  act.confirm({ message: 'Delete .cache/?', destructive: true }),
  `Explain what will happen before confirming.`,
],
```

Step output should include `{ approved: z.boolean() }`.

### `act.plan` — present and approve

```typescript
import { act } from '@contentful/skill-kit';

// Direct prompt value
prompt: act.plan({
  summary: 'Migrate database schema',
  steps: ['Backup current schema', 'Run migration', 'Validate'],
}),

// Or via act in a prompt function
prompt: ({ act }) => act.plan({ summary: '...', steps: [...] }),
```

### `act.checklist` — tracked task list

```typescript
import { act } from '@contentful/skill-kit';

// Direct prompt value
prompt: act.checklist({
  create: [
    { title: 'Lint config', status: 'pending' },
    { title: 'Test suite', status: 'pending' },
  ],
}),

// Or via act in a prompt function
prompt: ({ stash, act }) => [
  act.checklist({ create: stash.tasks.map(t => ({ title: t, status: 'pending' })) }),
  `Work through each task. Update the checklist as you go.`,
],
```

### `act.subagent` — spawn isolated sub-agent

```typescript
import { act } from '@contentful/skill-kit';

// Direct prompt value
prompt: act.subagent({
  prompt: 'Review the PR for security issues.',
  output: z.object({ findings: z.array(z.string()) }),
}),

// Or via act in a prompt function
prompt: ({ act }) => act.subagent({ prompt: 'Review the PR.', output: FindingsSchema }),
```

#### `SubagentConfig`

| Field            | Type        | Required | Description                                                                                                                                                                                     |
| ---------------- | ----------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prompt`         | `string`    | yes      | Task description for the sub-agent                                                                                                                                                              |
| `output`         | `z.ZodType` | yes      | Schema the sub-agent's result must satisfy                                                                                                                                                      |
| `allowRecursion` | `boolean`   | no       | Default `false`. When false, the rendered XML includes a `no-recurse` attribute set to the skill name, preventing the subagent from re-invoking the same skill. When true, no guard is emitted. |

Default (recursion blocked):

```xml
<subagent no-recurse="my-skill">Review the PR for security issues.</subagent>
```

With `allowRecursion: true`:

```xml
<subagent>Run the doctor sub-skill.</subagent>
```

The preamble instruction for `<subagent>` tells the model: if `no-recurse` is set, the subagent must not invoke the skill named in the attribute.

### `act.survey` — batched multi-question

For steps that need answers to multiple questions in one turn:

```typescript
import { act } from '@contentful/skill-kit';

// Direct prompt value
prompt: act.survey([
  { type: 'open', question: 'What is your project name?' },
  { type: 'structured', question: 'What language?', options: [
    { value: 'ts', label: 'TypeScript' },
    { value: 'py', label: 'Python' },
  ]},
  { type: 'open', question: 'Describe your use case.' },
]),

// Or via act in a prompt function
prompt: ({ act }) => [
  act.survey([
    { type: 'open', question: 'What is your project name?' },
    { type: 'open', question: 'Describe your use case.' },
  ]),
  `Ask each question one at a time. Be conversational.`,
],
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

Each `question` in the array follows the same config shape as `askUser` (type, question, options for structured). The preamble maps `<survey>` to sequential question presentation via the host's tool.

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
- **`act`** (from PromptContext) — provides `.askUser()`, `.confirm()`, `.plan()`, `.checklist()`, `.subagent()`, `.survey()` methods that return act segments.
- **plain strings** — instructions, including the existing `prompt` template tag.
- **`view()`** — imported helper that wraps content in a `ViewSegment`, rendered as `<rendered>` XML. See [View Helper](#view-helper).

### XML output format

The SDK renders all prompt segments as XML tags. The preamble (sent once at session start) maps each tag to the host's tool via a markdown table:

| Tag           | Description                                                      | Example tool (Claude Code) |
| ------------- | ---------------------------------------------------------------- | -------------------------- |
| `<system>`    | Behavioral directives (persona, tone)                            | —                          |
| `<prompt>`    | Task instructions (plain strings get wrapped)                    | —                          |
| `<ask-user>`  | Structured or open question                                      | `AskUserQuestion`          |
| `<confirm>`   | Binary yes/no confirmation                                       | `AskUserQuestion`          |
| `<plan>`      | Plan presentation with steps                                     | `EnterPlanMode`            |
| `<checklist>` | Tracked task list                                                | `TaskCreate`               |
| `<survey>`    | Batched multi-question (`<question>` children)                   | `AskUserQuestion`          |
| `<subagent>`  | Sub-agent delegation (`no-recurse` guard)                        | `Agent`                    |
| `<rendered>`  | Pre-rendered verbatim output (optional `name` attr for labeling) | —                          |

No tool names appear in the XML itself. The preamble table maps tags to tools. On hosts without a matching tool, the instruction column provides generic fallback behavior (e.g., present a numbered list for `<ask-user>`). The `<subagent>` tag may include a `no-recurse` attribute naming the skill that the subagent must not invoke (see [`allowRecursion`](#subagentconfig) above).

The preamble is generated by `preambleRows()` in the registry, which calls each primitive's `preambleRow(tool)` method with the resolved tool name (or `undefined`). Tool resolution uses a three-way strategy via `resolveTools(handshake)`: if no explicit tools are reported, the host registry provides the list; if explicit tools are reported with `--subagent`, they are authoritative (subagents genuinely have fewer tools); if explicit tools are reported without `--subagent`, they are unioned with the host registry (handles agents that under-report).

Same skill, same XML, every host. The preamble table handles the translation.

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

Both `output` and `next` are required. Use via `.extend()` on the builder to get typed overrides that respect the parent skill's params/stash types.

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
  action: { run: writeProfile },
  next: terminal,
})
```

**Decoupling action input from step output** — when the model's output doesn't match action input exactly:

```typescript
.step('save', {
  output: z.object({ reasoning: z.string(), profile: ProfileSchema }),
  action: {
    run: writeProfile,
    input: ({ stepOutput }) => ({ profile: stepOutput.profile }),
    updateStash: ({ actionOutput }) => ({ savedPath: actionOutput.path }),
  },
  next: ({ actionOutput }) => actionOutput.path ? 'confirm' : 'retry',
})
```

- `action.input` transforms step output into action input (runs before action)
- `action.updateStash` stashes action results (runs after action, receives `{ actionOutput }`)
- The top-level `updateStash` callback receives `{ stepOutput, actionOutput? }` — the action result is available alongside the step output
- `next` receives action output for conditional routing

Step lifecycle with action: `prompt → model → validate(stepOutput) → action.input → action.run → action.updateStash → updateStash → next`

### `action()` config (ActionDefinition)

| Field    | Type                                                       | Required | Description                         |
| -------- | ---------------------------------------------------------- | -------- | ----------------------------------- |
| `name`   | `string`                                                   | yes      | Action identifier                   |
| `input`  | `z.ZodType`                                                | yes      | Schema for what the action receives |
| `output` | `z.ZodType`                                                | yes      | Schema for what the action returns  |
| `run`    | `(ctx: { input, signal: AbortSignal }) => Promise<output>` | yes      | Async function with typed I/O       |

### Step `action` field config

| Field         | Type                                                        | Required | Description                                                    |
| ------------- | ----------------------------------------------------------- | -------- | -------------------------------------------------------------- |
| `run`         | `ActionDefinition`                                          | yes      | The action to execute                                          |
| `input`       | `(ctx: { stepOutput; stash; params }) => unknown`           | no       | Transform step output into action input (default: pass output) |
| `updateStash` | `(ctx: { actionOutput; stash; params }) => Partial<TStash>` | no       | Stash action results after execution                           |

The `run` function on the `ActionDefinition` receives input parsed through the `input` schema and an `AbortSignal`. By default, the step's validated output is parsed as action input; use `action.input` to customize. Action results are recorded in history alongside step outputs and available via `getStep()` or the `next` transition function.

---

## View Helper

The `view()` helper wraps content in a `ViewSegment` that renders as a `<rendered>` XML tag. It replaces the old `render` step callback — views are now composed inline within prompt functions.

```typescript
import { view } from '@contentful/skill-kit';
```

### `view(content)` — unnamed

```typescript
view(render.table(checks, { columns: ['name', 'status'] }));
// → <rendered>\n...\n</rendered>
```

### `view(label, content)` — named

```typescript
view('report', render.table(checks, { columns: ['name', 'status'] }));
// → <rendered name="report">\n...\n</rendered>
```

Named views help the model reference specific rendered blocks when a prompt contains multiple views. Use inside prompt callbacks:

```typescript
.step('report', {
  prompt: ({ history }) => {
    const checks = history.find(s => s.step === 'diagnose')!.stepOutput.checks;
    return [
      view('report', render.table(checks, { columns: ['name', 'status', 'detail'] })),
      `Output the report above to the user exactly as shown.`,
    ];
  },
  output: z.object({ delivered: z.boolean() }),
  next: terminal,
})
```

---

## `terminal` Constant

```typescript
import { terminal } from '@contentful/skill-kit';

// Equivalent to { terminal: true }
step({ next: terminal });
```

A convenience constant for terminal transitions. Use `terminal` instead of `{ terminal: true }` for cleaner code.

---

## Render Helpers

Formatting utilities for generating markdown output in step prompts:

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
    onStepStart: ({ step, params }) => {
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
  params: { repoPath: '.' }, // optional — parsed against skill's params schema
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
| `--targets`  | no       | Comma-separated platforms. Defaults to `darwin-arm64,linux-x64`. Bun mode only  |
| `--single`   | no       | Build only for current platform. Bun mode only                                  |

### Runtime flags

| Flag            | Required                                          | Description                                                                                                                                                                                                                            |
| --------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--params`      | On `start`; also on `advance` without `--session` | JSON string validated against the skill's params schema. Session mode stores params in the header automatically                                                                                                                        |
| `--step`        | On `advance`                                      | Name of the step being submitted. Not needed with `--session` in file mode                                                                                                                                                             |
| `--output`      | On `advance`                                      | JSON string — the agent's response. Not needed with `--session` in file mode                                                                                                                                                           |
| `--history`     | On `advance`                                      | JSON array of `{ step, stepOutput, actionOutput? }`. Not needed with `--session`                                                                                                                                                       |
| `--host`        | Optional                                          | Host identifier for tool resolution: `claude-code`, `codex`, `opencode`, `gemini-cli`, `cline`, `roo-code`, `kilo-code`, `cursor`, `amp`. Defaults to `generic`                                                                        |
| `--tools`       | Optional                                          | Comma-separated list of available tools (merged with host registry; authoritative with `--subagent`). E.g., `--tools AskUserQuestion,EnterPlanMode,TaskCreate,Agent`. Only needed on `start` — session mode stores tools in the header |
| `--subagent`    | Optional                                          | Boolean flag. Indicates a subagent with a genuine tool subset — `--tools` becomes authoritative (no registry merge)                                                                                                                    |
| `--session`     | Optional                                          | `new` (start) or session ID (advance). Enables session mode                                                                                                                                                                            |
| `--session-dir` | Optional                                          | Directory for session files. Default: OS temp directory                                                                                                                                                                                |
| `--output-mode` | Optional                                          | `file` (default) or `flag`. How agent passes step output in session mode                                                                                                                                                               |

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

### MCP server mode

Every built skill binary supports MCP as an alternative to the CLI protocol. Start the MCP server with:

```bash
scripts/run mcp --host claude-code
```

| Flag      | Description                                                         |
| --------- | ------------------------------------------------------------------- |
| `--host`  | Host identifier for tool resolution. Same values as CLI mode        |
| `--tools` | Comma-separated list of available tools (merged with host registry) |

The server registers two MCP tools:

| Tool      | Input                                               | Description                         |
| --------- | --------------------------------------------------- | ----------------------------------- |
| `start`   | `{ params?: object }`                               | Begin a new workflow session        |
| `advance` | `{ session: string, step: string, output: object }` | Submit step output, get next prompt |

For composite skills, a `topic` tool is also registered when topics exist.

Configure in your MCP client (e.g., Claude Code `settings.json`):

```json
{
  "mcpServers": {
    "my-skill": {
      "command": "/path/to/skill/scripts/run",
      "args": ["mcp", "--host", "claude-code"]
    }
  }
}
```

### `skill-kit run`

Dev mode — run a skill without compiling:

```bash
skill-kit run <entry.ts> start --params '{}' --host claude-code
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

A complete skill showing params, stash, `askUser`, branching, and terminal steps:

```typescript
import { skill, z, act, terminal } from '@contentful/skill-kit';

export default skill({
  name: 'deploy-check',
  entry: 'choose',
  params: z.object({ env: z.string().default('staging') }),
  stash: z.object({ target: z.string() }),
})
  .step('choose', {
    prompt: act.askUser({
      type: 'structured',
      question: 'Which environment?',
      options: [
        { value: 'production', label: 'Production' },
        { value: 'staging', label: 'Staging' },
      ],
    }),
    output: z.object({ target: z.enum(['production', 'staging']) }),
    updateStash: ({ stepOutput }) => ({ target: stepOutput.target }),
    next: 'verify',
  })
  .step('verify', {
    prompt: ({ stash }) => `Run pre-deploy checks for ${stash.target}. Report any blockers.`,
    output: z.object({ blockers: z.array(z.string()), safe: z.boolean() }),
    next: ({ stepOutput }) => (stepOutput.safe ? 'deploy' : 'abort'),
  })
  .step('deploy', {
    prompt: 'Execute the deployment.',
    output: z.object({ url: z.string() }),
    next: terminal,
  })
  .step('abort', {
    prompt: 'Report the blockers and explain why deployment was aborted.',
    output: z.object({ summary: z.string() }),
    next: terminal,
  })
  .build();
```

**What's happening:**

1. **`choose`** — Uses `prompt: act.askUser(...)` to present environment options. The agent sees the options via host-appropriate tooling (AskUserQuestion on Claude Code, prose list elsewhere). The selected value is stashed for later steps.

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

Params and stash types flow end-to-end — `stash.target` in the `verify` prompt is typed as `string`, and the `choose` step's stash callback is checked against the declared stash schema. No type annotations needed anywhere.
