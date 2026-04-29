import { randomBytes } from 'node:crypto';
import type { SkillDefinition, CliResult, Handshake, ReferenceLoader } from '../types.js';
import { WorkflowEngine } from '../runtime/engine.js';
import { SubskillEngine } from './subskill-engine.js';
import { autoAdvance } from './auto-advance.js';
import { generatePreamble } from '../runtime/preamble.js';
import type { SkillEngine } from './skill-engine.js';
import type { McpResult } from './mcp-session.js';

const SESSION_ID_LENGTH = 4;

class McpCompositeSession {
  readonly id: string;
  private engine: SkillEngine;
  private _done = false;
  private readonly skill: SkillDefinition;
  private readonly handshake: Handshake;
  private readonly refs: ReferenceLoader;

  constructor(id: string, engine: SkillEngine, skill: SkillDefinition, handshake: Handshake, refs: ReferenceLoader) {
    this.id = id;
    this.engine = engine;
    this.skill = skill;
    this.handshake = handshake;
    this.refs = refs;
  }

  get done(): boolean {
    return this._done;
  }

  async advance(stepName: string, output: unknown): Promise<CliResult> {
    const subskillName = detectSubskill(stepName);

    if (subskillName && !(this.engine instanceof SubskillEngine)) {
      return {
        kind: 'error',
        error: 'validation',
        step: stepName,
        message: `Cannot advance sub-skill step "${stepName}" — session is in dispatcher mode. Complete the dispatcher first.`,
        retry: false,
      };
    }

    const raw = await this.engine.advance(stepName, output);
    const result = await autoAdvance(this.engine, raw);

    if (result.kind === 'redirect') {
      return this.handleRedirect(result);
    }

    if (result.kind === 'done') {
      this._done = true;
    }

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
      const content = topic.content({ refs: this.refs });
      this._done = true;
      return {
        kind: 'done',
        done: true,
        finalOutput: { topic: topicName, content },
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

      const params = sub.paramsMap ? sub.paramsMap(redirect.completed.stepOutput, redirect.stash) : {};
      const subEngine = new SubskillEngine(sub.definition, this.handshake, params, this.refs, subName);
      this.engine = subEngine;

      const rawStart = subEngine.start();
      const startResult = await autoAdvance(subEngine, rawStart);

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

export class McpCompositeSessionManager {
  private sessions = new Map<string, McpCompositeSession>();
  private readonly skill: SkillDefinition;
  private readonly handshake: Handshake;
  private readonly refs: ReferenceLoader;
  private readonly preamble: string;

  constructor(skill: SkillDefinition, handshake: Handshake, refs: ReferenceLoader) {
    this.skill = skill;
    this.handshake = handshake;
    this.refs = refs;
    this.preamble = generatePreamble(handshake);
  }

  start(params: unknown, subskillName?: string): McpResult {
    const sessionId = randomBytes(SESSION_ID_LENGTH).toString('hex');
    let engine: SkillEngine;

    if (subskillName) {
      const sub = this.skill.subskills?.[subskillName];
      if (!sub) {
        return {
          session: sessionId,
          status: 'error',
          step: '',
          message: `Unknown sub-skill "${subskillName}".`,
          retry: false,
        };
      }
      engine = new SubskillEngine(sub.definition, this.handshake, params, this.refs, subskillName);
    } else {
      engine = new WorkflowEngine(this.skill, this.handshake, params, this.refs);
    }

    const session = new McpCompositeSession(sessionId, engine, this.skill, this.handshake, this.refs);
    this.sessions.set(sessionId, session);

    const startResult = engine.start();
    return this.formatResult(sessionId, startResult, true);
  }

  async advance(sessionId: string, stepName: string, output: unknown): Promise<McpResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        session: sessionId,
        status: 'error',
        step: stepName,
        message: `Unknown session "${sessionId}". Call the start tool to begin a new workflow.`,
        retry: false,
      };
    }

    if (session.done) {
      this.sessions.delete(sessionId);
      return {
        session: sessionId,
        status: 'error',
        step: stepName,
        message: 'This session is complete. Call the start tool to begin a new workflow.',
        retry: false,
      };
    }

    const result = await session.advance(stepName, output);
    const formatted = this.formatResult(sessionId, result, false);

    if (result.kind === 'done') {
      this.sessions.delete(sessionId);
    }

    return formatted;
  }

  private formatResult(sessionId: string, result: CliResult, includesPreamble: boolean): McpResult {
    switch (result.kind) {
      case 'prompt':
        return {
          session: sessionId,
          status: 'prompt',
          step: result.step,
          prompt: result.prompt,
          schema: result.schema,
          ...(includesPreamble ? { preamble: this.preamble } : {}),
        };

      case 'done':
        return {
          session: sessionId,
          status: 'done',
          finalOutput: result.finalOutput,
        };

      case 'error':
        return {
          session: sessionId,
          status: 'error',
          step: result.step,
          message: result.message,
          retry: result.retry,
        };

      case 'redirect':
        return {
          session: sessionId,
          status: 'error',
          step: '',
          message: `Unhandled redirect to "${result.redirect}".`,
          retry: false,
        };
    }
  }
}

function detectSubskill(step: string): string | null {
  const idx = step.indexOf('/');
  return idx === -1 ? null : step.slice(0, idx);
}
