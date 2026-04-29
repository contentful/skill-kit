import { dirname, resolve } from 'node:path';
import type { SkillDefinition, SessionOutputMode } from '../types.js';
import { createReferenceLoader } from '../runtime/reference-loader.js';
import { SessionManager } from './session.js';
import { parseCompositeArgs, type CompositeCommand } from './arg-parser.js';
import { parseTools, parseJsonFlag } from './invocation-context.js';
import { createOutputWriter } from './output-writer.js';
import { handleTopics, handleTopic } from './topic-handler.js';
import { printCompositeHelp } from './help-printer.js';
import { handleDispatcher } from './dispatcher-handler.js';
import { handleSubskill } from './subskill-handler.js';

function resolveSkillDir(): string {
  const binPath = process.execPath;
  return resolve(dirname(binPath), '..');
}

function resolveSession(flags: Record<string, string>, command: 'start' | 'advance', skillName: string) {
  const sessionFlag = flags['session'];

  if (command === 'start' && sessionFlag === 'new') {
    const outputMode = (flags['output-mode'] as SessionOutputMode) ?? 'file';
    return SessionManager.create({
      sessionDir: flags['session-dir'],
      skill: skillName,
      host: flags['host'] ?? 'generic',
      tools: parseTools(flags),
      isSubagent: flags['subagent'] === 'true' || undefined,
      params: parseJsonFlag(flags['params'], {}),
      outputMode,
    });
  }

  if (command === 'advance' && sessionFlag && sessionFlag !== 'new') {
    return SessionManager.open(sessionFlag, flags['session-dir']);
  }

  return undefined;
}

function isMcpCommand(argv: string[]): boolean {
  return argv.length > 2 && argv[2] === 'mcp';
}

export async function compositeMain(def: SkillDefinition, refsBasePath?: string): Promise<void> {
  if (isMcpCommand(process.argv)) {
    const refs = createReferenceLoader(refsBasePath ?? resolveSkillDir());
    const { mcpCompositeMain } = await import('./mcp-composite.js');
    await mcpCompositeMain(def, refs);
    return;
  }

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

      case 'dispatcher': {
        const session = resolveSession(parsed.flags, parsed.command, def.name);
        const writer = createOutputWriter(session);
        await handleDispatcher(def, parsed, refs, session, writer);
        break;
      }

      case 'subskill': {
        const session = resolveSession(parsed.flags, parsed.command, def.name);
        const writer = createOutputWriter(session);
        await handleSubskill(def, parsed, refs, session, writer);
        break;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${message}\n`);
    process.exit(1);
  }
}

export { parseCompositeArgs, type CompositeCommand };
