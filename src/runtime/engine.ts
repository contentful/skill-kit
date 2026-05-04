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
import { type } from 'arktype';
import { renderPrimitive } from '../primitives/registry.js';
import { validateCycleGuards, type CycleGuardResult, CycleGuardError } from '../validation/cycle-guard.js';
import { validateOutput, validateSave } from './schema-validator.js';
import { StateStore } from './state-store.js';
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
  private readonly state: StateStore;
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
    this.state = new StateStore();
    this.currentStep = skill.entry;

    if (skill.params) {
      const result = skill.params(params);
      if (result instanceof type.errors) {
        const details = result
          .map((i) => (i.path.length > 0 ? `"${[...i.path].map(String).join('.')}": ${i.message}` : i.message))
          .join('; ');
        throw new Error(
          `Invalid params for skill "${skill.name}": ${details}. Pass --params with the required fields.`,
        );
      }
      this.skillParams = Object.freeze(result);
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

    let response: unknown;

    if (stepDef.config.response) {
      const validation = validateOutput(stepDef.config.response, rawOutput);
      if (!validation.success) {
        this.observers.fire('onStepValidationFailed', {
          step: stepName,
          raw: rawOutput,
          error: validation.error!,
          attempt: this.state.visitCount(stepName) + 1,
        });
        return {
          kind: 'error',
          error: 'validation',
          step: stepName,
          message: validation.error!,
          retry: true,
        };
      }
      response = Object.freeze(validation.data);
    } else {
      response = Object.freeze({});
    }

    let actionResult: unknown = undefined;
    if (typeof stepDef.config.action === 'function') {
      actionResult = await stepDef.config.action({
        response,
        store: this.state.buildAccessor(),
        params: this.skillParams,
        signal: this.abortController.signal,
      });
      actionResult = Object.freeze(actionResult);
    } else if (stepDef.config.action) {
      const { run: actionDef, mapInput } = stepDef.config.action;
      const rawActionInput = mapInput
        ? mapInput({ response, store: this.state.buildAccessor(), params: this.skillParams })
        : response;
      const actionInput = actionDef.input.assert(rawActionInput);
      actionResult = await actionDef.run({
        input: actionInput,
        signal: this.abortController.signal,
      });
      actionResult = Object.freeze(actionResult);
    }

    let stepResult: unknown;
    if (stepDef.config.save) {
      const saveReturn = stepDef.config.save({
        response,
        actionResult,
        store: this.state.buildAccessor(),
        params: this.skillParams,
      });
      const { step: stepValue, ...storeWrites } = (saveReturn as Record<string, unknown>) ?? {};
      stepResult = stepValue !== undefined ? Object.freeze(stepValue) : (actionResult ?? response);

      if (Object.keys(storeWrites).length > 0) {
        if (this.skill.stores) {
          const validation = validateSave(this.skill.stores, storeWrites);
          if (!validation.success) {
            process.stderr.write(`[skill-kit] save validation warning at step "${stepName}": ${validation.error}\n`);
          }
        }
        this.state.applySave(storeWrites);
      }
    } else if (actionResult !== undefined) {
      stepResult = actionResult;
    } else {
      stepResult = response;
    }

    this.state.append(stepName, response, actionResult, stepResult);

    this.observers.fire('onStepComplete', {
      step: stepName,
      response,
      durationMs: Date.now() - stepStartTime,
    });

    const completed: StepResult = Object.freeze({ step: stepName, response, actionResult, result: stepResult });
    const nextStep = this.resolveNext(stepDef, response, stepName, actionResult);

    if (nextStep === null) {
      const path = this.state.all().map((r) => r.step);
      this.observers.fire('onTransition', { from: stepName, to: '__terminal__', reason: 'terminal' });
      this.observers.fire('onSkillComplete', {
        path,
        finalOutput: response,
        durationMs: Date.now() - this.startTime,
      });
      await this.observers.flush();
      return { ...this.buildDone(), completed };
    }

    if (!this.skill.steps[nextStep]) {
      this.observers.fire('onTransition', { from: stepName, to: nextStep, reason: 'redirect' });
      await this.observers.flush();
      return {
        kind: 'redirect',
        redirect: nextStep,
        completed,
        store: this.state.buildAccessor(),
      } satisfies RedirectResult;
    }

    this.observers.fire('onTransition', { from: stepName, to: nextStep, reason: 'next' });
    this.observers.fire('onStepStart', { step: nextStep, params: this.skillParams });

    this.currentStep = nextStep;
    return { ...this.buildPrompt(nextStep), completed };
  }

  replayHistory(history: HistoryEntry[]): void {
    for (const raw of history) {
      const parsed = HistoryEntrySchema(raw);
      if (parsed instanceof type.errors) {
        const issues = parsed.map((i: { message: string }) => i.message).join('; ');
        process.stderr.write(`[skill-kit] skipping malformed history entry: ${issues}\n`);
        continue;
      }
      const entry = parsed;
      const stepDef = this.skill.steps[entry.step];
      if (!stepDef) continue;

      let response: unknown;
      if (stepDef.config.response) {
        const validation = validateOutput(stepDef.config.response, entry.response);
        response = validation.success ? Object.freeze(validation.data) : Object.freeze(entry.response);
      } else {
        response = Object.freeze(entry.response ?? {});
      }

      let replayResult: unknown;
      let storeWrites: Record<string, unknown> | undefined;
      if (stepDef.config.save) {
        const saveReturn = stepDef.config.save({
          response,
          actionResult: entry.actionResult,
          store: this.state.buildAccessor(),
          params: this.skillParams,
        });
        const { step: stepValue, ...writes } = (saveReturn as Record<string, unknown>) ?? {};
        replayResult = stepValue !== undefined ? Object.freeze(stepValue) : (entry.actionResult ?? response);
        if (Object.keys(writes).length > 0) storeWrites = writes;
      } else if (entry.actionResult !== undefined) {
        replayResult = entry.actionResult;
      } else {
        replayResult = response;
      }

      this.state.append(entry.step, response, entry.actionResult, replayResult);
      if (storeWrites) this.state.applySave(storeWrites);
    }
  }

  private resolveNext(
    stepDef: StepDefinition,
    response: unknown,
    stepName: string,
    actionResult: unknown,
  ): string | null {
    const { next, maxVisits, onMaxVisits } = stepDef.config;

    if (typeof next === 'object' && 'terminal' in next && next.terminal) {
      return null;
    }

    let target: string;
    if (typeof next === 'string') {
      target = next;
    } else if (typeof next === 'function') {
      const attempts = this.state.visitCount(stepName);
      target = next({ response, attempts, actionResult, params: this.skillParams, store: this.state.buildAccessor() });
    } else if (Array.isArray(next)) {
      const attempts = this.state.visitCount(stepName);
      const ctx = { response, actionResult, params: this.skillParams, store: this.state.buildAccessor(), attempts };
      const match = next.find((branch) => !branch.when || branch.when(ctx));
      if (!match) {
        throw new Error(`Step "${stepName}": no branch matched and no default (entry without \`when\`) was provided.`);
      }
      target = match.to;
    } else {
      return null;
    }

    if (target === 'self') target = stepName;

    if (maxVisits !== undefined) {
      const visits = this.state.visitCount(target);
      if (visits >= maxVisits) {
        if (onMaxVisits !== undefined) {
          return onMaxVisits;
        }
        throw new CycleGuardError(
          `Step "${target}" exceeded maxVisits (${maxVisits}). Set onMaxVisits to define a fallback transition.`,
        );
      }
    } else if (this.cycleGuard?.stepsInCycles.has(target)) {
      const visits = this.state.visitCount(target);
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
      store: this.state.buildAccessor(),
      params: this.skillParams,
      refs: this.refs,
      attempts: this.state.visitCount(stepName),
      host: this.handshake,
      act,
      system,
    };

    const raw = this.resolvePromptValue(stepDef, promptCtx);
    const pieces = normalizePieces(raw);

    const promptText = this.assemblePieces(pieces);

    let schema: unknown = null;
    if (stepDef.config.response) {
      try {
        schema = stepDef.config.response.toJsonSchema();
      } catch {
        // Schema may not support toJsonSchema in all cases
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
    const lastResult = this.state.last();
    const finalOutput = lastResult?.response ?? null;

    if (this.skill.finalOutput) {
      const validation = validateOutput(this.skill.finalOutput, finalOutput);
      if (!validation.success) {
        throw new Error(`Final output validation failed: ${validation.error}`);
      }
    }

    return { kind: 'done', done: true, finalOutput };
  }
}
