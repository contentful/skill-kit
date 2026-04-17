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
import { skill, step, z } from '@contentful/skill-kit';

export default skill({
  name: 'repo-doctor',
  entry: 'diagnose',
  steps: {
    diagnose: step({
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
    }),
    remediate: step({
      /* fix failing checks */
    }),
    report: step({
      /* render results, terminal */
    }),
  },
});
```

That's a skill. The agent sees one step at a time, returns structured output, and the CLI decides what happens next.

## Quick Start

```bash
pnpm add @contentful/skill-kit
```

**Define** → **Test** → **Build** → **Ship**

### Define a skill

```typescript
// src/skills/deploy-check/skill.ts
import { skill, step, z, askUser } from '@contentful/skill-kit';

export default skill({
  name: 'deploy-check',
  entry: 'choose',
  steps: {
    choose: step({
      ask: askUser({
        question: 'Which environment?',
        options: [
          { value: 'production', label: 'Production' },
          { value: 'staging', label: 'Staging' },
        ],
      }),
      output: z.object({ target: z.enum(['production', 'staging']) }),
      next: 'verify',
    }),
    verify: step({
      prompt: ({ prev }) => `Run pre-deploy checks for ${prev.target}. Report any blockers.`,
      output: z.object({ blockers: z.array(z.string()), safe: z.boolean() }),
      next: ({ output }) => (output.safe ? 'deploy' : 'abort'),
    }),
    deploy: step({
      prompt: 'Execute the deployment.',
      output: z.object({ url: z.string() }),
      next: { terminal: true },
    }),
    abort: step({
      prompt: 'Report the blockers to the user and explain why deployment was aborted.',
      output: z.object({ summary: z.string() }),
      next: { terminal: true },
    }),
  },
});
```

### Test without an agent

```typescript
// src/skills/deploy-check/skill.test.ts
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

```bash
node --test --import tsx/esm src/skills/deploy-check/skill.test.ts
```

### Build a distributable skill

```bash
npx skill-kit build src/skills/deploy-check/skill.ts -o skills/deploy-check
```

Output is an [agentskills.io](https://agentskills.io/specification)-compliant directory:

```
skills/deploy-check/
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

Primitives like `askUser`, `confirm`, and `plan` generate different prose depending on the agent:

| Primitive | Claude Code                 | Codex                        | Generic                |
| --------- | --------------------------- | ---------------------------- | ---------------------- |
| `askUser` | Uses `AskUserQuestion` tool | Prose with option list       | Prose with option list |
| `plan`    | Uses `EnterPlanMode`        | Uses `update_plan`           | Numbered list          |
| `tasks`   | Uses `TaskCreate`           | Uses `update_plan` checklist | Markdown checklist     |

Same skill definition, calibrated UX per host. The `--host` flag controls which prose variant is emitted.

## Repo Layout

Source and build output live in separate directories:

```
my-repo/
  src/skills/              ← Where you write TypeScript
    deploy-check/
      skill.ts
      skill.test.ts
      references/          ← Docs the skill can load on demand
  skills/                  ← Build output. Each subdir is installable.
    deploy-check/          ← Built by: skill-kit build ... -o skills/deploy-check
      SKILL.md
      scripts/run
      bin/...
    some-prose-skill/      ← Traditional prose skills coexist
      SKILL.md
```

Wire it up in `package.json`:

```json
{
  "scripts": {
    "build": "skill-kit build src/skills/deploy-check/skill.ts -o skills/deploy-check",
    "test": "node --test --import tsx/esm 'src/skills/**/*.test.ts'"
  }
}
```

## API

### Core

```typescript
import { skill, step, z, fragment, prompt, action, render } from '@contentful/skill-kit';
```

| Export                                                                   | What it does                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------ |
| `skill({ name, entry, steps })`                                          | Define a skill with named steps and an entry point     |
| `step({ prompt, output, next })`                                         | Define a step — prompt, Zod schema, transition         |
| `z`                                                                      | Zod re-export — one schema library, no extra deps      |
| `fragment(name, content)`                                                | Reusable prose partial                                 |
| `` prompt`...` ``                                                        | Tagged template with dedent + fragment interpolation   |
| `action({ name, input, output, run })`                                   | Deterministic CLI-side effect (file writes, API calls) |
| `render.table()` `.checklist()` `.diff()` `.code()` `.kv()` `.section()` | Markdown renderers for deterministic output            |

### Primitives

```typescript
import { askUser, confirm, plan, tasks, subtask } from '@contentful/skill-kit';
```

These attach to a step and generate host-aware prose automatically:

```typescript
step({
  ask: askUser({ question: 'Pick one', options: [...] }),
  output: z.object({ choice: z.enum([...]) }),
  next: ({ output }) => `handle-${output.choice}`,
})
```

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
step({
  // What the agent sees (string or function of context)
  prompt: string | (ctx: PromptContext) => string,

  // Zod schema — agent output is validated against this
  output: z.ZodType,

  // Where to go next
  next: 'step-name' | ((ctx) => 'step-name') | { terminal: true },

  // Deterministic rendered output (agent pastes verbatim)
  render?: (ctx: PromptContext) => string,

  // CLI-side effect after validation, before transition
  action?: ActionDefinition,

  // Stash data for later steps (not shown to agent)
  stash?: (ctx: { output }) => unknown,

  // Loop guards
  maxVisits?: number,
  onMaxVisits?: string,

  // Host-aware primitives (attach one per step)
  ask?: AskUserConfig,
  confirm?: ConfirmConfig,
  plan?: PlanConfig,
  tasks?: TasksConfig,
  subtask?: SubtaskConfig,
})
```

The `PromptContext` available in dynamic prompts and render functions:

| Field      | Type                      | Description                               |
| ---------- | ------------------------- | ----------------------------------------- |
| `prev`     | `unknown`                 | Output of the previous step               |
| `history`  | `StepResult[]`            | All prior step results                    |
| `context`  | `unknown`                 | Global skill context                      |
| `rendered` | `string?`                 | Output of this step's `render()`          |
| `refs`     | `ReferenceLoader`         | Lazy loader for `references/` files       |
| `attempts` | `number`                  | How many times this step has been visited |
| `host`     | `Handshake`               | Current host info                         |
| `stash`    | `Record<string, unknown>` | Data stashed by prior steps               |

</details>

## Key Decisions

- **Schemas are Zod.** One validator, native TS types. No pluggable schema systems.
- **State is append-only.** No mutation of prior step outputs. Enables replay.
- **Cycles require guards.** Every loop must declare `maxVisits` + `onMaxVisits`. Enforced at load time.
- **Actions are declared.** CLI-side effects are named and explicit — never inferred.
- **Single invocation.** No persistent processes. Each call reconstructs from history. Agents pipe nothing.

---

<p align="center">
  <a href="./SPEC.md">Full specification</a> · <a href="https://agentskills.io/specification">agentskills.io format</a>
</p>
