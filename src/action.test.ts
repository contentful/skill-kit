import test from 'node:test';
import assert from 'node:assert/strict';
import { type } from 'arktype';
import { action } from './action.js';

test('action() creates a frozen ActionDefinition', () => {
  const a = action({
    name: 'write-file',
    input: type({ path: 'string', content: 'string' }),
    output: type({ bytesWritten: 'number' }),
    run: async ({ input }) => ({ bytesWritten: input.content.length }),
  });

  assert.equal(a.kind, 'action');
  assert.equal(a.name, 'write-file');
  assert.ok(Object.isFrozen(a));
});

test('action() throws on missing name', () => {
  assert.throws(
    () =>
      action({
        name: '',
        input: type({}),
        output: type({}),
        run: async () => ({}),
      }),
    /name is required/,
  );
});

test('action() throws on missing run', () => {
  assert.throws(
    () =>
      action({
        name: 'x',
        input: type({}),
        output: type({}),
        run: undefined as never,
      }),
    /run function is required/,
  );
});
