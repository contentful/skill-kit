import test from 'node:test';
import assert from 'node:assert/strict';
import { type } from 'arktype';
import { skill } from './skill.js';
import { action } from './action.js';

test('skill().build() creates a frozen SkillDefinition', () => {
  const s = skill({
    name: 'test-skill',
    entry: 'start',
  })
    .step('start', {
      prompt: 'Do something.',
      response: type({ done: 'boolean' }),
      next: { terminal: true },
    })
    .build();

  assert.equal(s.kind, 'skill');
  assert.equal(s.name, 'test-skill');
  assert.equal(s.version, '0.0.0');
  assert.equal(s.entry, 'start');
  assert.ok(Object.isFrozen(s));
  assert.ok(Object.isFrozen(s.steps));
});

test('skill().build() preserves version and description', () => {
  const s = skill({
    name: 'versioned',
    version: '1.2.3',
    description: 'A test skill',
    entry: 'start',
  })
    .step('start', {
      prompt: 'Go.',
      response: type({ ok: 'boolean' }),
      next: { terminal: true },
    })
    .build();

  assert.equal(s.version, '1.2.3');
  assert.equal(s.description, 'A test skill');
});

test('skill().build() throws on missing name', () => {
  assert.throws(
    () =>
      skill({ name: '', entry: 'start' })
        .step('start', { prompt: 'x', response: type({}), next: { terminal: true } })
        .build(),
    /name is required/,
  );
});

test('skill().build() throws on missing entry', () => {
  assert.throws(
    () =>
      skill({ name: 'x', entry: '' })
        .step('start', { prompt: 'x', response: type({}), next: { terminal: true } })
        .build(),
    /entry is required/,
  );
});

test('skill().build() throws when entry step not found', () => {
  assert.throws(
    () =>
      skill({ name: 'x', entry: 'missing' })
        .step('start', { prompt: 'x', response: type({}), next: { terminal: true } })
        .build(),
    /entry step "missing" not found/,
  );
});

test('skill().build() throws on empty steps', () => {
  assert.throws(() => skill({ name: 'x', entry: 'start' }).build(), /at least one step/);
});

test('params type flows into step prompt callbacks', () => {
  const s = skill({
    name: 'typed',
    entry: 'a',
    params: type({ greeting: 'string' }),
  })
    .step('a', {
      prompt: ({ params }) => {
        const _check: string = params.greeting;
        void _check;
        return 'hi';
      },
      response: type({}),
      next: { terminal: true },
    })
    .build();

  assert.equal(s.kind, 'skill');
});

test('triggers are appended to description', () => {
  const s = skill({
    name: 'triggered',
    description: 'Diagnoses issues',
    triggers: ['debug', 'doctor', 'diagnose'],
    entry: 'start',
  })
    .step('start', {
      prompt: 'Go.',
      response: type({}),
      next: { terminal: true },
    })
    .build();

  assert.equal(s.description, 'Diagnoses issues. Trigger keywords: debug, doctor, diagnose');
});

test('triggers do not double-period when description ends with period', () => {
  const s = skill({
    name: 'dotted',
    description: 'Fixes things.',
    triggers: ['fix', 'repair'],
    entry: 'start',
  })
    .step('start', {
      prompt: 'Go.',
      response: type({}),
      next: { terminal: true },
    })
    .build();

  assert.equal(s.description, 'Fixes things. Trigger keywords: fix, repair');
});

test('triggers without description', () => {
  const s = skill({
    name: 'triggered',
    triggers: ['deploy', 'ship'],
    entry: 'start',
  })
    .step('start', {
      prompt: 'Go.',
      response: type({}),
      next: { terminal: true },
    })
    .build();

  assert.equal(s.description, 'Trigger keywords: deploy, ship');
});

test('empty triggers array does not modify description', () => {
  const s = skill({
    name: 'no-triggers',
    description: 'Just a skill',
    triggers: [],
    entry: 'start',
  })
    .step('start', {
      prompt: 'Go.',
      response: type({}),
      next: { terminal: true },
    })
    .build();

  assert.equal(s.description, 'Just a skill');
});

test('stash type flows into step prompt callbacks', () => {
  const s = skill({
    name: 'stashed',
    entry: 'a',
    stash: type({ name: 'string' }),
  })
    .step('a', {
      prompt: ({ stash }) => {
        const _check: string = stash.name;
        void _check;
        return 'hi';
      },
      response: type({}),
      next: { terminal: true },
    })
    .build();

  assert.equal(s.kind, 'skill');
});

test('.subskill() registers a sub-skill on the definition', () => {
  const child = skill({ name: 'child', entry: 'a' })
    .step('a', { prompt: 'hi', response: type({}), next: { terminal: true } })
    .build();

  const parent = skill({ name: 'parent', entry: 'start' })
    .step('start', { prompt: 'go', response: type({ target: 'string' }), next: 'subskill:child' })
    .subskill('child', child, { params: (output) => ({ from: output }) })
    .build();

  assert.ok(parent.subskills);
  assert.ok(parent.subskills['child']);
  assert.equal(parent.subskills['child'].definition.name, 'child');
  assert.equal(typeof parent.subskills['child'].paramsMap, 'function');
  assert.ok(Object.isFrozen(parent.subskills));
});

test('.subskill() without params mapping', () => {
  const child = skill({ name: 'child', entry: 'a' })
    .step('a', { prompt: 'hi', response: type({}), next: { terminal: true } })
    .build();

  const parent = skill({ name: 'parent', entry: 'start' })
    .step('start', { prompt: 'go', response: type({}), next: 'subskill:child' })
    .subskill('child', child)
    .build();

  assert.equal(parent.subskills!['child']!.paramsMap, undefined);
});

test('.subskill() throws on nested sub-skills', () => {
  const grandchild = skill({ name: 'grandchild', entry: 'a' })
    .step('a', { prompt: 'hi', response: type({}), next: { terminal: true } })
    .build();

  const child = skill({ name: 'child', entry: 'a' })
    .step('a', { prompt: 'hi', response: type({}), next: 'subskill:grandchild' })
    .subskill('grandchild', grandchild)
    .build();

  assert.throws(
    () =>
      skill({ name: 'parent', entry: 'start' })
        .step('start', { prompt: 'go', response: type({}), next: 'subskill:child' })
        .subskill('child', child),
    /cannot be nested/,
  );
});

test('.topic() registers topics on the definition', () => {
  const s = skill({ name: 'with-topics', entry: 'start' })
    .step('start', { prompt: 'go', response: type({}), next: { terminal: true } })
    .topic('faq', { label: 'FAQ', content: () => 'Answer' })
    .build();

  assert.ok(s.topics);
  assert.ok(s.topics['faq']);
  assert.equal(s.topics['faq'].label, 'FAQ');
  assert.equal(s.topics['faq'].content({ refs: { load: () => '', asset: (p: string) => p } }), 'Answer');
  assert.ok(Object.isFrozen(s.topics));
});

test('skill without subskills or topics omits those fields', () => {
  const s = skill({ name: 'plain', entry: 'start' })
    .step('start', { prompt: 'go', response: type({}), next: { terminal: true } })
    .build();

  assert.equal(s.subskills, undefined);
  assert.equal(s.topics, undefined);
});

test('step with incompatible action input schema throws at build time', () => {
  const writeAction = action({
    name: 'write',
    input: type({ path: 'string', content: 'string' }),
    output: type({ ok: 'boolean' }),
    run: async () => ({ ok: true }),
  });

  assert.throws(
    () =>
      skill({ name: 'compat-check', entry: 'draft' })
        .step('draft', {
          prompt: 'Draft',
          response: type({ title: 'string', body: 'string' }),
          action: { run: writeAction },
          next: { terminal: true },
        })
        .build(),
    /missing properties.*(path.*content|content.*path)/,
  );
});

test('step with compatible action input schema does not throw', () => {
  const writeAction = action({
    name: 'write',
    input: type({ path: 'string' }),
    output: type({ ok: 'boolean' }),
    run: async () => ({ ok: true }),
  });

  assert.doesNotThrow(() =>
    skill({ name: 'compat-ok', entry: 'a' })
      .step('a', {
        prompt: 'Go',
        response: type({ path: 'string', extra: 'number' }),
        action: { run: writeAction },
        next: { terminal: true },
      })
      .build(),
  );
});

test('step with action.input mapper skips compat check', () => {
  const writeAction = action({
    name: 'write',
    input: type({ path: 'string' }),
    output: type({ ok: 'boolean' }),
    run: async () => ({ ok: true }),
  });

  assert.doesNotThrow(() =>
    skill({ name: 'mapper-skip', entry: 'a' })
      .step('a', {
        prompt: 'Go',
        response: type({ title: 'string' }),
        action: {
          run: writeAction,
          input: ({ response }) => ({ path: response.title }),
        },
        next: { terminal: true },
      })
      .build(),
  );
});

test('skill().build() preserves frontmatter extension fields', () => {
  const s = skill({
    name: 'frontmatter-test',
    entry: 'start',
    argumentHint: 'hint text',
    arguments: ['issue', 'branch'],
    allowedTools: ['Bash', 'Read'],
    paths: '**/*.ts',
    context: 'fork',
    license: 'MIT',
    compatibility: 'Requires git',
    agent: 'Explore',
    model: 'sonnet',
    effort: 'high',
    disableModelInvocation: true,
    userInvocable: false,
  })
    .step('start', { prompt: 'Go.', response: type({}), next: { terminal: true } })
    .build();

  assert.equal(s.argumentHint, 'hint text');
  assert.deepEqual(s.arguments, ['issue', 'branch']);
  assert.deepEqual(s.allowedTools, ['Bash', 'Read']);
  assert.equal(s.paths, '**/*.ts');
  assert.equal(s.context, 'fork');
  assert.equal(s.license, 'MIT');
  assert.equal(s.compatibility, 'Requires git');
  assert.equal(s.agent, 'Explore');
  assert.equal(s.model, 'sonnet');
  assert.equal(s.effort, 'high');
  assert.equal(s.disableModelInvocation, true);
  assert.equal(s.userInvocable, false);
});

test('skill().build() defaults frontmatter extension fields to undefined', () => {
  const s = skill({ name: 'no-fm', entry: 'start' })
    .step('start', { prompt: 'Go.', response: type({}), next: { terminal: true } })
    .build();

  assert.equal(s.argumentHint, undefined);
  assert.equal(s.arguments, undefined);
  assert.equal(s.allowedTools, undefined);
  assert.equal(s.paths, undefined);
  assert.equal(s.context, undefined);
  assert.equal(s.license, undefined);
  assert.equal(s.compatibility, undefined);
  assert.equal(s.agent, undefined);
  assert.equal(s.model, undefined);
  assert.equal(s.effort, undefined);
  assert.equal(s.disableModelInvocation, undefined);
  assert.equal(s.userInvocable, undefined);
});
