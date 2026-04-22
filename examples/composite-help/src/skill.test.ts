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

test('choose doctor routes through get-space to doctor sub-skill', async () => {
  const result = await runComposite(skill, {
    model: mockModel({
      choose: { choice: 'doctor' },
      'get-space': { spaceId: 'abc123' },
      'doctor/diagnose': { issues: ['broken refs'], healthy: false },
      'doctor/suggest-fix': { fixes: [{ issue: 'broken refs', fix: 'republish' }] },
      'doctor/confirm-fix': { choice: 'skip' },
      'doctor/report-issues': { summary: 'Found 1 issue.' },
    }),
  });

  assert.deepEqual(result.path, [
    'choose',
    'get-space',
    'doctor/diagnose',
    'doctor/suggest-fix',
    'doctor/confirm-fix',
    'doctor/report-issues',
  ]);
  assert.equal(result.redirectedTo?.kind, 'subskill');
  assert.equal(result.redirectedTo?.name, 'doctor');
});

test('choose setup routes directly to setup sub-skill', async () => {
  const result = await runComposite(skill, {
    model: mockModel({
      choose: { choice: 'setup' },
      'setup/check-env': { hasSpaceId: true, hasToken: true },
      'setup/configure': { choice: 'done' },
      'setup/summary': { summary: 'All configured.' },
    }),
  });

  assert.deepEqual(result.path, ['choose', 'setup/check-env', 'setup/configure', 'setup/summary']);
  assert.equal(result.redirectedTo?.kind, 'subskill');
  assert.equal(result.redirectedTo?.name, 'setup');
});

test('choose faq routes through ask-topic to topic content', async () => {
  const result = await runComposite(skill, {
    refs,
    model: mockModel({
      choose: { choice: 'faq' },
      'ask-topic': { topicName: 'rate-limits' },
    }),
  });

  assert.deepEqual(result.path, ['choose', 'ask-topic']);
  assert.equal(result.redirectedTo?.kind, 'topic');
  assert.equal(result.redirectedTo?.name, 'rate-limits');
  assert.ok((result.output as { content: string }).content.includes('78 requests/second'));
});

test('faq with locales topic loads correct content', async () => {
  const result = await runComposite(skill, {
    refs,
    model: mockModel({
      choose: { choice: 'faq' },
      'ask-topic': { topicName: 'locales' },
    }),
  });

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
