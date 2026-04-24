import type { SubagentConfig } from '../../../types.js';

export function collabAgentProse(config: SubagentConfig): string {
  return [
    'SPAWN_SUBAGENT: Use the CollabAgent tool to spawn an agent for this task:',
    '',
    config.prompt,
    '',
    'Wait for the agent to complete, then return its final output.',
  ].join('\n');
}
