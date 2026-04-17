import type { ModelAdapter } from '../types.js';

type MockEntry = unknown | unknown[] | ((prompt: string) => unknown);

export function mockModel(map: Record<string, MockEntry>): ModelAdapter {
  const counters = new Map<string, number>();

  return {
    respond(stepName: string, prompt: string): unknown {
      const entry = map[stepName];
      if (entry === undefined) {
        throw new Error(`mockModel: no entry for step "${stepName}"`);
      }

      if (typeof entry === 'function') {
        return entry(prompt);
      }

      if (Array.isArray(entry)) {
        const idx = counters.get(stepName) ?? 0;
        counters.set(stepName, idx + 1);
        if (idx >= entry.length) {
          throw new Error(`mockModel: step "${stepName}" visited ${idx + 1} times but only ${entry.length} entries`);
        }
        return entry[idx];
      }

      return entry;
    },
  };
}
