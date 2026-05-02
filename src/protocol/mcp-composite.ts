import { z } from 'zod';
import type { SkillDefinition, ReferenceLoader, CliResult, Handshake } from '../types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WorkflowEngine } from '../runtime/engine.js';
import { SubskillEngine } from './subskill-engine.js';
import { autoAdvance } from './auto-advance.js';
import { McpSessionMap, type McpSession } from './mcp-session.js';
import { resolveHost } from './host.js';
import { generateMcpCompositeInstructions } from './mcp-instructions.js';
import { registerWorkflowTools, parseMcpFlags } from './mcp-tools.js';
import type { SkillEngine } from './skill-engine.js';

class CompositeSession implements McpSession {
  private engine: SkillEngine;
  private _done = false;
  private readonly skill: SkillDefinition;
  private readonly handshake: Handshake;
  private readonly refs: ReferenceLoader;

  constructor(engine: SkillEngine, skill: SkillDefinition, handshake: Handshake, refs: ReferenceLoader) {
    this.engine = engine;
    this.skill = skill;
    this.handshake = handshake;
    this.refs = refs;
  }

  get done() {
    return this._done;
  }

  async advance(stepName: string, output: unknown): Promise<CliResult> {
    const raw = await this.engine.advance(stepName, output);
    const result = await autoAdvance(this.engine, raw);

    if (result.kind === 'redirect') {
      return this.handleRedirect(result);
    }

    if (result.kind === 'done') this._done = true;
    return result;
  }

  private async handleRedirect(redirect: CliResult & { kind: 'redirect' }): Promise<CliResult> {
    const target = redirect.redirect;

    if (target.startsWith('topic:')) {
      const topicName = target.slice('topic:'.length);
      const topic = this.skill.topics?.[topicName];
      if (!topic) {
        return {
          kind: 'error',
          error: 'validation',
          step: '',
          message: `Redirect to unknown topic "${topicName}".`,
          retry: false,
        };
      }
      this._done = true;
      return {
        kind: 'done',
        done: true,
        finalOutput: { topic: topicName, content: topic.content({ refs: this.refs }) },
        completed: redirect.completed,
      };
    }

    if (target.startsWith('subskill:')) {
      const subName = target.slice('subskill:'.length);
      const sub = this.skill.subskills?.[subName];
      if (!sub) {
        return {
          kind: 'error',
          error: 'validation',
          step: '',
          message: `Redirect to unknown sub-skill "${subName}".`,
          retry: false,
        };
      }

      const params = sub.paramsMap ? sub.paramsMap(redirect.completed.response, redirect.stash) : {};
      const subEngine = new SubskillEngine(sub.definition, this.handshake, params, this.refs, subName);
      this.engine = subEngine;

      const startResult = await autoAdvance(subEngine, subEngine.start());
      if (startResult.kind === 'prompt' || startResult.kind === 'done') {
        return { ...startResult, completed: redirect.completed };
      }
      return startResult;
    }

    return {
      kind: 'error',
      error: 'validation',
      step: '',
      message: `Unknown redirect target "${target}".`,
      retry: false,
    };
  }
}

export function createMcpCompositeServer(
  skill: SkillDefinition,
  options: { host?: string; tools?: string[]; refs: ReferenceLoader },
): McpServer {
  const handshake = resolveHost(options.host, options.tools);
  const sessions = new McpSessionMap(handshake);

  const server = new McpServer(
    { name: skill.name, version: skill.version },
    {
      capabilities: { tools: {} },
      instructions: generateMcpCompositeInstructions(skill),
    },
  );

  registerWorkflowTools(server, {
    skillName: skill.name,
    sessions,
    onStart(params) {
      const engine = new WorkflowEngine(skill, handshake, params, options.refs);
      const session = new CompositeSession(engine, skill, handshake, options.refs);
      const id = sessions.register(session);
      return sessions.formatStart(id, engine.start());
    },
  });

  if (skill.topics && Object.keys(skill.topics).length > 0) {
    const topicNames = Object.keys(skill.topics);
    server.registerTool(
      'topic',
      {
        description: `Look up a reference topic. Available: ${topicNames.join(', ')}`,
        inputSchema: z.object({ name: z.string() }),
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
