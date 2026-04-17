import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePreamble } from './preamble.js';
import type { Handshake } from '../types.js';

test('preamble for Claude Code mentions AskUserQuestion', () => {
  const host: Handshake = {
    host: 'claude-code',
    toolsAvailable: ['AskUserQuestion', 'EnterPlanMode', 'TaskCreate', 'Agent'],
  };
  const result = generatePreamble(host);

  assert.ok(result.includes('AskUserQuestion'));
  assert.ok(result.includes('EnterPlanMode'));
  assert.ok(result.includes('TaskCreate'));
  assert.ok(result.includes('Agent'));
});

test('preamble for generic host omits tool-specific instructions', () => {
  const host: Handshake = { host: 'generic', toolsAvailable: [] };
  const result = generatePreamble(host);

  assert.ok(!result.includes('AskUserQuestion'));
  assert.ok(!result.includes('EnterPlanMode'));
  assert.ok(result.includes('structured workflow'));
});
