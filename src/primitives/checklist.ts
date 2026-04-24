import type { ChecklistConfig } from '../types.js';

export interface ChecklistInput {
  create: Array<{ title: string; status: string }>;
}

export function checklist(input: ChecklistInput): ChecklistConfig {
  return Object.freeze({
    kind: 'checklist' as const,
    create: input.create,
  });
}

export function renderChecklist(config: ChecklistConfig): string {
  const items = config.create.map((t) => `  <item status="${t.status}">${t.title}</item>`).join('\n');
  return `<checklist>\n${items}\n</checklist>`;
}

export const checklistTools = ['TaskCreate', 'tracker-create-task', 'write-todos', 'todo', 'update_todo_list'];

export function checklistPreambleRow(tool: string | undefined): { tag: string; tool: string; instruction: string } {
  return {
    tag: '`<checklist>`',
    tool: tool ?? '—',
    instruction: tool
      ? 'Register `<item>` children via the tool. Update status as each completes.'
      : 'Maintain visible checklist. Update status as items complete.',
  };
}
