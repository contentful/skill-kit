import type { SkillDefinition } from '../types.js';
import { WorkflowEngine } from '../runtime/engine.js';
import { resolveHost } from './host.js';
import type { SessionFile } from './session.js';

export async function handleStart(
  skill: SkillDefinition,
  context: unknown,
  hostName?: string,
  session?: SessionFile,
): Promise<void> {
  const handshake = resolveHost(hostName);
  const engine = new WorkflowEngine(skill, handshake, context);
  const result = engine.start();

  if (session) {
    const line = session.appendResult(result);
    session.writeStartPointer(line);
  } else {
    process.stdout.write(JSON.stringify(result) + '\n');
  }
}

export async function handleAdvance(
  skill: SkillDefinition,
  stepName: string,
  output: unknown,
  history: Array<{ step: string; output: unknown; action?: unknown }>,
  hostName?: string,
  session?: SessionFile,
): Promise<void> {
  const handshake = resolveHost(hostName);
  const engine = new WorkflowEngine(skill, handshake, {});

  if (history.length > 0) {
    engine.replayHistory(history);
  }

  engine.start();
  const result = await engine.advance(stepName, output);

  if (session) {
    const line = session.appendResult(result);
    session.writePointer(line);
  } else {
    process.stdout.write(JSON.stringify(result) + '\n');
  }
}

function printHelp(skillName: string): void {
  const help = [
    `${skillName} — skill-kit CLI`,
    '',
    'Usage:',
    `  ${skillName} --context '{"key":"value"}' [--host claude-code] [--session new]`,
    `  ${skillName} advance --session <id>`,
    `  ${skillName} advance --step <name> --output '{"key":"value"}' --history '[...]' [--host claude-code]`,
    '',
    'Subcommands:',
    '  (default)   Begin the workflow (same as start). Returns first step prompt as JSON.',
    '  start       Explicit alias for the default command.',
    '  advance     Submit step output. Returns next prompt or done signal.',
    '',
    'Flags:',
    '  --context      JSON string. Validated against skill context schema. (start only)',
    '  --step         Name of the step whose output is being submitted. (advance only)',
    '  --output       JSON string. The agent response for the step. (advance only)',
    '  --history      JSON array of {step, output, action?} objects. (advance only)',
    '  --host         Host identifier for prose generation. Default: generic.',
    '  --session      "new" to create a session (start), or session ID (advance).',
    '  --session-dir  Directory for session files. Default: OS temp directory.',
    '  --output-mode  "file" (default) or "flag". How the agent passes step output.',
    '  --help         Print this message.',
  ];
  process.stderr.write(help.join('\n') + '\n');
}

export function parseArgs(argv: string[]): {
  command: 'start' | 'advance' | 'help';
  flags: Record<string, string>;
} {
  const args = argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    return { command: 'help', flags: {} };
  }

  let command: 'start' | 'advance';
  let flagStart: number;

  const first = args[0]!;
  if (first === 'start' || first === 'advance') {
    command = first;
    flagStart = 1;
  } else if (first.startsWith('--')) {
    command = 'start';
    flagStart = 0;
  } else {
    return { command: 'help', flags: {} };
  }

  const flags: Record<string, string> = {};
  for (let i = flagStart; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--') && i + 1 < args.length) {
      flags[arg.slice(2)] = args[i + 1]!;
      i++;
    }
  }

  return { command, flags };
}

export { printHelp };
