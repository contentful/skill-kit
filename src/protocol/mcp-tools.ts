import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpSessionMap, McpResult } from './mcp-session.js';

export interface WorkflowToolsOptions {
  skillName: string;
  sessions: McpSessionMap;
  onStart: (params: Record<string, unknown>) => McpResult;
}

function toToolResult(result: McpResult) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
}

export function registerWorkflowTools(server: McpServer, options: WorkflowToolsOptions): void {
  const { skillName, sessions, onStart } = options;

  server.registerTool(
    'start',
    {
      description: `Start a new ${skillName} workflow session. Returns the first step prompt.`,
      inputSchema: z.object({
        params: z.record(z.string(), z.unknown()).optional(),
      }),
    },
    (args) => toToolResult(onStart(args.params ?? {})),
  );

  server.registerTool(
    'advance',
    {
      description: `Submit step output for the current ${skillName} workflow step and get the next prompt.`,
      inputSchema: z.object({
        session: z.string(),
        step: z.string(),
        output: z.record(z.string(), z.unknown()),
      }),
    },
    async (args) => toToolResult(await sessions.advance(args.session, args.step, args.output)),
  );
}

export interface McpFlags {
  host?: string;
  tools?: string[];
}

export function parseMcpFlags(argv: string[]): McpFlags {
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
