import type { StepResult } from '../types.js';
import type { StoreView, StepsView } from '../types/store.js';
import { deepMerge } from './deep-merge.js';

export type { StoreView as StoreAccessor };

function findLast(records: readonly StepResult[], step: string): unknown {
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i]!.step === step) return records[i]!.result;
  }
  return undefined;
}

export class StateStore {
  private readonly records: StepResult[] = [];
  private readonly subStores: Record<string, unknown> = {};

  append(step: string, response: unknown, actionResult?: unknown, result?: unknown): void {
    const record: StepResult = Object.freeze({ step, response, actionResult, result: result ?? response });
    this.records.push(record);
  }

  applySave(saveData: Record<string, unknown>): void {
    for (const [storeName, value] of Object.entries(saveData)) {
      if (value === undefined) continue;
      this.subStores[storeName] = deepMerge(this.subStores[storeName] ?? {}, value);
    }
  }

  private buildStepsAccessor<
    TSteps extends Record<string, unknown> = Record<string, unknown>,
    TGuaranteed extends keyof TSteps = never,
  >(): StepsView<TSteps, TGuaranteed> {
    const records = this.records;

    const methods = {
      all<K extends string & keyof TSteps>(step: K): TSteps[K][] {
        return records.filter((r) => r.step === step).map((r) => r.result as TSteps[K]);
      },

      ran<K extends string & keyof TSteps>(step: K): boolean {
        return records.some((r) => r.step === step);
      },

      get history(): readonly StepResult[] {
        return records;
      },
    };

    return new Proxy(methods, {
      get(target, prop, receiver) {
        if (prop in target) return Reflect.get(target, prop, receiver);
        if (typeof prop === 'string') return findLast(records, prop);
        return undefined;
      },
    }) as StepsView<TSteps, TGuaranteed>;
  }

  buildAccessor<
    TSteps extends Record<string, unknown> = Record<string, unknown>,
    TGuaranteed extends keyof TSteps = never,
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    TStores extends Record<string, unknown> = {},
  >(): StoreView<TSteps, TGuaranteed, TStores> {
    const stepsAccessor = this.buildStepsAccessor<TSteps, TGuaranteed>();
    const subStores = this.subStores;

    return new Proxy({} as StoreView<TSteps, TGuaranteed, TStores>, {
      get(_target, prop) {
        if (prop === 'steps') return stepsAccessor;
        if (typeof prop === 'string' && prop in subStores) return subStores[prop];
        return undefined;
      },
    });
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
