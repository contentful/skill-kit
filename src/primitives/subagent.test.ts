import test from 'node:test';
import assert from 'node:assert/strict';
import { type } from 'arktype';
import { subagent } from './subagent.js';

test('subagent() returns a frozen SubagentConfig', () => {
  const config = subagent({
    prompt: 'Research the top 5 CVEs.',
    output: type({ findings: 'string[]' }),
  });
  assert.equal(config.kind, 'subagent');
  assert.equal(config.prompt, 'Research the top 5 CVEs.');
  assert.ok(Object.isFrozen(config));
});
