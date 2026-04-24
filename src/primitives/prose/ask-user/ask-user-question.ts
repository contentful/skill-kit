import type { AskUserConfig } from '../../../types.js';

export function askUserQuestionProse(config: AskUserConfig): string {
  if (config.type === 'open') {
    return `ASK_FREEFORM: "${config.question}"`;
  }

  const optionsList = config.options
    .map((o) => `"${o.label}" (value: ${o.value}${o.description ? `, ${o.description}` : ''})`)
    .join(', ');

  const selectMode = config.multiSelect ? 'one or more answers' : 'exactly one answer';

  return [
    `ASK_STRUCTURED: Use the AskUserQuestion tool to ask the user: "${config.question}"`,
    `Provide these options, unchanged, as the tool's option list: ${optionsList}.`,
    `Do not modify or add options. Expect ${selectMode}. Return the selected value(s) verbatim.`,
  ].join(' ');
}
