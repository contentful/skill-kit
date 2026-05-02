import test from 'node:test';
import assert from 'node:assert/strict';
import { runSkill, mockModel } from '@contentful/skill-kit/test';
import skill from './skill.js';

test('happy path: survey → research → plan → write → confirm → summary', async () => {
  const result = await runSkill(skill, {
    model: mockModel({
      'gather-preferences': { theme: 'performance', framework: 'react' },
      research: { summary: 'Use code splitting, lazy loading, and memoization.' },
      'plan-report': { approved: true },
      'write-report': { title: 'Performance Report', body: 'React performance best practices.' },
      'confirm-publish': { publish: true },
      summary: { summary: 'Report published.' },
    }),
  });

  assert.deepEqual(result.path, [
    'gather-preferences',
    'research',
    'plan-report',
    'write-report',
    'confirm-publish',
    'summary',
  ]);
});

test('plan rejected → ask-changes → plan again', async () => {
  const result = await runSkill(skill, {
    model: mockModel({
      'gather-preferences': { theme: 'security', framework: 'vue' },
      research: { summary: 'Use CSP headers, sanitize inputs, audit deps.' },
      'plan-report': [{ approved: false }, { approved: true }],
      'ask-changes': { feedback: 'Add a section on dependency auditing.' },
      'write-report': { title: 'Security Report', body: 'Vue security practices.' },
      'confirm-publish': { publish: true },
      summary: { summary: 'Done.' },
    }),
  });

  assert.ok(result.path.includes('ask-changes'));
  assert.equal(result.path.filter((s) => s === 'plan-report').length, 2);
});

test('confirm-publish declined → ask-changes loop', async () => {
  const result = await runSkill(skill, {
    model: mockModel({
      'gather-preferences': { theme: 'accessibility', framework: 'svelte' },
      research: { summary: 'Use semantic HTML, ARIA labels, focus management.' },
      'plan-report': { approved: true },
      'write-report': { title: 'A11y Report', body: 'Svelte accessibility.' },
      'confirm-publish': [{ publish: false }, { publish: true }],
      'ask-changes': { feedback: 'Rewrite the intro.' },
      summary: { summary: 'Published.' },
    }),
  });

  assert.ok(result.path.includes('ask-changes'));
  assert.equal(result.path.filter((s) => s === 'confirm-publish').length, 2);
});

test('stash accumulates across steps', async () => {
  const result = await runSkill(skill, {
    model: mockModel({
      'gather-preferences': { theme: 'performance', framework: 'svelte' },
      research: { summary: 'Compile-time optimizations.' },
      'plan-report': { approved: true },
      'write-report': { title: 'Perf', body: 'Content.' },
      'confirm-publish': { publish: true },
      summary: { summary: 'All done.' },
    }),
  });

  assert.deepEqual(result.response, { summary: 'All done.' });
});
