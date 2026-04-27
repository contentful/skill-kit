import test from 'node:test';
import assert from 'node:assert/strict';
import { askUser } from './ask-user.js';

test('askUser structured returns frozen AskStructuredConfig', () => {
  const config = askUser({
    type: 'structured',
    question: 'Which target?',
    options: [
      { value: 'production', label: 'Production' },
      { value: 'staging', label: 'Staging' },
    ],
  });
  assert.equal(config.kind, 'askUser');
  assert.equal(config.type, 'structured');
  assert.equal(config.question, 'Which target?');
  assert.equal(config.options.length, 2);
  assert.ok(Object.isFrozen(config));
});

test('askUser open returns frozen AskOpenConfig', () => {
  const config = askUser({ type: 'open', question: 'Tell me more' });
  assert.equal(config.kind, 'askUser');
  assert.equal(config.type, 'open');
  assert.equal(config.question, 'Tell me more');
  assert.ok(Object.isFrozen(config));
});
