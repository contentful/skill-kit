import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { generateBunWrapper } from './bun-wrapper-template.js';
import { generateNodeWrapper } from './node-wrapper-template.js';
import { generateScriptsRun } from './scripts-run-template.js';
import { generateNodeScriptsRun } from './node-scripts-run-template.js';
import { generateSkillMd } from './skillmd-template.js';
import { generateReferenceMd } from './reference-md-template.js';
import { generatePackageJson } from './package-json-template.js';
import { resolveTargets } from './targets.js';
import { skill } from '../skill.js';
import { reference } from '../reference.js';

test('generateBunWrapper produces valid import for skill', () => {
  const result = generateBunWrapper('/abs/path/skill.ts', 'skill');
  assert.ok(result.includes("import def from '/abs/path/skill.ts'"));
  assert.ok(result.includes('import { main }'));
  assert.ok(result.includes('main(def)'));
});

test('generateBunWrapper produces valid import for reference', () => {
  const result = generateBunWrapper('/abs/path/ref.ts', 'reference');
  assert.ok(result.includes("import def from '/abs/path/ref.ts'"));
  assert.ok(result.includes('import { referenceMain }'));
  assert.ok(result.includes('referenceMain(def)'));
});

test('generateScriptsRun produces valid bash dispatcher', () => {
  const result = generateScriptsRun('repo-doctor');
  assert.ok(result.startsWith('#!/usr/bin/env bash'));
  assert.ok(result.includes('set -euo pipefail'));
  assert.ok(result.includes('repo-doctor-${OS}-${ARCH}'));
  assert.ok(result.includes('exec "$BIN" "$@"'));
  assert.ok(result.includes('uname -s'));
  assert.ok(result.includes('uname -m'));
});

test('generateSkillMd produces valid frontmatter and invocation instructions', () => {
  const s = skill({
    name: 'test-skill',
    version: '1.0.0',
    description: 'A test skill for unit testing.',
    entry: 'start',
  })
    .step('start', {
      prompt: 'Begin the process.',
      output: z.object({ done: z.boolean() }),
      next: { terminal: true },
    })
    .build();

  const result = generateSkillMd(s);

  assert.ok(result.startsWith('---\nname: test-skill'));
  assert.ok(result.includes('description: "A test skill for unit testing."'));
  assert.ok(result.includes('version: "1.0.0"'));
  assert.ok(result.includes('scripts/run --params'));
  assert.ok(result.includes('scripts/run advance'));
  assert.ok(result.includes('"type":"done"'));
  assert.ok(result.includes('**start**: Begin the process.'));
});

test('generateSkillMd uses empty description when none provided', () => {
  const s = skill({ name: 'minimal', entry: 'a' })
    .step('a', { prompt: 'Go.', output: z.object({}), next: { terminal: true } })
    .build();

  const result = generateSkillMd(s);
  assert.ok(result.includes('description: ""'));
});

test('generateSkillMd double-quotes YAML description content', () => {
  const s = skill({
    name: 'quoted',
    description: 'Trigger keywords: debug, fix and "repair".',
    entry: 'start',
  })
    .step('start', {
      prompt: 'Begin.',
      output: z.object({ done: z.boolean() }),
      next: { terminal: true },
    })
    .build();

  const result = generateSkillMd(s);
  assert.ok(result.includes('description: "Trigger keywords: debug, fix and \\\"repair\\\"."'));
});

test('generateSkillMd emits argument-hint in frontmatter', () => {
  const s = skill({ name: 'hinted', entry: 'a', argumentHint: 'Describe the issue to diagnose' })
    .step('a', { prompt: 'Go.', output: z.object({}), next: { terminal: true } })
    .build();

  const result = generateSkillMd(s);
  assert.ok(result.includes('argument-hint: "Describe the issue to diagnose"'));
});

test('generateSkillMd emits allowed-tools as string in frontmatter', () => {
  const s = skill({ name: 'tools-str', entry: 'a', allowedTools: 'Bash Read Write' })
    .step('a', { prompt: 'Go.', output: z.object({}), next: { terminal: true } })
    .build();

  const result = generateSkillMd(s);
  assert.ok(result.includes('allowed-tools: "Bash Read Write"'));
});

test('generateSkillMd emits allowed-tools as YAML list in frontmatter', () => {
  const s = skill({ name: 'tools-arr', entry: 'a', allowedTools: ['Bash', 'Read', 'Write'] })
    .step('a', { prompt: 'Go.', output: z.object({}), next: { terminal: true } })
    .build();

  const result = generateSkillMd(s);
  assert.ok(result.includes('allowed-tools:\n  - "Bash"\n  - "Read"\n  - "Write"'));
});

test('generateSkillMd emits paths as string in frontmatter', () => {
  const s = skill({ name: 'paths-str', entry: 'a', paths: '**/*.config.ts' })
    .step('a', { prompt: 'Go.', output: z.object({}), next: { terminal: true } })
    .build();

  const result = generateSkillMd(s);
  assert.ok(result.includes('paths: "**/*.config.ts"'));
});

test('generateSkillMd emits paths as YAML list in frontmatter', () => {
  const s = skill({ name: 'paths-arr', entry: 'a', paths: ['src/**/*.ts', 'tests/**/*.test.ts'] })
    .step('a', { prompt: 'Go.', output: z.object({}), next: { terminal: true } })
    .build();

  const result = generateSkillMd(s);
  assert.ok(result.includes('paths:\n  - "src/**/*.ts"\n  - "tests/**/*.test.ts"'));
});

test('generateSkillMd emits context in frontmatter', () => {
  const s = skill({ name: 'forked', entry: 'a', context: 'fork' })
    .step('a', { prompt: 'Go.', output: z.object({}), next: { terminal: true } })
    .build();

  const result = generateSkillMd(s);
  assert.ok(result.includes('context: "fork"'));
});

test('generateSkillMd omits frontmatter extension fields when not set', () => {
  const s = skill({ name: 'minimal', entry: 'a' })
    .step('a', { prompt: 'Go.', output: z.object({}), next: { terminal: true } })
    .build();

  const result = generateSkillMd(s);
  const frontmatter = result.split('---')[1]!;
  assert.ok(!frontmatter.includes('argument-hint'));
  assert.ok(!frontmatter.includes('allowed-tools'));
  assert.ok(!frontmatter.includes('paths'));
  assert.ok(!frontmatter.includes('context'));
});

test('generateSkillMd emits all frontmatter extension fields together', () => {
  const s = skill({
    name: 'full',
    version: '2.0.0',
    description: 'Full featured skill.',
    entry: 'a',
    argumentHint: 'What to check',
    allowedTools: ['Bash', 'Read'],
    paths: ['*.config.ts'],
    context: 'fork',
  })
    .step('a', { prompt: 'Go.', output: z.object({}), next: { terminal: true } })
    .build();

  const result = generateSkillMd(s);
  assert.ok(result.includes('argument-hint: "What to check"'));
  assert.ok(result.includes('allowed-tools:\n  - "Bash"\n  - "Read"'));
  assert.ok(result.includes('paths:\n  - "*.config.ts"'));
  assert.ok(result.includes('context: "fork"'));
  assert.ok(result.includes('version: "2.0.0"'));
});

test('generateReferenceMd double-quotes YAML description content', () => {
  const ref = reference({
    name: 'docs-ref',
    description: 'Reference topics: setup and "debug".',
  })
    .topic('setup', { label: 'Setup', content: () => 'Use setup docs.' })
    .build();

  const result = generateReferenceMd(ref);
  assert.ok(result.includes('description: "Reference topics: setup and \\\"debug\\\"."'));
});

test('generateSkillMd with protocol=session omits stateless instructions', () => {
  const s = skill({ name: 'test', entry: 'a' })
    .step('a', { prompt: 'Go.', output: z.object({}), next: { terminal: true } })
    .build();

  const result = generateSkillMd(s, 'session');
  assert.ok(result.includes('--session new'));
  assert.ok(!result.includes('--history'));
});

test('generateSkillMd with protocol=stateless omits session instructions', () => {
  const s = skill({ name: 'test', entry: 'a' })
    .step('a', { prompt: 'Go.', output: z.object({}), next: { terminal: true } })
    .build();

  const result = generateSkillMd(s, 'stateless');
  assert.ok(result.includes('--history'));
  assert.ok(!result.includes('--session new'));
});

test('generateSkillMd default protocol is session', () => {
  const s = skill({ name: 'test', entry: 'a' })
    .step('a', { prompt: 'Go.', output: z.object({}), next: { terminal: true } })
    .build();

  const result = generateSkillMd(s);
  assert.ok(result.includes('--session new'));
  assert.ok(!result.includes('--history'));
});

test('generatePackageJson produces valid JSON with name and version', () => {
  const result = generatePackageJson('2.0.0', { name: 'my-skill' });
  const parsed = JSON.parse(result);
  assert.equal(parsed.name, 'my-skill');
  assert.equal(parsed.version, '2.0.0');
});

test('generatePackageJson writes packageConfig fields', () => {
  const result = generatePackageJson('1.0.0', {
    name: 'my-skill',
    packageConfig: { description: 'A skill', license: 'Apache-2.0', files: ['bin'] },
  });
  const parsed = JSON.parse(result);
  assert.equal(parsed.description, 'A skill');
  assert.equal(parsed.license, 'Apache-2.0');
  assert.deepEqual(parsed.files, ['bin']);
});

test('generatePackageJson packageConfig.name overrides default name', () => {
  const result = generatePackageJson('1.0.0', {
    name: 'my-skill',
    packageConfig: { name: '@org/my-skill' },
  });
  const parsed = JSON.parse(result);
  assert.equal(parsed.name, '@org/my-skill');
});

test('generatePackageJson passes through arbitrary fields from packageConfig', () => {
  const result = generatePackageJson('1.0.0', {
    name: 'my-skill',
    packageConfig: { repository: { type: 'git', url: 'https://example.com' }, keywords: ['skill'] },
  });
  const parsed = JSON.parse(result);
  assert.deepEqual(parsed.repository, { type: 'git', url: 'https://example.com' });
  assert.deepEqual(parsed.keywords, ['skill']);
});

test('generatePackageJson merges with existing package.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pkg-merge-'));
  try {
    const existingPath = join(dir, 'package.json');
    writeFileSync(existingPath, JSON.stringify({ name: 'old', version: '0.0.1', customField: true }));
    const result = generatePackageJson('1.0.0', { name: 'new-name', existingPath });
    const parsed = JSON.parse(result);
    assert.equal(parsed.name, 'new-name');
    assert.equal(parsed.version, '1.0.0');
    assert.equal(parsed.customField, true);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('generatePackageJson merge prefers packageConfig over existing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pkg-merge-'));
  try {
    const existingPath = join(dir, 'package.json');
    writeFileSync(existingPath, JSON.stringify({ name: 'old', version: '0.0.1', license: 'ISC' }));
    const result = generatePackageJson('1.0.0', {
      name: 'my-skill',
      packageConfig: { license: 'MIT' },
      existingPath,
    });
    const parsed = JSON.parse(result);
    assert.equal(parsed.license, 'MIT');
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('resolveTargets returns defaults when no args', () => {
  const targets = resolveTargets();
  assert.equal(targets.length, 2);
  assert.equal(targets[0]!.name, 'darwin-arm64');
  assert.equal(targets[1]!.name, 'linux-x64');
});

test('resolveTargets resolves custom targets', () => {
  const targets = resolveTargets(['linux-arm64', 'darwin-x64']);
  assert.equal(targets.length, 2);
  assert.equal(targets[0]!.name, 'linux-arm64');
  assert.equal(targets[1]!.name, 'darwin-x64');
});

test('resolveTargets throws on unknown target', () => {
  assert.throws(() => resolveTargets(['windows-x64']), /Unknown build target/);
});

test('generateNodeWrapper produces valid import for skill', () => {
  const result = generateNodeWrapper('/abs/path/skill.ts', 'skill');
  assert.ok(result.includes("import def from '/abs/path/skill.ts'"));
  assert.ok(result.includes('import { main }'));
  assert.ok(result.includes('main(def)'));
});

test('generateNodeWrapper produces valid import for reference with SKILL_DIR', () => {
  const result = generateNodeWrapper('/abs/path/ref.ts', 'reference');
  assert.ok(result.includes("import def from '/abs/path/ref.ts'"));
  assert.ok(result.includes('import { referenceMain }'));
  assert.ok(result.includes('process.env.SKILL_DIR'));
});

test('generateBunWrapper produces compositeMain for skill with subskills', () => {
  const result = generateBunWrapper('/abs/path/skill.ts', 'skill', true);
  assert.ok(result.includes('import { compositeMain }'));
  assert.ok(result.includes('compositeMain(def)'));
});

test('generateNodeWrapper produces compositeMain for skill with subskills', () => {
  const result = generateNodeWrapper('/abs/path/skill.ts', 'skill', true);
  assert.ok(result.includes('import { compositeMain }'));
  assert.ok(result.includes('compositeMain(def, process.env.SKILL_DIR)'));
});

test('generateSkillMd includes sub-skills and topics sections', () => {
  const child = skill({ name: 'doctor', description: 'Diagnose issues.', entry: 'a' })
    .step('a', { prompt: 'Go.', output: z.object({}), next: { terminal: true } })
    .build();

  const s = skill({ name: 'composite', entry: 'start' })
    .step('start', { prompt: 'Classify.', output: z.object({}), next: 'subskill:doctor' })
    .subskill('doctor', child)
    .topic('faq', { label: 'Frequently asked questions', content: () => 'FAQ content' })
    .build();

  const result = generateSkillMd(s);
  assert.ok(result.includes('## Sub-skills'));
  assert.ok(result.includes('**doctor**: Diagnose issues.'));
  assert.ok(result.includes('## Reference topics'));
  assert.ok(result.includes('**faq**: Frequently asked questions'));
  assert.ok(result.includes('scripts/run topics'));
  assert.ok(result.includes('scripts/run topic <name>'));
});

test('generateSkillMd documents params with defaults', () => {
  const s = skill({
    name: 'greeter',
    entry: 'greet',
    params: z.object({
      greeting: z.string().default('Hey there!'),
    }),
  })
    .step('greet', { prompt: 'Go.', output: z.object({}), next: { terminal: true } })
    .build();

  const result = generateSkillMd(s);
  assert.ok(result.includes('## Parameters'));
  assert.ok(result.includes('| `greeting` | string | No | `"Hey there!"` |'));
  assert.ok(result.includes('All parameters have defaults'));
  assert.ok(result.includes("--params '{}'"));
});

test('generateSkillMd documents required params and uses them in start example', () => {
  const s = skill({
    name: 'doctor',
    entry: 'diagnose',
    params: z.object({
      repoPath: z.string(),
      strictness: z.enum(['lenient', 'normal', 'strict']).default('normal'),
    }),
  })
    .step('diagnose', { prompt: 'Go.', output: z.object({}), next: { terminal: true } })
    .build();

  const result = generateSkillMd(s);
  assert.ok(result.includes('| `repoPath` | string | **Yes** | — |'));
  assert.ok(result.includes('`"lenient"` \\| `"normal"` \\| `"strict"`'));
  assert.ok(result.includes('| `strictness` |'));
  assert.ok(result.includes('"repoPath":"<repoPath>"'));
});

test('generateSkillMd shows no-params message when skill has no params', () => {
  const s = skill({ name: 'minimal', entry: 'a' })
    .step('a', { prompt: 'Go.', output: z.object({}), next: { terminal: true } })
    .build();

  const result = generateSkillMd(s);
  assert.ok(result.includes('## Parameters'));
  assert.ok(result.includes('This skill takes no parameters'));
});

test('generateSkillMd documents sub-skill params', () => {
  const child = skill({
    name: 'doctor',
    description: 'Diagnose issues.',
    entry: 'a',
    params: z.object({ spaceId: z.string() }),
  })
    .step('a', { prompt: 'Go.', output: z.object({}), next: { terminal: true } })
    .build();

  const s = skill({ name: 'composite', entry: 'start' })
    .step('start', { prompt: 'Classify.', output: z.object({}), next: 'subskill:doctor' })
    .subskill('doctor', child)
    .build();

  const result = generateSkillMd(s);
  assert.ok(result.includes('**doctor**: Diagnose issues.'));
  assert.ok(result.includes('`spaceId` (string, required)'));
});

test('generateNodeScriptsRun produces valid bash delegator with Node version check', () => {
  const result = generateNodeScriptsRun('repo-doctor');
  assert.ok(result.startsWith('#!/usr/bin/env bash'));
  assert.ok(result.includes('set -euo pipefail'));
  assert.ok(result.includes('command -v node'));
  assert.ok(result.includes('NODE_VERSION'));
  assert.ok(result.includes('-lt 24'));
  assert.ok(result.includes('export SKILL_DIR'));
  assert.ok(result.includes('exec node "$SKILL_DIR/bin/repo-doctor.mjs" "$@"'));
});
