import test from 'node:test';
import assert from 'node:assert/strict';
import { runSkill, mockModel } from '@contentful/skill-kit/test';
import skill from './skill.js';

test('happy path: classic + canvas, approve plan, no polish', async () => {
  const result = await runSkill(skill, {
    context: { difficulty: 'beginner' },
    model: mockModel({
      welcome: { excited: true },
      'choose-variant': { variant: 'classic' },
      'name-game': { name: 'RetroBlocks' },
      'choose-renderer': { renderer: 'canvas' },
      'design-review': { approved: true },
      'research-renderer': { summary: 'Use requestAnimationFrame for smooth rendering' },
      'implementation-plan': { approved: true },
      'build-checklist': { acknowledged: true },
      build: { filesCreated: ['index.html', 'game.js', 'style.css'], summary: 'Game built!' },
      'generate-theme': { css: ':root { --primary: #00ff00; }' },
      'final-review': { approved: false },
      summary: { summary: 'RetroBlocks is complete!' },
    }),
  });

  assert.deepEqual(result.path, [
    'welcome',
    'choose-variant',
    'name-game',
    'choose-renderer',
    'design-review',
    'research-renderer',
    'implementation-plan',
    'build-checklist',
    'build',
    'generate-theme',
    'final-review',
    'summary',
  ]);
});

test('modern + dom, revise plan once, one polish pass', async () => {
  const result = await runSkill(skill, {
    model: mockModel({
      welcome: { excited: true },
      'choose-variant': { variant: 'modern' },
      'name-game': { name: 'NeonDrop' },
      'choose-renderer': { renderer: 'dom' },
      'design-review': { approved: true },
      'research-renderer': { summary: 'Use CSS Grid for the board layout' },
      'implementation-plan': [{ approved: false, modifications: 'Add hold-piece support first' }, { approved: true }],
      'revise-plan': { answer: 'Add hold-piece as step 2, shift everything else down' },
      'build-checklist': { acknowledged: true },
      build: { filesCreated: ['index.html', 'game.ts'], summary: 'Built with hold-piece' },
      'generate-theme': { css: ':root { --primary: #ff00ff; }' },
      'final-review': [{ approved: true }, { approved: false }],
      polish: { answer: 'Add a neon glow effect to the active piece' },
      summary: { summary: 'NeonDrop with glow effects!' },
    }),
  });

  assert.ok(result.path.includes('revise-plan'));
  assert.ok(result.path.includes('polish'));
  assert.equal(result.path[result.path.length - 1], 'summary');
});

test('design-review rejection loops back to choose-variant', async () => {
  const result = await runSkill(skill, {
    model: mockModel({
      welcome: { excited: true },
      'choose-variant': [{ variant: 'puzzle' }, { variant: 'classic' }],
      'name-game': [{ name: 'PuzzleTris' }, { name: 'ClassicFall' }],
      'choose-renderer': [{ renderer: 'webgl' }, { renderer: 'canvas' }],
      'design-review': [{ approved: false }, { approved: true }],
      'research-renderer': { summary: 'Canvas is straightforward' },
      'implementation-plan': { approved: true },
      'build-checklist': { acknowledged: true },
      build: { filesCreated: ['game.js'], summary: 'Done' },
      'generate-theme': { css: 'body { background: #111; }' },
      'final-review': { approved: false },
      summary: { summary: 'ClassicFall built!' },
    }),
  });

  // Should visit choose-variant twice (once rejected, once approved)
  const variantVisits = result.path.filter((s) => s === 'choose-variant');
  assert.equal(variantVisits.length, 2);
});
