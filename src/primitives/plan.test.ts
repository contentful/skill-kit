import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProseGenerator } from './prose/index.js';
import type { Handshake, PlanConfig } from '../types.js';

const config: PlanConfig = {
  kind: 'plan',
  summary: 'Migrate auth to JWTs',
  steps: ['Add JWT helpers', 'Update login flow', 'Add compat layer'],
};

test('plan on Claude Code uses EnterPlanMode', () => {
  const host: Handshake = { host: 'claude-code', toolsAvailable: ['AskUserQuestion', 'EnterPlanMode'] };
  const prose = resolveProseGenerator(host);
  const result = prose.plan(config);

  assert.ok(result.includes('EnterPlanMode'));
  assert.ok(result.includes('Migrate auth to JWTs'));
});

test('plan on Codex uses update_plan', () => {
  const host: Handshake = { host: 'codex', toolsAvailable: ['shell', 'apply_patch', 'update_plan'] };
  const prose = resolveProseGenerator(host);
  const result = prose.plan(config);

  assert.ok(result.includes('update_plan'));
});

test('plan on OpenCode uses todowrite', () => {
  const host: Handshake = { host: 'opencode', toolsAvailable: ['bash', 'multiedit', 'todowrite'] };
  const prose = resolveProseGenerator(host);
  const result = prose.plan(config);

  assert.ok(result.includes('todowrite'));
});

test('plan on generic uses numbered list', () => {
  const host: Handshake = { host: 'generic', toolsAvailable: [] };
  const prose = resolveProseGenerator(host);
  const result = prose.plan(config);

  assert.ok(result.includes('numbered list'));
  assert.ok(result.includes('1. Add JWT helpers'));
});
