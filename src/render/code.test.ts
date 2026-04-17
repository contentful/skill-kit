import test from 'node:test';
import assert from 'node:assert/strict';
import { code } from './code.js';

test('code() renders fenced block without language', () => {
  const result = code('const x = 1;');
  assert.equal(result, '```\nconst x = 1;\n```');
});

test('code() renders fenced block with language', () => {
  const result = code('const x = 1;', 'typescript');
  assert.equal(result, '```typescript\nconst x = 1;\n```');
});

test('code() handles multiline source', () => {
  const result = code('line1\nline2\nline3', 'js');
  assert.ok(result.startsWith('```js\n'));
  assert.ok(result.endsWith('\n```'));
  assert.ok(result.includes('line2'));
});
