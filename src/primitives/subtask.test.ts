import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { subtask } from './subtask.js';
import { resolveProseGenerator } from './prose/index.js';
import type { Handshake } from '../types.js';

const config = subtask({
  prompt: 'Research the top 5 CVEs affecting our dependency tree.',
  output: z.object({ findings: z.array(z.string()) }),
});

test('subtask() returns a frozen SubtaskConfig', () => {
  assert.equal(config.kind, 'subtask');
  assert.equal(config.prompt, 'Research the top 5 CVEs affecting our dependency tree.');
  assert.ok(Object.isFrozen(config));
});

test('subtask prose includes SPAWN_SUBTASK verb and prompt text', () => {
  const host: Handshake = { host: 'claude-code', toolsAvailable: ['AskUserQuestion', 'Agent'] };
  const prose = resolveProseGenerator(host);
  const result = prose.subtask(config);

  assert.ok(result.includes('SPAWN_SUBTASK'));
  assert.ok(result.includes('Research the top 5 CVEs'));
});

test('subtask prose uses same verb on generic host', () => {
  const host: Handshake = { host: 'generic', toolsAvailable: [] };
  const prose = resolveProseGenerator(host);
  const result = prose.subtask(config);

  assert.ok(result.includes('SPAWN_SUBTASK'));
});
