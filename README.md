<p align="center">
  <strong>@contentful/skill-kit</strong><br>
  <em>Typed state machines for agent skills. Define steps, validate outputs, compile to executables.</em>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> · <a href="#how-it-works">How It Works</a> · <a href="#api">API</a> · <a href="./SPEC.md">Spec</a>
</p>

---

A prose skill is a blob of markdown the agent reads all at once. That works for simple tasks — and falls apart for multi-step workflows where you need branching, validation, and deterministic output.

skill-kit replaces the blob with a **typed state machine**. You define steps with prompts, Zod schemas for outputs, and explicit transitions. The SDK compiles it into a self-contained binary that agents invoke via Bash — one call per step, JSON in and out.

```typescript
import { skill, z } from '@contentful/skill-kit';

export default skill({
  name: 'repo-doctor',
  entry: 'diagnose',
})
  .step('diagnose', {
    prompt: 'Inspect the repository. Report health checks for CI, linting, and test coverage.',
    output: z.object({
      checks: z.array(
        z.object({
          name: z.string(),
          status: z.enum(['pass', 'fail']),
          detail: z.string(),
        }),
      ),
    }),
    next: ({ output }) => (output.checks.some((c) => c.status === 'fail') ? 'remediate' : 'report'),
  })
  .step('remediate', {
    /* fix failing checks */
  })
  .step('report', {
    /* render results, terminal */
  })
  .build();
```

That's a skill. The agent sees one step at a time, returns structured output, and the CLI decides what happens next.

## Quick Start

```bash
pnpm add @contentful/skill-kit
```

**Define** → **Test** → **Build** → **Ship**

### Define a skill

```typescript
// examples/deploy-check/src/skill.ts
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

Context and stash types flow into step callbacks automatically — `stash.target` is typed as `string`, no annotations needed.

### Test without an agent

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

### Build a distributable skill

```bash
npx skill-kit build examples/deploy-check/src/skill.ts -o examples/deploy-check/skill
```

Output is an [agentskills.io](https://agentskills.io/specification)-compliant directory:

```
examples/deploy-check/skill/
  SKILL.md               ← Generated. Agents read this.
  package.json
  scripts/
    run                  ← Shell wrapper. The public interface.
  bin/
    deploy-check-darwin-arm64
    deploy-check-linux-x64
```

Install it anywhere — `skills add`, `agents-kit install`, or just `git clone`.

## How It Works

```
┌─────────┐  scripts/run start   ┌─────────────┐
│         │ ───────────────────► │             │
│  Agent  │  ◄ JSON: prompt,     │  Skill CLI  │
│         │    schema            │  (compiled) │
│         │                      │             │
│         │  scripts/run advance │             │
│         │ ───────────────────► │             │
│         │  ◄ JSON: next prompt │             │
│         │       ...or done     │             │
└─────────┘                      └─────────────┘
```

Each invocation is **stateless**. The agent passes the full conversation history via `--history` on every `advance` call. The binary reconstructs state, validates the output against the Zod schema, and returns the next step's prompt as JSON.

No persistent processes. No stdin piping. Just Bash calls that every agent host already supports.

### Host-aware primitives

The SDK uses an abstract verb system. The preamble (sent on first response) maps verbs to host-specific tools:

| Verb             | Claude Code             | Codex                   | Generic                 |
| ---------------- | ----------------------- | ----------------------- | ----------------------- |
| `ASK_STRUCTURED` | `AskUserQuestion` tool  | Prose with option list  | Prose with option list  |
| `ASK_FREEFORM`   | Plain text conversation | Plain text conversation | Plain text conversation |
| `PRESENT_PLAN`   | `EnterPlanMode`         | `update_plan`           | Numbered list           |
| `CREATE_TASKS`   | `TaskCreate`            | `update_plan` checklist | Markdown checklist      |

Step prose uses the verbs. The preamble handles the translation. Same skill, every host.

### Modules

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
  .step('start', { ... next: 'auth-login' })
  .register(authModule, { next: 'dashboard' })
  .step('dashboard', {
    // stash is now { appName: string } & { userId: string }
    prompt: ({ stash }) => `Welcome ${stash.userId} to ${stash.appName}`,
    ...
  })
  .build();
```

## API

### Builder

```typescript
import { skill, z } from '@contentful/skill-kit';

skill({ name, entry, context?, stash?, observers?, capabilities?, finalOutput? })
  .step(name, config)              // inline step — context/stash types inferred
  .extend(name, sharedStep, overrides)  // shared step with typed overrides
  .register(module, { next })      // merge module steps, widen stash type
  .build()                         // → SkillDefinition
```

### askUser — structured or open

```typescript
import { askUser } from '@contentful/skill-kit';

// Structured — becomes ASK_STRUCTURED verb → AskUserQuestion on Claude Code
ask: askUser({
  type: 'structured',
  question: 'Which env?',
  options: [{ value: 'prod', label: 'Production' }, ...],
})

// Open — becomes ASK_FREEFORM verb → plain text conversation, never a tool
ask: askUser({
  type: 'open',
  question: "What's your tech stack?",
})
```

### Other primitives

| Export                               | What it does                 |
| ------------------------------------ | ---------------------------- |
| `confirm({ message, destructive? })` | Binary yes/no approval       |
| `plan({ summary, steps })`           | Show plan, wait for approval |
| `tasks({ create })`                  | Tracked subtask list         |
| `subtask({ prompt, output })`        | Spawn isolated sub-agent     |

### Standalone steps

```typescript
import { step, z } from '@contentful/skill-kit';

// For shared/reusable steps defined outside a skill
const openQuestion = step({
  output: z.object({ answer: z.string() }),
  next: '__parent__',
});
```

Use via `.extend()` on the builder to get typed overrides.

### Testing

```typescript
import { runSkill, mockModel } from '@contentful/skill-kit/test';
```

| Export                                        | What it does                                                   |
| --------------------------------------------- | -------------------------------------------------------------- |
| `runSkill(skill, { model, context?, host? })` | Drive a skill to completion                                    |
| `mockModel({ stepName: output })`             | Canned outputs — static values, arrays for loops, or functions |

### CLI

```bash
skill-kit build <entry.ts> -o <dir>       # Compile to distributable skill
skill-kit build ... --targets linux-arm64  # Override platform targets
skill-kit build ... --single               # Current platform only (fast)
skill-kit run <skill.ts> start --context   # Dev mode — run without compiling
skill-kit check <skill.ts>                 # Lint for portability issues
```

<details>
<summary><strong>Step config reference</strong></summary>

```typescript
// Inline in .step() — context and stash typed via builder
{
  prompt: string | (ctx: PromptContext) => string,
  output: z.ZodType,
  next: 'step-name' | ((ctx) => 'step-name') | { terminal: true },
  render?: (ctx: PromptContext) => string,
  action?: ActionDefinition,
  stash?: (ctx: { output }) => Partial<TStash>,
  maxVisits?: number,
  onMaxVisits?: string,
  ask?: AskUserConfig,
  confirm?: ConfirmConfig,
  plan?: PlanConfig,
  tasks?: TasksConfig,
  subtask?: SubtaskConfig,
}
```

`PromptContext` fields available in dynamic prompts and render functions:

| Field      | Description                                                 |
| ---------- | ----------------------------------------------------------- |
| `prev`     | Output of the previous step                                 |
| `history`  | All prior step results                                      |
| `context`  | Global skill context (typed from `skill({ context: ... })`) |
| `rendered` | Output of this step's `render()`                            |
| `refs`     | Lazy loader for `references/` files                         |
| `attempts` | How many times this step has been visited                   |
| `host`     | Current host info                                           |
| `stash`    | Accumulated stash data (typed from `skill({ stash: ... })`) |

</details>

## Key Decisions

- **Builder pattern.** `skill()` returns a builder. `.step()` callbacks get typed context/stash via contextual inference — no annotations.
- **Schemas are Zod.** One validator, native TS types. No pluggable schema systems.
- **State is append-only.** No mutation of prior step outputs. Enables replay.
- **Cycles require guards.** Every loop must declare `maxVisits` + `onMaxVisits`. Enforced at load time.
- **Abstract verb system.** Step prose uses verbs (`ASK_STRUCTURED`, `ASK_FREEFORM`). The preamble maps them to host-specific tools.
- **Single invocation.** No persistent processes. Each call reconstructs from history.

---

<p align="center">
  <a href="./SPEC.md">Full specification</a> · <a href="https://agentskills.io/specification">agentskills.io format</a>
</p>
