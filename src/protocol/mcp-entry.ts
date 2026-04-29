import type { SkillDefinition, ReferenceLoader } from '../types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WorkflowEngine } from '../runtime/engine.js';
import { autoAdvance } from './auto-advance.js';
import { McpSessionMap, type McpSession } from './mcp-session.js';
import { resolveHost } from './host.js';
import { generateMcpInstructions } from './mcp-instructions.js';
import { registerWorkflowTools, parseMcpFlags } from './mcp-tools.js';

export interface McpEntryOptions {
  host?: string;
  tools?: string[];
  refs: ReferenceLoader;
}

class SimpleSession implements McpSession {
  private engine: WorkflowEngine;
  private _done = false;

  constructor(engine: WorkflowEngine) {
    this.engine = engine;
  }

  get done() {
    return this._done;
  }

  async advance(stepName: string, output: unknown) {
    const raw = await this.engine.advance(stepName, output);
    const result = await autoAdvance(this.engine, raw);
    if (result.kind === 'done') this._done = true;
    return result;
  }
}

export function createMcpServer(skill: SkillDefinition, options: McpEntryOptions): McpServer {
  const handshake = resolveHost(options.host, options.tools);
  const sessions = new McpSessionMap(handshake);

  const server = new McpServer(
    { name: skill.name, version: skill.version },
    {
      capabilities: { tools: {} },
      instructions: generateMcpInstructions(skill),
    },
  );

  registerWorkflowTools(server, {
    skillName: skill.name,
    sessions,
    onStart(params) {
      const engine = new WorkflowEngine(skill, handshake, params, options.refs);
      const session = new SimpleSession(engine);
      const id = sessions.register(session);
      return sessions.formatStart(id, engine.start());
    },
  });

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
