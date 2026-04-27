import test from 'node:test';
import assert from 'node:assert/strict';
import { askUser } from './ask-user.js';
import { askUserPrimitive } from './ask-user.js';

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

test('askUser structured passes through header', () => {
  const config = askUser({
    type: 'structured',
    question: 'Role?',
    header: 'Role',
    options: [
      { value: 'dev', label: 'Developer' },
      { value: 'designer', label: 'Designer' },
    ],
  });
  assert.equal(config.type, 'structured');
  assert.equal(config.header, 'Role');
});

test('askUser structured throws if header exceeds 12 chars', () => {
  assert.throws(
    () =>
      askUser({
        type: 'structured',
        question: 'Role?',
        header: 'This Is Too Long',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      }),
    /header must be ≤12 characters/,
  );
});

test('askUser structured throws if fewer than 2 options', () => {
  assert.throws(
    () =>
      askUser({
        type: 'structured',
        question: 'Pick',
        options: [{ value: 'a', label: 'A' }],
      }),
    /options must have 2–4 items/,
  );
});

test('askUser structured throws if more than 4 options', () => {
  assert.throws(
    () =>
      askUser({
        type: 'structured',
        question: 'Pick',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
          { value: 'c', label: 'C' },
          { value: 'd', label: 'D' },
          { value: 'e', label: 'E' },
        ],
      }),
    /options must have 2–4 items/,
  );
});

test('askUser render includes header attribute', () => {
  const config = askUser({
    type: 'structured',
    question: 'Role?',
    header: 'Role',
    options: [
      { value: 'dev', label: 'Dev' },
      { value: 'pm', label: 'PM' },
    ],
  });
  const xml = askUserPrimitive.render(config);
  assert.ok(xml.includes('header="Role"'));
});

test('askUser render includes preview as child element', () => {
  const config = askUser({
    type: 'structured',
    question: 'Style?',
    options: [
      { value: 'classic', label: 'Classic', description: 'Traditional', preview: '  ##\n  ##' },
      { value: 'modern', label: 'Modern' },
    ],
  });
  const xml = askUserPrimitive.render(config);
  assert.ok(xml.includes('<preview>  ##\n  ##</preview>'));
  assert.ok(!xml.includes('preview='));
});

test('askUser render omits preview element when not set', () => {
  const config = askUser({
    type: 'structured',
    question: 'Pick',
    options: [
      { value: 'a', label: 'A', description: 'First' },
      { value: 'b', label: 'B', description: 'Second' },
    ],
  });
  const xml = askUserPrimitive.render(config);
  assert.ok(!xml.includes('<preview>'));
});
