import type { AskUserConfig, ConfirmConfig, PlanConfig, TasksConfig, SubtaskConfig } from '../../types.js';

export function askUserProse(config: AskUserConfig): string {
  const optionsList = config.options.map((o) => o.label).join(', ');
  const selectMode = config.multiSelect ? 'Accept one or more answers' : 'Accept only a single answer';

  return [
    `Ask the user: "${config.question}"`,
    `Present these options and no others: ${optionsList}.`,
    `${selectMode} matching one of those exact labels.`,
    "If the user's response is ambiguous or doesn't match, ask again with the same options.",
  ].join(' ');
}

export function confirmProse(config: ConfirmConfig): string {
  const lines = [`Confirm with the user: "${config.message}"`];
  lines.push('Accept only a clear yes or clear no.');
  lines.push(`Default to ${config.defaultAnswer ?? 'no'} on any ambiguity.`);
  if (config.destructive) {
    lines.push('This is a destructive operation — proceed with caution.');
  }
  return lines.join(' ');
}

export function planProse(config: PlanConfig): string {
  const stepsList = config.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return [
    `Present this plan to the user as a numbered list:`,
    '',
    `Summary: ${config.summary}`,
    '',
    stepsList,
    '',
    'Ask whether to proceed or revise before continuing.',
  ].join('\n');
}

export function tasksProse(config: TasksConfig): string {
  const taskList = config.create.map((t) => `- "${t.title}" (${t.status})`).join('\n');
  return [
    'Maintain this checklist in the visible output, updating status as each item completes:',
    '',
    taskList,
  ].join('\n');
}

export function subtaskProse(config: SubtaskConfig): string {
  return [
    'Focus on this subtask and return a structured summary:',
    '',
    config.prompt,
    '',
    'Then return to the main workflow.',
  ].join('\n');
}
