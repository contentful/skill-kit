import type { SkillDefinition, ReferenceLoader } from '../types.js';
import { SubskillEngine } from './subskill-engine.js';
import { autoAdvance } from './auto-advance.js';
import { resolveStartContext, resolveAdvanceContext } from './invocation-context.js';
import type { OutputWriter } from './output-writer.js';
import type { SessionFile } from './session.js';

export async function handleSubskill(
  def: SkillDefinition,
  parsed: { name: string; command: 'start' | 'advance'; flags: Record<string, string> },
  refs: ReferenceLoader,
  session: SessionFile | undefined,
  writer: OutputWriter,
): Promise<void> {
  const sub = def.subskills?.[parsed.name];
  if (!sub) {
    process.stderr.write(`error: unknown sub-skill "${parsed.name}"\n`);
    process.exit(1);
  }

  if (parsed.command === 'start') {
    const ctx = resolveStartContext(parsed.flags, session, refs);
    const subEngine = new SubskillEngine(sub.definition, ctx.handshake, ctx.params, refs, parsed.name);
    const startResult = subEngine.start();
    const result = await autoAdvance(subEngine, startResult, writer.writeIntermediate);
    writer.writeStart(result);
    return;
  }

  const ctx = resolveAdvanceContext(parsed.flags, session, refs);
  const subEngine = new SubskillEngine(sub.definition, ctx.handshake, ctx.params, refs, parsed.name);
  subEngine.replayHistory(ctx.history);
  subEngine.startForReplay();
  const advanceResult = await subEngine.advance(ctx.stepName, ctx.output);
  const result = await autoAdvance(subEngine, advanceResult, writer.writeIntermediate);
  writer.writeAdvance(result);
}
