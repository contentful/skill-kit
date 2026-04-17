import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { generateBunWrapper } from './bun-wrapper-template.js';
import { generateScriptsRun } from './scripts-run-template.js';
import { generateSkillMd } from './skillmd-template.js';
import { generatePackageJson } from './package-json-template.js';
import { resolveTargets } from './targets.js';
import { skill } from '../skill.js';
import { step } from '../step.js';

test('generateBunWrapper produces valid import structure', () => {
  const result = generateBunWrapper('/abs/path/skill.ts');
  assert.ok(result.includes("import skill from '/abs/path/skill.ts'"));
  assert.ok(result.includes("import { main } from '@contentful/skill-kit/cli'"));
  assert.ok(result.includes('main(skill)'));
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
    steps: {
      start: step({
        prompt: 'Begin the process.',
        output: z.object({ done: z.boolean() }),
        next: { terminal: true },
      }),
    },
  });

  const result = generateSkillMd(s);

  assert.ok(result.startsWith('---\nname: test-skill'));
  assert.ok(result.includes('description: A test skill for unit testing.'));
  assert.ok(result.includes('version: "1.0.0"'));
  assert.ok(result.includes('scripts/run start'));
  assert.ok(result.includes('scripts/run advance'));
  assert.ok(result.includes('"done": true'));
  assert.ok(result.includes('**start**: Begin the process.'));
});

test('generateSkillMd uses default description when none provided', () => {
  const s = skill({
    name: 'minimal',
    entry: 'a',
    steps: {
      a: step({ prompt: 'Go.', output: z.object({}), next: { terminal: true } }),
    },
  });

  const result = generateSkillMd(s);
  assert.ok(result.includes('minimal skill powered by @contentful/skill-kit'));
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
