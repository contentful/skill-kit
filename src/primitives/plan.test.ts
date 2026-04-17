import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProseGenerator } from './prose/index.js';
import type { Handshake, PlanConfig } from '../types.js';

const config: PlanConfig = {
  kind: 'plan',
  summary: 'Migrate auth to JWTs',
  steps: ['Add JWT helpers', 'Update login flow', 'Add compat layer'],
};

test('plan produces PRESENT_PLAN verb with summary and steps', () => {
  const host: Handshake = { host: 'claude-code', toolsAvailable: ['AskUserQuestion', 'EnterPlanMode'] };
  const prose = resolveProseGenerator(host);
  const result = prose.plan(config);

  assert.ok(result.includes('PRESENT_PLAN'));
  assert.ok(result.includes('Migrate auth to JWTs'));
  assert.ok(result.includes('1. Add JWT helpers'));
});

test('plan uses same verb on generic host', () => {
  const host: Handshake = { host: 'generic', toolsAvailable: [] };
  const prose = resolveProseGenerator(host);
  const result = prose.plan(config);

  assert.ok(result.includes('PRESENT_PLAN'));
});
