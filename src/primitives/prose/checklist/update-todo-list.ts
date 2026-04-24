import type { ChecklistConfig } from '../../../types.js';

export function updateTodoListProse(config: ChecklistConfig): string {
  const taskList = config.create.map((t) => `- "${t.title}" (${t.status})`).join('\n');
  return [
    'CREATE_CHECKLIST: Use update_todo_list to register these items, then update status as each completes:',
    '',
    taskList,
  ].join('\n');
}
