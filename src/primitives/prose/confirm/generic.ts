import type { ConfirmConfig } from '../../../types.js';

export function genericConfirmProse(config: ConfirmConfig): string {
  const lines = [`ASK_STRUCTURED: "${config.message}"`, 'Options: "Yes, proceed" / "No, cancel".'];
  if (config.destructive) {
    lines.push('This is a destructive operation — emphasize the consequences.');
  }
  lines.push(`Default to ${config.defaultAnswer ?? 'no'} on any ambiguity.`);
  return lines.join(' ');
}
