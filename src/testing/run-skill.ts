import type {
  SkillDefinition,
  Handshake,
  ModelAdapter,
  SkillRunResult,
  PromptResult,
  DoneResult,
  CliResult,
} from '../types.js';
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
  while ('step' in current && !('error' in current) && !('done' in current) && !('redirect' in current)) {
    const prompt = current as PromptResult;
    if (!engine.isPromptless(prompt.step)) break;
    depth += 1;
    if (depth > MAX_AUTO_ADVANCE) {
      throw new Error(`Auto-advance depth exceeded (${MAX_AUTO_ADVANCE}). Check for infinite prompt-less step loops.`);
    }
    path.push(prompt.step);
    current = await engine.advance(prompt.step, {});
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
  if ('done' in initial && (initial as DoneResult).done) {
    return { path, outputs, stepOutput: (initial as DoneResult).finalOutput, history: engine['history'].all() };
  }
  let current = initial as PromptResult;

  while (true) {
    path.push(current.step);

    const response = await opts.model.respond(current.step, current.prompt);
    const result = await engine.advance(current.step, response);

    if ('error' in result) {
      throw new Error(`Validation error at step "${result.step}": ${result.message}`);
    }

    outputs[current.step] = response;

    const drained = await drainPromptless(engine, result, path);

    if ('done' in drained && (drained as DoneResult).done) {
      return {
        path,
        outputs,
        stepOutput: (drained as DoneResult).finalOutput,
        history: engine['history'].all(),
      };
    }

    current = drained as PromptResult;
  }
}
