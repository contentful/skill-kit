import type { z } from 'zod';
import type { SubagentConfig } from '../types.js';

export interface SubagentInput {
  prompt: string;
  output: z.ZodType;
}

export function subagent(input: SubagentInput): SubagentConfig {
  return Object.freeze({
    kind: 'subagent' as const,
    prompt: input.prompt,
    output: input.output,
  });
}
