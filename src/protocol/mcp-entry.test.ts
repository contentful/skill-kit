import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from './mcp-entry.js';
import { skill, z } from '../index.js';
import type { ReferenceLoader } from '../types.js';

const NOOP_REFS: ReferenceLoader = { load: () => '', asset: (p: string) => p };

function simpleSkill() {
  return skill({ name: 'test-skill', entry: 'greet' })
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

async function createConnectedPair(def: ReturnType<typeof simpleSkill>) {
  const server = createMcpServer(def, { host: 'claude-code', refs: NOOP_REFS });
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return { server, client };
}

test('listTools returns start and advance tools', async () => {
  const { client, server } = await createConnectedPair(simpleSkill());

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  assert.ok(names.includes('start'));
  assert.ok(names.includes('advance'));

  await server.close();
});

test('start tool returns prompt with session', async () => {
  const { client, server } = await createConnectedPair(simpleSkill());

  const result = await client.callTool({ name: 'start', arguments: {} });
  assert.equal(result.isError, undefined);
  assert.ok(result.content);

  const content = result.content as Array<{ type: string; text: string }>;
  const parsed = JSON.parse(content[0]!.text);
  assert.equal(parsed.status, 'prompt');
  assert.equal(parsed.step, 'greet');
  assert.ok(parsed.session);
  assert.ok(parsed.preamble);
  assert.ok(parsed.prompt);

  await server.close();
});

test('full workflow via MCP: start → advance → done', async () => {
  const { client, server } = await createConnectedPair(simpleSkill());

  const startResult = await client.callTool({ name: 'start', arguments: {} });
  const startParsed = JSON.parse((startResult.content as Array<{ text: string }>)[0]!.text);
  assert.equal(startParsed.status, 'prompt');

  const advanceResult = await client.callTool({
    name: 'advance',
    arguments: {
      session: startParsed.session,
      step: 'greet',
      output: { message: 'hello world' },
    },
  });
  const advanceParsed = JSON.parse((advanceResult.content as Array<{ text: string }>)[0]!.text);
  assert.equal(advanceParsed.status, 'done');
  assert.deepEqual(advanceParsed.finalOutput, { message: 'hello world' });

  await server.close();
});

test('multi-step workflow via MCP', async () => {
  const { client, server } = await createConnectedPair(multiStepSkill());

  const r1 = await client.callTool({ name: 'start', arguments: {} });
  const p1 = JSON.parse((r1.content as Array<{ text: string }>)[0]!.text);
  assert.equal(p1.status, 'prompt');
  assert.equal(p1.step, 'greet');

  const r2 = await client.callTool({
    name: 'advance',
    arguments: { session: p1.session, step: 'greet', output: { message: 'hi' } },
  });
  const p2 = JSON.parse((r2.content as Array<{ text: string }>)[0]!.text);
  assert.equal(p2.status, 'prompt');
  assert.equal(p2.step, 'ask');

  const r3 = await client.callTool({
    name: 'advance',
    arguments: { session: p1.session, step: 'ask', output: { answer: '42' } },
  });
  const p3 = JSON.parse((r3.content as Array<{ text: string }>)[0]!.text);
  assert.equal(p3.status, 'done');

  await server.close();
});

test('advance with invalid session returns error in result', async () => {
  const { client, server } = await createConnectedPair(simpleSkill());

  const result = await client.callTool({
    name: 'advance',
    arguments: { session: 'bad', step: 'greet', output: {} },
  });
  const parsed = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
  assert.equal(parsed.status, 'error');
  assert.ok(parsed.message.includes('Unknown session'));

  await server.close();
});

test('server instructions are set', async () => {
  const server = createMcpServer(simpleSkill(), { host: 'claude-code', refs: NOOP_REFS });
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const info = client.getServerCapabilities();
  assert.ok(info);

  const instructions = client.getInstructions();
  assert.ok(instructions);
  assert.ok(instructions.includes('test-skill'));

  await server.close();
});
