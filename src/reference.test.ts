import test from 'node:test';
import assert from 'node:assert/strict';
import { reference } from './reference.js';

test('reference().build() creates a frozen ReferenceDefinition', () => {
  const ref = reference({
    name: 'test-ref',
    description: 'A test reference skill.',
  })
    .topic('intro', {
      label: 'Introduction',
      content: () => '# Intro\n\nHello world.',
    })
    .build();

  assert.equal(ref.kind, 'reference');
  assert.equal(ref.name, 'test-ref');
  assert.equal(ref.description, 'A test reference skill.');
  assert.ok(Object.isFrozen(ref));
  assert.ok(ref.topics['intro']);
});

test('reference topic content is callable', () => {
  const ref = reference({
    name: 'callable',
    description: 'Test.',
  })
    .topic('greet', {
      label: 'Greeting',
      content: () => 'Hello!',
    })
    .build();

  const result = ref.topics['greet']!.content({ refs: { load: () => '', asset: (p) => p } });
  assert.equal(result, 'Hello!');
});

test('reference topic can load refs', () => {
  const ref = reference({
    name: 'with-refs',
    description: 'Test.',
  })
    .topic('data', {
      label: 'Data reference',
      content: ({ refs }) => refs.load('data.md'),
    })
    .build();

  const mockRefs = { load: () => '# Data\n\nSome data.', asset: (p: string) => p };
  const result = ref.topics['data']!.content({ refs: mockRefs });
  assert.ok(result.includes('Some data'));
});

test('reference().build() throws on missing name', () => {
  assert.throws(
    () =>
      reference({ name: '', description: 'x' })
        .topic('a', { label: 'A', content: () => 'x' })
        .build(),
    /name is required/,
  );
});

test('reference().build() throws on missing description', () => {
  assert.throws(
    () =>
      reference({ name: 'x', description: '' })
        .topic('a', { label: 'A', content: () => 'x' })
        .build(),
    /description is required/,
  );
});

test('reference().build() throws on no topics', () => {
  assert.throws(() => reference({ name: 'x', description: 'x' }).build(), /at least one topic/);
});
