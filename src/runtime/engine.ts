import type {
  SkillDefinition,
  Handshake,
  StepDefinition,
  PromptResult,
  DoneResult,
  CliResult,
  PromptContext,
  ReferenceLoader,
} from '../types.js';
import { validateCycleGuards } from '../validation/cycle-guard.js';
import { validateOutput } from './schema-validator.js';
import { History } from './history.js';
import { StashStore } from './stash.js';

const NOOP_REFS: ReferenceLoader = {
  load: () => '',
  asset: (p) => p,
};

export class WorkflowEngine {
  private readonly skill: SkillDefinition;
  private readonly handshake: Handshake;
  private readonly skillContext: unknown;
  private readonly history: History;
  private readonly stash: StashStore;
  private readonly refs: ReferenceLoader;
  private currentStep: string;

  constructor(
    skill: SkillDefinition,
    handshake: Handshake,
    context: unknown,
    refs?: ReferenceLoader,
  ) {
    this.skill = skill;
    this.handshake = handshake;
    this.refs = refs ?? NOOP_REFS;
    this.history = new History();
    this.stash = new StashStore();
    this.currentStep = skill.entry;

    if (skill.context) {
      const result = skill.context.safeParse(context);
      if (!result.success) {
        throw new Error(`Invalid context: ${result.error.issues.map((i) => i.message).join('; ')}`);
      }
      this.skillContext = Object.freeze(result.data);
    } else {
      this.skillContext = Object.freeze(context ?? {});
    }
  }

  start(): PromptResult {
    validateCycleGuards(this.skill.steps);
    return this.buildPrompt(this.currentStep);
  }

  advance(stepName: string, rawOutput: unknown): CliResult {
    const stepDef = this.skill.steps[stepName];
    if (!stepDef) {
      return { error: 'validation', step: stepName, message: `Unknown step "${stepName}"`, retry: false };
    }

    const validation = validateOutput(stepDef.config.output, rawOutput);
    if (!validation.success) {
      return {
        error: 'validation',
        step: stepName,
        message: validation.error!,
        retry: true,
      };
    }

    const output = Object.freeze(validation.data);

    if (stepDef.config.stash) {
      this.stash.set(stepName, stepDef.config.stash({ output }));
    }

    this.history.append(stepName, output);

    const nextStep = this.resolveNext(stepDef, output, stepName);

    if (nextStep === null) {
      return this.buildDone();
    }

    this.currentStep = nextStep;
    return this.buildPrompt(nextStep);
  }

  replayHistory(history: Array<{ step: string; output: unknown }>): void {
    for (const entry of history) {
      const stepDef = this.skill.steps[entry.step];
      if (!stepDef) continue;

      const validation = validateOutput(stepDef.config.output, entry.output);
      const output = validation.success ? Object.freeze(validation.data) : Object.freeze(entry.output);

      if (stepDef.config.stash) {
        this.stash.set(entry.step, stepDef.config.stash({ output }));
      }

      this.history.append(entry.step, output);
    }
  }

  private resolveNext(stepDef: StepDefinition, output: unknown, stepName: string): string | null {
    const { next, maxVisits, onMaxVisits } = stepDef.config;

    if (typeof next === 'object' && 'terminal' in next && next.terminal) {
      return null;
    }

    let target: string;
    if (typeof next === 'string') {
      target = next;
    } else if (typeof next === 'function') {
      const attempts = this.history.visitCount(stepName);
      target = next({ output, attempts });
    } else {
      return null;
    }

    if (target === 'self') target = stepName;

    if (maxVisits !== undefined && onMaxVisits !== undefined) {
      const visits = this.history.visitCount(target);
      if (visits >= maxVisits) {
        return onMaxVisits;
      }
    }

    return target;
  }

  private buildPrompt(stepName: string): PromptResult {
    const stepDef = this.skill.steps[stepName];
    if (!stepDef) throw new Error(`Step "${stepName}" not found`);

    const prev = this.history.last()?.output;

    const promptCtx: PromptContext = {
      prev,
      history: this.history.all(),
      context: this.skillContext,
      rendered: undefined,
      refs: this.refs,
      attempts: this.history.visitCount(stepName),
      host: this.handshake,
      stash: this.stash.all(),
    };

    if (stepDef.config.render) {
      (promptCtx as { rendered: string | undefined }).rendered = stepDef.config.render(promptCtx);
    }

    let promptText: string;
    const { prompt: promptConfig } = stepDef.config;
    if (typeof promptConfig === 'function') {
      promptText = promptConfig(promptCtx);
    } else if (typeof promptConfig === 'string') {
      promptText = promptConfig;
    } else {
      promptText = '';
    }

    let schema: unknown = null;
    try {
      schema = stepDef.config.output.toJSONSchema();
    } catch {
      // Zod schema may not support toJSONSchema in all cases
    }

    return { step: stepName, prompt: promptText, schema };
  }

  private buildDone(): DoneResult {
    const lastResult = this.history.last();
    const finalOutput = lastResult?.output ?? null;

    if (this.skill.finalOutput) {
      const validation = validateOutput(this.skill.finalOutput, finalOutput);
      if (!validation.success) {
        throw new Error(`Final output validation failed: ${validation.error}`);
      }
    }

    return { done: true, finalOutput };
  }
}
