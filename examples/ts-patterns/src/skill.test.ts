import test from 'node:test';
import assert from 'node:assert/strict';
import ref from './skill.js';

test('ts-patterns reference has correct metadata', () => {
  assert.equal(ref.kind, 'reference');
  assert.equal(ref.name, 'ts-patterns');
  assert.equal(ref.version, '1.0.0');
});

test('ts-patterns has all expected topics', () => {
  const names = Object.keys(ref.topics);
  assert.ok(names.includes('generics'));
  assert.ok(names.includes('discriminated-unions'));
  assert.ok(names.includes('builder-pattern'));
  assert.ok(names.includes('error-handling'));
});

test('generics topic loads from references/', () => {
  const mockRefs = {
    load: (f: string) => {
      assert.equal(f, 'generics.md');
      return '# Generics\n\nContent here.';
    },
    asset: (p: string) => p,
  };

  const content = ref.topics['generics']!.content({ refs: mockRefs });
  assert.ok(content.includes('Generics'));
});

test('discriminated-unions topic renders inline content', () => {
  const noopRefs = { load: () => '', asset: (p: string) => p };
  const content = ref.topics['discriminated-unions']!.content({ refs: noopRefs });
  assert.ok(content.includes('Discriminated Unions'));
  assert.ok(content.includes('s.kind'));
});

test('error-handling topic renders a table', () => {
  const noopRefs = { load: () => '', asset: (p: string) => p };
  const content = ref.topics['error-handling']!.content({ refs: noopRefs });
  assert.ok(content.includes('Result<T, E>'));
  assert.ok(content.includes('| pattern |'));
});
