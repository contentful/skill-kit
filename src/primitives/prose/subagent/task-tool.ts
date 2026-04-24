import type { SubagentConfig } from '../../../types.js';

export function taskToolProse(config: SubagentConfig): string {
  return [
    'SPAWN_SUBAGENT: Use the task tool to spawn a subagent for this:',
    '',
    config.prompt,
    '',
    "Return the subagent's final output.",
  ].join('\n');
}
