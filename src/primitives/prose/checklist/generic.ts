import type { ChecklistConfig } from '../../../types.js';

export function genericChecklistProse(config: ChecklistConfig): string {
  const taskList = config.create.map((t) => `- "${t.title}" (${t.status})`).join('\n');
  return [
    'CREATE_CHECKLIST: Maintain this checklist in the visible output, updating status as each item completes:',
    '',
    taskList,
  ].join('\n');
}
