import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parseCompositeArgs, type CompositeCommand } from './composite-entry.js';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, 'fixtures', 'composite-skill.ts');
const cwd = join(__dirname, '..', '..');

async function run(...args: string[]): Promise<{ stdout: string; stderr: string }> {
  return exec('npx', ['tsx', fixturePath, ...args], { cwd });
}

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'skill-kit-composite-test-'));
}

function readSessionLines(filePath: string): Array<Record<string, unknown>> {
  return readFileSync(filePath, 'utf-8')
    .trimEnd()
    .split('\n')
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

// --- parseCompositeArgs ---

test('parseCompositeArgs: no args returns help', () => {
  const result = parseCompositeArgs(['node', 'run'], ['doctor', 'setup']);
  assert.equal(result.mode, 'help');
});

test('parseCompositeArgs: --help returns help', () => {
  const result = parseCompositeArgs(['node', 'run', '--help'], ['doctor', 'setup']);
  assert.equal(result.mode, 'help');
});

test('parseCompositeArgs: implicit start with flags', () => {
  const result = parseCompositeArgs(['node', 'run', '--context', '{}'], ['doctor', 'setup']);
  assert.equal(result.mode, 'dispatcher');
  assert.equal((result as Extract<CompositeCommand, { mode: 'dispatcher' }>).command, 'start');
  assert.equal((result as Extract<CompositeCommand, { mode: 'dispatcher' }>).flags['context'], '{}');
});

test('parseCompositeArgs: advance command', () => {
  const result = parseCompositeArgs(
    ['node', 'run', 'advance', '--step', 'classify', '--output', '{}'],
    ['doctor', 'setup'],
  );
  assert.equal(result.mode, 'dispatcher');
  assert.equal((result as Extract<CompositeCommand, { mode: 'dispatcher' }>).command, 'advance');
});

test('parseCompositeArgs: subskill start', () => {
  const result = parseCompositeArgs(['node', 'run', 'doctor', '--context', '{}'], ['doctor', 'setup']);
  assert.equal(result.mode, 'subskill');
  const sub = result as Extract<CompositeCommand, { mode: 'subskill' }>;
  assert.equal(sub.name, 'doctor');
  assert.equal(sub.command, 'start');
});

test('parseCompositeArgs: subskill advance', () => {
  const result = parseCompositeArgs(
    ['node', 'run', 'doctor', 'advance', '--step', 'diagnose', '--output', '{}'],
    ['doctor', 'setup'],
  );
  assert.equal(result.mode, 'subskill');
  const sub = result as Extract<CompositeCommand, { mode: 'subskill' }>;
  assert.equal(sub.name, 'doctor');
  assert.equal(sub.command, 'advance');
});

test('parseCompositeArgs: topics command', () => {
  const result = parseCompositeArgs(['node', 'run', 'topics'], ['doctor', 'setup']);
  assert.equal(result.mode, 'topics');
});

test('parseCompositeArgs: topic command', () => {
  const result = parseCompositeArgs(['node', 'run', 'topic', 'basics'], ['doctor', 'setup']);
  assert.equal(result.mode, 'topic');
  assert.equal((result as Extract<CompositeCommand, { mode: 'topic' }>).name, 'basics');
});

// --- CLI integration tests ---

test('composite: dispatcher start returns first step prompt', async () => {
  const { stdout } = await run('--context', '{}');
  const result = JSON.parse(stdout.trim());
  assert.equal(result.step, 'classify');
  assert.ok(result.prompt.includes('Classify intent.'));
  assert.ok(result.schema);
});

test('composite: dispatcher advance with subskill redirect starts sub-skill', async () => {
  const { stdout } = await run('advance', '--step', 'classify', '--output', '{"intent":"doctor"}', '--history', '[]');
  const result = JSON.parse(stdout.trim());
  assert.equal(result.step, 'doctor/diagnose');
  assert.ok(result.prompt.includes('Diagnose the issue.'));
  assert.ok(result.completed);
  assert.equal(result.completed.step, 'classify');
});

test('composite: dispatcher advance with topic redirect returns done with content', async () => {
  const { stdout } = await run('advance', '--step', 'classify', '--output', '{"intent":"faq"}', '--history', '[]');
  const result = JSON.parse(stdout.trim());
  assert.equal(result.done, true);
  assert.equal(result.finalOutput.topic, 'basics');
  assert.equal(result.finalOutput.content, 'This is the basics FAQ content.');
});

test('composite: sub-skill advance with namespaced step', async () => {
  const history = JSON.stringify([
    { step: 'classify', output: { intent: 'doctor' } },
    { step: 'doctor/diagnose', output: { issue: 'broken' } },
  ]);
  const { stdout } = await run(
    'advance',
    '--step',
    'doctor/diagnose',
    '--output',
    '{"issue":"fixed"}',
    '--history',
    history,
  );
  const result = JSON.parse(stdout.trim());
  assert.equal(result.done, true);
  assert.deepEqual(result.finalOutput, { issue: 'fixed' });
});

test('composite: direct sub-skill start bypasses dispatcher', async () => {
  const { stdout } = await run('doctor', '--context', '{}');
  const result = JSON.parse(stdout.trim());
  assert.equal(result.step, 'doctor/diagnose');
  assert.ok(result.prompt.includes('Diagnose the issue.'));
});

test('composite: direct sub-skill advance', async () => {
  const history = JSON.stringify([{ step: 'doctor/diagnose', output: { issue: 'test' } }]);
  const { stdout } = await run(
    'doctor',
    'advance',
    '--step',
    'diagnose',
    '--output',
    '{"issue":"ok"}',
    '--history',
    history,
  );
  const result = JSON.parse(stdout.trim());
  assert.equal(result.done, true);
});

test('composite: topics command lists available topics', async () => {
  const { stdout } = await run('topics');
  assert.ok(stdout.includes('basics'));
  assert.ok(stdout.includes('Basic FAQ'));
});

test('composite: topic command loads content', async () => {
  const { stdout } = await run('topic', 'basics');
  assert.equal(stdout.trim(), 'This is the basics FAQ content.');
});

test('composite: --help lists subskills and topics', async () => {
  const { stderr } = await run('--help');
  assert.ok(stderr.includes('doctor'));
  assert.ok(stderr.includes('setup'));
  assert.ok(stderr.includes('basics'));
  assert.ok(stderr.includes('Sub-skills'));
  assert.ok(stderr.includes('Reference topics'));
});

// --- Session mode tests ---

test('composite session: dispatcher start creates session file', async () => {
  const dir = createTempDir();
  const { stdout } = await run('--context', '{}', '--session', 'new', '--session-dir', dir);
  const pointer = JSON.parse(stdout.trim());

  assert.ok(pointer.sessionId);
  assert.ok(pointer.file);
  assert.equal(pointer.line, 2);

  const lines = readSessionLines(pointer.file);
  assert.equal(lines[0]!.type, 'header');
  assert.equal(lines[1]!.type, 'prompt');
  assert.equal(lines[1]!.step, 'classify');
});

test('composite session: dispatcher advance with subskill redirect (file mode)', async () => {
  const dir = createTempDir();
  const { stdout: startOut } = await run('--context', '{}', '--session', 'new', '--session-dir', dir);
  const pointer = JSON.parse(startOut.trim());

  appendFileSync(
    pointer.file,
    JSON.stringify({ type: 'output', step: 'classify', output: { intent: 'doctor' } }) + '\n',
  );

  const { stdout: advOut } = await run('advance', '--session', pointer.sessionId, '--session-dir', dir);
  const line = parseInt(advOut.trim(), 10);

  const lines = readSessionLines(pointer.file);
  const resultLine = lines[line - 1]!;
  assert.equal(resultLine.type, 'prompt');
  assert.equal(resultLine.step, 'doctor/diagnose');
  assert.ok(resultLine.completed);
});

test('composite session: dispatcher advance with topic redirect (file mode)', async () => {
  const dir = createTempDir();
  const { stdout: startOut } = await run('--context', '{}', '--session', 'new', '--session-dir', dir);
  const pointer = JSON.parse(startOut.trim());

  appendFileSync(pointer.file, JSON.stringify({ type: 'output', step: 'classify', output: { intent: 'faq' } }) + '\n');

  const { stdout: advOut } = await run('advance', '--session', pointer.sessionId, '--session-dir', dir);
  const line = parseInt(advOut.trim(), 10);

  const lines = readSessionLines(pointer.file);
  const resultLine = lines[line - 1]!;
  assert.equal(resultLine.type, 'done');
  assert.equal((resultLine as Record<string, unknown>).done, true);
  assert.equal((resultLine.finalOutput as Record<string, unknown>).topic, 'basics');
});

test('composite session: full lifecycle dispatcher → subskill (file mode)', async () => {
  const dir = createTempDir();

  const { stdout: startOut } = await run('--context', '{}', '--session', 'new', '--session-dir', dir);
  const pointer = JSON.parse(startOut.trim());

  appendFileSync(
    pointer.file,
    JSON.stringify({ type: 'output', step: 'classify', output: { intent: 'doctor' } }) + '\n',
  );
  const { stdout: adv1 } = await run('advance', '--session', pointer.sessionId, '--session-dir', dir);
  const line1 = parseInt(adv1.trim(), 10);

  const linesAfterRedirect = readSessionLines(pointer.file);
  const subskillPrompt = linesAfterRedirect[line1 - 1]!;
  assert.equal(subskillPrompt.step, 'doctor/diagnose');

  appendFileSync(
    pointer.file,
    JSON.stringify({ type: 'output', step: 'doctor/diagnose', output: { issue: 'fixed' } }) + '\n',
  );
  const { stdout: adv2 } = await run('advance', '--session', pointer.sessionId, '--session-dir', dir);
  const line2 = parseInt(adv2.trim(), 10);

  const finalLines = readSessionLines(pointer.file);
  const doneLine = finalLines[line2 - 1]!;
  assert.equal(doneLine.type, 'done');
  assert.deepEqual(doneLine.finalOutput, { issue: 'fixed' });
});

test('composite session: direct subskill start (file mode)', async () => {
  const dir = createTempDir();
  const { stdout } = await run('doctor', '--context', '{}', '--session', 'new', '--session-dir', dir);
  const pointer = JSON.parse(stdout.trim());

  const lines = readSessionLines(pointer.file);
  assert.equal(lines[1]!.type, 'prompt');
  assert.equal(lines[1]!.step, 'doctor/diagnose');
});

test('composite session: flag mode advance', async () => {
  const dir = createTempDir();
  const { stdout: startOut } = await run(
    '--context',
    '{}',
    '--session',
    'new',
    '--session-dir',
    dir,
    '--output-mode',
    'flag',
  );
  const pointer = JSON.parse(startOut.trim());

  const { stdout: advOut } = await run(
    'advance',
    '--step',
    'classify',
    '--output',
    '{"intent":"faq"}',
    '--session',
    pointer.sessionId,
    '--session-dir',
    dir,
  );
  const line = parseInt(advOut.trim(), 10);

  const lines = readSessionLines(pointer.file);
  const doneLine = lines[line - 1]!;
  assert.equal(doneLine.type, 'done');
  assert.equal((doneLine.finalOutput as Record<string, unknown>).topic, 'basics');
});
