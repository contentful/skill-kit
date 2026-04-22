import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionManager } from './session.js';
import type { PromptResult, DoneResult, ValidationErrorResult } from '../types.js';

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'skill-kit-test-'));
}

test('SessionManager.create writes header and returns SessionFile', () => {
  const dir = createTempDir();
  const session = SessionManager.create({
    sessionDir: dir,
    skill: 'test-skill',
    host: 'claude-code',
    context: { path: '.' },
  });

  assert.match(session.sessionId, /^[a-f0-9]{8}$/);
  assert.equal(session.header.type, 'header');
  assert.equal(session.header.skill, 'test-skill');
  assert.equal(session.header.host, 'claude-code');
  assert.deepEqual(session.header.context, { path: '.' });
  assert.equal(session.header.outputMode, 'file');

  const content = readFileSync(session.filePath, 'utf-8');
  const header = JSON.parse(content.trimEnd());
  assert.equal(header.type, 'header');
  assert.equal(header.sessionId, session.sessionId);
});

test('SessionManager.create respects outputMode flag', () => {
  const dir = createTempDir();
  const session = SessionManager.create({
    sessionDir: dir,
    skill: 'test-skill',
    host: 'claude-code',
    context: {},
    outputMode: 'flag',
  });

  assert.equal(session.header.outputMode, 'flag');
});

test('SessionManager.open reads existing session', () => {
  const dir = createTempDir();
  const created = SessionManager.create({
    sessionDir: dir,
    skill: 'test-skill',
    host: 'claude-code',
    context: { key: 'value' },
  });

  const opened = SessionManager.open(created.sessionId, dir);
  assert.equal(opened.sessionId, created.sessionId);
  assert.equal(opened.filePath, created.filePath);
  assert.equal(opened.header.skill, 'test-skill');
  assert.deepEqual(opened.header.context, { key: 'value' });
});

test('SessionManager.open throws for nonexistent session', () => {
  const dir = createTempDir();
  assert.throws(() => SessionManager.open('deadbeef', dir), /session "deadbeef" not found/);
});

test('SessionFile.append returns incrementing line numbers', () => {
  const dir = createTempDir();
  const session = SessionManager.create({
    sessionDir: dir,
    skill: 'test-skill',
    host: 'claude-code',
    context: {},
  });

  const line2 = session.append({ type: 'prompt', step: 'greet', prompt: 'Hello', schema: {} });
  assert.equal(line2, 2);

  const line3 = session.append({ type: 'output', step: 'greet', output: { message: 'hi' } });
  assert.equal(line3, 3);

  const line4 = session.append({ type: 'prompt', step: 'ask', prompt: 'What?', schema: {} });
  assert.equal(line4, 4);
});

test('SessionFile.lineCount returns correct count', () => {
  const dir = createTempDir();
  const session = SessionManager.create({
    sessionDir: dir,
    skill: 'test-skill',
    host: 'claude-code',
    context: {},
  });

  assert.equal(session.lineCount(), 1);
  session.append({ type: 'prompt', step: 'greet', prompt: 'Hello', schema: {} });
  assert.equal(session.lineCount(), 2);
});

test('SessionFile.reconstructHistory builds history from completed fields', () => {
  const dir = createTempDir();
  const session = SessionManager.create({
    sessionDir: dir,
    skill: 'test-skill',
    host: 'claude-code',
    context: {},
  });

  session.append({ type: 'prompt', step: 'greet', prompt: 'Hello', schema: {} });
  session.append({ type: 'output', step: 'greet', output: { message: 'hi' } });
  session.append({
    type: 'prompt',
    step: 'ask',
    prompt: 'What?',
    schema: {},
    completed: { step: 'greet', output: { message: 'hi' } },
  });
  session.append({ type: 'output', step: 'ask', output: { answer: 'stuff' } });
  session.append({
    type: 'done',
    done: true,
    finalOutput: { result: 'ok' },
    completed: { step: 'ask', output: { answer: 'stuff' }, action: { status: 200 } },
  });

  const history = session.reconstructHistory();
  assert.equal(history.length, 2);
  assert.deepEqual(history[0], { step: 'greet', output: { message: 'hi' } });
  assert.deepEqual(history[1], { step: 'ask', output: { answer: 'stuff' }, action: { status: 200 } });
});

test('SessionFile.reconstructHistory returns empty for fresh session', () => {
  const dir = createTempDir();
  const session = SessionManager.create({
    sessionDir: dir,
    skill: 'test-skill',
    host: 'claude-code',
    context: {},
  });

  session.append({ type: 'prompt', step: 'greet', prompt: 'Hello', schema: {} });

  const history = session.reconstructHistory();
  assert.equal(history.length, 0);
});

test('SessionFile.readLastOutput finds the last output line', () => {
  const dir = createTempDir();
  const session = SessionManager.create({
    sessionDir: dir,
    skill: 'test-skill',
    host: 'claude-code',
    context: {},
  });

  session.append({ type: 'prompt', step: 'greet', prompt: 'Hello', schema: {} });
  session.append({ type: 'output', step: 'greet', output: { message: 'hi' } });
  session.append({
    type: 'prompt',
    step: 'ask',
    prompt: 'What?',
    schema: {},
    completed: { step: 'greet', output: { message: 'hi' } },
  });
  session.append({ type: 'output', step: 'ask', output: { answer: 'stuff' } });

  const last = session.readLastOutput();
  assert.deepEqual(last, { step: 'ask', output: { answer: 'stuff' } });
});

test('SessionFile.readLastOutput returns null when no output lines exist', () => {
  const dir = createTempDir();
  const session = SessionManager.create({
    sessionDir: dir,
    skill: 'test-skill',
    host: 'claude-code',
    context: {},
  });

  session.append({ type: 'prompt', step: 'greet', prompt: 'Hello', schema: {} });

  assert.equal(session.readLastOutput(), null);
});

test('SessionFile.appendResult adds type field to PromptResult', () => {
  const dir = createTempDir();
  const session = SessionManager.create({
    sessionDir: dir,
    skill: 'test-skill',
    host: 'claude-code',
    context: {},
  });

  const result: PromptResult = { step: 'greet', prompt: 'Hello', schema: { type: 'object' } };
  const line = session.appendResult(result);
  assert.equal(line, 2);

  const content = readFileSync(session.filePath, 'utf-8');
  const lines = content.trimEnd().split('\n');
  const parsed = JSON.parse(lines[1]!);
  assert.equal(parsed.type, 'prompt');
  assert.equal(parsed.step, 'greet');
});

test('SessionFile.appendResult adds type field to DoneResult', () => {
  const dir = createTempDir();
  const session = SessionManager.create({
    sessionDir: dir,
    skill: 'test-skill',
    host: 'claude-code',
    context: {},
  });

  const result: DoneResult = { done: true, finalOutput: { summary: 'done' } };
  session.appendResult(result);

  const content = readFileSync(session.filePath, 'utf-8');
  const lines = content.trimEnd().split('\n');
  const parsed = JSON.parse(lines[1]!);
  assert.equal(parsed.type, 'done');
  assert.equal(parsed.done, true);
});

test('SessionFile.appendResult adds type field to ValidationErrorResult', () => {
  const dir = createTempDir();
  const session = SessionManager.create({
    sessionDir: dir,
    skill: 'test-skill',
    host: 'claude-code',
    context: {},
  });

  const result: ValidationErrorResult = { error: 'validation', step: 'greet', message: 'bad', retry: true };
  session.appendResult(result);

  const content = readFileSync(session.filePath, 'utf-8');
  const lines = content.trimEnd().split('\n');
  const parsed = JSON.parse(lines[1]!);
  assert.equal(parsed.type, 'error');
  assert.equal(parsed.error, 'validation');
});

test('SessionFile.cleanup removes the session file', () => {
  const dir = createTempDir();
  const session = SessionManager.create({
    sessionDir: dir,
    skill: 'test-skill',
    host: 'claude-code',
    context: {},
  });

  session.cleanup();
  assert.throws(() => SessionManager.open(session.sessionId, dir), /not found/);
});

test('SessionManager.cleanup removes session file by id', () => {
  const dir = createTempDir();
  const session = SessionManager.create({
    sessionDir: dir,
    skill: 'test-skill',
    host: 'claude-code',
    context: {},
  });

  SessionManager.cleanup(session.sessionId, dir);
  assert.throws(() => SessionManager.open(session.sessionId, dir), /not found/);
});

test('SessionFile handles malformed lines gracefully', () => {
  const dir = createTempDir();
  const session = SessionManager.create({
    sessionDir: dir,
    skill: 'test-skill',
    host: 'claude-code',
    context: {},
  });

  appendFileSync(session.filePath, '{"type":"prompt","step":"greet","prompt":"Hello","schema":{}}\n');
  appendFileSync(session.filePath, 'not valid json\n');
  appendFileSync(session.filePath, '{"type":"output","step":"greet","output":{"message":"hi"}}\n');

  const last = session.readLastOutput();
  assert.deepEqual(last, { step: 'greet', output: { message: 'hi' } });
});
