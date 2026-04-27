import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePreamble } from './preamble.js';
import type { Handshake } from '../types.js';

test('preamble for Claude Code includes tool names in table', () => {
  const host: Handshake = {
    host: 'claude-code',
    toolsAvailable: ['AskUserQuestion', 'EnterPlanMode', 'TaskCreate', 'Agent'],
  };
  const result = generatePreamble(host);

  assert.ok(result.includes('| Tag |'));
  assert.ok(result.includes('AskUserQuestion'));
  assert.ok(result.includes('EnterPlanMode'));
  assert.ok(result.includes('TaskCreate'));
  assert.ok(result.includes('Agent'));
  assert.ok(result.includes('<ask-user>'));
  assert.ok(result.includes('<confirm>'));
  assert.ok(result.includes('<plan>'));
  assert.ok(result.includes('<checklist>'));
  assert.ok(result.includes('<subagent>'));
});

test('preamble for generic host shows dashes for tools', () => {
  const host: Handshake = { host: 'generic', toolsAvailable: [] };
  const result = generatePreamble(host);

  assert.ok(result.includes('| Tag |'));
  assert.ok(!result.includes('AskUserQuestion'));
  assert.ok(!result.includes('EnterPlanMode'));
  assert.ok(result.includes('numbered list'));
});

test('preamble for Cline maps to Cline tools', () => {
  const host: Handshake = {
    host: 'cline',
    toolsAvailable: ['ask_followup_question', 'PLAN_MODE', 'update_todo_list', 'USE_SUBAGENTS'],
  };
  const result = generatePreamble(host);

  assert.ok(result.includes('ask_followup_question'));
  assert.ok(result.includes('PLAN_MODE'));
  assert.ok(result.includes('update_todo_list'));
  assert.ok(result.includes('USE_SUBAGENTS'));
});

test('preamble hybrid fallback resolves host from registry', () => {
  const host: Handshake = { host: 'gemini-cli', toolsAvailable: [] };
  const result = generatePreamble(host);

  assert.ok(result.includes('ask-user'));
  assert.ok(result.includes('enter-plan-mode'));
});
