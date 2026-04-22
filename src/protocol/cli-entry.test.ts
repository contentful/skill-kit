import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, 'fixtures', 'simple-skill.ts');
const multiStepFixturePath = join(__dirname, 'fixtures', 'multi-step-skill.ts');

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
    ['tsx', fixturePath, 'advance', '--step', 'greet', '--output', '{"message":"hello"}', '--history', '[]'],
    { cwd: join(__dirname, '..', '..') },
  );

  const result = JSON.parse(stdout.trim());
  assert.equal(result.done, true);
  assert.deepEqual(result.finalOutput, { message: 'hello' });
  assert.ok(result.completed);
  assert.equal(result.completed.step, 'greet');
});

test('CLI implicit start (no subcommand) returns first step prompt as JSON', async () => {
  const { stdout } = await exec('npx', ['tsx', fixturePath, '--context', '{}'], {
    cwd: join(__dirname, '..', '..'),
  });

  const result = JSON.parse(stdout.trim());
  assert.equal(result.step, 'greet');
  assert.equal(result.prompt, 'Say hello.');
  assert.ok(result.schema);
});

test('CLI --help prints usage to stderr', async () => {
  const { stderr } = await exec('npx', ['tsx', fixturePath, '--help'], {
    cwd: join(__dirname, '..', '..'),
  });

  assert.ok(stderr.includes('start'));
  assert.ok(stderr.includes('advance'));
  assert.ok(stderr.includes('--context'));
});

// --- Session mode tests ---

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'skill-kit-cli-test-'));
}

test('CLI session start returns session pointer', async () => {
  const dir = createTempDir();
  const { stdout } = await exec(
    'npx',
    ['tsx', fixturePath, 'start', '--context', '{}', '--host', 'claude-code', '--session', 'new', '--session-dir', dir],
    { cwd: join(__dirname, '..', '..') },
  );

  const pointer = JSON.parse(stdout.trim());
  assert.ok(pointer.sessionId);
  assert.ok(pointer.file);
  assert.equal(pointer.line, 2);

  const fileContent = readFileSync(pointer.file, 'utf-8');
  const lines = fileContent.trimEnd().split('\n');
  assert.equal(lines.length, 2);

  const header = JSON.parse(lines[0]!);
  assert.equal(header.type, 'header');
  assert.equal(header.skill, 'simple');
  assert.equal(header.host, 'claude-code');

  const prompt = JSON.parse(lines[1]!);
  assert.equal(prompt.type, 'prompt');
  assert.equal(prompt.step, 'greet');
  assert.equal(prompt.prompt, 'Say hello.');
});

test('CLI session advance in flag mode returns line number', async () => {
  const dir = createTempDir();

  const { stdout: startOut } = await exec(
    'npx',
    ['tsx', fixturePath, 'start', '--context', '{}', '--session', 'new', '--session-dir', dir, '--output-mode', 'flag'],
    { cwd: join(__dirname, '..', '..') },
  );
  const pointer = JSON.parse(startOut.trim());

  const { stdout: advanceOut } = await exec(
    'npx',
    [
      'tsx', fixturePath, 'advance',
      '--step', 'greet',
      '--output', '{"message":"hello"}',
      '--session', pointer.sessionId,
      '--session-dir', dir,
    ],
    { cwd: join(__dirname, '..', '..') },
  );

  const line = parseInt(advanceOut.trim(), 10);
  assert.equal(line, 4);

  const fileContent = readFileSync(pointer.file, 'utf-8');
  const lines = fileContent.trimEnd().split('\n');
  assert.equal(lines.length, 4);

  const outputLine = JSON.parse(lines[2]!);
  assert.equal(outputLine.type, 'output');
  assert.equal(outputLine.step, 'greet');

  const doneLine = JSON.parse(lines[3]!);
  assert.equal(doneLine.type, 'done');
  assert.equal(doneLine.done, true);
});

test('CLI session advance in file mode reads output from session file', async () => {
  const dir = createTempDir();

  const { stdout: startOut } = await exec(
    'npx',
    ['tsx', fixturePath, 'start', '--context', '{}', '--session', 'new', '--session-dir', dir],
    { cwd: join(__dirname, '..', '..') },
  );
  const pointer = JSON.parse(startOut.trim());

  appendFileSync(pointer.file, JSON.stringify({ type: 'output', step: 'greet', output: { message: 'hello' } }) + '\n');

  const { stdout: advanceOut } = await exec(
    'npx',
    ['tsx', fixturePath, 'advance', '--session', pointer.sessionId, '--session-dir', dir],
    { cwd: join(__dirname, '..', '..') },
  );

  const line = parseInt(advanceOut.trim(), 10);
  assert.equal(line, 4);

  const fileContent = readFileSync(pointer.file, 'utf-8');
  const lines = fileContent.trimEnd().split('\n');

  const doneLine = JSON.parse(lines[3]!);
  assert.equal(doneLine.type, 'done');
  assert.equal(doneLine.done, true);
  assert.deepEqual(doneLine.finalOutput, { message: 'hello' });
});

test('CLI session full lifecycle with multi-step skill (file mode)', async () => {
  const dir = createTempDir();

  const { stdout: startOut } = await exec(
    'npx',
    ['tsx', multiStepFixturePath, 'start', '--context', '{}', '--session', 'new', '--session-dir', dir],
    { cwd: join(__dirname, '..', '..') },
  );
  const pointer = JSON.parse(startOut.trim());
  assert.equal(pointer.line, 2);

  appendFileSync(pointer.file, JSON.stringify({ type: 'output', step: 'greet', output: { message: 'hi' } }) + '\n');

  const { stdout: adv1Out } = await exec(
    'npx',
    ['tsx', multiStepFixturePath, 'advance', '--session', pointer.sessionId, '--session-dir', dir],
    { cwd: join(__dirname, '..', '..') },
  );
  const line1 = parseInt(adv1Out.trim(), 10);
  assert.equal(line1, 4);

  const fileContent1 = readFileSync(pointer.file, 'utf-8');
  const promptLine = JSON.parse(fileContent1.trimEnd().split('\n')[3]!);
  assert.equal(promptLine.type, 'prompt');
  assert.equal(promptLine.step, 'ask');
  assert.ok(promptLine.completed);
  assert.equal(promptLine.completed.step, 'greet');

  appendFileSync(pointer.file, JSON.stringify({ type: 'output', step: 'ask', output: { answer: 'stuff' } }) + '\n');

  const { stdout: adv2Out } = await exec(
    'npx',
    ['tsx', multiStepFixturePath, 'advance', '--session', pointer.sessionId, '--session-dir', dir],
    { cwd: join(__dirname, '..', '..') },
  );
  const line2 = parseInt(adv2Out.trim(), 10);
  assert.equal(line2, 6);

  const fileContent2 = readFileSync(pointer.file, 'utf-8');
  const doneLine = JSON.parse(fileContent2.trimEnd().split('\n')[5]!);
  assert.equal(doneLine.type, 'done');
  assert.equal(doneLine.done, true);
  assert.deepEqual(doneLine.finalOutput, { answer: 'stuff' });
  assert.equal(doneLine.completed.step, 'ask');
});

test('CLI session stateless mode still works without --session', async () => {
  const { stdout } = await exec(
    'npx',
    ['tsx', fixturePath, 'advance', '--step', 'greet', '--output', '{"message":"hello"}', '--history', '[]'],
    { cwd: join(__dirname, '..', '..') },
  );

  const result = JSON.parse(stdout.trim());
  assert.equal(result.done, true);
  assert.deepEqual(result.finalOutput, { message: 'hello' });
});
