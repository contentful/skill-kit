<p align="center">
  <img src="./assets/banner.jpg" alt="@contentful/skill-kit — TypeScript SDK for agent skills: workflow state machines and progressive-disclosure references." width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.9%2B-3178c6" alt="TypeScript 5.9+">
  <img src="https://img.shields.io/badge/Node.js-24%2B-339933" alt="Node.js 24+">
  <img src="https://img.shields.io/badge/ArkType-4-3068b7" alt="ArkType 4">
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> · <a href="#skill-types">Skill Types</a> · <a href="#how-it-works">How It Works</a> · <a href="#examples">Examples</a> · <a href="#api">API</a> · <a href="./docs/api.md">Full API Reference</a> · <a href="./docs/architecture.md">Architecture</a> · <a href="./SPEC.md">Spec</a>
</p>

---

A prose skill is a blob of markdown the agent reads all at once. That works until it doesn't — multi-step workflows need branching and validation, and large reference docs need progressive disclosure.

skill-kit gives you two tools. **Workflow skills** are typed state machines — steps with prompts, ArkType schemas, and explicit transitions. **Reference skills** are on-demand topic loaders — the agent reads the SKILL.md, then loads detailed content one topic at a time. Both bundle into self-contained packages that agents invoke via Bash.

```typescript
import { skill, type, terminal } from '@contentful/skill-kit';

export default skill({
  name: 'repo-doctor',
  entry: 'diagnose',
})
  .step('diagnose', {
    prompt: 'Inspect the repository. Report health checks for CI, linting, and test coverage.',
    response: type({
      checks: {
        name: 'string',
        status: "'pass' | 'fail'",
        detail: 'string',
      }[],
    }),
    next: [
      { to: 'remediate', when: ({ response }) => response.checks.some((c) => c.status === 'fail') },
      { to: 'report' },
    ],
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
import { skill, type, terminal } from '@contentful/skill-kit';

export default skill({
  name: 'greet',
  entry: 'ask',
})
  .step('ask', {
    prompt: 'Ask the user for their name.',
    response: type({ name: 'string' }),
    next: 'welcome',
  })
  .step('welcome', {
    prompt: ({ store }) => `Say hello to ${store.steps.ask.name}.`,
    response: type({ message: 'string' }),
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
// result.response → { message: 'Hello, Alice!' }
```

### Build a distributable skill

```bash
npx skill-kit build src/skill.ts -o skill --mode node    # lightweight Node.js bundle
npx skill-kit build src/skill.ts -o skill                 # standalone executables (default)
```

Output is an [agentskills.io](https://agentskills.io/specification)-compliant directory:

```
skill/
  SKILL.md               <- Generated. Agents read this.
  package.json
  scripts/
    run                  <- Shell wrapper. The public interface.
  bin/
    greet.mjs            <- Node mode: single bundle (~100-500KB)
    # -- OR for default bun mode: --
    # greet-darwin-arm64  <- Standalone executables (~50-100MB each)
    # greet-linux-x64
```

Install it anywhere — `skills add`, `agents-kit install`, or just `git clone`.

## Skill Types

### Workflow skills

Typed state machines with steps, ArkType schemas, branching, and the store for cross-step state. The hero example above shows the pattern — `skill()` -> `.step()` -> `.build()`. Add `params` for immutable input, `store` for typed access to prior step results, `askUser` for interactive questions, and `action` for side effects. The store knows your workflow graph — guaranteed steps are non-optional, branch targets require `?.`. Steps without a `prompt` auto-advance (useful for computation-only routing steps); steps without a `response` schema skip validation. See the [full API reference](./docs/api.md) for all options.

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
scripts/run topic auth              # load a specific topic -> plain text to stdout
```

No JSON, no history, no state machine. Just `topic <name>` -> text.

### Composite skills

When related skills share references and overlap in scope, combine them into a single composite. A composite is a regular `skill()` with sub-skills and topics registered on it — a dispatcher state machine that routes to independent sub-skill workflows or resolves reference topics directly.

```typescript
import doctorSkill from './subskills/doctor.js';
import setupSkill from './subskills/setup.js';

skill({ name: 'contentful-help', entry: 'choose', system: 'You are a helpful Contentful support assistant.' })
  .step('choose', {
    prompt: act.askUser({ type: 'structured', question: 'What do you need?', options: [...] }),
    response: type({ choice: 'string' }),
    next: ({ response }) => `subskill:${response.choice}`,
  })
  .topic('rate-limits', { label: 'API rate limits', content: ({ refs }) => refs.load('rate-limits.md') })
  .subskill('doctor', doctorSkill, { params: (_out, store) => ({ spaceId: store.steps.choose.spaceId }) })
  .subskill('setup', setupSkill)
  .build();
```

Sub-skills are standalone `skill().build()` definitions — testable independently. `next` returns `'subskill:<name>'` or `'topic:<name>'` to route. See the [Composite Skills guide](./docs/api.md#composite-skills).

---

## How It Works

```
+---------+  scripts/run         +-------------+
|         | --------------------> |             |
|  Agent  |  < JSON: prompt,     |  Skill CLI  |
|         |    schema            |  (bundled)  |
|         |                      |             |
|         |  scripts/run advance |             |
|         | --------------------> |             |
|         |  < JSON: next prompt |             |
|         |       ...or done     |             |
+---------+                      +-------------+
```

The SDK supports three invocation modes. **MCP mode** (preferred) runs the skill as a long-lived MCP stdio server — the agent interacts through `start`/`advance` tool calls with no Bash or file I/O visible to the user. **Session mode** writes protocol data to a JSONL temp file — the agent reads/writes the file instead of parsing verbose JSON from stdout. **Stateless mode** passes the full conversation history via `--history` on every `advance` call. All modes share the same engine, validate against ArkType schemas, and return the next step's prompt.

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

Each step follows a fixed lifecycle. Understanding the order matters when using actions and the `save` callback:

```
prompt -> model -> validate(response) -> action.mapInput -> action.run -> save -> store -> next
```

1. **prompt** -- the CLI emits the step's prompt and schema to the agent (steps without a prompt auto-advance immediately)
2. **model** -- the agent reads the prompt, does the work, returns structured output
3. **validate(response)** -- the CLI validates the output against the step's ArkType schema (skipped for response-less steps)
4. **action.mapInput** -- if the step has an action, `action.mapInput` transforms the validated response into action input
5. **action.run** -- the action executes CLI-side (file writes, API calls, etc.)
6. **save** -- the `save` callback returns `{ step?, ...subStoreWrites }`. The `step` property controls what gets stored as the step result (defaults to action output or response). Additional keys are deep-merged into the corresponding sub-stores.
7. **store** -- the step result is appended to `store.steps`, and sub-store writes are merged into their top-level store properties
8. **next** -- the transition function determines the next step (or terminal)

### The store knows your workflow graph

The store organizes state into two namespaces: `store.steps` for step-keyed results and top-level sub-stores for domain-structured state. Step results flow into `store.steps` automatically. Sub-stores are populated by `save` callbacks that return additional keys alongside the optional `step` property.

The type system tracks which steps are guaranteed (on all paths from entry) vs optional (branch targets), computed automatically from your step declarations:

```typescript
.step('profile-card', {
  prompt: ({ store }) => {
    const name = store.steps.greet.name;              // guaranteed -- non-optional
    const role = store.steps['ask-role'].role;         // guaranteed -- non-optional
    const stack = store.steps['ask-stack']?.answer;    // branch target -- optional, use ?.
    const hobbies = store.steps.all('ask-hobby');      // loop visits -- typed array
    const env = store.environment;                     // sub-store -- domain state
    // ...
  },
})
```

Zero boilerplate. No `updateStash`, no manual wiring. Retry loops (backward edges) don't create false branches — the forward path is still guaranteed.

---

## Examples

### get-to-know-you (workflow)

A playful interview that builds a developer trading card. Shows declarative branching with `NextBranch[]`, `askUser`, `confirm`, render helpers, actions, loop guards, and the store.

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
  response: type({ role: "'dev' | 'designer' | 'manager' | 'other'" }),
  next: [
    { to: 'ask-stack', when: ({ response }) => response.role === 'dev' },
    { to: 'ask-tools', when: ({ response }) => response.role === 'designer' },
    { to: 'ask-team-size', when: ({ response }) => response.role === 'manager' },
    { to: 'ask-specialty' },
  ],
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
import { skill, type, act, view, terminal } from '@contentful/skill-kit';

skill({ name, entry, system?, version?, resolveVersion?, package?, description?, triggers?, params?, observers?, finalOutput? })
  .step(name, config)              // inline step -- params/store types inferred
  .extend(name, sharedStep, overrides)  // shared step with typed overrides
  .register(module, { next })      // merge module steps, widen store type
  .subskill(name, skillDef, opts?) // register a sub-skill with params mapping
  .topic(name, { label, content }) // register a reference topic
  .build()                         // -> SkillDefinition
```

### Reference Builder

```typescript
reference({ name, description, version?, resolveVersion?, package? })
  .topic(name, { label, content: (ctx) => string })  // content receives { refs }
  .build()                                            // -> ReferenceDefinition
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

prompt: ({ store }) => [view('Trading Card', renderedCard), 'Present the card verbatim.'],
```

Use `terminal` as a shorthand for `{ terminal: true }`:

```typescript
import { terminal } from '@contentful/skill-kit';

next: terminal,
```

Prompt functions receive `act` and `system` via `PromptContext` for composable prompt vocabulary:

```typescript
prompt: ({ store, act, system }) => [
  system`You are a game dev mentor.`,
  act.checklist({ create: store.steps.all('task').map(t => ({ title: t.name, status: 'pending' })) }),
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
skill-kit run <skill.ts> --params '{}' --host ...   # Dev mode -- run without building
skill-kit check <skill.ts>                          # Lint for portability issues
```

<details>
<summary><strong>Step config reference</strong></summary>

```typescript
{
  prompt?: string | PromptPiece | PromptPiece[] | PromptFn,  // accepts segments (ActSegment, ViewSegment, etc.) directly; omit for auto-advance steps
  response?: type.Any,                                        // omit for steps that skip validation; requires prompt
  next: 'step-name' | NextBranch[] | ((ctx) => 'step-name') | terminal,
  action?: {
    run: ActionDefinition,                                     // the action to execute
    mapInput?: (ctx: { response; store; params }) => unknown,  // transform response to action input
  },
  save?: (ctx: { response; actionResult; store; params }) => { step?: unknown; [subStore: string]: unknown } | void,
  maxVisits?: number,
  onMaxVisits?: string,
}
```

**Step lifecycle:** `prompt` -> `model` -> `validate(response)` -> `action.mapInput` -> `action.run` -> `save` -> `store` -> `next`

`PromptContext` fields available in dynamic prompts:

| Field      | Description                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `store`    | Typed accessor with `store.steps.*` for step results and top-level sub-stores for domain state |
| `params`   | Global skill params (typed from `skill({ params: ... })`)                                      |
| `refs`     | Lazy loader for `references/` files                                                            |
| `attempts` | How many times this step has been visited                                                      |
| `host`     | Current host info                                                                              |
| `act`      | Primitive directive builders (`askUser`, `confirm`, `plan`, etc.)                              |
| `system`   | System segment tag/function for persona/frame                                                  |

</details>

For modules, fragments, actions, render helpers, observers, and lint rules, see the [full API reference](./docs/api.md).

## Key Decisions

- **Builder pattern.** `skill()` returns a builder. `.step()` callbacks get typed params and store via contextual inference — no annotations.
- **Schemas are ArkType.** One validator, native TS types. String-based type expressions: `type({ name: 'string' })`.
- **The store knows your graph.** Step results live under `store.steps` with DAG-based typing — guaranteed predecessors are non-optional (`store.steps.greet.name`), branch targets require `?.` (`store.steps['ask-stack']?.answer`). Top-level sub-stores hold domain state populated by `save` callbacks.
- **Declarative branching.** `next: [{ to: 'a', when: ... }, { to: 'b' }]` — pattern-match style transitions. The type system extracts targets and computes guaranteed vs optional.
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
