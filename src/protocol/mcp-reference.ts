import { z } from 'zod';
import type { ReferenceDefinition, ReferenceLoader } from '../types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export function createMcpReferenceServer(def: ReferenceDefinition, refs: ReferenceLoader): McpServer {
  const topicNames = Object.keys(def.topics);

  const server = new McpServer(
    { name: def.name, version: def.version },
    {
      capabilities: { tools: {} },
      instructions: [
        `This MCP server provides reference topics for "${def.name}".`,
        '',
        `Call the "topic" tool with a topic name. Available topics: ${topicNames.join(', ')}`,
        '',
        'Present the content to the user. Do not show raw JSON or tool calls.',
      ].join('\n'),
    },
  );

  server.registerTool('topics', { description: `List available ${def.name} reference topics.` }, () => {
    const list = Object.entries(def.topics).map(([name, t]) => `${name}: ${t.label}`);
    return { content: [{ type: 'text', text: list.join('\n') }] };
  });

  server.registerTool(
    'topic',
    {
      description: `Look up a ${def.name} reference topic. Available: ${topicNames.join(', ')}`,
      inputSchema: z.object({
        name: z.string().describe('Topic name.'),
      }),
    },
    (args) => {
      const topic = def.topics[args.name];
      if (!topic) {
        return {
          content: [
            {
              type: 'text',
              text: `Unknown topic "${args.name}". Available: ${topicNames.join(', ')}`,
            },
          ],
          isError: true,
        };
      }
      const content = topic.content({ refs });
      return { content: [{ type: 'text', text: content }] };
    },
  );

  return server;
}

export async function mcpReferenceMain(def: ReferenceDefinition, refs: ReferenceLoader): Promise<void> {
  const server = createMcpReferenceServer(def, refs);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
