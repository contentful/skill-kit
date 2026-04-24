import type { SubagentConfig } from '../../../types.js';

export function useSubagentsProse(config: SubagentConfig): string {
  return [
    'SPAWN_SUBAGENT: Use USE_SUBAGENTS to spawn a subagent for this task:',
    '',
    config.prompt,
    '',
    "Return the subagent's final output.",
  ].join('\n');
}
