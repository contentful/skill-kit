<p align="center">
  <img src="./assets/banner.jpg" alt="@contentful/skill-kit — TypeScript SDK for agent skills: workflow state machines and progressive-disclosure references." width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.9%2B-3178c6" alt="TypeScript 5.9+">
  <img src="https://img.shields.io/badge/Node.js-24%2B-339933" alt="Node.js 24+">
  <img src="https://img.shields.io/badge/Zod-4-3068b7" alt="Zod 4">
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> · <a href="#skill-types">Skill Types</a> · <a href="#how-it-works">How It Works</a> · <a href="#examples">Examples</a> · <a href="#api">API</a> · <a href="./docs/api.md">Full API Reference</a> · <a href="./docs/architecture.md">Architecture</a> · <a href="./SPEC.md">Spec</a>
</p>

---

A prose skill is a blob of markdown the agent reads all at once. That works until it doesn't — multi-step workflows need branching and validation, and large reference docs need progressive disclosure.

skill-kit gives you two tools. **Workflow skills** are typed state machines — steps with prompts, Zod schemas, and explicit transitions. **Reference skills** are on-demand topic loaders — the agent reads the SKILL.md, then loads detailed content one topic at a time. Both bundle into self-contained packages that agents invoke via Bash.

```typescript
import { skill, z, terminal } from '@contentful/skill-kit';

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
    next: ({ stepOutput }) => (stepOutput.checks.some((c) => c.status === 'fail') ? 'remediate' : 'report'),
  })
  .step('remediate', {
    /* fix failing checks */
  })
  .step('report', {
    /* render results */
    next: terminal,
  })
  .build();
```

That's a skill. The agent sees one step at a time, returns structured output, and the CLI decides what happens next.

## Quick Start

```bash
pnpm add @contentful/skill-kit
```

### Define a skill

```typescript
import { skill, z, terminal } from '@contentful/skill-kit';

export default skill({
  name: 'greet',
  entry: 'ask',
})
  .step('ask', {
    prompt: 'Ask the user for their name.',
    output: z.object({ name: z.string() }),
    next: 'welcome',
  })
  .step('welcome', {
    prompt: ({ getStep }) => `Say hello to ${getStep('ask')?.stepOutput.name}.`,
    output: z.object({ message: z.string() }),
    next: terminal,
  })
  .build();
```

### Test without an agent

```typescript
import { runSkill, mockModel } from '@contentful/skill-kit/test';
import greet from './skill.ts';

const result = await runSkill(greet, {
  model: mockModel({
    ask: { name: 'Alice' },
    welcome: { message: 'Hello, Alice!' },
  }),
});

// result.path → ['ask', 'welcome']
// result.output → { message: 'Hello, Alice!' }
```

### Build a distributable skill

```bash
npx skill-kit build src/skill.ts -o skill --mode node    # lightweight Node.js bundle
npx skill-kit build src/skill.ts -o skill                 # standalone executables (default)
```

Output is an [agentskills.io](https://agentskills.io/specification)-compliant directory:

```
skill/
  SKILL.md               ← Generated. Agents read this.
  package.json
  scripts/
    run                  ← Shell wrapper. The public interface.
  bin/
    greet.mjs            ← Node mode: single bundle (~100-500KB)
    # — OR for default bun mode: —
    # greet-darwin-arm64  ← Standalone executables (~50-100MB each)
    # greet-linux-x64
```

Install it anywhere — `skills add`, `agents-kit install`, or just `git clone`.

## Skill Types

### Workflow skills

Typed state machines with steps, Zod schemas, branching, and cross-step state. The hero example above shows the pattern — `skill()` → `.step()` → `.build()`. Add `params` for immutable input, `stash` for accumulated state, `askUser` for interactive questions, and `action` for side effects. Steps without a `prompt` auto-advance (useful for computation-only routing steps); steps without an `output` schema skip validation. See the [full API reference](./docs/api.md) for all options.

### Reference skills

For skills that don't need a workflow — just progressive disclosure of content:

```typescript
import { reference, render } from '@contentful/skill-kit';

export default reference({
  name: 'api-guide',
  description: 'API reference for the Foo service.',
})
  .topic('auth', {
    label: 'Authentication and token management',
    content: ({ refs }) => refs.load('auth.md'),
  })
  .topic('errors', {
    label: 'Error codes and troubleshooting',
    content: () => render.table(ERROR_CODES, { columns: ['code', 'meaning', 'fix'] }),
  })
  .build();
```

The generated SKILL.md lists topics. Agents load them on demand:

```bash
scripts/run topics                  # list all topics
scripts/run topic auth              # load a specific topic → plain text to stdout
```

No JSON, no history, no state machine. Just `topic <name>` → text.

### Composite skills

When related skills share references and overlap in scope, combine them into a single composite. A composite is a regular `skill()` with sub-skills and topics registered on it — a dispatcher state machine that routes to independent sub-skill workflows or resolves reference topics directly.

```typescript
import doctorSkill from './subskills/doctor.js';
import setupSkill from './subskills/setup.js';

skill({ name: 'contentful-help', entry: 'choose', system: 'You are a helpful Contentful support assistant.', ... })
  .step('choose', {
    prompt: act.askUser({ type: 'structured', question: 'What do you need?', options: [...] }),
    output: z.object({ choice: z.string() }),
    next: ({ stepOutput }) => `subskill:${stepOutput.choice}`,
  })
  .topic('rate-limits', { label: 'API rate limits', content: ({ refs }) => refs.load('rate-limits.md') })
  .subskill('doctor', doctorSkill, { params: (_out, stash) => ({ spaceId: stash.spaceId }) })
  .subskill('setup', setupSkill)
  .build();
```

Sub-skills are standalone `skill().build()` definitions — testable independently. `next` returns `'subskill:<name>'` or `'topic:<name>'` to route. See the [Composite Skills guide](./docs/api.md#composite-skills).

---

## How It Works

```
┌─────────┐  scripts/run         ┌─────────────┐
│         │ ───────────────────► │             │
│  Agent  │  ◄ JSON: prompt,     │  Skill CLI  │
│         │    schema            │  (bundled)  │
│         │                      │             │
│         │  scripts/run advance │             │
│         │ ───────────────────► │             │
│         │  ◄ JSON: next prompt │             │
│         │       ...or done     │             │
└─────────┘                      └─────────────┘
```

The SDK supports three invocation modes. **MCP mode** (preferred) runs the skill as a long-lived MCP stdio server — the agent interacts through `start`/`advance` tool calls with no Bash or file I/O visible to the user. **Session mode** writes protocol data to a JSONL temp file — the agent reads/writes the file instead of parsing verbose JSON from stdout. **Stateless mode** passes the full conversation history via `--history` on every `advance` call. All modes share the same engine, validate against Zod schemas, and return the next step's prompt.

To use MCP mode, configure the skill as an MCP server in your agent host:

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

### Host-aware primitives

The SDK renders primitive directives as XML tags. The preamble (sent on first response) maps each tag to the host's tool via a markdown table:

| Tag           | Description                               | Example tool (Claude Code) |
| ------------- | ----------------------------------------- | -------------------------- |
| `<ask-user>`  | Structured or open question               | `AskUserQuestion`          |
| `<confirm>`   | Binary yes/no confirmation                | `AskUserQuestion`          |
| `<plan>`      | Plan presentation with steps              | `EnterPlanMode`            |
| `<checklist>` | Tracked task list                         | `TaskCreate`               |
| `<survey>`    | Batch multiple structured questions       | `AskUserQuestion`          |
| `<subagent>`  | Sub-agent delegation (`no-recurse` guard) | `Agent`                    |

No tool names in the XML. The preamble handles the mapping. Same skill, same XML, every host. See the [architecture doc](./docs/architecture.md#the-host-aware-prose-system) for the full tag table and how the preamble is generated.

### Step Lifecycle

Each step follows a fixed lifecycle. Understanding the order matters when using actions and stash together:

```
prompt → model → validate(stepOutput) → action.input → action.run → action.updateStash → updateStash → next
```

1. **prompt** -- the CLI emits the step's prompt and schema to the agent (steps without a prompt auto-advance immediately)
2. **model** -- the agent reads the prompt, does the work, returns structured output
3. **validate(stepOutput)** -- the CLI validates the output against the step's Zod schema (skipped for output-less steps)
4. **action.input** -- if the step has an action, `action.input` transforms the validated output into action input
5. **action.run** -- the action executes CLI-side (file writes, API calls, etc.)
6. **action.updateStash** -- `action.updateStash` persists action results to the stash
7. **updateStash** -- the step-level `updateStash` callback runs, receiving both the step output and action result
8. **next** -- the transition function determines the next step (or terminal)

---

## Examples

### get-to-know-you (workflow)

A playful interview that builds a developer trading card. Shows branching, `askUser`, `confirm`, fragments, render helpers, actions, and loop guards.

```typescript
.step('ask-role', {
  prompt: act.askUser({
    type: 'structured',
    question: "What's your primary role?",
    options: [
      { value: 'dev', label: 'Developer' },
      { value: 'designer', label: 'Designer' },
      { value: 'manager', label: 'Manager' },
    ],
  }),
  output: z.object({ role: z.enum(['dev', 'designer', 'manager', 'other']) }),
  next: ({ stepOutput }) => {
    switch (stepOutput.role) {
      case 'dev': return 'ask-stack';
      case 'designer': return 'ask-tools';
      default: return 'ask-specialty';
    }
  },
})
```

[Full source](./examples/get-to-know-you/src/skill.ts)

### ts-patterns (reference)

TypeScript patterns reference with on-demand topic loading. Shows `render.table`, `render.code`, and external markdown via `refs.load()`.

```typescript
.topic('error-handling', {
  label: 'Error handling — Result types, custom errors, exhaustive matching',
  content: () => render.table(
    [
      { pattern: 'try/catch', use: 'External APIs, I/O', note: 'Catch specific error types' },
      { pattern: 'Result<T, E>', use: 'Domain logic', note: 'Forces caller to handle both paths' },
    ],
    { columns: ['pattern', 'use', 'note'] },
  ),
})
```

[Full source](./examples/ts-patterns/src/skill.ts)

### contentful-help (composite)

A composite skill that dispatches to doctor and setup sub-skills, or resolves FAQ topics directly. Shows `.subskill()`, `.topic()`, `subskill:` / `topic:` routing, actions for deterministic env checks, and `runComposite` for testing.

[Full source](./examples/contentful-help/src/skill.ts)

---

## API

### Workflow Builder

```typescript
import { skill, z, act, view, terminal } from '@contentful/skill-kit';

skill({ name, entry, system?, version?, resolveVersion?, package?, description?, triggers?, params?, stash?, observers?, finalOutput? })
  .step(name, config)              // inline step — params/stash types inferred
  .extend(name, sharedStep, overrides)  // shared step with typed overrides
  .register(module, { next })      // merge module steps, widen stash type
  .subskill(name, skillDef, opts?) // register a sub-skill with params mapping
  .topic(name, { label, content }) // register a reference topic
  .build()                         // → SkillDefinition
```

### Reference Builder

```typescript
reference({ name, description, version?, resolveVersion?, package? })
  .topic(name, { label, content: (ctx) => string })  // content receives { refs }
  .build()                                            // → ReferenceDefinition
```

### Primitives

All primitive creation goes through the `act` namespace (`import { act } from '@contentful/skill-kit'`). Pass act segments directly to `prompt:` (single-primitive shorthand) or compose them in prompt functions (arrays):

| Method                                              | What it does                                          |
| --------------------------------------------------- | ----------------------------------------------------- |
| `act.askUser({ type, question, ... })`              | Structured or open question                           |
| `act.confirm({ message, destructive? })`            | Binary yes/no approval                                |
| `act.plan({ summary, steps })`                      | Show plan, wait for approval                          |
| `act.checklist({ create })`                         | Tracked task list                                     |
| `act.subagent({ prompt, output, allowRecursion? })` | Spawn isolated sub-agent (recursion guard by default) |
| `act.survey(questions)`                             | Batch multiple structured questions                   |

Use `view()` to inject pre-rendered content into prompts:

```typescript
import { view } from '@contentful/skill-kit';

prompt: ({ stash }) => [view('Trading Card', renderedCard), 'Present the card verbatim.'],
```

Use `terminal` as a shorthand for `{ terminal: true }`:

```typescript
import { terminal } from '@contentful/skill-kit';

next: terminal,
```

Prompt functions receive `act` and `system` via `PromptContext` for composable prompt vocabulary:

```typescript
prompt: ({ stash, act, system }) => [
  system`You are a game dev mentor.`,
  act.checklist({ create: stash.tasks.map(t => ({ title: t, status: 'pending' })) }),
  prompt`Build the game. Update the checklist as you go.`,
],
```

### Testing

```typescript
import { runSkill, mockModel } from '@contentful/skill-kit/test';
```

| Export                                       | What it does                                                   |
| -------------------------------------------- | -------------------------------------------------------------- |
| `runSkill(skill, { model, params?, host? })` | Drive a skill to completion                                    |
| `runComposite(skill, { model, refs?, ... })` | Drive a composite skill (handles sub-skill routing)            |
| `mockModel({ stepName: output })`            | Canned outputs — static values, arrays for loops, or functions |

### CLI

```bash
skill-kit build <entry.ts> -o <dir>                # Bundle skill (default: bun executables)
skill-kit build <entry.ts> -o <dir> --mode node    # Lightweight Node.js bundle
skill-kit build ... --targets linux-arm64           # Override platform targets (bun mode)
skill-kit build ... --single                        # Current platform only (bun mode, fast)
skill-kit run <skill.ts> --params '{}' --host ...   # Dev mode — run without building
skill-kit check <skill.ts>                          # Lint for portability issues
```

<details>
<summary><strong>Step config reference</strong></summary>

```typescript
{
  prompt?: string | PromptPiece | PromptPiece[] | PromptFn,  // accepts segments (ActSegment, ViewSegment, etc.) directly; omit for auto-advance steps
  output?: z.ZodType,                                         // omit for steps that skip validation
  next: 'step-name' | ((ctx) => 'step-name') | terminal,
  action?: {
    run: ActionDefinition,                                     // the action to execute
    input?: (ctx: { stepOutput; stash }) => unknown,           // transform step output to action input
    updateStash?: (ctx: { actionOutput }) => Partial<TStash>,  // stash action results
  },
  updateStash?: (ctx: { stepOutput; actionOutput? }) => Partial<TStash>,
  maxVisits?: number,
  onMaxVisits?: string,
}
```

**Step lifecycle:** `prompt` -> `model` -> `validate(stepOutput)` -> `action.input` -> `action.run` -> `action.updateStash` -> `updateStash` -> `next`

`PromptContext` fields available in dynamic prompts:

| Field      | Description                                                       |
| ---------- | ----------------------------------------------------------------- |
| `history`  | All prior step results                                            |
| `getStep`  | Typed accessor: `getStep<T>('name')?.stepOutput`                  |
| `params`   | Global skill params (typed from `skill({ params: ... })`)         |
| `refs`     | Lazy loader for `references/` files                               |
| `attempts` | How many times this step has been visited                         |
| `host`     | Current host info                                                 |
| `stash`    | Accumulated stash data (typed from `skill({ stash: ... })`)       |
| `act`      | Primitive directive builders (`askUser`, `confirm`, `plan`, etc.) |
| `system`   | System segment tag/function for persona/frame                     |

</details>

For modules, fragments, actions, render helpers, observers, and lint rules, see the [full API reference](./docs/api.md).

## Key Decisions

- **Builder pattern.** `skill()` returns a builder. `.step()` callbacks get typed params/stash via contextual inference — no annotations.
- **Schemas are Zod.** One validator, native TS types. No pluggable schema systems.
- **XML output format.** Primitives render as XML tags (`<ask-user>`, `<plan>`, `<checklist>`, etc.). The preamble maps tags to host-specific tools via a markdown table.
- **Single invocation.** No persistent processes. Each call reconstructs from history.
- **Three skill patterns, one build pipeline.** Workflow skills for state machines, reference skills for progressive disclosure, and composite skills that combine sub-skills and topics under a single dispatcher. All build to the same agentskills.io directory structure.

---

## Help and Support

- Open a GitHub issue for bugs and feature requests.
- For security issues, follow [SECURITY.md](SECURITY.md).
- Contentful support resources: https://www.contentful.com/help/getting-started/how-to-get-help/

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local development setup, validation commands, and pull request guidelines.

## License and Notices

This project is licensed under [MIT](LICENSE).

Third-party notices and license automation docs:

- [NOTICE](NOTICE)
- [AUTOMATION-FOR-LICENSES.md](AUTOMATION-FOR-LICENSES.md)

---

<p align="center">
  <a href="./docs/api.md">Full API Reference</a> · <a href="./docs/architecture.md">Architecture</a> · <a href="./SPEC.md">Specification</a> · <a href="https://agentskills.io/specification">agentskills.io</a>
</p>
