import test from 'node:test';
import assert from 'node:assert/strict';
import { system } from './system.js';
import { fragment } from './fragment.js';

test('system() as template tag produces SystemSegment', () => {
  const seg = system`You are a security specialist.`;
  assert.equal(seg.kind, 'system');
  assert.equal(seg.text, 'You are a security specialist.');
  assert.ok(Object.isFrozen(seg));
});

test('system() as plain function produces SystemSegment', () => {
  const seg = system('Be precise and factual.');
  assert.equal(seg.kind, 'system');
  assert.equal(seg.text, 'Be precise and factual.');
});

test('system() template tag interpolates fragments', () => {
  const tone = fragment('tone', 'Keep it professional.');
  const seg = system`${tone} No jokes.`;
  assert.equal(seg.text, 'Keep it professional. No jokes.');
});

test('system() template tag interpolates values', () => {
  const role = 'mentor';
  const seg = system`You are a ${role}.`;
  assert.equal(seg.text, 'You are a mentor.');
});

test('system() template tag dedents multiline', () => {
  const seg = system`
    Line one.
    Line two.
  `;
  assert.equal(seg.text, 'Line one.\nLine two.');
});
