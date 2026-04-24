import type { AskUserConfig } from '../../../types.js';

export function genericAskUserProse(config: AskUserConfig): string {
  if (config.type === 'open') {
    return `ASK_FREEFORM: "${config.question}"`;
  }

  const optionsList = config.options
    .map((o) => `"${o.label}" (value: ${o.value}${o.description ? `, ${o.description}` : ''})`)
    .join(', ');

  const selectMode = config.multiSelect ? 'one or more answers' : 'exactly one answer';

  return [
    `ASK_STRUCTURED: "${config.question}"`,
    `Present these options as a numbered list and no others: ${optionsList}.`,
    `Accept only ${selectMode} matching one of those exact values.`,
    'If the response is ambiguous or does not match, ask again with the same options.',
  ].join(' ');
}
