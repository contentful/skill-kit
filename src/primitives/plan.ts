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

export function renderPlan(config: PlanConfig): string {
  const steps = config.steps.map((s) => `  <step>${s}</step>`).join('\n');
  return `<plan summary="${config.summary}">\n${steps}\n</plan>`;
}

export const planTools = ['EnterPlanMode', 'enter-plan-mode', 'update_plan', 'plan', 'PLAN_MODE'];

export function planPreambleRow(tool: string | undefined): { tag: string; tool: string; instruction: string } {
  return {
    tag: '`<plan>`',
    tool: tool ?? '—',
    instruction: tool
      ? 'Present summary + `<step>` children via the tool. Wait for approval.'
      : 'Present as numbered list. Ask to proceed or revise.',
  };
}
