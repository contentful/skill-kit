import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { subagent } from './subagent.js';
import { buildProseGenerator } from './prose/index.js';
import type { Handshake } from '../types.js';

const config = subagent({
  prompt: 'Research the top 5 CVEs affecting our dependency tree.',
  output: z.object({ findings: z.array(z.string()) }),
});

test('subagent() returns a frozen SubagentConfig', () => {
  assert.equal(config.kind, 'subagent');
  assert.equal(config.prompt, 'Research the top 5 CVEs affecting our dependency tree.');
  assert.ok(Object.isFrozen(config));
});

test('subagent on Claude Code names Agent tool', () => {
  const host: Handshake = { host: 'claude-code', toolsAvailable: ['AskUserQuestion', 'Agent'] };
  const prose = buildProseGenerator(host);
  const result = prose.subagent(config);

  assert.ok(result.includes('SPAWN_SUBAGENT'));
  assert.ok(result.includes('Agent tool'));
  assert.ok(result.includes('Research the top 5 CVEs'));
});

test('subagent on generic host does not name host-specific tools', () => {
  const host: Handshake = { host: 'generic', toolsAvailable: [] };
  const prose = buildProseGenerator(host);
  const result = prose.subagent(config);

  assert.ok(result.includes('SPAWN_SUBAGENT'));
  assert.ok(!result.includes('Agent tool'));
});
