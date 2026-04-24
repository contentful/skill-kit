import type { ChecklistConfig } from '../types.js';

export interface ChecklistInput {
  create: Array<{ title: string; status: string }>;
}

export function checklist(input: ChecklistInput): ChecklistConfig {
  return Object.freeze({
    kind: 'checklist' as const,
    create: input.create,
  });
}
