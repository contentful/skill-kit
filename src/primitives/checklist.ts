import type { ChecklistConfig } from '../types.js';
import { definePrimitive } from './primitive.js';

const UPDATE_TOOLS: Record<string, string> = {
  TaskCreate: 'TaskUpdate',
  'tracker-create-task': 'tracker-update-task',
};

export interface ChecklistInput {
  create: Array<{ title: string; status: string }>;
}

export const checklistPrimitive = definePrimitive({
  tag: 'checklist',

  tools: ['TaskCreate', 'tracker-create-task', 'write-todos', 'todo', 'update_todo_list'] as const,

  create(input: ChecklistInput): ChecklistConfig {
    return Object.freeze({
      kind: 'checklist' as const,
      create: input.create,
    });
  },

  render(config) {
    const items = config.create.map((t) => `  <item status="${t.status}">${t.title}</item>`).join('\n');
    return `<checklist>\n${items}\n</checklist>`;
  },

  preambleRow(tool) {
    if (tool && tool in UPDATE_TOOLS) {
      return {
        tag: '`<checklist>`',
        tool,
        instruction: `Create \`<item>\` children via ${tool}. Mark done via ${UPDATE_TOOLS[tool]} as each completes.`,
      };
    }
    return {
      tag: '`<checklist>`',
      tool: tool ?? '—',
      instruction: tool
        ? 'Register `<item>` children via the tool. Re-invoke to update status as each completes.'
        : 'Maintain visible checklist. Update status as items complete.',
    };
  },
});

export const checklist = checklistPrimitive.create;
