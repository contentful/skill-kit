import test from 'node:test';
import assert from 'node:assert/strict';
import { plan } from './plan.js';

test('plan() returns a frozen PlanConfig', () => {
  const config = plan({
    summary: 'Migrate auth to JWTs',
    steps: ['Add JWT helpers', 'Update login flow', 'Add compat layer'],
  });
  assert.equal(config.kind, 'plan');
  assert.equal(config.summary, 'Migrate auth to JWTs');
  assert.equal(config.steps.length, 3);
  assert.ok(Object.isFrozen(config));
});
