import { z } from 'zod';
import type { SkillDefinition, ReferenceLoader } from '../types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolveHost } from './host.js';
import { McpCompositeSessionManager } from './mcp-composite-session.js';

export function createMcpCompositeServer(
  skill: SkillDefinition,
  options: { host?: string; tools?: string[]; refs: ReferenceLoader },
): McpServer {
  const handshake = resolveHost(options.host, options.tools);
  const sessions = new McpCompositeSessionManager(skill, handshake, options.refs);

  const server = new McpServer(
    { name: skill.name, version: skill.version },
    {
      capabilities: { tools: {} },
      instructions: generateMcpCompositeInstructions(skill, sessions),
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
        subskill: z.string().optional().describe('Start a specific sub-skill directly. Omit to use the dispatcher.'),
      }),
    },
    (args) => {
      const result = sessions.start(args.params ?? {}, args.subskill);
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

  if (skill.topics && Object.keys(skill.topics).length > 0) {
    const topicNames = Object.keys(skill.topics);
    server.registerTool(
      'topic',
      {
        description: `Look up a reference topic. Available: ${topicNames.join(', ')}`,
        inputSchema: z.object({
          name: z.string().describe('Topic name.'),
        }),
      },
      (args) => {
        const topic = skill.topics?.[args.name];
        if (!topic) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: `Unknown topic "${args.name}". Available: ${topicNames.join(', ')}` }),
              },
            ],
            isError: true,
          };
        }
        const content = topic.content({ refs: options.refs });
        return { content: [{ type: 'text', text: JSON.stringify({ name: args.name, content }) }] };
      },
    );
  }

  return server;
}

function generateMcpCompositeInstructions(skill: SkillDefinition, _sessions: McpCompositeSessionManager): string {
  const subskills = skill.subskills ? Object.keys(skill.subskills) : [];
  const topics = skill.topics ? Object.keys(skill.topics) : [];

  const lines = [
    `This MCP server runs the "${skill.name}" composite skill.`,
    '',
    'How to use:',
    '1. Call "start" to begin a new session. Pass "subskill" to go directly to a sub-skill, or omit to use the dispatcher.',
    '2. Read the preamble (first call only). It maps XML tags to your available tools.',
    '3. Follow the prompt instructions. Produce JSON matching the schema.',
    '4. Call "advance" with session, step, and output.',
    '5. Repeat until status is "done".',
    '',
    'Sub-skill step names are prefixed (e.g., "doctor/diagnose").',
    'Do not show raw JSON, session IDs, or tool calls to the user.',
  ];

  if (subskills.length > 0) {
    lines.push('', `Available sub-skills: ${subskills.join(', ')}`);
  }
  if (topics.length > 0) {
    lines.push('', `Reference topics (use "topic" tool): ${topics.join(', ')}`);
  }

  return lines.join('\n');
}

export async function mcpCompositeMain(def: SkillDefinition, refs: ReferenceLoader): Promise<void> {
  const flags = parseMcpFlags(process.argv);

  const server = createMcpCompositeServer(def, {
    host: flags.host,
    tools: flags.tools,
    refs,
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
