import { randomBytes } from 'node:crypto';
import { readFileSync, appendFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SessionHeader, SessionOutputMode, SessionPointer, CliResult, StepResult } from '../types.js';

const SESSION_ID_LENGTH = 4;
const SESSION_FILE_PREFIX = 'skill-kit-';
const SESSION_FILE_SUFFIX = '.jsonl';

function generateSessionId(): string {
  return randomBytes(SESSION_ID_LENGTH).toString('hex');
}

function sessionFilePath(sessionDir: string, sessionId: string): string {
  return join(sessionDir, `${SESSION_FILE_PREFIX}${sessionId}${SESSION_FILE_SUFFIX}`);
}

export interface CreateSessionOptions {
  sessionDir?: string;
  skill: string;
  host: string;
  tools?: string[];
  isSubagent?: boolean;
  params: unknown;
  outputMode?: SessionOutputMode;
}

export class SessionFile {
  readonly sessionId: string;
  readonly filePath: string;
  readonly header: SessionHeader;

  constructor(sessionId: string, filePath: string, header: SessionHeader) {
    this.sessionId = sessionId;
    this.filePath = filePath;
    this.header = header;
  }

  append(line: Record<string, unknown>): number {
    appendFileSync(this.filePath, JSON.stringify(line) + '\n');
    return this.lineCount();
  }

  lineCount(): number {
    const content = readFileSync(this.filePath, 'utf-8');
    return content.trimEnd().split('\n').length;
  }

  reconstructHistory(): Array<{ step: string; stepOutput: unknown; actionOutput?: unknown }> {
    const lines = this.readLines();
    const history: Array<{ step: string; stepOutput: unknown; actionOutput?: unknown }> = [];

    for (const line of lines) {
      if (line.type === 'prompt' || line.type === 'done') {
        const autoAdvanced = (line as Record<string, unknown>).autoAdvanced as StepResult[] | undefined;
        if (autoAdvanced) {
          for (const entry of autoAdvanced) {
            history.push({
              step: entry.step,
              stepOutput: entry.stepOutput,
              ...(entry.actionOutput !== undefined ? { actionOutput: entry.actionOutput } : {}),
            });
          }
        }
        const completed = (line as Record<string, unknown>).completed as StepResult | undefined;
        if (completed) {
          history.push({
            step: completed.step,
            stepOutput: completed.stepOutput,
            ...(completed.actionOutput !== undefined ? { actionOutput: completed.actionOutput } : {}),
          });
        }
      }
    }

    return history;
  }

  readLastOutput(): { step: string; output: unknown } | null {
    const lines = this.readLines();
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]!;
      if (line.type === 'output') {
        return { step: line.step as string, output: line.output };
      }
    }
    return null;
  }

  appendResult(result: CliResult): number {
    const typed = addTypeField(result);
    return this.append(typed);
  }

  writePointer(line: number): void {
    process.stdout.write(`${line}\n`);
  }

  writeStartPointer(line: number): void {
    const pointer: SessionPointer = { sessionId: this.sessionId, file: this.filePath, line };
    process.stdout.write(JSON.stringify(pointer) + '\n');
  }

  cleanup(): void {
    if (existsSync(this.filePath)) {
      unlinkSync(this.filePath);
    }
  }

  private readLines(): Array<Record<string, unknown>> {
    const content = readFileSync(this.filePath, 'utf-8');
    const rawLines = content.trimEnd().split('\n');
    const parsed: Array<Record<string, unknown>> = [];

    for (const raw of rawLines) {
      try {
        parsed.push(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        // skip malformed lines (crash resilience)
      }
    }

    return parsed;
  }
}

export class SessionManager {
  static create(options: CreateSessionOptions): SessionFile {
    const sessionDir = options.sessionDir ?? tmpdir();
    const sessionId = generateSessionId();
    const filePath = sessionFilePath(sessionDir, sessionId);

    const header: SessionHeader = {
      type: 'header',
      sessionId,
      skill: options.skill,
      host: options.host,
      ...(options.tools?.length ? { tools: options.tools } : {}),
      ...(options.isSubagent ? { isSubagent: true } : {}),
      params: options.params,
      createdAt: new Date().toISOString(),
      outputMode: options.outputMode ?? 'file',
    };

    writeFileSync(filePath, JSON.stringify(header) + '\n');
    return new SessionFile(sessionId, filePath, header);
  }

  static open(sessionId: string, sessionDir?: string): SessionFile {
    const dir = sessionDir ?? tmpdir();
    const filePath = sessionFilePath(dir, sessionId);

    if (!existsSync(filePath)) {
      throw new Error(`session "${sessionId}" not found at ${filePath}. Start a new session with --session new.`);
    }

    const content = readFileSync(filePath, 'utf-8');
    const firstLine = content.split('\n')[0];
    if (!firstLine) {
      throw new Error(`session "${sessionId}" has an empty file at ${filePath}.`);
    }

    const header = JSON.parse(firstLine) as SessionHeader;
    if (header.type !== 'header' || header.sessionId !== sessionId) {
      throw new Error(`session "${sessionId}" has an invalid header.`);
    }

    return new SessionFile(sessionId, filePath, header);
  }

  static cleanup(sessionId: string, sessionDir?: string): void {
    const dir = sessionDir ?? tmpdir();
    const filePath = sessionFilePath(dir, sessionId);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }
}

function addTypeField(result: CliResult): Record<string, unknown> {
  return { type: result.kind, ...result };
}
