import type { z } from 'zod';
import type { SubtaskConfig } from '../types.js';

export interface SubtaskInput {
  prompt: string;
  output: z.ZodType;
  contextBudget?: 'narrow' | 'normal' | 'wide';
}

export function subtask(input: SubtaskInput): SubtaskConfig {
  return Object.freeze({
    kind: 'subtask' as const,
    prompt: input.prompt,
    output: input.output,
    contextBudget: input.contextBudget,
  });
}
