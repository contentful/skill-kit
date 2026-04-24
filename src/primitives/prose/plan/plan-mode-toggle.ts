import type { PlanConfig } from '../../../types.js';

export function planModeToggleProse(config: PlanConfig): string {
  const stepsList = config.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return [
    'PRESENT_PLAN: Switch to PLAN_MODE and present this plan:',
    '',
    `Summary: ${config.summary}`,
    '',
    stepsList,
    '',
    'Wait for the user to approve, then switch to ACT_MODE to proceed.',
  ].join('\n');
}
