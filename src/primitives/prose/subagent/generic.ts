import type { SubagentConfig } from '../../../types.js';

export function genericSubagentProse(config: SubagentConfig): string {
  return [
    'SPAWN_SUBAGENT: Focus on this task, then return a structured summary:',
    '',
    config.prompt,
    '',
    'Then return to the main workflow.',
  ].join('\n');
}
