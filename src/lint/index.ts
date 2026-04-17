import type { SkillDefinition } from '../types.js';
import { validateCycleGuards } from '../validation/cycle-guard.js';
import { noHostToolNames } from './rules/no-host-tool-names.js';
import { hostBranchingDensity } from './rules/host-branching-density.js';
import { primitiveSchemaMatch } from './rules/primitive-schema-mismatch.js';
import { orphanReferences } from './rules/orphan-references.js';
import { unknownToolNames } from './rules/unknown-tool-names.js';
import type { LintDiagnostic } from './types.js';
export type { LintDiagnostic } from './types.js';

export function checkSkill(skill: SkillDefinition, rootDir: string): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];

  try {
    validateCycleGuards(skill.steps);
  } catch (err) {
    diagnostics.push({
      rule: 'cycle-guard',
      severity: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }

  diagnostics.push(...noHostToolNames(skill));
  diagnostics.push(...hostBranchingDensity(skill));
  diagnostics.push(...primitiveSchemaMatch(skill));
  diagnostics.push(...orphanReferences(skill, rootDir));
  diagnostics.push(...unknownToolNames(skill));

  return diagnostics;
}
