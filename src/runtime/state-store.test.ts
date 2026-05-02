import test from 'node:test';
import assert from 'node:assert/strict';
import { StateStore } from './state-store.js';

test('StateStore: maybe() returns undefined for unvisited step', () => {
  const store = new StateStore();
  const accessor = store.buildAccessor<{ greet: { name: string } }>();
  assert.equal(accessor.maybe('greet'), undefined);
});

test('StateStore: maybe() returns last response for visited step', () => {
  const store = new StateStore();
  store.append('greet', { name: 'Alice' });
  const accessor = store.buildAccessor<{ greet: { name: string } }>();
  assert.deepEqual(accessor.maybe('greet'), { name: 'Alice' });
});

test('StateStore: maybe() returns last visit for looping step', () => {
  const store = new StateStore();
  store.append('ask-hobby', { hobby: 'Chess', wantsMore: true });
  store.append('ask-hobby', { hobby: 'Baking', wantsMore: false });
  const accessor = store.buildAccessor<{ 'ask-hobby': { hobby: string; wantsMore: boolean } }>();
  assert.deepEqual(accessor.maybe('ask-hobby'), { hobby: 'Baking', wantsMore: false });
});

test('StateStore: all() returns empty array for unvisited step', () => {
  const store = new StateStore();
  const accessor = store.buildAccessor<{ greet: { name: string } }>();
  assert.deepEqual(accessor.all('greet'), []);
});

test('StateStore: all() returns all visits in order', () => {
  const store = new StateStore();
  store.append('ask-hobby', { hobby: 'Chess' });
  store.append('ask-hobby', { hobby: 'Baking' });
  store.append('ask-hobby', { hobby: 'Climbing' });
  const accessor = store.buildAccessor<{ 'ask-hobby': { hobby: string } }>();
  assert.deepEqual(
    accessor.all('ask-hobby').map((v) => v.hobby),
    ['Chess', 'Baking', 'Climbing'],
  );
});

test('StateStore: ran() returns false for unvisited step', () => {
  const store = new StateStore();
  const accessor = store.buildAccessor<{ greet: { name: string } }>();
  assert.equal(accessor.ran('greet'), false);
});

test('StateStore: ran() returns true for visited step', () => {
  const store = new StateStore();
  store.append('greet', { name: 'Alice' });
  const accessor = store.buildAccessor<{ greet: { name: string } }>();
  assert.equal(accessor.ran('greet'), true);
});

test('StateStore: history returns all records in append order', () => {
  const store = new StateStore();
  store.append('a', { val: 1 });
  store.append('b', { val: 2 });
  store.append('a', { val: 3 });
  const accessor = store.buildAccessor();
  assert.equal(accessor.history.length, 3);
  assert.equal(accessor.history[0]!.step, 'a');
  assert.equal(accessor.history[1]!.step, 'b');
  assert.equal(accessor.history[2]!.step, 'a');
});

test('StateStore: accessor reflects appends made after creation', () => {
  const store = new StateStore();
  const accessor = store.buildAccessor<{ greet: { name: string } }>();
  assert.equal(accessor.maybe('greet'), undefined);
  store.append('greet', { name: 'Alice' });
  assert.deepEqual(accessor.maybe('greet'), { name: 'Alice' });
});

test('StateStore: visitCount tracks per-step visits', () => {
  const store = new StateStore();
  store.append('a', {});
  store.append('b', {});
  store.append('a', {});
  assert.equal(store.visitCount('a'), 2);
  assert.equal(store.visitCount('b'), 1);
  assert.equal(store.visitCount('c'), 0);
});

test('StateStore: last() returns most recent record', () => {
  const store = new StateStore();
  assert.equal(store.last(), undefined);
  store.append('a', { val: 1 });
  store.append('b', { val: 2 });
  assert.equal(store.last()!.step, 'b');
});

test('StateStore: actionResult preserved in records', () => {
  const store = new StateStore();
  store.append('check', { links: ['a.com'] }, { statuses: [{ ok: true }] });
  const accessor = store.buildAccessor();
  assert.deepEqual(accessor.history[0]!.actionResult, { statuses: [{ ok: true }] });
});

test('StateStore: branching — only visited branch appears', () => {
  const store = new StateStore();
  store.append('greet', { name: 'Alice' });
  store.append('ask-role', { role: 'dev' });
  store.append('ask-stack', { answer: 'TypeScript' });

  const accessor = store.buildAccessor<{
    greet: { name: string };
    'ask-role': { role: string };
    'ask-stack': { answer: string };
    'ask-tools': { answer: string };
  }>();

  assert.deepEqual(accessor.maybe('ask-stack'), { answer: 'TypeScript' });
  assert.equal(accessor.maybe('ask-tools'), undefined);
  assert.equal(accessor.ran('ask-stack'), true);
  assert.equal(accessor.ran('ask-tools'), false);
});
