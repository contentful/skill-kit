import type { SkillDefinition } from '../../types.js';
import type { LintDiagnostic } from '../types.js';

const HOST_TOOL_NAMES = [
  'AskUserQuestion',
  'EnterPlanMode',
  'ExitPlanMode',
  'TaskCreate',
  'TaskUpdate',
  'TodoWrite',
  'apply_patch',
  'update_plan',
  'multiedit',
  'todowrite',
  'todoread',
];

const GUARD_PATTERN = /host\.toolsAvailable\.includes\s*\(\s*['"](\w+)['"]\s*\)/g;

export function noHostToolNames(skill: SkillDefinition): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];

  for (const [stepName, stepDef] of Object.entries(skill.steps)) {
    const { prompt: promptConfig } = stepDef.config;
    if (!promptConfig) continue;

    let source: string;
    if (typeof promptConfig === 'string') {
      source = promptConfig;
    } else {
      source = promptConfig.toString();
    }

    const guardedNames = new Set<string>();
    for (const match of source.matchAll(GUARD_PATTERN)) {
      guardedNames.add(match[1]!);
    }

    for (const toolName of HOST_TOOL_NAMES) {
      if (guardedNames.has(toolName)) continue;

      const regex = new RegExp(`\\b${toolName}\\b`);
      if (regex.test(source)) {
        diagnostics.push({
          rule: 'no-host-tool-names',
          severity: 'error',
          message: `Step "${stepName}" references host tool "${toolName}" directly. Use an SDK primitive instead, or guard with host.toolsAvailable.includes("${toolName}").`,
          step: stepName,
        });
      }
    }
  }

  return diagnostics;
}
