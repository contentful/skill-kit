import type { SkillDefinition } from '../../types.js';
import type { LintDiagnostic } from '../types.js';
import { HOST_REGISTRY } from '../../protocol/host.js';

const KNOWN_TOOLS = new Set(Object.values(HOST_REGISTRY).flat());

const TOOL_PATTERN = /host\.toolsAvailable\.includes\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

export function unknownToolNames(skill: SkillDefinition): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];

  for (const [stepName, stepDef] of Object.entries(skill.steps)) {
    const { prompt: promptConfig } = stepDef.config;
    if (!promptConfig) continue;

    const source = typeof promptConfig === 'string' ? promptConfig : promptConfig.toString();
    for (const match of source.matchAll(TOOL_PATTERN)) {
      const toolName = match[1]!;
      if (!KNOWN_TOOLS.has(toolName)) {
        diagnostics.push({
          rule: 'unknown-tool-names',
          severity: 'warning',
          message: `Step "${stepName}" references unknown tool "${toolName}" in host check. Check for typos.`,
          step: stepName,
        });
      }
    }
  }

  return diagnostics;
}
