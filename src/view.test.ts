import test from 'node:test';
import assert from 'node:assert/strict';
import { view } from './view.js';

test('view() creates unnamed ViewSegment from string', () => {
  const seg = view('# Hello');
  assert.equal(seg.kind, 'view');
  assert.equal(seg.label, undefined);
  assert.equal(seg.text, '# Hello');
  assert.ok(Object.isFrozen(seg));
});

test('view() creates unnamed ViewSegment from array', () => {
  const seg = view(['# Title', 'Body text']);
  assert.equal(seg.kind, 'view');
  assert.equal(seg.label, undefined);
  assert.equal(seg.text, '# Title\n\nBody text');
});

test('view() creates named ViewSegment', () => {
  const seg = view('stats', '# Stats');
  assert.equal(seg.kind, 'view');
  assert.equal(seg.label, 'stats');
  assert.equal(seg.text, '# Stats');
});

test('view() creates named ViewSegment from array', () => {
  const seg = view('card', ['Header', 'Footer']);
  assert.equal(seg.kind, 'view');
  assert.equal(seg.label, 'card');
  assert.equal(seg.text, 'Header\n\nFooter');
});
