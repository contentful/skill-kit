import type {
  CliResult,
  PromptResult,
  DoneResult,
  ValidationErrorResult,
  StepResult,
  Handshake,
  SkillDefinition,
  ReferenceLoader,
} from '../types.js';
import { WorkflowEngine } from '../runtime/engine.js';

type HistoryEntry = { step: string; stepOutput: unknown; actionOutput?: unknown };

/**
 * Wraps a WorkflowEngine for a subskill, transparently qualifying step names
 * on the way out (engine → session) and unqualifying on the way in (session → engine).
 *
 * Callers never prefix or unprefix manually — the boundary lives here.
 */
export class SubskillEngine {
  private readonly engine: WorkflowEngine;
  private readonly prefix: string;

  constructor(
    definition: SkillDefinition,
    handshake: Handshake,
    params: unknown,
    refs: ReferenceLoader,
    subskillName: string,
  ) {
    this.engine = new WorkflowEngine(definition, handshake, params, refs);
    this.prefix = `${subskillName}/`;
  }

  start(): PromptResult {
    return this.qualifyPrompt(this.engine.start());
  }

  startForReplay(): void {
    this.engine.start();
  }

  replayHistory(history: HistoryEntry[]): void {
    const filtered: HistoryEntry[] = [];
    for (const entry of history) {
      if (entry.step.startsWith(this.prefix)) {
        filtered.push({ ...entry, step: entry.step.slice(this.prefix.length) });
      }
    }
    if (filtered.length > 0) {
      this.engine.replayHistory(filtered);
    }
  }

  isPromptless(qualifiedStep: string): boolean {
    const bareStep = this.stripPrefix(qualifiedStep);
    return this.engine.isPromptless(bareStep);
  }

  async advance(qualifiedStep: string, output: unknown): Promise<CliResult> {
    const bareStep = this.stripPrefix(qualifiedStep);
    return this.qualifyResult(await this.engine.advance(bareStep, output));
  }

  private stripPrefix(step: string): string {
    return step.startsWith(this.prefix) ? step.slice(this.prefix.length) : step;
  }

  private qualify(step: string): string {
    return `${this.prefix}${step}`;
  }

  private qualifyCompleted(completed: StepResult): StepResult {
    return { ...completed, step: this.qualify(completed.step) };
  }

  private qualifyPrompt(result: PromptResult): PromptResult {
    return {
      ...result,
      step: this.qualify(result.step),
      ...(result.completed ? { completed: this.qualifyCompleted(result.completed) } : {}),
    };
  }

  private qualifyResult(result: CliResult): CliResult {
    if ('redirect' in result) {
      throw new Error(
        `SubskillEngine: unexpected redirect "${(result as { redirect: string }).redirect}" — ` +
          `subskills should not produce redirect results`,
      );
    }

    if ('error' in result) {
      const err = result as ValidationErrorResult;
      return { ...err, step: this.qualify(err.step) };
    }

    if ('done' in result) {
      const done = result as DoneResult;
      return {
        ...done,
        ...(done.completed ? { completed: this.qualifyCompleted(done.completed) } : {}),
      };
    }

    return this.qualifyPrompt(result as PromptResult);
  }
}
