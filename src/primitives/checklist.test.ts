import test from 'node:test';
import assert from 'node:assert/strict';
import { checklist } from './checklist.js';
import { resolveProseGenerator } from './prose/index.js';
import type { Handshake } from '../types.js';

const config = checklist({
  create: [
    { title: 'Fix CI configuration', status: 'pending' },
    { title: 'Update dependencies', status: 'in_progress' },
  ],
});

test('checklist() returns a frozen ChecklistConfig', () => {
  assert.equal(config.kind, 'checklist');
  assert.equal(config.create.length, 2);
  assert.ok(Object.isFrozen(config));
});

test('checklist prose includes CREATE_CHECKLIST verb and task titles', () => {
  const host: Handshake = { host: 'claude-code', toolsAvailable: ['AskUserQuestion', 'TaskCreate'] };
  const prose = resolveProseGenerator(host);
  const result = prose.checklist(config);

  assert.ok(result.includes('CREATE_CHECKLIST'));
  assert.ok(result.includes('Fix CI configuration'));
  assert.ok(result.includes('Update dependencies'));
  assert.ok(result.includes('pending'));
  assert.ok(result.includes('in_progress'));
});

test('checklist prose uses same verb on generic host', () => {
  const host: Handshake = { host: 'generic', toolsAvailable: [] };
  const prose = resolveProseGenerator(host);
  const result = prose.checklist(config);

  assert.ok(result.includes('CREATE_CHECKLIST'));
});
