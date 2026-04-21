import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from './single-invocation.js';

test('parseArgs parses start command', () => {
  const result = parseArgs(['node', 'skill', 'start', '--context', '{"path":"."}', '--host', 'claude-code']);
  assert.equal(result.command, 'start');
  assert.equal(result.flags['context'], '{"path":"."}');
  assert.equal(result.flags['host'], 'claude-code');
});

test('parseArgs parses advance command', () => {
  const result = parseArgs([
    'node',
    'skill',
    'advance',
    '--step',
    'diagnose',
    '--output',
    '{"checks":[]}',
    '--history',
    '[]',
    '--host',
    'generic',
  ]);
  assert.equal(result.command, 'advance');
  assert.equal(result.flags['step'], 'diagnose');
  assert.equal(result.flags['output'], '{"checks":[]}');
  assert.equal(result.flags['history'], '[]');
});

test('parseArgs returns help for --help', () => {
  const result = parseArgs(['node', 'skill', '--help']);
  assert.equal(result.command, 'help');
});

test('parseArgs returns help for no args', () => {
  const result = parseArgs(['node', 'skill']);
  assert.equal(result.command, 'help');
});

test('parseArgs returns help for unknown command', () => {
  const result = parseArgs(['node', 'skill', 'unknown']);
  assert.equal(result.command, 'help');
});

test('parseArgs defaults to start when first arg is a flag', () => {
  const result = parseArgs(['node', 'skill', '--context', '{}', '--host', 'claude-code']);
  assert.equal(result.command, 'start');
  assert.equal(result.flags['context'], '{}');
  assert.equal(result.flags['host'], 'claude-code');
});
