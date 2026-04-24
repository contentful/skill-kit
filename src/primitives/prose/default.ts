import type { AskUserConfig, ConfirmConfig, PlanConfig, ChecklistConfig, SubagentConfig } from '../../types.js';

export function askUserProse(config: AskUserConfig): string {
  if (config.type === 'open') {
    return `ASK_FREEFORM: "${config.question}"`;
  }

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

export function checklistProse(config: ChecklistConfig): string {
  const taskList = config.create.map((t) => `- "${t.title}" (${t.status})`).join('\n');
  return ['CREATE_CHECKLIST:', '', taskList].join('\n');
}

export function subagentProse(config: SubagentConfig): string {
  return ['SPAWN_SUBAGENT:', '', config.prompt].join('\n');
}
