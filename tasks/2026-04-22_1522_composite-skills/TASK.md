# Composite Skills

## Scope

**In:** Extend `SkillDefinition` and `SkillBuilder` to support sub-skills and topics. Add `RedirectResult` to the engine, a composite CLI entry point, build pipeline support, test utilities, example composite skill, SPEC.md updates, docs updates, and any adjustments to existing examples.

**Out:** Migration of third-party skills built on the SDK.

## Context

Customer-facing Contentful skills overlap in references and purpose (e.g. `contentful-doctor`, `contentful-setup`, `contentful-common-mistakes` all reference the same material). Users want a single skill that bundles a shared reference directory, a dispatcher state machine, and multiple independent sub-skill state machines. The dispatcher can short-circuit with a reference topic answer when a full workflow isn't needed.

### Key design decisions (agreed with user)

- **Extend `skill()` directly** — no new `CompositeDefinition` type or builder. Add `.subskill()` and `.topic()` to the existing `SkillBuilder`. A composite is just a skill that happens to have subskills registered.
- **Transition-based routing** — any step's `next` can return `'subskill:doctor'` or `'topic:rate-limits'` to exit the dispatcher and enter a sub-skill or resolve a topic. These are just strings; the engine returns a `RedirectResult` when the target doesn't exist in the local step map.
- **Dispatcher is a full skill** — it can have as many steps as needed (classify, triage, gather context, ask clarifications) before routing. It's not a one-shot classifier.
- **Standalone sub-skills** — sub-skills are regular `skill().build()` definitions imported and registered. They can be developed and tested independently.
- **Explicit context mapping** — each sub-skill registration includes a transform `(stepOutput, stash) → subSkillContext`.
- **No nesting** — enforced at runtime (`.subskill()` throws if the passed definition already has subskills). TypeScript structural typing prevents compile-time enforcement.
- **`scripts/run` is always the single entry point** — hosts grant `scripts/run *` via "Always allow", so all subcommands (sub-skill access, topic lookup) go through `scripts/run`.
- **Not a separate `composite()` builder** — we considered this and rejected it because SkillDefinition already has everything needed. Sub-skills and topics are just optional fields. This avoids a new kind in the Buildable union and keeps the type system simpler.

## Plan

### API Design

#### Builder API (extends `SkillBuilder`)

```typescript
import { skill, z, askUser } from '@contentful/skill-kit';
import doctorSkill from './subskills/doctor.js';
import setupSkill from './subskills/setup.js';

export default skill({
  name: 'contentful-helper',
  version: '1.0.0',
  description: 'Diagnose, configure, and explain Contentful.',
  triggers: ['contentful help', 'contentful doctor', 'contentful setup'],
  entry: 'classify',
  context: z.object({ userQuery: z.string() }),
  stash: z.object({ intent: z.string(), spaceId: z.string().optional() }),
})
  // Dispatcher steps — full state machine, `next` can return step names,
  // 'subskill:<name>', or 'topic:<name>' at any point.

  .step('classify', {
    prompt: ({ context, refs }) => `Classify intent: "${context.userQuery}"`,
    output: z.object({
      intent: z.enum(['doctor', 'setup', 'faq', 'unclear']),
      confidence: z.number(),
      faqTopic: z.string().optional(),
    }),
    stash: ({ output }) => ({ intent: output.intent }),
    next: ({ output }) => {
      if (output.intent === 'faq' && output.faqTopic) return `topic:${output.faqTopic}`;
      if (output.confidence < 0.7) return 'clarify';
      if (output.intent === 'doctor') return 'check-space';
      return `subskill:${output.intent}`;
    },
  })

  .step('clarify', {
    ask: askUser({
      type: 'structured',
      question: 'What would you like help with?',
      options: [
        { value: 'doctor', label: 'Diagnose issues', description: 'Find and fix problems' },
        { value: 'setup', label: 'Set up Contentful', description: 'Configure your space' },
        { value: 'faq', label: 'Quick question', description: 'Look something up' },
      ],
    }),
    output: z.object({ choice: z.string() }),
    stash: ({ output }) => ({ intent: output.choice }),
    next: ({ output }) => {
      if (output.choice === 'faq') return 'ask-topic';
      if (output.choice === 'doctor') return 'check-space';
      return `subskill:${output.choice}`;
    },
  })

  .step('check-space', {
    prompt: 'Ask the user for their Contentful space ID.',
    output: z.object({ spaceId: z.string() }),
    stash: ({ output }) => ({ spaceId: output.spaceId }),
    next: 'subskill:doctor',
  })

  .step('ask-topic', {
    ask: askUser({ type: 'open', question: 'What would you like to know about?' }),
    output: z.object({ topicName: z.string() }),
    next: ({ output }) => `topic:${output.topicName}`,
  })

  // Reference topics — accessible from prompts via refs, also as exit targets
  .topic('rate-limits', {
    label: 'Rate limiting reference',
    content: ({ refs }) => refs.load('rate-limits.md'),
  })

  // Sub-skills — standalone SkillDefinitions with explicit context mapping
  .subskill('doctor', doctorSkill, {
    context: (_output, stash) => ({ spaceId: stash.spaceId }),
  })
  .subskill('setup', setupSkill, {
    context: (_output, stash) => ({ mode: 'guided' }),
  })

  .build();
```

#### New types (`src/types.ts`)

```typescript
interface SubskillRegistration {
  readonly definition: SkillDefinition;
  readonly contextMap?: (stepOutput: unknown, stash: unknown) => unknown;
}

interface RedirectResult {
  redirect: string; // e.g. 'subskill:doctor', 'topic:rate-limits'
  completed: StepResult; // the step that produced the redirect
  stash: unknown; // dispatcher's accumulated stash
}
```

`SkillDefinition` gains two optional fields:

```typescript
readonly subskills?: Readonly<Record<string, SubskillRegistration>>;
readonly topics?: Readonly<Record<string, TopicConfig>>;  // TopicConfig already exists
```

`CliResult` union gains `RedirectResult`.

No new `Buildable` kind — still `kind: 'skill'`. Build pipeline checks `def.subskills` presence.

#### Engine change (`src/runtime/engine.ts`)

In `advance()`, after `resolveNext` returns a target string, check if it exists in `this.skill.steps`. If not, return `RedirectResult` instead of calling `buildPrompt` (which would throw):

```typescript
if (!this.skill.steps[nextStep]) {
  return { redirect: nextStep, completed, stash: this.stash.all() };
}
```

Backwards-compatible: existing skills never produce unresolvable step names.

#### CLI protocol

`scripts/run` is always the entry point. Arg parsing dispatches:

```bash
# Dispatcher flow
scripts/run --context '{"userQuery":"my types are broken"}'
scripts/run advance --step classify --output '{...}' --history '[...]'
scripts/run advance --step doctor/diagnose --output '{...}' --history '[...]'

# Direct sub-skill access (bypass dispatcher)
scripts/run doctor --context '{"spaceId":"abc123"}'
scripts/run doctor advance --step diagnose --output '{...}' --history '[...]'

# Reference topics
scripts/run topics
scripts/run topic rate-limits
```

Arg parsing logic: `argv[2]` — if known sub-skill name → sub-skill mode; if `topics`/`topic` → reference mode; if `advance` → dispatcher advance; if `--*` or absent → dispatcher start (implicit default).

#### Step name namespacing

- Dispatcher steps: no prefix (`classify`, `check-space`)
- Sub-skill steps: prefixed `subskillName/` (`doctor/diagnose`)
- Prefixing/unprefixing at the composite entry layer — engines never see prefixes
- History for a sub-skill engine is filtered to that sub-skill's entries (unprefixed)

#### Redirect handling in composite entry

When engine `advance` returns `RedirectResult`:

- `subskill:X` → look up registration, call `contextMap(completed.output, stash)`, create sub-skill engine, `start()`, return `PromptResult` with prefixed step name
- `topic:X` → look up topic, load content via `ReferenceLoader`, return `DoneResult` with content

### Implementation phases

1. Types & engine — `src/types.ts`, `src/runtime/engine.ts`
2. Builder — `.subskill()` and `.topic()` on `SkillBuilder` (`src/skill-builder.ts`, `src/index.ts`)
3. Composite entry point — `src/protocol/composite-entry.ts`, `src/cli.ts`
4. Build pipeline — detect subskills in `src/build/index.ts`, wrapper templates, SKILL.md generation
5. Test utilities — `runComposite()` in `src/test.ts`
6. Lint — extend `checkSkill` in `src/lint/index.ts`
7. Example composite skill — `examples/composite-help/`
8. SPEC.md and docs — `SPEC.md`, `docs/api.md`, `docs/architecture.md`, `docs-site/`

## Steps

- [ ] Phase 1: Types & Engine (`src/types.ts`, `src/runtime/engine.ts`)
- [ ] Phase 2: Builder Extensions (`src/skill-builder.ts`, `src/index.ts`)
- [ ] Phase 3: Composite Entry Point (`src/protocol/composite-entry.ts`, `src/cli.ts`)
- [ ] Phase 4: Build Pipeline (`src/build/`)
- [ ] Phase 5: Test Utilities (`src/test.ts`)
- [ ] Phase 6: Lint (`src/lint/index.ts`)
- [ ] Phase 7: Example composite skill (`examples/`)
- [ ] Phase 8: SPEC.md and docs updates

## Notes

- Considered a separate `composite()` builder with its own `CompositeDefinition` type. Rejected because SkillDefinition already has the right shape — subskills and topics are just optional fields. Avoids a third `Buildable` kind.
- Considered compile-time nesting prevention via a `LeafSkillDefinition` type. Rejected because TypeScript structural typing means the extra `subskills` property wouldn't cause a type error. Runtime check in `.subskill()` is the pragmatic alternative.
- Considered terminal-only dispatch (dispatcher must fully complete before sub-skill starts). Rejected because the dispatcher needs to be a full state machine that can gather context, ask clarifications, and route from any step — not just the final one.
- Considered `finalOutput` interpretation for routing (dispatcher terminates, composite entry reads the output to decide routing). Rejected in favor of `next`-based routing because it's more natural — routing is a transition, not a side effect of termination.
