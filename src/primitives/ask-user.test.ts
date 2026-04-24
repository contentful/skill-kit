import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProseGenerator } from './prose/index.js';
import { askUser } from './ask-user.js';
import type { Handshake } from '../types.js';

const config = askUser({
  type: 'structured',
  question: 'Which deployment target?',
  options: [
    { value: 'production', label: 'Production' },
    { value: 'staging', label: 'Staging' },
    { value: 'local', label: 'Local' },
  ],
});

test('askUser on Claude Code names AskUserQuestion tool', () => {
  const host: Handshake = { host: 'claude-code', toolsAvailable: ['AskUserQuestion'] };
  const prose = buildProseGenerator(host);
  const result = prose.askUser(config);

  assert.ok(result.includes('ASK_STRUCTURED'));
  assert.ok(result.includes('AskUserQuestion'));
  assert.ok(result.includes('Which deployment target?'));
  assert.ok(result.includes('Production'));
});

test('askUser on generic host does not name host-specific tools', () => {
  const host: Handshake = { host: 'generic', toolsAvailable: [] };
  const prose = buildProseGenerator(host);
  const result = prose.askUser(config);

  assert.ok(result.includes('ASK_STRUCTURED'));
  assert.ok(!result.includes('AskUserQuestion'));
  assert.ok(result.includes('Production'));
});

test('askUser on Cline uses ask_followup_question', () => {
  const host: Handshake = { host: 'cline', toolsAvailable: ['ask_followup_question'] };
  const prose = buildProseGenerator(host);
  const result = prose.askUser(config);

  assert.ok(result.includes('ask_followup_question'));
});

test('hybrid fallback: host name resolves tools from registry', () => {
  const host: Handshake = { host: 'claude-code', toolsAvailable: [] };
  const prose = buildProseGenerator(host);
  const result = prose.askUser(config);

  assert.ok(result.includes('AskUserQuestion'), 'should resolve from registry when toolsAvailable is empty');
});
