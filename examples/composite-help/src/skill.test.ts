import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runComposite, mockModel } from '@contentful/skill-kit/test';
import type { ReferenceLoader } from '@contentful/skill-kit';
import skill from './skill.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const refsDir = join(__dirname, 'references');
const refs: ReferenceLoader = {
  load: (filename: string) => readFileSync(join(refsDir, filename), 'utf-8'),
  asset: (path: string) => join(__dirname, path),
};

test('dispatcher routes to doctor sub-skill via get-space', async () => {
  const result = await runComposite(skill, {
    context: { query: 'my entries are broken' },
    model: mockModel({
      classify: { intent: 'doctor', confidence: 0.9 },
      'get-space': { spaceId: 'abc123' },
      'doctor/diagnose': { issues: ['broken refs'], healthy: false },
      'doctor/suggest-fix': { fixes: [{ issue: 'broken refs', fix: 'republish' }] },
      'doctor/confirm-fix': { choice: 'skip' },
      'doctor/report-issues': { summary: 'Found 1 issue.' },
    }),
  });

  assert.deepEqual(result.path, [
    'classify',
    'get-space',
    'doctor/diagnose',
    'doctor/suggest-fix',
    'doctor/confirm-fix',
    'doctor/report-issues',
  ]);
  assert.equal(result.redirectedTo?.kind, 'subskill');
  assert.equal(result.redirectedTo?.name, 'doctor');
});

test('dispatcher routes to setup sub-skill directly', async () => {
  const result = await runComposite(skill, {
    context: { query: 'set up my space' },
    model: mockModel({
      classify: { intent: 'setup', confidence: 0.95 },
      'setup/check-env': { hasSpaceId: true, hasToken: true },
      'setup/configure': { choice: 'done' },
      'setup/summary': { summary: 'All configured.' },
    }),
  });

  assert.deepEqual(result.path, ['classify', 'setup/check-env', 'setup/configure', 'setup/summary']);
  assert.equal(result.redirectedTo?.kind, 'subskill');
  assert.equal(result.redirectedTo?.name, 'setup');
});

test('dispatcher resolves FAQ topic directly', async () => {
  const result = await runComposite(skill, {
    context: { query: 'what are the rate limits' },
    refs,
    model: mockModel({
      classify: { intent: 'faq', confidence: 0.99, faqTopic: 'rate-limits' },
    }),
  });

  assert.deepEqual(result.path, ['classify']);
  assert.equal(result.redirectedTo?.kind, 'topic');
  assert.equal(result.redirectedTo?.name, 'rate-limits');
  assert.ok((result.output as { content: string }).content.includes('78 requests/second'));
});

test('low confidence routes through clarify step', async () => {
  const result = await runComposite(skill, {
    context: { query: 'help' },
    model: mockModel({
      classify: { intent: 'unclear', confidence: 0.3 },
      clarify: { choice: 'setup' },
      'setup/check-env': { hasSpaceId: true, hasToken: true },
      'setup/configure': { choice: 'done' },
      'setup/summary': { summary: 'Done.' },
    }),
  });

  assert.ok(result.path.includes('clarify'));
  assert.equal(result.redirectedTo?.kind, 'subskill');
  assert.equal(result.redirectedTo?.name, 'setup');
});

test('clarify FAQ routes through ask-topic to topic', async () => {
  const result = await runComposite(skill, {
    context: { query: 'question' },
    refs,
    model: mockModel({
      classify: { intent: 'unclear', confidence: 0.2 },
      clarify: { choice: 'faq' },
      'ask-topic': { topicName: 'locales' },
    }),
  });

  assert.deepEqual(result.path, ['classify', 'clarify', 'ask-topic']);
  assert.equal(result.redirectedTo?.kind, 'topic');
  assert.equal(result.redirectedTo?.name, 'locales');
  assert.ok((result.output as { content: string }).content.includes('Fallback chain'));
});

test('direct sub-skill access bypasses dispatcher', async () => {
  const result = await runComposite(skill, {
    directSubskill: 'doctor',
    context: { spaceId: 'direct-test' },
    model: mockModel({
      'doctor/diagnose': { issues: [], healthy: true },
      'doctor/report-clean': { summary: 'All good!' },
    }),
  });

  assert.deepEqual(result.path, ['doctor/diagnose', 'doctor/report-clean']);
  assert.equal(result.redirectedTo?.name, 'doctor');
});
