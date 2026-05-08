export type CompositeCommand =
  | { mode: 'dispatcher'; command: 'start' | 'advance'; flags: Record<string, string> }
  | { mode: 'subskill'; name: string; command: 'start' | 'advance'; flags: Record<string, string> }
  | { mode: 'cleanup'; flags: Record<string, string> }
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
  if (first === 'cleanup') {
    return { mode: 'cleanup', flags: parseFlags(args, 1) };
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

export function parseFlags(args: string[], start: number): Record<string, string> {
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
