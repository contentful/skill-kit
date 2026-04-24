import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProseGenerator } from './prose/index.js';
import type { Handshake, PlanConfig } from '../types.js';

const config: PlanConfig = {
  kind: 'plan',
  summary: 'Migrate auth to JWTs',
  steps: ['Add JWT helpers', 'Update login flow', 'Add compat layer'],
};

test('plan produces PRESENT_PLAN verb with summary and steps', () => {
  const host: Handshake = { host: 'claude-code', toolsAvailable: ['AskUserQuestion', 'EnterPlanMode'] };
  const prose = buildProseGenerator(host);
  const result = prose.plan(config);

  assert.ok(result.includes('PRESENT_PLAN'));
  assert.ok(result.includes('EnterPlanMode'));
  assert.ok(result.includes('Migrate auth to JWTs'));
  assert.ok(result.includes('1. Add JWT helpers'));
});

test('plan on generic host does not name host-specific tools', () => {
  const host: Handshake = { host: 'generic', toolsAvailable: [] };
  const prose = buildProseGenerator(host);
  const result = prose.plan(config);

  assert.ok(result.includes('PRESENT_PLAN'));
  assert.ok(!result.includes('EnterPlanMode'));
});

test('plan on Cline uses PLAN_MODE', () => {
  const host: Handshake = { host: 'cline', toolsAvailable: ['PLAN_MODE', 'ACT_MODE'] };
  const prose = buildProseGenerator(host);
  const result = prose.plan(config);

  assert.ok(result.includes('PLAN_MODE'));
  assert.ok(result.includes('ACT_MODE'));
});
