import test from 'node:test';
import assert from 'node:assert/strict';
import { runSkill, mockModel } from '@contentful/skill-kit/test';
import skill from './skill.js';

test('developer path: greet → ask-role → ask-stack → ask-hobby → confirm → profile-card', async () => {
  const result = await runSkill(skill, {
    context: { greeting: 'Howdy!' },
    model: mockModel({
      greet: { name: 'Alice' },
      'ask-role': { role: 'dev' },
      'ask-stack': { answer: 'TypeScript + Bun + Zod' },
      'ask-hobby': { hobby: 'Rock climbing', wantsMore: false },
      'confirm-profile': { approved: true },
      'profile-card': {
        card: 'rendered card',
        profile: {
          name: 'Alice',
          role: 'dev',
          specialty: 'TypeScript + Bun + Zod',
          hobbies: ['Rock climbing'],
          funFact: 'A group of developers is called a "merge conflict."',
        },
      },
    }),
  });

  assert.deepEqual(result.path, ['greet', 'ask-role', 'ask-stack', 'ask-hobby', 'confirm-profile', 'profile-card']);
});

test('designer path branches to ask-tools', async () => {
  const result = await runSkill(skill, {
    model: mockModel({
      greet: { name: 'Bob' },
      'ask-role': { role: 'designer' },
      'ask-tools': { answer: 'Figma + CSS-in-the-raw' },
      'ask-hobby': { hobby: 'Pottery', wantsMore: false },
      'confirm-profile': { approved: true },
      'profile-card': {
        card: 'card',
        profile: {
          name: 'Bob',
          role: 'designer',
          specialty: 'Figma + CSS-in-the-raw',
          hobbies: ['Pottery'],
          funFact: 'fact',
        },
      },
    }),
  });

  assert.ok(result.path.includes('ask-tools'));
  assert.ok(!result.path.includes('ask-stack'));
});

test('manager path branches to ask-team-size', async () => {
  const result = await runSkill(skill, {
    model: mockModel({
      greet: { name: 'Carol' },
      'ask-role': { role: 'manager' },
      'ask-team-size': { answer: '8 engineers, one very dramatic standup' },
      'ask-hobby': { hobby: 'Running', wantsMore: false },
      'confirm-profile': { approved: true },
      'profile-card': {
        card: 'card',
        profile: {
          name: 'Carol',
          role: 'manager',
          specialty: '8 engineers',
          hobbies: ['Running'],
          funFact: 'fact',
        },
      },
    }),
  });

  assert.ok(result.path.includes('ask-team-size'));
});

test('hobby loop: user can add multiple hobbies', async () => {
  const result = await runSkill(skill, {
    model: mockModel({
      greet: { name: 'Dana' },
      'ask-role': { role: 'other' },
      'ask-specialty': { answer: 'I break things professionally' },
      'ask-hobby': [
        { hobby: 'Baking', wantsMore: true },
        { hobby: 'Chess', wantsMore: false },
      ],
      'confirm-profile': { approved: true },
      'profile-card': {
        card: 'card',
        profile: {
          name: 'Dana',
          role: 'other',
          specialty: 'Breaking things',
          hobbies: ['Baking', 'Chess'],
          funFact: 'fact',
        },
      },
    }),
  });

  const hobbyVisits = result.path.filter((s) => s === 'ask-hobby');
  assert.equal(hobbyVisits.length, 2);
});

test('confirm-profile: user declines and adds another hobby', async () => {
  const result = await runSkill(skill, {
    model: mockModel({
      greet: { name: 'Eve' },
      'ask-role': { role: 'dev' },
      'ask-stack': { answer: 'Rust all the way' },
      'ask-hobby': [
        { hobby: 'Gaming', wantsMore: false },
        { hobby: 'Cooking', wantsMore: false },
      ],
      'confirm-profile': [{ approved: false }, { approved: true }],
      'profile-card': {
        card: 'card',
        profile: {
          name: 'Eve',
          role: 'dev',
          specialty: 'Rust',
          hobbies: ['Gaming', 'Cooking'],
          funFact: 'fact',
        },
      },
    }),
  });

  const confirmVisits = result.path.filter((s) => s === 'confirm-profile');
  assert.equal(confirmVisits.length, 2);
});
