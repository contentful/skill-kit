import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { subagent } from './subagent.js';

test('subagent() returns a frozen SubagentConfig', () => {
  const config = subagent({
    prompt: 'Research the top 5 CVEs.',
    output: z.object({ findings: z.array(z.string()) }),
  });
  assert.equal(config.kind, 'subagent');
  assert.equal(config.prompt, 'Research the top 5 CVEs.');
  assert.ok(Object.isFrozen(config));
});
