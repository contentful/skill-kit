import test from 'node:test';
import assert from 'node:assert/strict';
import { McpSessionManager } from './mcp-session.js';
import { skill, z } from '../index.js';
import type { Handshake, ReferenceLoader } from '../types.js';

const HANDSHAKE: Handshake = { host: 'claude-code', toolsAvailable: [], isSubagent: false };
const NOOP_REFS: ReferenceLoader = { load: () => '', asset: (p: string) => p };

function simpleSkill() {
  return skill({ name: 'test', entry: 'greet' })
    .step('greet', {
      prompt: 'Say hello.',
      output: z.object({ message: z.string() }),
      next: { terminal: true },
    })
    .build();
}

function multiStepSkill() {
  return skill({ name: 'multi', entry: 'greet' })
    .step('greet', {
      prompt: 'Say hello.',
      output: z.object({ message: z.string() }),
      next: 'ask',
    })
    .step('ask', {
      prompt: 'Ask a question.',
      output: z.object({ answer: z.string() }),
      next: { terminal: true },
    })
    .build();
}

test('start returns prompt with preamble and session ID', () => {
  const manager = new McpSessionManager(simpleSkill(), HANDSHAKE, NOOP_REFS);
  const result = manager.start({});

  assert.equal(result.status, 'prompt');
  assert.equal(result.step, 'greet');
  assert.ok(result.session);
  assert.equal(result.session.length, 8);
  assert.ok('preamble' in result && result.preamble);
  assert.ok('prompt' in result && result.prompt);
  assert.ok('schema' in result && result.schema);
});

test('start returns different session IDs', () => {
  const manager = new McpSessionManager(simpleSkill(), HANDSHAKE, NOOP_REFS);
  const r1 = manager.start({});
  const r2 = manager.start({});

  assert.notEqual(r1.session, r2.session);
});

test('advance completes a single-step workflow', async () => {
  const manager = new McpSessionManager(simpleSkill(), HANDSHAKE, NOOP_REFS);
  const start = manager.start({});
  assert.equal(start.status, 'prompt');

  const result = await manager.advance(start.session, 'greet', { message: 'hello' });
  assert.equal(result.status, 'done');
  assert.ok('finalOutput' in result);
});

test('advance walks through a multi-step workflow', async () => {
  const manager = new McpSessionManager(multiStepSkill(), HANDSHAKE, NOOP_REFS);
  const start = manager.start({});
  assert.equal(start.status, 'prompt');
  assert.equal(start.step, 'greet');

  const r2 = await manager.advance(start.session, 'greet', { message: 'hi' });
  assert.equal(r2.status, 'prompt');
  assert.ok('step' in r2 && r2.step === 'ask');
  assert.ok(!('preamble' in r2) || !r2.preamble);

  const r3 = await manager.advance(start.session, 'ask', { answer: '42' });
  assert.equal(r3.status, 'done');
});

test('advance on unknown session returns error', async () => {
  const manager = new McpSessionManager(simpleSkill(), HANDSHAKE, NOOP_REFS);
  const result = await manager.advance('nonexistent', 'greet', {});

  assert.equal(result.status, 'error');
  assert.ok('message' in result && result.message.includes('Unknown session'));
});

test('advance on completed session returns error', async () => {
  const manager = new McpSessionManager(simpleSkill(), HANDSHAKE, NOOP_REFS);
  const start = manager.start({});
  await manager.advance(start.session, 'greet', { message: 'hello' });

  const result = await manager.advance(start.session, 'greet', { message: 'again' });
  assert.equal(result.status, 'error');
  assert.ok('message' in result && result.message.includes('start tool'));
});

test('validation error returns retry-able error', async () => {
  const manager = new McpSessionManager(simpleSkill(), HANDSHAKE, NOOP_REFS);
  const start = manager.start({});

  const result = await manager.advance(start.session, 'greet', { wrong: 'field' });
  assert.equal(result.status, 'error');
  assert.ok('retry' in result && result.retry === true);
});

test('multiple concurrent sessions are independent', async () => {
  const manager = new McpSessionManager(multiStepSkill(), HANDSHAKE, NOOP_REFS);
  const s1 = manager.start({});
  const s2 = manager.start({});

  await manager.advance(s1.session, 'greet', { message: 'a' });
  const r2 = await manager.advance(s2.session, 'greet', { message: 'b' });

  assert.equal(r2.status, 'prompt');
  assert.ok('step' in r2 && r2.step === 'ask');

  const r1done = await manager.advance(s1.session, 'ask', { answer: 'x' });
  assert.equal(r1done.status, 'done');

  const r2done = await manager.advance(s2.session, 'ask', { answer: 'y' });
  assert.equal(r2done.status, 'done');
});
