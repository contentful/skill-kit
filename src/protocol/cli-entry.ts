import type { SkillDefinition } from '../types.js';
import type { SessionOutputMode } from '../types.js';
import { parseArgs, handleStart, handleAdvance, printHelp } from './single-invocation.js';
import { SessionManager } from './session.js';

function parseToolsFlag(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function main(skill: SkillDefinition): Promise<void> {
  const { command, flags } = parseArgs(process.argv);
  const tools = parseToolsFlag(flags['tools']);

  try {
    switch (command) {
      case 'help':
        printHelp(skill.name);
        break;

      case 'start': {
        const context = flags['context'] ? (JSON.parse(flags['context']) as unknown) : {};
        const sessionFlag = flags['session'];

        if (sessionFlag === 'new') {
          const outputMode = (flags['output-mode'] as SessionOutputMode) ?? 'file';
          const session = SessionManager.create({
            sessionDir: flags['session-dir'],
            skill: skill.name,
            host: flags['host'] ?? 'generic',
            context,
            outputMode,
          });
          await handleStart(skill, context, flags['host'], session, tools);
        } else {
          await handleStart(skill, context, flags['host'], undefined, tools);
        }
        break;
      }

      case 'advance': {
        const sessionFlag = flags['session'];

        if (sessionFlag && sessionFlag !== 'new') {
          const session = SessionManager.open(sessionFlag, flags['session-dir']);
          let stepName: string;
          let output: unknown;
          let history: Array<{ step: string; output: unknown; action?: unknown }>;

          history = session.reconstructHistory();

          if (session.header.outputMode === 'file' && !flags['output']) {
            const lastOutput = session.readLastOutput();
            if (!lastOutput) {
              process.stderr.write(
                'error: no output found in session file. Write your output to the session file before advancing.\n',
              );
              process.exit(1);
            }
            stepName = lastOutput.step;
            output = lastOutput.output;
          } else {
            stepName = flags['step']!;
            output = flags['output'] ? (JSON.parse(flags['output']) as unknown) : undefined;

            if (!stepName) {
              process.stderr.write('error: --step is required for advance in flag mode\n');
              process.exit(1);
            }
            if (output === undefined) {
              process.stderr.write('error: --output is required for advance in flag mode\n');
              process.exit(1);
            }

            session.append({ type: 'output', step: stepName, output });
          }

          await handleAdvance(skill, stepName, output, history, session.header.host, session, tools);
        } else {
          const step = flags['step'];
          const output = flags['output'] ? (JSON.parse(flags['output']) as unknown) : undefined;
          const history = flags['history']
            ? (JSON.parse(flags['history']) as Array<{ step: string; output: unknown; action?: unknown }>)
            : [];

          if (!step) {
            process.stderr.write('error: --step is required for advance\n');
            process.exit(1);
          }
          if (output === undefined) {
            process.stderr.write('error: --output is required for advance\n');
            process.exit(1);
          }

          await handleAdvance(skill, step, output, history, flags['host'], undefined, tools);
        }
        break;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${message}\n`);
    process.exit(1);
  }
}
