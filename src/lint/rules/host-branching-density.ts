import type { SkillDefinition } from '../../types.js';
import type { LintDiagnostic } from '../types.js';

const HOST_BRANCH_PATTERN = /host\.toolsAvailable\.includes/;

export function hostBranchingDensity(skill: SkillDefinition): LintDiagnostic[] {
  let branchCount = 0;
  const branchingSteps: string[] = [];

  for (const [stepName, stepDef] of Object.entries(skill.steps)) {
    const { prompt: promptConfig } = stepDef.config;
    if (!promptConfig) continue;

    const source = typeof promptConfig === 'string' ? promptConfig : promptConfig.toString();
    if (HOST_BRANCH_PATTERN.test(source)) {
      branchCount++;
      branchingSteps.push(stepName);
    }
  }

  if (branchCount > 1) {
    return [
      {
        rule: 'host-branching-density',
        severity: 'warning',
        message: `${branchCount} steps branch on host.toolsAvailable (${branchingSteps.join(', ')}). This may indicate a missing SDK primitive.`,
      },
    ];
  }

  return [];
}
