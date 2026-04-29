import test from 'node:test';
import assert from 'node:assert/strict';
import { McpSessionMap, type McpSession } from './mcp-session.js';
import { WorkflowEngine } from '../runtime/engine.js';
import { autoAdvance } from './auto-advance.js';
import { skill, z } from '../index.js';
import type { Handshake, ReferenceLoader, CliResult } from '../types.js';

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

class TestSession implements McpSession {
  private engine: WorkflowEngine;
  private _done = false;

  constructor(def: ReturnType<typeof simpleSkill>, params: unknown = {}) {
    this.engine = new WorkflowEngine(def, HANDSHAKE, params, NOOP_REFS);
  }

  get done() {
    return this._done;
  }

  startEngine() {
    return this.engine.start();
  }

  async advance(stepName: string, output: unknown): Promise<CliResult> {
    const raw = await this.engine.advance(stepName, output);
    const result = await autoAdvance(this.engine, raw);
    if (result.kind === 'done') this._done = true;
    return result;
  }
}

function startSession(sessions: McpSessionMap, def: ReturnType<typeof simpleSkill>) {
  const session = new TestSession(def);
  const id = sessions.register(session);
  const result = sessions.formatStart(id, session.startEngine());
  return { id, result };
}

test('start returns prompt with preamble and session ID', () => {
  const sessions = new McpSessionMap(HANDSHAKE);
  const { result } = startSession(sessions, simpleSkill());

  assert.equal(result.status, 'prompt');
  assert.ok('step' in result && result.step === 'greet');
  assert.ok(result.session);
  assert.equal(result.session.length, 8);
  assert.ok('preamble' in result && result.preamble);
});

test('start returns different session IDs', () => {
  const sessions = new McpSessionMap(HANDSHAKE);
  const { id: id1 } = startSession(sessions, simpleSkill());
  const { id: id2 } = startSession(sessions, simpleSkill());

  assert.notEqual(id1, id2);
});

test('advance completes a single-step workflow', async () => {
  const sessions = new McpSessionMap(HANDSHAKE);
  const { id } = startSession(sessions, simpleSkill());

  const result = await sessions.advance(id, 'greet', { message: 'hello' });
  assert.equal(result.status, 'done');
  assert.ok('finalOutput' in result);
});

test('advance walks through a multi-step workflow', async () => {
  const sessions = new McpSessionMap(HANDSHAKE);
  const { id } = startSession(sessions, multiStepSkill());

  const r2 = await sessions.advance(id, 'greet', { message: 'hi' });
  assert.equal(r2.status, 'prompt');
  assert.ok('step' in r2 && r2.step === 'ask');
  assert.ok(!('preamble' in r2) || !r2.preamble);

  const r3 = await sessions.advance(id, 'ask', { answer: '42' });
  assert.equal(r3.status, 'done');
});

test('advance on unknown session returns error', async () => {
  const sessions = new McpSessionMap(HANDSHAKE);
  const result = await sessions.advance('nonexistent', 'greet', {});

  assert.equal(result.status, 'error');
  assert.ok('message' in result && result.message.includes('Unknown session'));
});

test('advance on completed session returns error', async () => {
  const sessions = new McpSessionMap(HANDSHAKE);
  const { id } = startSession(sessions, simpleSkill());
  await sessions.advance(id, 'greet', { message: 'hello' });

  const result = await sessions.advance(id, 'greet', { message: 'again' });
  assert.equal(result.status, 'error');
  assert.ok('message' in result && result.message.includes('start tool'));
});

test('validation error returns retry-able error', async () => {
  const sessions = new McpSessionMap(HANDSHAKE);
  const { id } = startSession(sessions, simpleSkill());

  const result = await sessions.advance(id, 'greet', { wrong: 'field' });
  assert.equal(result.status, 'error');
  assert.ok('retry' in result && result.retry === true);
});

test('multiple concurrent sessions are independent', async () => {
  const sessions = new McpSessionMap(HANDSHAKE);
  const { id: id1 } = startSession(sessions, multiStepSkill());
  const { id: id2 } = startSession(sessions, multiStepSkill());

  await sessions.advance(id1, 'greet', { message: 'a' });
  const r2 = await sessions.advance(id2, 'greet', { message: 'b' });

  assert.equal(r2.status, 'prompt');
  assert.ok('step' in r2 && r2.step === 'ask');

  const r1done = await sessions.advance(id1, 'ask', { answer: 'x' });
  assert.equal(r1done.status, 'done');

  const r2done = await sessions.advance(id2, 'ask', { answer: 'y' });
  assert.equal(r2done.status, 'done');
});
