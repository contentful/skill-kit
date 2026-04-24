import type { AskUserConfig } from '../../../types.js';

export function opencodeQuestionProse(config: AskUserConfig): string {
  if (config.type === 'open') {
    return `ASK_FREEFORM: "${config.question}"`;
  }

  const optionsList = config.options
    .map((o) => `"${o.label}" (value: ${o.value}${o.description ? `, ${o.description}` : ''})`)
    .join(', ');

  const selectMode = config.multiSelect ? 'one or more answers' : 'exactly one answer';

  return [
    `ASK_STRUCTURED: Use the question tool to ask the user: "${config.question}"`,
    `Provide these options: ${optionsList}.`,
    `Expect ${selectMode}. Return the selected value(s) verbatim.`,
  ].join(' ');
}
