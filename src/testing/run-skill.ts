import type { SkillDefinition, Handshake, ModelAdapter, SkillRunResult, CliResult } from '../types.js';
import { WorkflowEngine } from '../runtime/engine.js';

export interface RunSkillOptions {
  params?: Record<string, unknown>;
  model: ModelAdapter;
  host?: Partial<Handshake>;
}

const MAX_AUTO_ADVANCE = 20;

async function drainPromptless(engine: WorkflowEngine, result: CliResult, path: string[]): Promise<CliResult> {
  let current = result;
  let depth = 0;
  while (current.kind === 'prompt') {
    if (!engine.isPromptless(current.step)) break;
    depth += 1;
    if (depth > MAX_AUTO_ADVANCE) {
      throw new Error(`Auto-advance depth exceeded (${MAX_AUTO_ADVANCE}). Check for infinite prompt-less step loops.`);
    }
    path.push(current.step);
    current = await engine.advance(current.step, {});
  }
  return current;
}

export async function runSkill(skill: SkillDefinition, opts: RunSkillOptions): Promise<SkillRunResult> {
  const handshake: Handshake = {
    host: opts.host?.host ?? 'generic',
    toolsAvailable: opts.host?.toolsAvailable ?? [],
    isSubagent: opts.host?.isSubagent ?? false,
  };

  const engine = new WorkflowEngine(skill, handshake, opts.params ?? {});
  const startResult = engine.start();

  const path: string[] = [];
  const outputs: Record<string, unknown> = {};

  let initial = await drainPromptless(engine, startResult, path);
  if (initial.kind === 'done') {
    return { path, outputs, response: initial.finalOutput, history: engine['history'].all() };
  }
  if (initial.kind !== 'prompt') {
    throw new Error(`Unexpected result kind "${initial.kind}" at start`);
  }
  let current = initial;

  while (true) {
    path.push(current.step);

    const response = await opts.model.respond(current.step, current.prompt);
    const result = await engine.advance(current.step, response);

    if (result.kind === 'error') {
      throw new Error(`Validation error at step "${result.step}": ${result.message}`);
    }

    outputs[current.step] = response;

    const drained = await drainPromptless(engine, result, path);

    if (drained.kind === 'done') {
      return {
        path,
        outputs,
        response: drained.finalOutput,
        history: engine['history'].all(),
      };
    }

    if (drained.kind !== 'prompt') {
      throw new Error(`Unexpected result kind "${drained.kind}" during run`);
    }
    current = drained;
  }
}
