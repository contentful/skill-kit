import { dirname, resolve } from 'node:path';
import type { SkillDefinition, RedirectResult, CliResult, ReferenceLoader, SessionOutputMode } from '../types.js';
import { WorkflowEngine } from '../runtime/engine.js';
import { createReferenceLoader } from '../runtime/reference-loader.js';
import { resolveHost } from './host.js';
import { SessionManager, type SessionFile } from './session.js';
import { SubskillEngine } from './subskill-engine.js';

function resolveSkillDir(): string {
  const binPath = process.execPath;
  return resolve(dirname(binPath), '..');
}

type HistoryEntry = { step: string; stepOutput: unknown; actionOutput?: unknown };

export type CompositeCommand =
  | { mode: 'dispatcher'; command: 'start' | 'advance'; flags: Record<string, string> }
  | { mode: 'subskill'; name: string; command: 'start' | 'advance'; flags: Record<string, string> }
  | { mode: 'topics' }
  | { mode: 'topic'; name: string }
  | { mode: 'help' };

export function parseCompositeArgs(argv: string[], subskillNames: string[]): CompositeCommand {
  const args = argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    return { mode: 'help' };
  }

  const first = args[0]!;

  if (first === 'topics') return { mode: 'topics' };
  if (first === 'topic') {
    const name = args[1];
    if (!name) {
      process.stderr.write('error: topic name required. Run with "topics" to list.\n');
      process.exit(1);
    }
    return { mode: 'topic', name };
  }

  if (subskillNames.includes(first)) {
    return parseSubskillArgs(first, args.slice(1));
  }

  return parseDispatcherArgs(args);
}

function parseDispatcherArgs(args: string[]): CompositeCommand {
  const first = args[0]!;
  let command: 'start' | 'advance';
  let flagStart: number;

  if (first === 'start' || first === 'advance') {
    command = first;
    flagStart = 1;
  } else if (first.startsWith('--')) {
    command = 'start';
    flagStart = 0;
  } else {
    return { mode: 'help' };
  }

  return { mode: 'dispatcher', command, flags: parseFlags(args, flagStart) };
}

function parseSubskillArgs(name: string, args: string[]): CompositeCommand {
  if (args.length === 0 || args[0]!.startsWith('--')) {
    return { mode: 'subskill', name, command: 'start', flags: parseFlags(args, 0) };
  }

  const first = args[0]!;
  if (first === 'start' || first === 'advance') {
    return { mode: 'subskill', name, command: first, flags: parseFlags(args, 1) };
  }

  return { mode: 'help' };
}

const BOOLEAN_FLAGS = new Set(['subagent']);

function parseFlags(args: string[], start: number): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = start; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      if (BOOLEAN_FLAGS.has(name)) {
        flags[name] = 'true';
      } else if (i + 1 < args.length) {
        flags[name] = args[i + 1]!;
        i++;
      }
    }
  }
  return flags;
}

function detectSubskill(step: string): string | null {
  const idx = step.indexOf('/');
  return idx === -1 ? null : step.slice(0, idx);
}

function extractDispatcherHistory(history: HistoryEntry[]): HistoryEntry[] {
  return history.filter((e) => !e.step.includes('/'));
}

function writeOutput(data: unknown, session: SessionFile | undefined): void {
  if (session) {
    const line = session.appendResult(data as CliResult);
    session.writePointer(line);
  } else {
    process.stdout.write(JSON.stringify(data) + '\n');
  }
}

function writeStartOutput(data: unknown, session: SessionFile | undefined): void {
  if (session) {
    const line = session.appendResult(data as CliResult);
    session.writeStartPointer(line);
  } else {
    process.stdout.write(JSON.stringify(data) + '\n');
  }
}

interface SessionContext {
  session: SessionFile | undefined;
  isStart: boolean;
}

export async function compositeMain(def: SkillDefinition, refsBasePath?: string): Promise<void> {
  const subskillNames = def.subskills ? Object.keys(def.subskills) : [];
  const parsed = parseCompositeArgs(process.argv, subskillNames);
  const refs = createReferenceLoader(refsBasePath ?? resolveSkillDir());

  try {
    switch (parsed.mode) {
      case 'help':
        printCompositeHelp(def);
        break;

      case 'topics':
        handleTopics(def);
        break;

      case 'topic':
        handleTopic(def, parsed.name, refs);
        break;

      case 'dispatcher':
        await handleDispatcher(def, parsed, refs);
        break;

      case 'subskill':
        await handleSubskill(def, parsed, refs);
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${message}\n`);
    process.exit(1);
  }
}

function handleTopics(def: SkillDefinition): void {
  if (!def.topics || Object.keys(def.topics).length === 0) {
    process.stderr.write('No topics available.\n');
    return;
  }
  for (const [name, topic] of Object.entries(def.topics)) {
    process.stdout.write(`${name}: ${topic.label}\n`);
  }
}

function handleTopic(def: SkillDefinition, topicName: string, refs: ReferenceLoader): void {
  const topic = def.topics?.[topicName];
  if (!topic) {
    process.stderr.write(`error: unknown topic "${topicName}". Run with "topics" to list.\n`);
    process.exit(1);
  }
  const content = topic.content({ refs });
  process.stdout.write(content);
  if (!content.endsWith('\n')) process.stdout.write('\n');
}

function resolveSessionForCommand(
  flags: Record<string, string>,
  command: 'start' | 'advance',
  skillName: string,
): SessionContext {
  const sessionFlag = flags['session'];

  if (command === 'start' && sessionFlag === 'new') {
    const outputMode = (flags['output-mode'] as SessionOutputMode) ?? 'file';
    const toolsRaw = flags['tools'];
    const sessionTools = toolsRaw
      ? toolsRaw
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;
    const isSubagent = flags['subagent'] === 'true' || undefined;
    const session = SessionManager.create({
      sessionDir: flags['session-dir'],
      skill: skillName,
      host: flags['host'] ?? 'generic',
      tools: sessionTools,
      isSubagent,
      params: flags['context'] ? (JSON.parse(flags['context']) as unknown) : {},
      outputMode,
    });
    return { session, isStart: true };
  }

  if (command === 'advance' && sessionFlag && sessionFlag !== 'new') {
    const session = SessionManager.open(sessionFlag, flags['session-dir']);
    return { session, isStart: false };
  }

  return { session: undefined, isStart: command === 'start' };
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

function parseTools(flags: Record<string, string>): string[] | undefined {
  const raw = flags['tools'];
  return raw
    ? raw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : undefined;
}

async function handleDispatcher(
  def: SkillDefinition,
  parsed: { command: 'start' | 'advance'; flags: Record<string, string> },
  refs: ReferenceLoader,
): Promise<void> {
  const { session, isStart } = resolveSessionForCommand(parsed.flags, parsed.command, def.name);
  const tools = session?.header.tools ?? parseTools(parsed.flags);
  const isSubagent = session?.header.isSubagent ?? parsed.flags['subagent'] === 'true';
  const handshake = resolveHost(session?.header.host ?? parsed.flags['host'], tools, isSubagent);

  if (isStart) {
    const params = parsed.flags['context'] ? (JSON.parse(parsed.flags['context']) as unknown) : {};
    const engine = new WorkflowEngine(def, handshake, params, refs);
    const result = engine.start();
    writeStartOutput(result, session);
    return;
  }

  const { stepName, output, history } = resolveAdvanceInput(parsed.flags, session);

  const subskillName = detectSubskill(stepName);
  if (subskillName) {
    const sub = def.subskills?.[subskillName];
    if (!sub) throw new Error(`Unknown sub-skill "${subskillName}"`);
    const subEngine = new SubskillEngine(sub.definition, handshake, {}, refs, subskillName);
    subEngine.replayHistory(history as HistoryEntry[]);
    subEngine.startForReplay();
    const result = await subEngine.advance(stepName, output);
    writeOutput(result, session);
    return;
  }

  const engine = new WorkflowEngine(def, handshake, {}, refs);
  const dispatcherHistory = extractDispatcherHistory(history as HistoryEntry[]);
  if (dispatcherHistory.length > 0) {
    engine.replayHistory(dispatcherHistory);
  }
  engine.start();

  const result = await engine.advance(stepName, output);

  if ('redirect' in result) {
    await handleRedirect(def, result as RedirectResult, handshake, refs, session);
    return;
  }

  writeOutput(result, session);
}

async function handleSubskill(
  def: SkillDefinition,
  parsed: { name: string; command: 'start' | 'advance'; flags: Record<string, string> },
  refs: ReferenceLoader,
): Promise<void> {
  const sub = def.subskills?.[parsed.name];
  if (!sub) {
    process.stderr.write(`error: unknown sub-skill "${parsed.name}"\n`);
    process.exit(1);
  }

  const { session, isStart } = resolveSessionForCommand(parsed.flags, parsed.command, def.name);
  const subTools = session?.header.tools ?? parseTools(parsed.flags);
  const subIsSubagent = session?.header.isSubagent ?? parsed.flags['subagent'] === 'true';
  const handshake = resolveHost(session?.header.host ?? parsed.flags['host'], subTools, subIsSubagent);

  if (isStart) {
    const params = parsed.flags['context'] ? (JSON.parse(parsed.flags['context']) as unknown) : {};
    const subEngine = new SubskillEngine(sub.definition, handshake, params, refs, parsed.name);
    writeStartOutput(subEngine.start(), session);
    return;
  }

  const { stepName, output, history } = resolveAdvanceInput(parsed.flags, session);
  const subEngine = new SubskillEngine(sub.definition, handshake, {}, refs, parsed.name);
  subEngine.replayHistory(history as HistoryEntry[]);
  subEngine.startForReplay();
  const result = await subEngine.advance(stepName, output);
  writeOutput(result, session);
}

async function handleRedirect(
  def: SkillDefinition,
  redirect: RedirectResult,
  handshake: ReturnType<typeof resolveHost>,
  refs: ReferenceLoader,
  session: SessionFile | undefined,
): Promise<void> {
  const target = redirect.redirect;

  if (target.startsWith('topic:')) {
    const topicName = target.slice('topic:'.length);
    const topic = def.topics?.[topicName];
    if (!topic) {
      throw new Error(`Redirect to unknown topic "${topicName}"`);
    }
    const content = topic.content({ refs });
    writeOutput({ done: true, finalOutput: { topic: topicName, content }, completed: redirect.completed }, session);
    return;
  }

  if (target.startsWith('subskill:')) {
    const subName = target.slice('subskill:'.length);
    const sub = def.subskills?.[subName];
    if (!sub) {
      throw new Error(`Redirect to unknown sub-skill "${subName}"`);
    }

    const params = sub.paramsMap ? sub.paramsMap(redirect.completed.stepOutput, redirect.stash) : {};
    const subEngine = new SubskillEngine(sub.definition, handshake, params, refs, subName);
    const startResult = subEngine.start();
    // completed is from the dispatcher step that triggered the redirect — already in session convention
    writeOutput({ ...startResult, completed: redirect.completed }, session);
    return;
  }

  throw new Error(`Unknown redirect target "${target}" — expected subskill:<name> or topic:<name>`);
}

function printCompositeHelp(def: SkillDefinition): void {
  const subNames = def.subskills ? Object.keys(def.subskills) : [];
  const topicNames = def.topics ? Object.keys(def.topics) : [];

  const lines = [
    `${def.name} — composite skill`,
    '',
    'Usage:',
    `  ${def.name} --context '{"key":"value"}' [--host claude-code] [--session new]`,
    `  ${def.name} advance --session <id>`,
    `  ${def.name} advance --step <name> --output '{"..."}' --history '[...]'`,
  ];

  if (subNames.length > 0) {
    lines.push('');
    lines.push('Sub-skills (direct access):');
    for (const name of subNames) {
      const desc = def.subskills![name]!.definition.description;
      lines.push(`  ${name.padEnd(20)} ${desc}`);
    }
    lines.push('');
    lines.push(`  ${def.name} <subskill> --context '{"..."}' [--host claude-code]`);
    lines.push(`  ${def.name} <subskill> advance --step <name> --output '{"..."}' --history '[...]'`);
  }

  if (topicNames.length > 0) {
    lines.push('');
    lines.push('Reference topics:');
    for (const name of topicNames) {
      lines.push(`  ${name.padEnd(20)} ${def.topics![name]!.label}`);
    }
    lines.push('');
    lines.push(`  ${def.name} topics              List all topics`);
    lines.push(`  ${def.name} topic <name>         Load a topic`);
  }

  lines.push('');
  lines.push('Flags:');
  lines.push('  --context      JSON string. Validated against context schema. (start only)');
  lines.push('  --step         Step name (advance only). Sub-skill steps: <subskill>/<step>');
  lines.push('  --output       JSON string. Agent response for the step. (advance only)');
  lines.push('  --history      JSON array of {step, output, action?} objects. (advance only)');
  lines.push('  --host         Host identifier for prose generation. Default: generic.');
  lines.push('  --tools        Comma-separated list of available tools (merged with host registry).');
  lines.push('  --subagent     Indicates a subagent with a genuine tool subset (no registry merge).');
  lines.push('  --session      "new" to create a session (start), or session ID (advance).');
  lines.push('  --session-dir  Directory for session files. Default: OS temp directory.');
  lines.push('  --output-mode  "file" (default) or "flag". How agent passes step output.');
  lines.push('  --help         Print this message.');

  process.stderr.write(lines.join('\n') + '\n');
}
