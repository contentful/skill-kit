import test from 'node:test';
import assert from 'node:assert/strict';
import { StateStore } from './state-store.js';

test('StateStore: optional property returns undefined for unvisited step', () => {
  const store = new StateStore();
  const accessor = store.buildAccessor<{ greet: { name: string } }>();
  assert.equal(accessor.steps.greet, undefined);
});

test('StateStore: optional property returns last response for visited step', () => {
  const store = new StateStore();
  store.append('greet', { name: 'Alice' });
  const accessor = store.buildAccessor<{ greet: { name: string } }>();
  assert.deepEqual(accessor.steps.greet, { name: 'Alice' });
});

test('StateStore: optional property returns last visit for looping step', () => {
  const store = new StateStore();
  store.append('ask-hobby', { hobby: 'Chess', wantsMore: true });
  store.append('ask-hobby', { hobby: 'Baking', wantsMore: false });
  const accessor = store.buildAccessor<{ 'ask-hobby': { hobby: string; wantsMore: boolean } }>();
  assert.deepEqual(accessor.steps['ask-hobby'], { hobby: 'Baking', wantsMore: false });
});

test('StateStore: all() returns empty array for unvisited step', () => {
  const store = new StateStore();
  const accessor = store.buildAccessor<{ greet: { name: string } }>();
  assert.deepEqual(accessor.steps.all('greet'), []);
});

test('StateStore: all() returns all visits in order', () => {
  const store = new StateStore();
  store.append('ask-hobby', { hobby: 'Chess' });
  store.append('ask-hobby', { hobby: 'Baking' });
  store.append('ask-hobby', { hobby: 'Climbing' });
  const accessor = store.buildAccessor<{ 'ask-hobby': { hobby: string } }>();
  assert.deepEqual(
    accessor.steps.all('ask-hobby').map((v) => v.hobby),
    ['Chess', 'Baking', 'Climbing'],
  );
});

test('StateStore: ran() returns false for unvisited step', () => {
  const store = new StateStore();
  const accessor = store.buildAccessor<{ greet: { name: string } }>();
  assert.equal(accessor.steps.ran('greet'), false);
});

test('StateStore: ran() returns true for visited step', () => {
  const store = new StateStore();
  store.append('greet', { name: 'Alice' });
  const accessor = store.buildAccessor<{ greet: { name: string } }>();
  assert.equal(accessor.steps.ran('greet'), true);
});

test('StateStore: history returns all records in append order', () => {
  const store = new StateStore();
  store.append('a', { val: 1 });
  store.append('b', { val: 2 });
  store.append('a', { val: 3 });
  const accessor = store.buildAccessor();
  assert.equal(accessor.steps.history.length, 3);
  assert.equal(accessor.steps.history[0]!.step, 'a');
  assert.equal(accessor.steps.history[1]!.step, 'b');
  assert.equal(accessor.steps.history[2]!.step, 'a');
});

test('StateStore: accessor reflects appends made after creation', () => {
  const store = new StateStore();
  const accessor = store.buildAccessor<{ greet: { name: string } }>();
  assert.equal(accessor.steps.greet, undefined);
  store.append('greet', { name: 'Alice' });
  assert.deepEqual(accessor.steps.greet, { name: 'Alice' });
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
  assert.deepEqual(accessor.steps.history[0]!.actionResult, { statuses: [{ ok: true }] });
});

test('StateStore: result field overrides response in store access', () => {
  const store = new StateStore();
  const response = { links: ['a.com', 'b.com'] };
  const actionResult = { statuses: [{ url: 'a.com', ok: true }] };
  const result = { totalLinks: 2, broken: [] };
  store.append('check', response, actionResult, result);

  const accessor = store.buildAccessor<{ check: { totalLinks: number; broken: string[] } }>();
  assert.deepEqual(accessor.steps.check, { totalLinks: 2, broken: [] });
  assert.equal(accessor.steps.history[0]!.response, response);
  assert.equal(accessor.steps.history[0]!.result, result);
});

test('StateStore: result defaults to response when not provided', () => {
  const store = new StateStore();
  store.append('greet', { name: 'Alice' });
  const accessor = store.buildAccessor<{ greet: { name: string } }>();
  assert.deepEqual(accessor.steps.greet, { name: 'Alice' });
  assert.equal(accessor.steps.history[0]!.result, accessor.steps.history[0]!.response);
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

  assert.deepEqual(accessor.steps['ask-stack'], { answer: 'TypeScript' });
  assert.equal(accessor.steps['ask-tools'], undefined);
  assert.equal(accessor.steps.ran('ask-stack'), true);
  assert.equal(accessor.steps.ran('ask-tools'), false);
});

// ============================================================
// Sub-store tests
// ============================================================

test('StateStore: applySave merges data, accessible via property', () => {
  const store = new StateStore();
  store.applySave({ environment: { apiA: { host: 'a.com' } } });
  const accessor = store.buildAccessor();
  assert.deepEqual((accessor as Record<string, unknown>).environment, { apiA: { host: 'a.com' } });
});

test('StateStore: multiple applySave calls deep-merge', () => {
  const store = new StateStore();
  store.applySave({ environment: { apiA: { host: 'a.com' } } });
  store.applySave({ environment: { apiB: { host: 'b.com' } } });
  const accessor = store.buildAccessor();
  assert.deepEqual((accessor as Record<string, unknown>).environment, {
    apiA: { host: 'a.com' },
    apiB: { host: 'b.com' },
  });
});

test('StateStore: unwritten sub-store returns undefined', () => {
  const store = new StateStore();
  const accessor = store.buildAccessor();
  assert.equal((accessor as Record<string, unknown>).environment, undefined);
});

test('StateStore: sub-store and step data coexist', () => {
  const store = new StateStore();
  store.append('greet', { name: 'Alice' });
  store.applySave({ environment: { host: 'a.com' } });
  const accessor = store.buildAccessor<{ greet: { name: string } }>();
  assert.deepEqual(accessor.steps.greet, { name: 'Alice' });
  assert.deepEqual((accessor as Record<string, unknown>).environment, { host: 'a.com' });
});

test('StateStore: step methods still work with sub-stores', () => {
  const store = new StateStore();
  store.append('greet', { name: 'Alice' });
  store.applySave({ environment: { host: 'a.com' } });
  const accessor = store.buildAccessor<{ greet: { name: string } }>();
  assert.equal(accessor.steps.ran('greet'), true);
  assert.deepEqual(accessor.steps.all('greet'), [{ name: 'Alice' }]);
  assert.equal(accessor.steps.history.length, 1);
});

test('StateStore: accessor reflects saves made after creation', () => {
  const store = new StateStore();
  const accessor = store.buildAccessor();
  assert.equal((accessor as Record<string, unknown>).environment, undefined);
  store.applySave({ environment: { host: 'a.com' } });
  assert.deepEqual((accessor as Record<string, unknown>).environment, { host: 'a.com' });
});
