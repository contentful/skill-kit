import test from 'node:test';
import assert from 'node:assert/strict';
import { tasks } from './tasks.js';
import { resolveProseGenerator } from './prose/index.js';
import type { Handshake } from '../types.js';

const config = tasks({
  create: [
    { title: 'Fix CI configuration', status: 'pending' },
    { title: 'Update dependencies', status: 'in_progress' },
  ],
});

test('tasks() returns a frozen TasksConfig', () => {
  assert.equal(config.kind, 'tasks');
  assert.equal(config.create.length, 2);
  assert.ok(Object.isFrozen(config));
});

test('tasks prose includes CREATE_TASKS verb and task titles', () => {
  const host: Handshake = { host: 'claude-code', toolsAvailable: ['AskUserQuestion', 'TaskCreate'] };
  const prose = resolveProseGenerator(host);
  const result = prose.tasks(config);

  assert.ok(result.includes('CREATE_TASKS'));
  assert.ok(result.includes('Fix CI configuration'));
  assert.ok(result.includes('Update dependencies'));
  assert.ok(result.includes('pending'));
  assert.ok(result.includes('in_progress'));
});

test('tasks prose uses same verb on generic host', () => {
  const host: Handshake = { host: 'generic', toolsAvailable: [] };
  const prose = resolveProseGenerator(host);
  const result = prose.tasks(config);

  assert.ok(result.includes('CREATE_TASKS'));
});
