import type { TasksConfig } from '../types.js';

export interface TasksInput {
  create: Array<{ title: string; status: string }>;
}

export function tasks(input: TasksInput): TasksConfig {
  return Object.freeze({
    kind: 'tasks' as const,
    create: input.create,
  });
}
