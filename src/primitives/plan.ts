import type { PlanConfig } from '../types.js';
import { definePrimitive } from './primitive.js';

export interface PlanInput {
  summary: string;
  steps: string[];
}

export const planPrimitive = definePrimitive({
  tag: 'plan',

  tools: ['EnterPlanMode', 'enter-plan-mode', 'update_plan', 'plan', 'PLAN_MODE'] as const,

  create(input: PlanInput): PlanConfig {
    return Object.freeze({
      kind: 'plan' as const,
      summary: input.summary,
      steps: input.steps,
    });
  },

  render(config) {
    const steps = config.steps.map((s) => `  <step>${s}</step>`).join('\n');
    return `<plan summary="${config.summary}">\n${steps}\n</plan>`;
  },

  preambleRow(tool) {
    return {
      tag: '`<plan>`',
      tool: tool ?? '—',
      instruction: tool
        ? 'Submit summary + `<step>` children to the tool to enter plan mode. Await user approval or revision before continuing.'
        : 'Present as numbered list. Ask to proceed or revise.',
    };
  },
});

export const plan = planPrimitive.create;
