import type { PlanConfig } from '../../../types.js';

export function planToolProse(config: PlanConfig): string {
  const stepsList = config.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return [
    'PRESENT_PLAN: Use the plan tool to present this plan:',
    '',
    `Summary: ${config.summary}`,
    '',
    stepsList,
    '',
    'Then ask the user explicitly whether to proceed or revise.',
  ].join('\n');
}
