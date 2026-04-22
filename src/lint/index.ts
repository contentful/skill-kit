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
    const cycleResult = validateCycleGuards(skill.steps);
    for (const stepName of cycleResult.stepsInCycles) {
      const stepDef = skill.steps[stepName];
      if (stepDef && stepDef.config.maxVisits === undefined) {
        diagnostics.push({
          rule: 'cycle-guard',
          severity: 'warning',
          message:
            `Step "${stepName}" is in a cycle but lacks maxVisits/onMaxVisits. ` +
            `An implicit limit of ${cycleResult.defaultMaxVisits} visits will apply at runtime.`,
        });
      }
    }
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
  diagnostics.push(...compositeRules(skill));

  if (skill.subskills) {
    for (const [name, reg] of Object.entries(skill.subskills)) {
      const subDiags = checkSkill(reg.definition, rootDir);
      for (const d of subDiags) {
        diagnostics.push({ ...d, message: `[subskill:${name}] ${d.message}` });
      }
    }
  }

  return diagnostics;
}

function compositeRules(skill: SkillDefinition): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];

  for (const stepName of Object.keys(skill.steps)) {
    if (stepName.includes('/')) {
      diagnostics.push({
        rule: 'composite-step-name',
        severity: 'error',
        step: stepName,
        message: `Step name "${stepName}" contains "/" which conflicts with sub-skill step namespacing.`,
      });
    }
  }

  if (skill.subskills) {
    const subNames = new Set<string>();
    for (const name of Object.keys(skill.subskills)) {
      if (subNames.has(name)) {
        diagnostics.push({
          rule: 'composite-duplicate-subskill',
          severity: 'error',
          message: `Duplicate sub-skill name "${name}".`,
        });
      }
      subNames.add(name);
    }
  }

  if (skill.topics) {
    const topicNames = new Set<string>();
    for (const name of Object.keys(skill.topics)) {
      if (topicNames.has(name)) {
        diagnostics.push({
          rule: 'composite-duplicate-topic',
          severity: 'error',
          message: `Duplicate topic name "${name}".`,
        });
      }
      topicNames.add(name);
    }
  }

  return diagnostics;
}
