import type { StepResult } from '../types.js';

export class History {
  private readonly results: StepResult[] = [];

  append(step: string, output: unknown, actionOutput?: unknown): void {
    const result: StepResult = Object.freeze({
      step,
      output,
      action: actionOutput,
    });
    this.results.push(result);
  }

  last(): StepResult | undefined {
    return this.results[this.results.length - 1];
  }

  find(stepName: string): StepResult | undefined {
    return this.results.find((r) => r.step === stepName);
  }

  all(): readonly StepResult[] {
    return this.results;
  }

  visitCount(stepName: string): number {
    return this.results.filter((r) => r.step === stepName).length;
  }
}
