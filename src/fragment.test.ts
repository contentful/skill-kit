import test from 'node:test';
import assert from 'node:assert/strict';
import { fragment, prompt } from './fragment.js';

test('fragment() creates a frozen Fragment', () => {
  const f = fragment('tone', 'Be professional and concise.');

  assert.equal(f.name, 'tone');
  assert.equal(f.content, 'Be professional and concise.');
  assert.ok(Object.isFrozen(f));
});

test('fragment() trims content whitespace', () => {
  const f = fragment('tone', '\n  Be concise.  \n');

  assert.equal(f.content, 'Be concise.');
});

test('fragment() throws on empty name', () => {
  assert.throws(() => fragment('', 'content'), /name is required/);
});

test('prompt`` strips common leading whitespace', () => {
  const result = prompt`
    Line one.
    Line two.
    Line three.
  `;

  assert.equal(result, 'Line one.\nLine two.\nLine three.');
});

test('prompt`` interpolates fragments by content', () => {
  const tone = fragment('tone', 'Be concise.');

  const result = prompt`
    ${tone}

    Analyze the code.
  `;

  assert.equal(result, 'Be concise.\n\nAnalyze the code.');
});

test('prompt`` interpolates multiple fragments', () => {
  const tone = fragment('tone', 'Be concise.');
  const rules = fragment('rules', 'Return valid JSON.');

  const result = prompt`
    ${tone}

    Do the work.

    ${rules}
  `;

  assert.equal(result, 'Be concise.\n\nDo the work.\n\nReturn valid JSON.');
});

test('prompt`` interpolates strings and numbers', () => {
  const path = '/src/index.ts';
  const count = 42;

  const result = prompt`
    Analyze ${path} and check ${count} items.
  `;

  assert.equal(result, 'Analyze /src/index.ts and check 42 items.');
});

test('prompt`` handles single line', () => {
  const result = prompt`Hello world.`;

  assert.equal(result, 'Hello world.');
});
