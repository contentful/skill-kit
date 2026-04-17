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
    lines.push('This is a destructive operation.');
  }
  return lines.join(' ');
}

export function planProse(config: PlanConfig): string {
  const stepsList = config.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return [
    `Present this plan as a checklist using todowrite:`,
    '',
    `Summary: ${config.summary}`,
    '',
    stepsList,
    '',
    'Then ask explicitly whether to proceed or revise.',
  ].join('\n');
}

export function tasksProse(config: TasksConfig): string {
  const taskList = config.create.map((t) => `- "${t.title}" (${t.status})`).join('\n');
  return ['Use todowrite to register these todos:', '', taskList, '', 'Update status as each completes.'].join('\n');
}

export function subtaskProse(config: SubtaskConfig): string {
  return [`Use the task tool to spawn a subagent for:`, '', config.prompt, '', 'Return its final output.'].join('\n');
}
