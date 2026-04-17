import type { PlanConfig } from '../types.js';

export interface PlanInput {
  summary: string;
  steps: string[];
}

export function plan(input: PlanInput): PlanConfig {
  return Object.freeze({
    kind: 'plan' as const,
    summary: input.summary,
    steps: input.steps,
  });
}
