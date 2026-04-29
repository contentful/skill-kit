import { z } from 'zod';
import type { SkillDefinition, ReferenceLoader } from '../types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpSessionManager } from './mcp-session.js';
import { resolveHost } from './host.js';
import { generateMcpInstructions } from './mcp-instructions.js';

export interface McpEntryOptions {
  host?: string;
  tools?: string[];
  refs: ReferenceLoader;
}

export function createMcpServer(skill: SkillDefinition, options: McpEntryOptions): McpServer {
  const handshake = resolveHost(options.host, options.tools);
  const sessions = new McpSessionManager(skill, handshake, options.refs);

  const server = new McpServer(
    { name: skill.name, version: skill.version },
    {
      capabilities: { tools: {} },
      instructions: generateMcpInstructions(skill, sessions),
    },
  );

  server.registerTool(
    'start',
    {
      description: `Start a new ${skill.name} workflow session. Returns the first step prompt.`,
      inputSchema: z.object({
        params: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Skill parameters. Omit if the skill takes no params.'),
      }),
    },
    (args) => {
      const result = sessions.start(args.params ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    'advance',
    {
      description: `Submit step output for the current ${skill.name} workflow step and get the next prompt.`,
      inputSchema: z.object({
        session: z.string().describe('Session ID returned by the start tool.'),
        step: z.string().describe('The step name being completed.'),
        output: z.record(z.string(), z.unknown()).describe('JSON output matching the step schema.'),
      }),
    },
    async (args) => {
      const result = await sessions.advance(args.session, args.step, args.output);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
  );

  return server;
}

export async function mcpMain(skill: SkillDefinition, refs?: ReferenceLoader): Promise<void> {
  const flags = parseMcpFlags(process.argv);
  const noopRefs: ReferenceLoader = { load: () => '', asset: (p: string) => p };

  const server = createMcpServer(skill, {
    host: flags.host,
    tools: flags.tools,
    refs: refs ?? noopRefs,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

interface McpFlags {
  host?: string;
  tools?: string[];
}

function parseMcpFlags(argv: string[]): McpFlags {
  const args = argv.slice(2);
  const flags: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--') && i + 1 < args.length) {
      flags[arg.slice(2)] = args[i + 1]!;
      i++;
    }
  }

  return {
    host: flags['host'],
    tools: flags['tools']
      ?.split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  };
}
