import type { z } from 'zod';
import type { SubagentConfig } from '../types.js';
import { definePrimitive } from './primitive.js';

export interface SubagentInput {
  prompt: string;
  output: z.ZodType;
  allowRecursion?: boolean;
}

export const subagentPrimitive = definePrimitive({
  tag: 'subagent',

  tools: ['Agent', 'agent', 'CollabAgent', 'task', 'USE_SUBAGENTS', 'new_task'] as const,

  create(input: SubagentInput): SubagentConfig {
    return Object.freeze({
      kind: 'subagent' as const,
      prompt: input.prompt,
      output: input.output,
      allowRecursion: input.allowRecursion,
    });
  },

  render(config, ctx) {
    if (!config.allowRecursion && ctx?.skillName) {
      return `<subagent no-recurse="${ctx.skillName}">${config.prompt}</subagent>`;
    }
    return `<subagent>${config.prompt}</subagent>`;
  },

  preambleRow(tool) {
    return {
      tag: '`<subagent>`',
      tool: tool ?? '—',
      instruction: tool
        ? 'Spawn isolated agent for enclosed task via the tool. Return its output. If `no-recurse` is set, the subagent must not invoke this skill again.'
        : 'Focus on enclosed task, return structured result, then continue. If `no-recurse` is set, do not invoke this skill again.',
    };
  },
});

export const subagent = subagentPrimitive.create;
