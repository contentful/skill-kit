import type {
  SkillDefinition,
  Handshake,
  StepDefinition,
  StepResult,
  PromptResult,
  DoneResult,
  RedirectResult,
  CliResult,
  PromptContext,
  ReferenceLoader,
  PromptPiece,
  PromptReturn,
} from '../types.js';
import { renderPrimitive } from '../primitives/registry.js';
import { validateCycleGuards, type CycleGuardResult, CycleGuardError } from '../validation/cycle-guard.js';
import { validateOutput } from './schema-validator.js';
import { History } from './history.js';
import { StashStore } from './stash.js';
import { ObserverDispatcher } from './observer-dispatch.js';
import { generatePreamble } from './preamble.js';
import { act } from '../act.js';
import { system } from '../system.js';

function normalizePieces(raw: PromptReturn): PromptPiece[] {
  if (typeof raw === 'string') return [raw];
  if (Array.isArray(raw)) return [...raw];
  return [raw];
}

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
  private readonly observers: ObserverDispatcher;
  private readonly abortController: AbortController;
  private startTime: number = 0;
  private currentStep: string;
  private cycleGuard: CycleGuardResult | undefined;

  constructor(skill: SkillDefinition, handshake: Handshake, context: unknown, refs?: ReferenceLoader) {
    this.skill = skill;
    this.handshake = handshake;
    this.refs = refs ?? NOOP_REFS;
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
    this.cycleGuard = validateCycleGuards(this.skill.steps);
    const prompt = this.buildPrompt(this.currentStep);
    const preamble = generatePreamble(this.handshake);
    prompt.preamble = this.skill.system ? `${this.skill.system}\n\n${preamble}` : preamble;
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
      const rawActionInput = stepDef.config.actionInput
        ? stepDef.config.actionInput({ output, stash: this.stash.all() })
        : output;
      const actionInput = stepDef.config.action.input.parse(rawActionInput);
      actionOutput = await stepDef.config.action.run({
        input: actionInput,
        signal: this.abortController.signal,
      });
      actionOutput = Object.freeze(actionOutput);
    }

    if (stepDef.config.afterAction && actionOutput !== undefined) {
      this.stash.merge(stepDef.config.afterAction({ output, action: actionOutput }) as Record<string, unknown>);
    }

    this.history.append(stepName, output, actionOutput);

    this.observers.fire('onStepComplete', {
      step: stepName,
      output,
      durationMs: Date.now() - stepStartTime,
    });

    const completed: StepResult = Object.freeze({ step: stepName, output, action: actionOutput });
    const nextStep = this.resolveNext(stepDef, output, stepName, actionOutput);

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

    if (!this.skill.steps[nextStep]) {
      this.observers.fire('onTransition', { from: stepName, to: nextStep, reason: 'redirect' });
      await this.observers.flush();
      return { redirect: nextStep, completed, stash: this.stash.all() } satisfies RedirectResult;
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

      if (stepDef.config.afterAction && entry.action !== undefined) {
        this.stash.merge(stepDef.config.afterAction({ output, action: entry.action }) as Record<string, unknown>);
      }

      this.history.append(entry.step, output, entry.action);
    }
  }

  private resolveNext(
    stepDef: StepDefinition,
    output: unknown,
    stepName: string,
    actionOutput: unknown,
  ): string | null {
    const { next, maxVisits, onMaxVisits } = stepDef.config;

    if (typeof next === 'object' && 'terminal' in next && next.terminal) {
      return null;
    }

    let target: string;
    if (typeof next === 'string') {
      target = next;
    } else if (typeof next === 'function') {
      const attempts = this.history.visitCount(stepName);
      target = next({ output, attempts, action: actionOutput });
    } else {
      return null;
    }

    if (target === 'self') target = stepName;

    if (maxVisits !== undefined) {
      const visits = this.history.visitCount(target);
      if (visits >= maxVisits) {
        if (onMaxVisits !== undefined) {
          return onMaxVisits;
        }
        throw new CycleGuardError(
          `Step "${target}" exceeded maxVisits (${maxVisits}). Set onMaxVisits to define a fallback transition.`,
        );
      }
    } else if (this.cycleGuard?.stepsInCycles.has(target)) {
      const visits = this.history.visitCount(target);
      if (visits >= this.cycleGuard.defaultMaxVisits) {
        throw new CycleGuardError(
          `Step "${target}" exceeded implicit cycle limit (${this.cycleGuard.defaultMaxVisits} visits). ` +
            `Add explicit maxVisits and onMaxVisits to control this behavior.`,
        );
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
      getStep: <TOutput = unknown, TAction = unknown>(name: string) => this.history.get<TOutput, TAction>(name),
      context: this.skillContext,
      rendered: undefined,
      refs: this.refs,
      attempts: this.history.visitCount(stepName),
      host: this.handshake,
      stash: this.stash.all(),
      act,
      system,
    };

    if (stepDef.config.render) {
      (promptCtx as { rendered: string | undefined }).rendered = stepDef.config.render(promptCtx);
    }

    const raw = this.resolvePromptValue(stepDef, promptCtx);
    const pieces = normalizePieces(raw);

    if (stepDef.config.act) {
      pieces.unshift(stepDef.config.act);
    }

    const promptText = this.assemblePieces(pieces);

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

  private resolvePromptValue(stepDef: StepDefinition, ctx: PromptContext): PromptReturn {
    const { prompt: promptConfig } = stepDef.config;
    if (typeof promptConfig === 'function') return promptConfig(ctx);
    if (typeof promptConfig === 'string') return promptConfig;
    if (Array.isArray(promptConfig)) return promptConfig;
    return '';
  }

  private assemblePieces(pieces: PromptPiece[]): string {
    return pieces
      .map((piece) => {
        if (typeof piece === 'string') return `<prompt>\n${piece}\n</prompt>`;
        if (piece.kind === 'system') return `<system>${piece.text}</system>`;
        if (piece.kind === 'act') return renderPrimitive(piece.primitive);
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
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
