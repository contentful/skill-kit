import { randomBytes } from 'node:crypto';
import type { SkillDefinition, CliResult, Handshake, ReferenceLoader } from '../types.js';
import { WorkflowEngine } from '../runtime/engine.js';
import { autoAdvance } from './auto-advance.js';
import { generatePreamble } from '../runtime/preamble.js';

const SESSION_ID_LENGTH = 4;

export interface McpPromptResult {
  session: string;
  status: 'prompt';
  step: string;
  prompt: string;
  schema: unknown;
  preamble?: string;
}

export interface McpDoneResult {
  session: string;
  status: 'done';
  finalOutput: unknown;
}

export interface McpErrorResult {
  session: string;
  status: 'error';
  step: string;
  message: string;
  retry: boolean;
}

export type McpResult = McpPromptResult | McpDoneResult | McpErrorResult;

class McpSession {
  readonly id: string;
  private engine: WorkflowEngine;
  private _done = false;

  constructor(id: string, engine: WorkflowEngine) {
    this.id = id;
    this.engine = engine;
  }

  get done(): boolean {
    return this._done;
  }

  async advance(stepName: string, output: unknown): Promise<CliResult> {
    const raw = await this.engine.advance(stepName, output);
    const result = await autoAdvance(this.engine, raw);
    if (result.kind === 'done') {
      this._done = true;
    }
    return result;
  }
}

export class McpSessionManager {
  private sessions = new Map<string, McpSession>();
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

  start(params: unknown): McpResult {
    const sessionId = randomBytes(SESSION_ID_LENGTH).toString('hex');
    const engine = new WorkflowEngine(this.skill, this.handshake, params, this.refs);
    const session = new McpSession(sessionId, engine);
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
          message: `Redirect to "${result.redirect}" — not supported in simple skill MCP mode.`,
          retry: false,
        };
    }
  }
}
