import type { StepResult } from '../types.js';

export interface StoreAccessor<TSteps extends Record<string, unknown> = Record<string, unknown>> {
  maybe<K extends string & keyof TSteps>(step: K): TSteps[K] | undefined;
  all<K extends string & keyof TSteps>(step: K): TSteps[K][];
  ran<K extends string & keyof TSteps>(step: K): boolean;
  readonly history: readonly StepResult[];
}

export class StateStore {
  private readonly records: StepResult[] = [];

  append(step: string, response: unknown, actionResult?: unknown): void {
    const record: StepResult = Object.freeze({ step, response, actionResult });
    this.records.push(record);
  }

  buildAccessor<TSteps extends Record<string, unknown> = Record<string, unknown>>(): StoreAccessor<TSteps> {
    const records = this.records;

    return {
      maybe<K extends string & keyof TSteps>(step: K): TSteps[K] | undefined {
        for (let i = records.length - 1; i >= 0; i--) {
          if (records[i]!.step === step) return records[i]!.response as TSteps[K];
        }
        return undefined;
      },

      all<K extends string & keyof TSteps>(step: K): TSteps[K][] {
        return records.filter((r) => r.step === step).map((r) => r.response as TSteps[K]);
      },

      ran<K extends string & keyof TSteps>(step: K): boolean {
        return records.some((r) => r.step === step);
      },

      get history(): readonly StepResult[] {
        return records;
      },
    };
  }

  last(): StepResult | undefined {
    return this.records[this.records.length - 1];
  }

  all(): readonly StepResult[] {
    return this.records;
  }

  visitCount(stepName: string): number {
    return this.records.filter((r) => r.step === stepName).length;
  }
}
