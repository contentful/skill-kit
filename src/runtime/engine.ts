import type {
  SkillDefinition,
  Handshake,
  StepDefinition,
  StepResult,
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
import { ObserverDispatcher } from './observer-dispatch.js';
import { resolveProseGenerator, type ProseGenerator } from '../primitives/prose/index.js';

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
  private readonly prose: ProseGenerator;
  private readonly observers: ObserverDispatcher;
  private readonly abortController: AbortController;
  private startTime: number = 0;
  private currentStep: string;

  constructor(skill: SkillDefinition, handshake: Handshake, context: unknown, refs?: ReferenceLoader) {
    this.skill = skill;
    this.handshake = handshake;
    this.refs = refs ?? NOOP_REFS;
    this.prose = resolveProseGenerator(handshake);
    this.observers = new ObserverDispatcher(skill.observers ?? {});
    this.abortController = new AbortController();
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
    this.startTime = Date.now();
    this.validateParentSentinels();
    validateCycleGuards(this.skill.steps);
    const prompt = this.buildPrompt(this.currentStep);
    this.observers.fire('onStepStart', { step: this.currentStep, context: this.skillContext });
    return prompt;
  }

  async advance(stepName: string, rawOutput: unknown): Promise<CliResult> {
    const stepStartTime = Date.now();
    const stepDef = this.skill.steps[stepName];
    if (!stepDef) {
      return { error: 'validation', step: stepName, message: `Unknown step "${stepName}"`, retry: false };
    }

    const validation = validateOutput(stepDef.config.output, rawOutput);
    if (!validation.success) {
      this.observers.fire('onStepValidationFailed', {
        step: stepName,
        raw: rawOutput,
        error: validation.error!,
        attempt: this.history.visitCount(stepName) + 1,
      });
      return {
        error: 'validation',
        step: stepName,
        message: validation.error!,
        retry: true,
      };
    }

    const output = Object.freeze(validation.data);

    if (stepDef.config.stash) {
      this.stash.merge(stepDef.config.stash({ output }) as Record<string, unknown>);
    }

    let actionOutput: unknown = undefined;
    if (stepDef.config.action) {
      const actionInput = stepDef.config.action.input.parse(output);
      actionOutput = await stepDef.config.action.run({
        input: actionInput,
        signal: this.abortController.signal,
      });
      actionOutput = Object.freeze(actionOutput);
    }

    this.history.append(stepName, output, actionOutput);

    this.observers.fire('onStepComplete', {
      step: stepName,
      output,
      durationMs: Date.now() - stepStartTime,
    });

    const completed: StepResult = Object.freeze({ step: stepName, output, action: actionOutput });
    const nextStep = this.resolveNext(stepDef, output, stepName);

    if (nextStep === null) {
      const path = this.history.all().map((r) => r.step);
      this.observers.fire('onTransition', { from: stepName, to: '__terminal__', reason: 'terminal' });
      this.observers.fire('onSkillComplete', {
        path,
        finalOutput: output,
        durationMs: Date.now() - this.startTime,
      });
      await this.observers.flush();
      return { ...this.buildDone(), completed };
    }

    this.observers.fire('onTransition', { from: stepName, to: nextStep, reason: 'next' });
    this.observers.fire('onStepStart', { step: nextStep, context: this.skillContext });

    this.currentStep = nextStep;
    return { ...this.buildPrompt(nextStep), completed };
  }

  replayHistory(history: Array<{ step: string; output: unknown; action?: unknown }>): void {
    for (const entry of history) {
      const stepDef = this.skill.steps[entry.step];
      if (!stepDef) continue;

      const validation = validateOutput(stepDef.config.output, entry.output);
      const output = validation.success ? Object.freeze(validation.data) : Object.freeze(entry.output);

      if (stepDef.config.stash) {
        this.stash.merge(stepDef.config.stash({ output }) as Record<string, unknown>);
      }

      this.history.append(entry.step, output, entry.action);
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

    const primitiveProse = this.buildPrimitiveProse(stepDef);
    if (primitiveProse) {
      promptText = primitiveProse + (promptText ? '\n\n' + promptText : '');
    }

    let schema: unknown = null;
    try {
      schema = stepDef.config.output.toJSONSchema();
    } catch {
      // Zod schema may not support toJSONSchema in all cases
    }

    return { step: stepName, prompt: promptText, schema };
  }

  private validateParentSentinels(): void {
    for (const [name, stepDef] of Object.entries(this.skill.steps)) {
      if (stepDef.config.next === '__parent__') {
        throw new Error(
          `Step "${name}" has next: "__parent__" which must be overridden via .extend(). ` +
            `This step was likely imported from a shared module without setting a transition.`,
        );
      }
    }
  }

  private buildPrimitiveProse(stepDef: StepDefinition): string | null {
    const {
      ask,
      openQuestion: oq,
      confirm,
      plan: planConfig,
      tasks: tasksConfig,
      subtask: subtaskConfig,
    } = stepDef.config;
    if (ask) return this.prose.askUser(ask);
    if (oq) return this.prose.openQuestion(oq);
    if (confirm) return this.prose.confirm(confirm);
    if (planConfig) return this.prose.plan(planConfig);
    if (tasksConfig) return this.prose.tasks(tasksConfig);
    if (subtaskConfig) return this.prose.subtask(subtaskConfig);
    return null;
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
