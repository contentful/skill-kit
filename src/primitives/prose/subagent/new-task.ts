import type { SubagentConfig } from '../../../types.js';

export function newTaskProse(config: SubagentConfig): string {
  return [
    'SPAWN_SUBAGENT: Use new_task to create a new task for this work:',
    '',
    config.prompt,
    '',
    "Return the task's final output.",
  ].join('\n');
}
