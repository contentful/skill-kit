import type { AskUserConfig } from '../../../types.js';

export function askFollowupQuestionProse(config: AskUserConfig): string {
  if (config.type === 'open') {
    return `ASK_FREEFORM: "${config.question}"`;
  }

  const maxOptions = 4;
  const truncated = config.options.slice(0, maxOptions);
  const optionsList = truncated
    .map((o) => `"${o.label}" (value: ${o.value}${o.description ? `, ${o.description}` : ''})`)
    .join(', ');

  const selectMode = config.multiSelect ? 'one or more answers' : 'exactly one answer';

  return [
    `ASK_STRUCTURED: Use ask_followup_question to ask the user: "${config.question}"`,
    `Provide up to 4 suggested responses: ${optionsList}.`,
    `Expect ${selectMode}. Return the selected value(s) verbatim.`,
  ].join(' ');
}
