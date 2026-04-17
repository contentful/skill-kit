import type { SkillDefinition } from '../../types.js';
import type { LintDiagnostic } from '../types.js';

const KNOWN_TOOLS = new Set([
  // Claude Code
  'AskUserQuestion',
  'EnterPlanMode',
  'ExitPlanMode',
  'TaskCreate',
  'TaskUpdate',
  'TaskList',
  'TaskGet',
  'Agent',
  'Skill',
  'Read',
  'Edit',
  'Write',
  'Bash',
  'Glob',
  'Grep',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
  // Codex
  'shell',
  'apply_patch',
  'update_plan',
  'web_search',
  'view_image',
  'exec_command',
  'write_stdin',
  'request_permissions',
  // OpenCode
  'bash',
  'read',
  'write',
  'edit',
  'multiedit',
  'glob',
  'grep',
  'list',
  'webfetch',
  'task',
  'todowrite',
  'todoread',
  'lsp',
]);

const TOOL_PATTERN = /host\.toolsAvailable\.includes\s*\(\s*['"](\w+)['"]\s*\)/g;

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
