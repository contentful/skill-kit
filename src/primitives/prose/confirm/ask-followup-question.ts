import type { ConfirmConfig } from '../../../types.js';

export function askFollowupConfirmProse(config: ConfirmConfig): string {
  const lines = [
    `ASK_STRUCTURED: Use ask_followup_question to confirm: "${config.message}"`,
    'Provide two suggested responses: "Yes, proceed" and "No, cancel".',
  ];
  if (config.destructive) {
    lines.push('This is a destructive operation — emphasize the consequences.');
  }
  lines.push(`Default to ${config.defaultAnswer ?? 'no'} on any ambiguity.`);
  return lines.join(' ');
}
