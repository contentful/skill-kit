import type { SkillDefinition, RedirectResult, Handshake, ReferenceLoader } from '../types.js';
import { WorkflowEngine } from '../runtime/engine.js';
import { SubskillEngine } from './subskill-engine.js';
import { autoAdvance } from './auto-advance.js';
import type { HistoryEntry } from './types.js';
import { resolveStartContext, resolveAdvanceContext } from './invocation-context.js';
import { type OutputWriter } from './output-writer.js';
import type { SessionFile } from './session.js';

function detectSubskill(step: string): string | null {
  const idx = step.indexOf('/');
  return idx === -1 ? null : step.slice(0, idx);
}

function extractDispatcherHistory(history: HistoryEntry[]): HistoryEntry[] {
  return history.filter((e) => !e.step.includes('/'));
}

export async function handleDispatcher(
  def: SkillDefinition,
  parsed: { command: 'start' | 'advance'; flags: Record<string, string> },
  refs: ReferenceLoader,
  session: SessionFile | undefined,
  writer: OutputWriter,
): Promise<void> {
  if (parsed.command === 'start') {
    const ctx = resolveStartContext(parsed.flags, session, refs);
    const engine = new WorkflowEngine(def, ctx.handshake, ctx.params, refs);
    const startResult = engine.start();
    const result = await autoAdvance(engine, startResult, writer.writeIntermediate);
    writer.writeStart(result);
    return;
  }

  const ctx = resolveAdvanceContext(parsed.flags, session, refs);

  const subskillName = detectSubskill(ctx.stepName);
  if (subskillName) {
    const sub = def.subskills?.[subskillName];
    if (!sub) throw new Error(`Unknown sub-skill "${subskillName}"`);
    const subEngine = new SubskillEngine(sub.definition, ctx.handshake, {}, refs, subskillName);
    subEngine.replayHistory(ctx.history);
    subEngine.startForReplay();
    const subResult = await subEngine.advance(ctx.stepName, ctx.output);
    const result = await autoAdvance(subEngine, subResult, writer.writeIntermediate);
    writer.writeAdvance(result);
    return;
  }

  const engine = new WorkflowEngine(def, ctx.handshake, ctx.params, refs);
  const dispatcherHistory = extractDispatcherHistory(ctx.history);
  if (dispatcherHistory.length > 0) {
    engine.replayHistory(dispatcherHistory);
  }
  engine.start();

  const advanceResult = await engine.advance(ctx.stepName, ctx.output);
  const result = await autoAdvance(engine, advanceResult, writer.writeIntermediate);

  if (result.kind === 'redirect') {
    await handleRedirect(def, result, ctx.handshake, refs, writer);
    return;
  }

  writer.writeAdvance(result);
}

async function handleRedirect(
  def: SkillDefinition,
  redirect: RedirectResult,
  handshake: Handshake,
  refs: ReferenceLoader,
  writer: OutputWriter,
): Promise<void> {
  const target = redirect.redirect;

  if (target.startsWith('topic:')) {
    const topicName = target.slice('topic:'.length);
    const topic = def.topics?.[topicName];
    if (!topic) {
      throw new Error(`Redirect to unknown topic "${topicName}"`);
    }
    const content = topic.content({ refs });
    writer.writeAdvance({
      kind: 'done',
      done: true,
      finalOutput: { topic: topicName, content },
      completed: redirect.completed,
    });
    return;
  }

  if (target.startsWith('subskill:')) {
    const subName = target.slice('subskill:'.length);
    const sub = def.subskills?.[subName];
    if (!sub) {
      throw new Error(`Redirect to unknown sub-skill "${subName}"`);
    }

    const params = sub.paramsMap ? sub.paramsMap(redirect.completed.response, redirect.store) : {};
    const subEngine = new SubskillEngine(sub.definition, handshake, params, refs, subName);
    const rawStart = subEngine.start();
    const startResult = await autoAdvance(subEngine, rawStart, writer.writeIntermediate);
    if (startResult.kind === 'prompt' || startResult.kind === 'done') {
      writer.writeAdvance({ ...startResult, completed: redirect.completed });
    } else {
      writer.writeAdvance(startResult);
    }
    return;
  }

  throw new Error(`Unknown redirect target "${target}" — expected subskill:<name> or topic:<name>`);
}
