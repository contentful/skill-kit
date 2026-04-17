import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProseGenerator } from './prose/index.js';
import { askUser } from './ask-user.js';
import type { Handshake } from '../types.js';

const config = askUser({
  question: 'Which deployment target?',
  options: [
    { value: 'production', label: 'Production' },
    { value: 'staging', label: 'Staging' },
    { value: 'local', label: 'Local' },
  ],
});

test('askUser on Claude Code produces AskUserQuestion prose', () => {
  const host: Handshake = { host: 'claude-code', toolsAvailable: ['AskUserQuestion'] };
  const prose = resolveProseGenerator(host);
  const result = prose.askUser(config);

  assert.ok(result.includes('AskUserQuestion'));
  assert.ok(result.includes('Which deployment target?'));
  assert.ok(result.includes('Production'));
});

test('askUser on generic host produces fallback prose', () => {
  const host: Handshake = { host: 'generic', toolsAvailable: [] };
  const prose = resolveProseGenerator(host);
  const result = prose.askUser(config);

  assert.ok(!result.includes('AskUserQuestion'));
  assert.ok(result.includes('Ask the user'));
  assert.ok(result.includes('Production'));
});

test('askUser on Codex produces codex-specific prose', () => {
  const host: Handshake = { host: 'codex', toolsAvailable: ['shell', 'apply_patch', 'update_plan'] };
  const prose = resolveProseGenerator(host);
  const result = prose.askUser(config);

  assert.ok(!result.includes('AskUserQuestion'));
  assert.ok(result.includes('Ask the user'));
});
