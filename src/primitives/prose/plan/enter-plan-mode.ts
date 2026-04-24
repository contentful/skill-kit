import type { PlanConfig } from '../../../types.js';

export function enterPlanModeProse(config: PlanConfig): string {
  const stepsList = config.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return [
    'PRESENT_PLAN: Use EnterPlanMode to enter plan mode and present this plan to the user:',
    '',
    `Summary: ${config.summary}`,
    '',
    stepsList,
    '',
    'Wait for the user to review and approve before proceeding. Use ExitPlanMode when done.',
  ].join('\n');
}
