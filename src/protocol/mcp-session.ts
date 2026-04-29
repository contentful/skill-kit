import { randomBytes } from 'node:crypto';
import type { CliResult, Handshake } from '../types.js';
import { generatePreamble } from '../runtime/preamble.js';

const SESSION_ID_LENGTH = 4;

// --- MCP result types (transport-facing) ---

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

// --- Session interface ---

export interface McpSession {
  readonly done: boolean;
  advance(stepName: string, output: unknown): Promise<CliResult>;
}

// --- Session map with lifecycle management ---

export class McpSessionMap {
  private sessions = new Map<string, McpSession>();
  readonly preamble: string;

  constructor(handshake: Handshake) {
    this.preamble = generatePreamble(handshake);
  }

  register(session: McpSession): string {
    const id = randomBytes(SESSION_ID_LENGTH).toString('hex');
    this.sessions.set(id, session);
    return id;
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
    const formatted = formatResult(sessionId, result, false);

    if (result.kind === 'done') {
      this.sessions.delete(sessionId);
    }

    return formatted;
  }

  formatStart(sessionId: string, result: CliResult): McpResult {
    return formatResult(sessionId, result, true, this.preamble);
  }
}

function formatResult(sessionId: string, result: CliResult, includesPreamble: boolean, preamble?: string): McpResult {
  switch (result.kind) {
    case 'prompt':
      return {
        session: sessionId,
        status: 'prompt',
        step: result.step,
        prompt: result.prompt,
        schema: result.schema,
        ...(includesPreamble && preamble ? { preamble } : {}),
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
