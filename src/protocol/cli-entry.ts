import type { SkillDefinition } from '../types.js';
import { parseArgs, handleStart, handleAdvance, printHelp } from './single-invocation.js';

export async function main(skill: SkillDefinition): Promise<void> {
  const { command, flags } = parseArgs(process.argv);

  try {
    switch (command) {
      case 'help':
        printHelp(skill.name);
        break;

      case 'start': {
        const context = flags['context'] ? (JSON.parse(flags['context']) as unknown) : {};
        await handleStart(skill, context, flags['host']);
        break;
      }

      case 'advance': {
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

        await handleAdvance(skill, step, output, history, flags['host']);
        break;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${message}\n`);
    process.exit(1);
  }
}
