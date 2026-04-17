import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePreamble } from './preamble.js';
import type { Handshake } from '../types.js';

test('preamble for Claude Code maps ASK_STRUCTURED to AskUserQuestion', () => {
  const host: Handshake = {
    host: 'claude-code',
    toolsAvailable: ['AskUserQuestion', 'EnterPlanMode', 'TaskCreate', 'Agent'],
  };
  const result = generatePreamble(host);

  assert.ok(result.includes('ASK_STRUCTURED'));
  assert.ok(result.includes('AskUserQuestion'));
  assert.ok(result.includes('ASK_FREEFORM'));
  assert.ok(result.includes('PRESENT_PLAN'));
  assert.ok(result.includes('EnterPlanMode'));
  assert.ok(result.includes('CREATE_TASKS'));
  assert.ok(result.includes('TaskCreate'));
  assert.ok(result.includes('SPAWN_SUBTASK'));
  assert.ok(result.includes('Agent tool'));
});

test('preamble for generic host uses prose fallbacks', () => {
  const host: Handshake = { host: 'generic', toolsAvailable: [] };
  const result = generatePreamble(host);

  assert.ok(result.includes('ASK_STRUCTURED'));
  assert.ok(!result.includes('AskUserQuestion'));
  assert.ok(result.includes('numbered list'));
  assert.ok(result.includes('ASK_FREEFORM'));
  assert.ok(result.includes('PRESENT_PLAN'));
  assert.ok(!result.includes('EnterPlanMode'));
});
