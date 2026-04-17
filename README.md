# @contentful/skill-kit

TypeScript SDK for building agent skills with CLI-driven workflows. Skills are typed state machines — each step has a prompt, a schema-validated output, and explicit transitions. The SDK compiles skills into self-contained executables that work with any agent host.

## Install

```bash
pnpm add @contentful/skill-kit
```

## Quick start

### 1. Define a skill

```typescript
// src/skills/repo-doctor/skill.ts
import { skill, step, z, render } from '@contentful/skill-kit';

const CheckResult = z.object({
  name: z.string(),
  status: z.enum(['pass', 'fail']),
  detail: z.string(),
});

export default skill({
  name: 'repo-doctor',
  version: '1.0.0',
  description: 'Inspects a repository and reports health check results.',
  entry: 'diagnose',
  steps: {
    diagnose: step({
      prompt: 'Inspect the repository and report health checks for CI, linting, and test coverage.',
      output: z.object({ checks: z.array(CheckResult) }),
      next: ({ output }) => (output.checks.some((c) => c.status === 'fail') ? 'remediate' : 'report'),
    }),
    remediate: step({
      prompt: ({ prev }) =>
        `Fix these failing checks:\n${JSON.stringify(
          prev.checks.filter((c: any) => c.status === 'fail'),
          null,
          2,
        )}`,
      output: z.object({
        remediations: z.array(z.object({ check: z.string(), action: z.string() })),
      }),
      next: 'report',
    }),
    report: step({
      prompt: ({ rendered }) => `Output the following report exactly as shown:\n\n${rendered}`,
      output: z.object({ summary: z.string() }),
      render: ({ history }) => {
        const diagnose = history.find((s) => s.step === 'diagnose')!;
        return render.table((diagnose.output as any).checks, {
          columns: ['name', 'status', 'detail'],
          statusIcons: { pass: '✅', fail: '❌' },
        });
      },
      next: { terminal: true },
    }),
  },
});
```

### 2. Test it

```typescript
// src/skills/repo-doctor/skill.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { runSkill, mockModel } from '@contentful/skill-kit/test';
import doctor from './skill.ts';

test('routes to remediate when checks fail', async () => {
  const result = await runSkill(doctor, {
    model: mockModel({
      diagnose: { checks: [{ name: 'ci', status: 'fail', detail: 'no CI config' }] },
      remediate: { remediations: [{ check: 'ci', action: 'add workflow file' }] },
      report: { summary: 'CI config added' },
    }),
  });

  assert.deepEqual(result.path, ['diagnose', 'remediate', 'report']);
});

test('skips remediation when all checks pass', async () => {
  const result = await runSkill(doctor, {
    model: mockModel({
      diagnose: { checks: [{ name: 'ci', status: 'pass', detail: 'ok' }] },
      report: { summary: 'All good' },
    }),
  });

  assert.deepEqual(result.path, ['diagnose', 'report']);
});
```

```bash
node --test --import tsx/esm src/skills/repo-doctor/skill.test.ts
```

### 3. Build it

```bash
npx skill-kit build src/skills/repo-doctor/skill.ts -o skills/repo-doctor
```

This produces a complete [agentskills.io](https://agentskills.io/specification)-compliant skill directory:

```
skills/repo-doctor/
  SKILL.md                       # Generated — agents read this
  package.json                   # Generated
  scripts/
    run                          # Platform dispatcher (public interface)
  bin/
    repo-doctor-darwin-arm64     # macOS binary
    repo-doctor-linux-x64       # Linux binary
  references/                    # Copied from source (if any)
```

### 4. Use it

The generated `SKILL.md` instructs agents how to invoke the skill. Agents call `scripts/run` via Bash:

```bash
# Start the workflow
scripts/run start --context '{"repoPath":"."}'
# → {"step":"diagnose","prompt":"Inspect the repository...","schema":{...}}

# Advance with agent's response
scripts/run advance --step diagnose --output '{"checks":[...]}' --history '[...]'
# → {"step":"remediate","prompt":"Fix these failing checks...","schema":{...}}

# Continue until done
scripts/run advance --step report --output '{"summary":"..."}' --history '[...]'
# → {"done":true,"finalOutput":{...}}
```

## Repo layout

Source and built skills live in separate directories:

```
my-repo/
  package.json                # @contentful/skill-kit as devDep
  src/skills/                 # Source — where you write TypeScript
    repo-doctor/
      skill.ts
      skill.test.ts
      references/
  skills/                     # Build output — each subdir is an installable skill
    repo-doctor/
      SKILL.md
      package.json
      scripts/run
      bin/...
    some-prose-skill/         # Prose skills coexist
      SKILL.md
```

## API

### Core

| Export                    | Description                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| `skill(config)`           | Define a skill — name, entry step, steps map                                                |
| `step(config)`            | Define a step — prompt, output schema, transition                                           |
| `z`                       | Zod re-export for schema definitions                                                        |
| `fragment(name, content)` | Named reusable prose partial                                                                |
| `` prompt`...` ``         | Tagged template with dedent and fragment interpolation                                      |
| `action(config)`          | CLI-side deterministic effect                                                               |
| `render`                  | Built-in renderers: `.table()`, `.checklist()`, `.diff()`, `.code()`, `.kv()`, `.section()` |

### Primitives (host-aware)

These generate calibrated prose per agent host — naming the right tool on Claude Code, falling back to generic instructions elsewhere.

| Export                              | Description                          |
| ----------------------------------- | ------------------------------------ |
| `askUser({ question, options })`    | Structured multiple-choice question  |
| `confirm({ message, destructive })` | Binary approval with safety defaults |
| `plan({ summary, steps })`          | Show plan, wait for approval         |
| `tasks({ create })`                 | Tracked subtask list                 |
| `subtask({ prompt, output })`       | Spawn isolated sub-agent             |

### Testing (`@contentful/skill-kit/test`)

| Export                                        | Description                                 |
| --------------------------------------------- | ------------------------------------------- |
| `runSkill(skill, { model, context?, host? })` | Run a skill to completion                   |
| `mockModel({ stepName: output })`             | Canned outputs (static, array, or function) |

### CLI

```bash
skill-kit build <entry.ts> -o <dir>    # Build distributable skill directory
skill-kit run <skill.ts> start|advance  # Run skill in dev mode
skill-kit check <skill.ts>              # Lint skill definition
```

## Key concepts

**Steps are the workflow.** Each step has a prompt the agent follows, a Zod schema for its output, and a transition to the next step. The SDK validates outputs and routes between steps — the agent just reads prompts and produces answers.

**Primitives are portable.** `askUser`, `confirm`, `plan` etc. generate different prose depending on the agent host. On Claude Code, `askUser` emits "Use the AskUserQuestion tool..."; on Codex or generic hosts, it falls back to prose instructions. Same skill, every host.

**Single-invocation protocol.** Each call to the binary is stateless. The agent passes full conversation history via `--history` on every `advance` call. The binary reconstructs state and returns one JSON response. No persistent processes.

**Build produces agentskills.io skills.** The output is a standard skill directory with `SKILL.md` at root, executables in `scripts/`, and binaries in `bin/`. Install via `skills add`, `agents-kit install`, or git.

## Reference

See [SPEC.md](./SPEC.md) for the full SDK specification.
