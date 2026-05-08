import type { SkillDefinition } from '../types.js';
import { WorkflowEngine } from '../runtime/engine.js';
import { autoAdvance } from './auto-advance.js';
import type { StartContext, AdvanceContext } from './invocation-context.js';
import { createOutputWriter } from './output-writer.js';

export async function handleStart(skill: SkillDefinition, ctx: StartContext): Promise<void> {
  const writer = createOutputWriter(ctx.session);
  const engine = new WorkflowEngine(skill, ctx.handshake, ctx.params, ctx.refs);
  const startResult = engine.start();
  const result = await autoAdvance(engine, startResult, writer.writeIntermediate);
  writer.writeStart(result);
}

export async function handleAdvance(skill: SkillDefinition, ctx: AdvanceContext): Promise<void> {
  const writer = createOutputWriter(ctx.session);
  const engine = new WorkflowEngine(skill, ctx.handshake, ctx.params, ctx.refs);

  if (ctx.history.length > 0) {
    engine.replayHistory(ctx.history);
  }

  engine.start();
  const advanceResult = await engine.advance(ctx.stepName, ctx.output);
  const result = await autoAdvance(engine, advanceResult, writer.writeIntermediate);
  writer.writeAdvance(result);
}

function printHelp(skillName: string): void {
  const help = [
    `${skillName} — skill-kit CLI`,
    '',
    'Usage:',
    `  ${skillName} --params '{"key":"value"}' [--host claude-code] [--session new]`,
    `  ${skillName} advance --session <id>`,
    `  ${skillName} advance --step <name> --output '{"key":"value"}' --params '{"key":"value"}' --history '[...]' [--host claude-code]`,
    `  ${skillName} cleanup --session <id>`,
    '',
    'Subcommands:',
    '  (default)   Begin the workflow (same as start). Returns first step prompt as JSON.',
    '  start       Explicit alias for the default command.',
    '  advance     Submit step output. Returns next prompt or done signal.',
    '  cleanup     Remove a session file. Idempotent — exits 0 even if already removed.',
    '',
    'Flags:',
    '  --params       JSON string. Validated against skill params schema. (start, and advance without session)',
    '  --step         Name of the step whose output is being submitted. (advance only)',
    '  --output       JSON string. The agent response for the step. (advance only)',
    '  --history      JSON array of {step, response, actionResult?} objects. (advance only)',
    '  --host         Host identifier for tool resolution. Default: generic.',
    '  --tools        Comma-separated list of available tools (merged with host registry).',
    '  --subagent     Indicates a subagent with a genuine tool subset (no registry merge).',
    '  --session      "new" to create a session (start), or session ID (advance/cleanup).',
    '  --session-dir  Directory for session files. Default: secure temp directory.',
    '  --output-mode  "file" (default) or "flag". How the agent passes step output.',
    '  --help         Print this message.',
  ];
  process.stderr.write(help.join('\n') + '\n');
}

const BOOLEAN_FLAGS = new Set(['subagent']);

export function parseArgs(argv: string[]): {
  command: 'start' | 'advance' | 'cleanup' | 'help';
  flags: Record<string, string>;
  booleans: Set<string>;
} {
  const args = argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    return { command: 'help', flags: {}, booleans: new Set() };
  }

  let command: 'start' | 'advance' | 'cleanup';
  let flagStart: number;

  const first = args[0]!;
  if (first === 'start' || first === 'advance' || first === 'cleanup') {
    command = first;
    flagStart = 1;
  } else if (first.startsWith('--')) {
    command = 'start';
    flagStart = 0;
  } else {
    return { command: 'help', flags: {}, booleans: new Set() };
  }

  const flags: Record<string, string> = {};
  const booleans = new Set<string>();
  for (let i = flagStart; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      if (BOOLEAN_FLAGS.has(name)) {
        booleans.add(name);
      } else if (i + 1 < args.length) {
        flags[name] = args[i + 1]!;
        i++;
      }
    }
  }

  return { command, flags, booleans };
}

export { printHelp };
