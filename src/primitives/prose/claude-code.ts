import type { AskUserConfig, ConfirmConfig, PlanConfig, TasksConfig, SubtaskConfig } from '../../types.js';

export function askUserProse(config: AskUserConfig): string {
  const optionsList = config.options
    .map((o) => `"${o.label}" (value: ${o.value}${o.description ? `, ${o.description}` : ''})`)
    .join(', ');

  const selectMode = config.multiSelect ? 'one or more answers' : 'exactly one answer';

  return [
    `ASK_STRUCTURED: "${config.question}"`,
    `Options: ${optionsList}.`,
    `Expect ${selectMode}. Return the selected value(s) verbatim.`,
  ].join(' ');
}

export function confirmProse(config: ConfirmConfig): string {
  const lines = [`ASK_STRUCTURED: "${config.message}"`, 'Options: "Yes, proceed" / "No, cancel".'];
  if (config.destructive) {
    lines.push('This is a destructive operation — emphasize the consequences.');
  }
  lines.push(`Default to ${config.defaultAnswer ?? 'no'} on any ambiguity.`);
  return lines.join(' ');
}

export function planProse(config: PlanConfig): string {
  const stepsList = config.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return [`PRESENT_PLAN:`, '', `Summary: ${config.summary}`, '', stepsList].join('\n');
}

export function tasksProse(config: TasksConfig): string {
  const taskList = config.create.map((t) => `- "${t.title}" (${t.status})`).join('\n');
  return ['CREATE_TASKS:', '', taskList].join('\n');
}

export function subtaskProse(config: SubtaskConfig): string {
  return ['SPAWN_SUBTASK:', '', config.prompt].join('\n');
}
