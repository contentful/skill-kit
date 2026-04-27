import test from 'node:test';
import assert from 'node:assert/strict';
import type { ConfirmConfig } from '../types.js';

test('confirm config has correct shape', () => {
  const config: ConfirmConfig = {
    kind: 'confirm',
    message: 'Delete 47 files?',
    destructive: true,
    defaultAnswer: 'no',
  };
  assert.equal(config.kind, 'confirm');
  assert.equal(config.destructive, true);
  assert.equal(config.defaultAnswer, 'no');
});
