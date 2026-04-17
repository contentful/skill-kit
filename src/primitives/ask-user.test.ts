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

test('askUser produces ASK_STRUCTURED verb with question and options', () => {
  const host: Handshake = { host: 'claude-code', toolsAvailable: ['AskUserQuestion'] };
  const prose = resolveProseGenerator(host);
  const result = prose.askUser(config);

  assert.ok(result.includes('ASK_STRUCTURED'));
  assert.ok(result.includes('Which deployment target?'));
  assert.ok(result.includes('Production'));
});

test('askUser uses same verb on generic host', () => {
  const host: Handshake = { host: 'generic', toolsAvailable: [] };
  const prose = resolveProseGenerator(host);
  const result = prose.askUser(config);

  assert.ok(result.includes('ASK_STRUCTURED'));
  assert.ok(result.includes('Production'));
});
