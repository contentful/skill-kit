import type { PlanConfig } from '../../../types.js';

export function genericPlanProse(config: PlanConfig): string {
  const stepsList = config.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return [
    'PRESENT_PLAN: Present this plan to the user as a numbered list:',
    '',
    `Summary: ${config.summary}`,
    '',
    stepsList,
    '',
    'Ask whether to proceed or revise before continuing.',
  ].join('\n');
}
