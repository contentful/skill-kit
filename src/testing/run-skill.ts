import type { SkillDefinition, Handshake, ModelAdapter, SkillRunResult, PromptResult, DoneResult } from '../types.js';
import { WorkflowEngine } from '../runtime/engine.js';

export interface RunSkillOptions {
  context?: Record<string, unknown>;
  model: ModelAdapter;
  host?: Partial<Handshake>;
}

export async function runSkill(skill: SkillDefinition, opts: RunSkillOptions): Promise<SkillRunResult> {
  const handshake: Handshake = {
    host: opts.host?.host ?? 'generic',
    toolsAvailable: opts.host?.toolsAvailable ?? [],
  };

  const engine = new WorkflowEngine(skill, handshake, opts.context ?? {});
  let current = engine.start();

  const path: string[] = [];
  const outputs: Record<string, unknown> = {};

  while (true) {
    path.push(current.step);

    const response = await opts.model.respond(current.step, current.prompt);
    const result = engine.advance(current.step, response);

    if ('error' in result) {
      throw new Error(`Validation error at step "${result.step}": ${result.message}`);
    }

    outputs[current.step] = response;

    if ('done' in result && result.done) {
      return {
        path,
        outputs,
        output: (result as DoneResult).finalOutput,
        history: engine['history'].all(),
      };
    }

    current = result as PromptResult;
  }
}
