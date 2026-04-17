import type { AskUserConfig, ConfirmConfig, PlanConfig, TasksConfig, SubtaskConfig } from '../../types.js';

export function askUserProse(config: AskUserConfig): string {
  const optionsList = config.options
    .map((o) => `"${o.label}" (value: ${o.value}${o.description ? `, ${o.description}` : ''})`)
    .join(', ');

  const selectMode = config.multiSelect ? 'one or more answers' : 'exactly one answer';

  return [
    `Use the AskUserQuestion tool to ask the user: "${config.question}"`,
    `Provide these options, unchanged, as the tool's option list: ${optionsList}.`,
    `Do not modify option text. Do not add options. Expect ${selectMode}.`,
    'Return the selected value(s) verbatim.',
  ].join(' ');
}

export function confirmProse(config: ConfirmConfig): string {
  const lines = [
    `Use the AskUserQuestion tool to confirm: "${config.message}"`,
    'Options: "Yes, proceed" / "No, cancel".',
  ];
  if (config.destructive) {
    lines.push('This is a destructive operation — emphasize the consequences.');
  }
  lines.push(`Default to ${config.defaultAnswer ?? 'no'} on any ambiguity.`);
  return lines.join(' ');
}

export function planProse(config: PlanConfig): string {
  const stepsList = config.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  return [
    `Use the EnterPlanMode tool with this plan:`,
    '',
    `Summary: ${config.summary}`,
    '',
    stepsList,
    '',
    'Wait for the user to approve via ExitPlanMode before proceeding.',
  ].join('\n');
}

export function tasksProse(config: TasksConfig): string {
  const taskList = config.create.map((t) => `- "${t.title}" (${t.status})`).join('\n');
  return [
    'Use TaskCreate to register these tasks:',
    '',
    taskList,
    '',
    'Use TaskUpdate to update status as each completes.',
  ].join('\n');
}

export function subtaskProse(config: SubtaskConfig): string {
  return [
    `Use the Agent tool to spawn a subagent with this prompt:`,
    '',
    config.prompt,
    '',
    'Return its final output matching the expected schema.',
  ].join('\n');
}
