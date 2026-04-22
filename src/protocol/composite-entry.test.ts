import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCompositeArgs, type CompositeCommand } from './composite-entry.js';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, 'fixtures', 'composite-skill.ts');
const cwd = join(__dirname, '..', '..');

async function run(...args: string[]): Promise<{ stdout: string; stderr: string }> {
  return exec('npx', ['tsx', fixturePath, ...args], { cwd });
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
  assert.equal(result.prompt, 'Classify intent.');
  assert.ok(result.schema);
});

test('composite: dispatcher advance with subskill redirect starts sub-skill', async () => {
  const { stdout } = await run('advance', '--step', 'classify', '--output', '{"intent":"doctor"}', '--history', '[]');
  const result = JSON.parse(stdout.trim());
  assert.equal(result.step, 'doctor/diagnose');
  assert.equal(result.prompt, 'Diagnose the issue.');
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
  assert.equal(result.prompt, 'Diagnose the issue.');
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
