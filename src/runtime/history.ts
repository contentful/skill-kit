import type { StepResult } from '../types.js';

export class History {
  private readonly results: StepResult[] = [];

  append(step: string, response: unknown, actionResult?: unknown): void {
    const result: StepResult = Object.freeze({
      step,
      response,
      actionResult,
    });
    this.results.push(result);
  }

  last(): StepResult | undefined {
    return this.results[this.results.length - 1];
  }

  get<TOutput = unknown, TAction = unknown>(
    stepName: string,
  ): { response: TOutput; actionResult: TAction } | undefined {
    const result = this.results.find((r) => r.step === stepName);
    if (!result) return undefined;
    return { response: result.response as TOutput, actionResult: result.actionResult as TAction };
  }

  all(): readonly StepResult[] {
    return this.results;
  }

  visitCount(stepName: string): number {
    return this.results.filter((r) => r.step === stepName).length;
  }
}
