import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProseGenerator } from './prose/index.js';
import type { Handshake, ConfirmConfig } from '../types.js';

const config: ConfirmConfig = {
  kind: 'confirm',
  message: 'This will delete 47 files. Continue?',
  destructive: true,
  defaultAnswer: 'no',
};

test('confirm with destructive=true includes warning on Claude Code', () => {
  const host: Handshake = { host: 'claude-code', toolsAvailable: ['AskUserQuestion'] };
  const prose = resolveProseGenerator(host);
  const result = prose.confirm(config);

  assert.ok(result.includes('destructive'));
  assert.ok(result.includes('delete 47 files'));
});

test('confirm with destructive=true includes warning on generic', () => {
  const host: Handshake = { host: 'generic', toolsAvailable: [] };
  const prose = resolveProseGenerator(host);
  const result = prose.confirm(config);

  assert.ok(result.includes('destructive'));
});
