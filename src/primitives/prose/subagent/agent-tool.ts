import type { SubagentConfig } from '../../../types.js';

export function agentToolProse(config: SubagentConfig): string {
  return [
    'SPAWN_SUBAGENT: Use the Agent tool to spawn a subagent with this prompt:',
    '',
    config.prompt,
    '',
    "Return the subagent's final output.",
  ].join('\n');
}
