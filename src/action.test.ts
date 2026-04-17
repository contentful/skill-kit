import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { action } from './action.js';

test('action() creates a frozen ActionDefinition', () => {
  const a = action({
    name: 'write-file',
    input: z.object({ path: z.string(), content: z.string() }),
    output: z.object({ bytesWritten: z.number() }),
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
        input: z.object({}),
        output: z.object({}),
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
        input: z.object({}),
        output: z.object({}),
        run: undefined as never,
      }),
    /run function is required/,
  );
});
