# State System — API Design Reference

This document captures the target developer-facing API for the state system redesign. It is the specification that the implementation follows. The TASK.md has the scope, plan, and checklist; this document has the concrete types and examples.

---

## The step DSL — before and after

### Current step lifecycle

```
prompt → agent → validate(output) → action.input → action.run → action.updateStash → updateStash → next
```

### New step lifecycle

```
prompt → agent → validate(response) → action.input → action.run → result → store.append → next
```

Key changes:

- `output` → `response` (agent contract)
- `action.updateStash` and `updateStash` → gone, replaced by `result`
- `result` computes the step's contribution to the store
- `store.append` is automatic — no developer code needed

### Current StepConfig

```typescript
interface StepConfig<TOutput, TParams, TStash, TActionOutput, TSteps> {
  prompt?: string | PromptPiece | PromptPiece[] | PromptFn<TParams, TStash, TSteps>;
  output?: TOutput;
  action?: {
    run: ActionDefinition;
    input?: (ctx: { stepOutput; stash; params }) => unknown;
    updateStash?: (ctx: { actionOutput }) => Partial<TStash>;
  };
  updateStash?: (ctx: { stepOutput; actionOutput; stash; params }) => Partial<TStash>;
  next: string | TransitionFn | { terminal: true };
  maxVisits?: number;
  onMaxVisits?: string;
}
```

### New StepConfig

```typescript
interface StepConfig<TResponse, TParams, TActionResult, TSteps, TResult> {
  prompt?: string | PromptPiece | PromptPiece[] | PromptFn<TParams, TSteps>;
  response?: TResponse;
  action?: {
    run: ActionDefinition;
    input?: (ctx: { response; store; params }) => unknown;
  };
  result?: (ctx: { response; actionResult }) => TResult;
  next: string | NextBranch[] | { terminal: true };
  maxVisits?: number;
  onMaxVisits?: string;
}
```

Removed: `updateStash`, `action.updateStash`, `TStash`.
Added: `result`, `NextBranch[]`.
Renamed: `output` → `response`, `stepOutput` → `response`, `actionOutput` → `actionResult`.

---

## Naming — the full picture

### Why `response`

`prompt` and `response` are a natural pair. "You prompt the agent, this is the response shape."

The word `output` was overloaded — it meant both the agent contract and the step's contribution to state. These are different things when actions are involved.

`response` clearly means "what the agent gives back." It appears as both the schema name and the callback parameter name:

```typescript
.step('greet', {
  prompt: 'Ask their name.',
  response: type({ name: 'string' }),     // schema
  next: ({ response }) => ...,             // parsed value
})
```

### Why `result`

`result` is what the step actually produces — its contribution to state. It may be derived from the response, the action result, or a transformation of both:

```typescript
.step('check-links', {
  response: type({ links: 'string[]' }),
  action: { run: checkLinks, input: ({ response }) => ({ urls: response.links }) },
  result: ({ response, actionResult }) => ({
    totalLinks: response.links.length,
    broken: actionResult.statuses.filter(s => !s.ok),
  }),
})
```

### Why `actionResult` (not `actionOutput`)

Consistency with `result`. The action produces a result, not an output. The response is to the prompt; the result is of the step/action.

### Full naming table

| Concept                             | Old                                                  | New                       |
| ----------------------------------- | ---------------------------------------------------- | ------------------------- |
| Agent contract schema               | `output`                                             | `response`                |
| Agent contract value (in callbacks) | `stepOutput`                                         | `response`                |
| Action return value (in callbacks)  | `actionOutput`                                       | `actionResult`            |
| Step's contribution to state        | split across `updateStash` + `stepOutput` in history | `result`                  |
| Cross-step state read               | `stash` / `getStep` / `history`                      | `store`                   |
| Cross-step state write              | `updateStash`                                        | automatic (from `result`) |
| Skill external input                | `params`                                             | `params` (unchanged)      |
| Branching transition                | `next: (ctx) => string`                              | `next: [{ to, when }]`    |

---

## Result inference rules

The step result — what gets stored — is inferred automatically in most cases:

### Case 1: Response only (no action, no explicit result)

```typescript
.step('greet', {
  prompt: 'Ask their name.',
  response: type({ name: 'string' }),
  next: 'ask-role',
})
// Step result type: { name: string }
// Stored as: store.greet = { name: 'Alice' }
```

### Case 2: Response + action (no explicit result)

```typescript
.step('check-links', {
  prompt: 'Find all external links.',
  response: type({ links: 'string[]' }),
  action: {
    run: checkLinks,  // action output: type({ statuses: StatusResult[] })
    input: ({ response }) => ({ urls: response.links }),
  },
  next: 'report',
})
// Step result type: { statuses: StatusResult[] }  (from action output schema)
// Stored as: store['check-links'] = { statuses: [...] }
```

### Case 3: Explicit result

```typescript
.step('check-links', {
  response: type({ links: 'string[]' }),
  action: { run: checkLinks, input: ({ response }) => ({ urls: response.links }) },
  result: ({ response, actionResult }) => ({
    totalLinks: response.links.length,
    broken: actionResult.statuses.filter(s => !s.ok),
  }),
  next: 'report',
})
// Step result type: { totalLinks: number, broken: StatusResult[] }  (inferred from return)
// Stored as: store['check-links'] = { totalLinks: 42, broken: [...] }
```

### Case 4: Action only (no response, e.g. promptless step)

```typescript
.step('gather-config', {
  action: { run: readEnvVars },
  next: 'run-diagnostics',
})
// Step result type: action output type
// Stored as: store['gather-config'] = { aHost: '...', aKey: '...', ... }
```

### Case 5: No response, no action (pure routing gate)

```typescript
.step('check-count', {
  next: [
    { to: 'remediate', when: ({ store }) => store['diagnose'].failCount > 0 },
    { to: 'report' },
  ],
})
// Step result type: {} (empty)
// Nothing meaningful stored
```

---

## Branching — declarative `next`

### Three forms

```typescript
// 1. Static string — single target
next: 'ask-role',

// 2. Terminal
next: { terminal: true },

// 3. Branching — ordered tagged entries
next: [
  { to: 'ask-stack', when: ({ response }) => response.role === 'dev' },
  { to: 'ask-tools', when: ({ response }) => response.role === 'designer' },
  { to: 'ask-team-size', when: ({ response }) => response.role === 'manager' },
  { to: 'ask-specialty' },  // default — no `when`
],
```

### NextBranch type

```typescript
interface NextBranch<TResponse = unknown, TActionResult = unknown, TParams = unknown, TStore = unknown> {
  to: string;
  when?: (ctx: {
    response: TResponse;
    actionResult: TActionResult;
    params: Readonly<TParams>;
    store: TStore;
    attempts: number;
  }) => boolean;
}
```

### Semantics

- Array order is deterministic (not object key order).
- Evaluated top-to-bottom. First entry whose `when` returns `true` wins.
- Entry without `when` is the unconditional default. Must be last.
- All `to` values are string literals, extractable by the builder for DAG analysis.
- `'self'` as a `to` value loops back to the current step.

### Why not keep `next` as a function?

An opaque function `(ctx) => string` hides the target step names from the builder. The builder needs those names to compute the DAG — which steps are reachable from which, what's guaranteed vs optional.

The tagged entry form gives us:

- Static target extraction for the DAG
- Deterministic evaluation order
- Self-documenting structure (IDE shows `{ to: string, when?: ... }`)
- Pattern-match readability

---

## Store accessor API

### Available in all contexts

`store` is available in `prompt`, `next`, and `action.input` — everywhere state is read.

### Step-keyed access

When no explicit `store` schema is declared on the skill, step results are keyed by step name:

```typescript
// Direct access — guaranteed predecessor (non-optional)
store.greet; // { name: string }
store.greet.name; // string

// Optional access — step may not have run
store.maybe('ask-stack'); // { answer: string } | undefined
store.maybe('ask-stack')?.answer; // string | undefined

// Loop access — step visited multiple times
store.all('ask-hobby'); // Array<{ hobby: string, wantsMore: boolean }>
store.all('ask-hobby').map((v) => v.hobby); // string[]

// Escape hatch — raw history
store.history; // readonly StepRecord[]
```

### Type narrowing

The builder computes from the DAG which steps are guaranteed predecessors of each step:

- **Guaranteed** (on ALL paths to this step): direct property access is non-optional
- **Optional** (on SOME paths): must use `store.maybe()`, returns `T | undefined`

If DAG analysis fails (e.g., a complex graph exceeds TypeScript recursion), the fallback is `reads`:

```typescript
.step('profile-card', {
  reads: ['greet', 'ask-role'] as const,  // explicit guarantee assertion
  prompt: ({ store }) => {
    store.greet.name;           // string (non-optional, validated at runtime)
    store.maybe('ask-stack');   // still available for optional access
  },
})
```

`reads` is validated at runtime — if a declared step hasn't run, the engine throws before the prompt function executes.

---

## Complete example: get-to-know-you (new API)

```typescript
import { skill, step, type, action, prompt, render, act, view } from '@contentful/skill-kit';

const ProfileSchema = type({
  name: 'string',
  role: 'string',
  specialty: 'string',
  hobbies: 'string[]',
  funFact: 'string',
});

const writeProfile = action({
  name: 'write-profile',
  input: type({ profile: ProfileSchema }),
  output: type({ path: 'string' }),
  run: async ({ input }) => {
    const path = `/tmp/profile-${Date.now()}.json`;
    process.stderr.write(`[get-to-know-you] Would write profile to ${path}\n`);
    void input;
    return { path };
  },
});

const openQuestionStep = step({
  response: type({ answer: 'string' }),
  next: '__parent__',
});

export default skill({
  name: 'get-to-know-you',
  version: '2.0.0',
  description: 'A playful interview that gets to know the user and produces a profile trading card.',
  triggers: ['introduce myself', 'trading card', 'get to know me', 'ice breaker'],
  argumentHint: '[name]',
  entry: 'greet',
  system: "Keep it light and fun. Use casual language. You're a friendly interviewer, not a form.",

  params: type({
    greeting: 'string = "Hey there!"',
  }),

  finalOutput: type({
    card: 'string',
    profile: ProfileSchema,
  }),
})
  .step('greet', {
    prompt: ({ params }) => prompt`
      ${params.greeting} You're about to interview the user to build their developer trading card.
      Start by asking their name. Be warm and enthusiastic — first impressions matter!
    `,
    response: type({ name: 'string' }),
    next: 'ask-role',
  })

  .step('ask-role', {
    prompt: act.askUser({
      type: 'structured',
      question: "What's your primary role?",
      options: [
        { value: 'dev', label: 'Developer', description: 'I write code for a living' },
        { value: 'designer', label: 'Designer', description: 'I make things pretty and usable' },
        { value: 'manager', label: 'Manager', description: 'I herd cats professionally' },
        { value: 'other', label: 'Something else', description: 'I defy your categories' },
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

  .extend('ask-stack', openQuestionStep, {
    prompt: ({ store }) => [
      prompt`
        ${store.greet.name} is a developer — nice!
        Ask what their go-to tech stack is.
      `,
      act.askUser({ type: 'open', question: "What's your go-to tech stack?" }),
    ],
    next: 'ask-hobby',
  })

  .extend('ask-tools', openQuestionStep, {
    prompt: [
      'A designer! Ask what tools they live in. Figma? Sketch? CSS-in-the-raw?',
      act.askUser({ type: 'open', question: 'What design tools do you live in?' }),
    ],
    next: 'ask-hobby',
  })

  .extend('ask-team-size', openQuestionStep, {
    prompt: [
      'A manager! Ask about their team — how big, what they work on.',
      act.askUser({ type: 'open', question: 'Tell me about your team.' }),
    ],
    next: 'ask-hobby',
  })

  .extend('ask-specialty', openQuestionStep, {
    prompt: [
      'Someone who defies categories — intriguing. Dare them to describe what they do in one sentence.',
      act.askUser({ type: 'open', question: 'Describe what you do in one sentence.' }),
    ],
    next: 'ask-hobby',
  })

  .step('ask-hobby', {
    prompt: ({ attempts }) => [
      attempts === 0
        ? 'Now for the important stuff. Ask about hobbies, side projects, or weird talents.'
        : 'Ask if they have another hobby they want on their card, or if they are done.',
      act.askUser({ type: 'open', question: 'What are your hobbies or side projects?' }),
    ],
    response: type({ hobby: 'string', wantsMore: 'boolean' }),
    maxVisits: 2,
    onMaxVisits: 'confirm-profile',
    next: [{ to: 'ask-hobby', when: ({ response }) => response.wantsMore }, { to: 'confirm-profile' }],
  })

  .step('confirm-profile', {
    prompt: act.confirm({
      message: 'Got enough for a great trading card! Ready to see it, or want to add one more hobby?',
      defaultAnswer: 'yes',
    }),
    response: type({ approved: 'boolean' }),
    next: [{ to: 'profile-card', when: ({ response }) => response.approved }, { to: 'ask-hobby' }],
    maxVisits: 3,
    onMaxVisits: 'profile-card',
  })

  .step('profile-card', {
    prompt: ({ store, refs }) => {
      // DAG guarantees: greet and ask-role are on all paths to profile-card
      const name = store.greet.name;
      const role = store['ask-role'].role;

      // Branching: exactly one of these ran
      const specialty =
        store.maybe('ask-stack')?.answer ??
        store.maybe('ask-tools')?.answer ??
        store.maybe('ask-team-size')?.answer ??
        store.maybe('ask-specialty')?.answer ??
        'Classified';

      // Loop: all visits to ask-hobby
      const hobbies = store.all('ask-hobby').map((v) => v.hobby);

      let funFact = '';
      try {
        const facts = refs.load('fun-facts.md');
        const lines = facts.split('\n').filter((l) => l.startsWith('- '));
        funFact = lines[Math.floor(Math.random() * lines.length)] ?? '';
        funFact = funFact.replace(/^- /, '');
      } catch {
        funFact = 'Fun facts are overrated anyway.';
      }

      const roleLabels: Record<string, string> = {
        dev: 'Developer',
        designer: 'Designer',
        manager: 'Manager',
        other: 'Wildcard',
      };

      const stats = render.kv({
        Name: name,
        Role: roleLabels[role] ?? role,
        Specialty: specialty,
      });

      const hobbyList = render.checklist(hobbies.map((h) => ({ text: h, done: true })));

      const card = [
        render.section(`${name}'s Trading Card`, stats),
        '',
        render.section('Hobbies & Interests', hobbyList || '(none listed)'),
        '',
        `> *${funFact}*`,
      ].join('\n');

      return [view(card), 'Present the rendered trading card verbatim.'];
    },
    response: type({
      card: 'string',
      profile: ProfileSchema,
    }),
    action: { run: writeProfile },
    next: { terminal: true },
  })

  .build();
```

---

## ArkType equivalence table

Quick reference for the migration:

| Zod                                 | ArkType                                                 |
| ----------------------------------- | ------------------------------------------------------- |
| `z.object({ name: z.string() })`    | `type({ name: 'string' })`                              |
| `z.string()`                        | `type('string')` or `'string'` in objects               |
| `z.number()`                        | `type('number')` or `'number'` in objects               |
| `z.boolean()`                       | `type('boolean')` or `'boolean'` in objects             |
| `z.array(z.string())`               | `type('string[]')`                                      |
| `z.enum(['a', 'b'])`                | `type("'a' \| 'b'")`                                    |
| `z.string().optional()`             | `'string?'` in objects, or `"string \| undefined"`      |
| `z.string().default('hi')`          | `'string = "hi"'`                                       |
| `z.union([z.string(), z.number()])` | `type('string \| number')`                              |
| `z.record(z.string(), z.unknown())` | `type('Record<string, unknown>')`                       |
| `z.infer<typeof schema>`            | `typeof schema.infer`                                   |
| `schema.safeParse(data)`            | `const result = schema(data)` (returns value or throws) |
| `schema.parse(data)`                | `schema.assert(data)` or `schema(data)`                 |
| `schema.toJSONSchema()`             | `schema.toJsonSchema()`                                 |
| `z.ZodType` (generic bound)         | `Type` from arktype                                     |
