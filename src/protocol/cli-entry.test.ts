import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, 'fixtures', 'simple-skill.ts');

test('CLI start returns first step prompt as JSON', async () => {
  const { stdout } = await exec('npx', ['tsx', fixturePath, 'start', '--context', '{}'], {
    cwd: join(__dirname, '..', '..'),
  });

  const result = JSON.parse(stdout.trim());
  assert.equal(result.step, 'greet');
  assert.equal(result.prompt, 'Say hello.');
  assert.ok(result.schema);
});

test('CLI advance returns done for terminal step', async () => {
  const { stdout } = await exec(
    'npx',
    [
      'tsx',
      fixturePath,
      'advance',
      '--step',
      'greet',
      '--output',
      '{"message":"hello"}',
      '--history',
      '[]',
    ],
    { cwd: join(__dirname, '..', '..') },
  );

  const result = JSON.parse(stdout.trim());
  assert.equal(result.done, true);
  assert.deepEqual(result.finalOutput, { message: 'hello' });
  assert.ok(result.completed);
  assert.equal(result.completed.step, 'greet');
});

test('CLI --help prints usage to stderr', async () => {
  const { stderr } = await exec('npx', ['tsx', fixturePath, '--help'], {
    cwd: join(__dirname, '..', '..'),
  });

  assert.ok(stderr.includes('start'));
  assert.ok(stderr.includes('advance'));
  assert.ok(stderr.includes('--context'));
});
