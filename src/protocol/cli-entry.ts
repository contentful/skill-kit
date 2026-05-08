import type { SkillDefinition } from '../types.js';
import type { SessionOutputMode } from '../types.js';
import { parseArgs, handleStart, handleAdvance, printHelp } from './single-invocation.js';
import { SessionManager } from './session.js';
import { resolveStartContext, resolveAdvanceContext, parseTools, parseJsonFlag } from './invocation-context.js';

const NOOP_REFS = { load: () => '', asset: (p: string) => p };

function isMcpCommand(argv: string[]): boolean {
  return argv.length > 2 && argv[2] === 'mcp';
}

export async function main(skill: SkillDefinition): Promise<void> {
  if (isMcpCommand(process.argv)) {
    const { mcpMain } = await import('./mcp-entry.js');
    await mcpMain(skill);
    return;
  }

  const { command, flags, booleans } = parseArgs(process.argv);

  try {
    switch (command) {
      case 'help':
        printHelp(skill.name);
        break;

      case 'start': {
        const sessionFlag = flags['session'];
        let session;

        if (sessionFlag === 'new') {
          const outputMode = (flags['output-mode'] as SessionOutputMode) ?? 'file';
          session = SessionManager.create({
            sessionDir: flags['session-dir'],
            skill: skill.name,
            host: flags['host'] ?? 'generic',
            tools: parseTools(flags),
            isSubagent: booleans.has('subagent') || undefined,
            params: parseJsonFlag(flags['params'], {}),
            outputMode,
          });
        }

        const ctx = resolveStartContext(flags, session, NOOP_REFS);
        await handleStart(skill, ctx);
        break;
      }

      case 'advance': {
        const sessionFlag = flags['session'];
        let session;

        if (sessionFlag && sessionFlag !== 'new') {
          session = SessionManager.open(sessionFlag, flags['session-dir']);
        }

        const ctx = resolveAdvanceContext(flags, session, NOOP_REFS);
        await handleAdvance(skill, ctx);
        break;
      }

      case 'cleanup': {
        const sessionFlag = flags['session'];
        if (!sessionFlag) {
          process.stderr.write('error: --session is required for cleanup\n');
          process.exit(1);
        }
        SessionManager.cleanup(sessionFlag, flags['session-dir']);
        break;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${message}\n`);
    process.exit(1);
  }
}
