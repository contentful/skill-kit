import type { Handshake, ReferenceLoader } from '../types.js';
import { resolveHost } from './host.js';
import type { SessionFile } from './session.js';
import type { HistoryEntry } from './types.js';

export interface InvocationContext {
  readonly handshake: Handshake;
  readonly params: unknown;
  readonly refs: ReferenceLoader;
  readonly session: SessionFile | undefined;
}

export interface StartContext extends InvocationContext {
  readonly command: 'start';
}

export interface AdvanceContext extends InvocationContext {
  readonly command: 'advance';
  readonly stepName: string;
  readonly output: unknown;
  readonly history: HistoryEntry[];
}

export function parseTools(flags: Record<string, string>): string[] | undefined {
  const raw = flags['tools'];
  return raw
    ? raw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : undefined;
}

export function parseJsonFlag(raw: string | undefined, fallback: unknown): unknown {
  return raw ? (JSON.parse(raw) as unknown) : fallback;
}

export function resolveHandshake(flags: Record<string, string>, session: SessionFile | undefined): Handshake {
  const tools = session?.header.tools ?? parseTools(flags);
  const isSubagent = session?.header.isSubagent ?? flags['subagent'] === 'true';
  return resolveHost(session?.header.host ?? flags['host'], tools, isSubagent);
}

export function resolveParams(flags: Record<string, string>, session: SessionFile | undefined): unknown {
  return session?.header.params ?? parseJsonFlag(flags['params'], {});
}

export function resolveStartContext(
  flags: Record<string, string>,
  session: SessionFile | undefined,
  refs: ReferenceLoader,
): StartContext {
  return {
    command: 'start',
    handshake: resolveHandshake(flags, session),
    params: session?.header.params ?? parseJsonFlag(flags['params'], {}),
    refs,
    session,
  };
}

export function resolveAdvanceContext(
  flags: Record<string, string>,
  session: SessionFile | undefined,
  refs: ReferenceLoader,
): AdvanceContext {
  const { stepName, output, history } = resolveAdvanceInput(flags, session);
  return {
    command: 'advance',
    handshake: resolveHandshake(flags, session),
    params: resolveParams(flags, session),
    refs,
    session,
    stepName,
    output,
    history,
  };
}

function resolveAdvanceInput(
  flags: Record<string, string>,
  session: SessionFile | undefined,
): { stepName: string; output: unknown; history: HistoryEntry[] } {
  if (session) {
    const history = session.reconstructHistory();

    if (session.header.outputMode === 'file' && !flags['output']) {
      const lastOutput = session.readLastOutput();
      if (!lastOutput) {
        process.stderr.write(
          'error: no output found in session file. Write your output to the session file before advancing.\n',
        );
        process.exit(1);
      }
      return { stepName: lastOutput.step, output: lastOutput.output, history };
    }

    const stepName = flags['step']!;
    const output = flags['output'] ? (JSON.parse(flags['output']) as unknown) : undefined;
    if (!stepName || output === undefined) {
      process.stderr.write('error: --step and --output are required for advance in flag mode\n');
      process.exit(1);
    }
    session.append({ type: 'output', step: stepName, output });
    return { stepName, output, history };
  }

  const stepName = flags['step']!;
  const output = flags['output'] ? (JSON.parse(flags['output']) as unknown) : undefined;
  const history: HistoryEntry[] = flags['history'] ? (JSON.parse(flags['history']) as HistoryEntry[]) : [];

  if (!stepName) {
    process.stderr.write('error: --step is required for advance\n');
    process.exit(1);
  }
  if (output === undefined) {
    process.stderr.write('error: --output is required for advance\n');
    process.exit(1);
  }

  return { stepName, output, history };
}
