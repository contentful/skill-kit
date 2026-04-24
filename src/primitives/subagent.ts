import type { z } from 'zod';
import type { SubagentConfig } from '../types.js';
import { definePrimitive } from './primitive.js';

export interface SubagentInput {
  prompt: string;
  output: z.ZodType;
}

export const subagentPrimitive = definePrimitive({
  tag: 'subagent',

  tools: ['Agent', 'agent', 'CollabAgent', 'task', 'USE_SUBAGENTS', 'new_task'] as const,

  create(input: SubagentInput): SubagentConfig {
    return Object.freeze({
      kind: 'subagent' as const,
      prompt: input.prompt,
      output: input.output,
    });
  },

  render(config) {
    return `<subagent>${config.prompt}</subagent>`;
  },

  preambleRow(tool) {
    return {
      tag: '`<subagent>`',
      tool: tool ?? '—',
      instruction: tool
        ? 'Spawn isolated agent for enclosed task via the tool. Return its output.'
        : 'Focus on enclosed task, return structured result, then continue.',
    };
  },
});

export const subagent = subagentPrimitive.create;
