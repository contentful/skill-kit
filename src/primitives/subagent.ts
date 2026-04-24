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

export function renderSubagent(config: SubagentConfig): string {
  return `<subagent>${config.prompt}</subagent>`;
}

export const subagentTools = ['Agent', 'agent', 'CollabAgent', 'task', 'USE_SUBAGENTS', 'new_task'];

export function subagentPreambleRow(tool: string | undefined): { tag: string; tool: string; instruction: string } {
  return {
    tag: '`<subagent>`',
    tool: tool ?? '—',
    instruction: tool
      ? 'Spawn isolated agent for enclosed task via the tool. Return its output.'
      : 'Focus on enclosed task, return structured result, then continue.',
  };
}
