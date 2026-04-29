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
import type { SkillEngine } from '../protocol/skill-engine.js';
import { HistoryEntrySchema, type HistoryEntry } from '../protocol/types.js';

function normalizePieces(raw: PromptReturn): PromptPiece[] {
  if (typeof raw === 'string') return [raw];
  if (Array.isArray(raw)) return [...raw];
  return [raw];
}

const NOOP_REFS: ReferenceLoader = {
  load: () => '',
  asset: (p) => p,
};

export class WorkflowEngine implements SkillEngine {
  private readonly skill: SkillDefinition;
  private readonly handshake: Handshake;
  private readonly skillParams: Readonly<unknown>;
  private readonly history: History;
  private readonly stash: StashStore;
  private readonly refs: ReferenceLoader;
  private readonly observers: ObserverDispatcher;
  private readonly abortController: AbortController;
  private startTime: number = 0;
  private currentStep: string;
  private cycleGuard: CycleGuardResult | undefined;

  constructor(skill: SkillDefinition, handshake: Handshake, params: unknown, refs?: ReferenceLoader) {
    this.skill = skill;
    this.handshake = handshake;
    this.refs = refs ?? NOOP_REFS;
    this.observers = new ObserverDispatcher(skill.observers ?? {});
    this.abortController = new AbortController();
    this.history = new History();
    this.stash = new StashStore(skill.stash ?? undefined);
    this.currentStep = skill.entry;

    if (skill.params) {
      const result = skill.params.safeParse(params);
      if (!result.success) {
        const details = result.error.issues
          .map((i: { path: PropertyKey[]; message: string }) =>
            i.path.length > 0 ? `"${i.path.map(String).join('.')}": ${i.message}` : i.message,
          )
          .join('; ');
        throw new Error(
          `Invalid params for skill "${skill.name}": ${details}. Pass --params with the required fields.`,
        );
      }
      this.skillParams = Object.freeze(result.data);
    } else {
      this.skillParams = Object.freeze(params ?? {});
    }
  }

  start(): PromptResult {
    this.startTime = Date.now();
    this.validateParentSentinels();
    this.cycleGuard = validateCycleGuards(this.skill.steps);
    const { step, prompt, schema } = this.buildPrompt(this.currentStep);
    const rawPreamble = generatePreamble(this.handshake);
    const preamble = this.skill.system ? `${this.skill.system}\n\n${rawPreamble}` : rawPreamble;
    this.observers.fire('onStepStart', { step: this.currentStep, params: this.skillParams });
    return { kind: 'prompt', step, preamble, prompt, schema };
  }

  isPromptless(stepName: string): boolean {
    const stepDef = this.skill.steps[stepName];
    return !!stepDef && stepDef.config.prompt === undefined;
  }

  async advance(stepName: string, rawOutput: unknown): Promise<CliResult> {
    const stepStartTime = Date.now();
    const stepDef = this.skill.steps[stepName];
    if (!stepDef) {
      return {
        kind: 'error',
        error: 'validation',
        step: stepName,
        message: `Unknown step "${stepName}"`,
        retry: false,
      };
    }

    let stepOutput: unknown;

    if (stepDef.config.output) {
      const validation = validateOutput(stepDef.config.output, rawOutput);
      if (!validation.success) {
        this.observers.fire('onStepValidationFailed', {
          step: stepName,
          raw: rawOutput,
          error: validation.error!,
          attempt: this.history.visitCount(stepName) + 1,
        });
        return {
          kind: 'error',
          error: 'validation',
          step: stepName,
          message: validation.error!,
          retry: true,
        };
      }
      stepOutput = Object.freeze(validation.data);
    } else {
      stepOutput = Object.freeze({});
    }

    let actionOutput: unknown = undefined;
    if (stepDef.config.action) {
      const { run: actionDef, input: inputFn, updateStash: actionUpdateStash } = stepDef.config.action;
      const rawActionInput = inputFn
        ? inputFn({ stepOutput, stash: this.stash.all(), params: this.skillParams })
        : stepOutput;
      const actionInput = actionDef.input.parse(rawActionInput);
      actionOutput = await actionDef.run({
        input: actionInput,
        signal: this.abortController.signal,
      });
      actionOutput = Object.freeze(actionOutput);
      if (actionUpdateStash) {
        this.stash.merge(actionUpdateStash({ actionOutput }) as Record<string, unknown>);
      }
    }

    if (stepDef.config.updateStash) {
      this.stash.merge(
        stepDef.config.updateStash({
          stepOutput,
          actionOutput,
          stash: this.stash.all(),
          params: this.skillParams,
        }) as Record<string, unknown>,
      );
    }

    this.history.append(stepName, stepOutput, actionOutput);

    this.observers.fire('onStepComplete', {
      step: stepName,
      stepOutput,
      durationMs: Date.now() - stepStartTime,
    });

    const completed: StepResult = Object.freeze({ step: stepName, stepOutput, actionOutput });
    const nextStep = this.resolveNext(stepDef, stepOutput, stepName, actionOutput);

    if (nextStep === null) {
      const path = this.history.all().map((r) => r.step);
      this.observers.fire('onTransition', { from: stepName, to: '__terminal__', reason: 'terminal' });
      this.observers.fire('onSkillComplete', {
        path,
        finalOutput: stepOutput,
        durationMs: Date.now() - this.startTime,
      });
      await this.observers.flush();
      return { ...this.buildDone(), completed };
    }

    if (!this.skill.steps[nextStep]) {
      this.observers.fire('onTransition', { from: stepName, to: nextStep, reason: 'redirect' });
      await this.observers.flush();
      return { kind: 'redirect', redirect: nextStep, completed, stash: this.stash.all() } satisfies RedirectResult;
    }

    this.observers.fire('onTransition', { from: stepName, to: nextStep, reason: 'next' });
    this.observers.fire('onStepStart', { step: nextStep, params: this.skillParams });

    this.currentStep = nextStep;
    return { ...this.buildPrompt(nextStep), completed };
  }

  replayHistory(history: HistoryEntry[]): void {
    for (const raw of history) {
      const parsed = HistoryEntrySchema.safeParse(raw);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i: { message: string }) => i.message).join('; ');
        process.stderr.write(`[skill-kit] skipping malformed history entry: ${issues}\n`);
        continue;
      }
      const entry = parsed.data;
      const stepDef = this.skill.steps[entry.step];
      if (!stepDef) continue;

      let stepOutput: unknown;
      if (stepDef.config.output) {
        const validation = validateOutput(stepDef.config.output, entry.stepOutput);
        stepOutput = validation.success ? Object.freeze(validation.data) : Object.freeze(entry.stepOutput);
      } else {
        stepOutput = Object.freeze(entry.stepOutput ?? {});
      }

      if (stepDef.config.action?.updateStash && entry.actionOutput !== undefined) {
        this.stash.merge(
          stepDef.config.action.updateStash({ actionOutput: entry.actionOutput }) as Record<string, unknown>,
        );
      }

      if (stepDef.config.updateStash) {
        this.stash.merge(
          stepDef.config.updateStash({
            stepOutput,
            actionOutput: entry.actionOutput,
            stash: this.stash.all(),
            params: this.skillParams,
          }) as Record<string, unknown>,
        );
      }

      this.history.append(entry.step, stepOutput, entry.actionOutput);
    }
  }

  private resolveNext(
    stepDef: StepDefinition,
    stepOutput: unknown,
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
      target = next({ stepOutput, attempts, actionOutput, params: this.skillParams, stash: this.stash.all() });
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

    const promptCtx: PromptContext = {
      history: this.history.all(),
      getStep: <TOutput = unknown, TAction = unknown>(name: string) => this.history.get<TOutput, TAction>(name),
      params: this.skillParams,
      refs: this.refs,
      attempts: this.history.visitCount(stepName),
      host: this.handshake,
      stash: this.stash.all(),
      act,
      system,
    };

    const raw = this.resolvePromptValue(stepDef, promptCtx);
    const pieces = normalizePieces(raw);

    const promptText = this.assemblePieces(pieces);

    let schema: unknown = null;
    if (stepDef.config.output) {
      try {
        schema = stepDef.config.output.toJSONSchema();
      } catch {
        // Zod schema may not support toJSONSchema in all cases
      }
    }

    return { kind: 'prompt', step: stepName, prompt: promptText, schema };
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
    if (promptConfig && typeof promptConfig === 'object' && 'kind' in promptConfig) return promptConfig;
    return '';
  }

  private assemblePieces(pieces: PromptPiece[]): string {
    return pieces
      .map((piece) => {
        if (typeof piece === 'string') return `<prompt>\n${piece}\n</prompt>`;
        if (piece.kind === 'system') return `<system>${piece.text}</system>`;
        if (piece.kind === 'act') return renderPrimitive(piece.primitive, { skillName: this.skill.name });
        if (piece.kind === 'view') {
          const nameAttr = piece.label ? ` name="${piece.label}"` : '';
          return `<rendered${nameAttr}>\n${piece.text}\n</rendered>`;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
  }

  private buildDone(): DoneResult {
    const lastResult = this.history.last();
    const finalOutput = lastResult?.stepOutput ?? null;

    if (this.skill.finalOutput) {
      const validation = validateOutput(this.skill.finalOutput, finalOutput);
      if (!validation.success) {
        throw new Error(`Final output validation failed: ${validation.error}`);
      }
    }

    return { kind: 'done', done: true, finalOutput };
  }
}
