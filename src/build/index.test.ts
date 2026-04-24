import test from 'node:test';
import assert from 'node:assert/strict';
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
  assert.ok(result.includes('scripts/run --context'));
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
  const result = generatePackageJson('my-skill', '2.0.0');
  const parsed = JSON.parse(result);
  assert.equal(parsed.name, 'my-skill');
  assert.equal(parsed.version, '2.0.0');
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
