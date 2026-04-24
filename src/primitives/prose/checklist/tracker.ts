import type { ChecklistConfig } from '../../../types.js';

export function trackerProse(config: ChecklistConfig): string {
  const taskList = config.create.map((t) => `- "${t.title}" (${t.status})`).join('\n');
  return [
    'CREATE_CHECKLIST: Use tracker-create-task to register these tasks, then tracker-update-task as each completes:',
    '',
    taskList,
  ].join('\n');
}
