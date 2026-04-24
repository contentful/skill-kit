import type { ChecklistConfig } from '../../../types.js';

export function taskCreateProse(config: ChecklistConfig): string {
  const taskList = config.create.map((t) => `- "${t.title}" (${t.status})`).join('\n');
  return [
    'CREATE_CHECKLIST: Use TaskCreate to register these tasks, then use TaskUpdate as each completes:',
    '',
    taskList,
  ].join('\n');
}
