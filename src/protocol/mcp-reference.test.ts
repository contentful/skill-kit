import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpReferenceServer } from './mcp-reference.js';
import { reference } from '../index.js';
import type { ReferenceLoader } from '../types.js';

const NOOP_REFS: ReferenceLoader = { load: () => '', asset: (p: string) => p };

function testReference() {
  return reference({
    name: 'test-ref',
    description: 'Test reference',
  })
    .topic('greeting', {
      label: 'How to greet',
      content: () => 'Say hello politely.',
    })
    .topic('farewell', {
      label: 'How to say goodbye',
      content: () => 'Wave and smile.',
    })
    .build();
}

async function createConnectedPair() {
  const def = testReference();
  const server = createMcpReferenceServer(def, NOOP_REFS);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { server, client };
}

test('listTools returns topics and topic tools', async () => {
  const { client, server } = await createConnectedPair();

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  assert.ok(names.includes('topics'));
  assert.ok(names.includes('topic'));

  await server.close();
});

test('topics tool lists available topics', async () => {
  const { client, server } = await createConnectedPair();

  const result = await client.callTool({ name: 'topics', arguments: {} });
  const text = (result.content as Array<{ text: string }>)[0]!.text;
  assert.ok(text.includes('greeting'));
  assert.ok(text.includes('farewell'));

  await server.close();
});

test('topic tool returns content', async () => {
  const { client, server } = await createConnectedPair();

  const result = await client.callTool({ name: 'topic', arguments: { name: 'greeting' } });
  const text = (result.content as Array<{ text: string }>)[0]!.text;
  assert.equal(text, 'Say hello politely.');

  await server.close();
});

test('topic tool returns error for unknown topic', async () => {
  const { client, server } = await createConnectedPair();

  const result = await client.callTool({ name: 'topic', arguments: { name: 'unknown' } });
  assert.equal(result.isError, true);
  const text = (result.content as Array<{ text: string }>)[0]!.text;
  assert.ok(text.includes('Unknown topic'));

  await server.close();
});

test('server instructions mention the skill name', async () => {
  const { client, server } = await createConnectedPair();

  const instructions = client.getInstructions();
  assert.ok(instructions);
  assert.ok(instructions.includes('test-ref'));

  await server.close();
});
