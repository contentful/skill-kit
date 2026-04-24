import type { ConfirmConfig } from '../types.js';

export interface ConfirmInput {
  message: string;
  destructive?: boolean;
  defaultAnswer?: 'yes' | 'no';
}

export function confirm(input: ConfirmInput): ConfirmConfig {
  return Object.freeze({
    kind: 'confirm' as const,
    message: input.message,
    destructive: input.destructive,
    defaultAnswer: input.defaultAnswer,
  });
}

export function renderConfirm(config: ConfirmConfig): string {
  const attrs = [`default="${config.defaultAnswer ?? 'no'}"`, config.destructive ? 'destructive="true"' : '']
    .filter(Boolean)
    .join(' ');
  return `<confirm ${attrs}>${config.message}</confirm>`;
}

export const confirmTools = ['AskUserQuestion', 'ask_followup_question'];

export function confirmPreambleRow(tool: string | undefined): { tag: string; tool: string; instruction: string } {
  return {
    tag: '`<confirm>`',
    tool: tool ?? '—',
    instruction: tool
      ? 'Yes/no via the tool. Respect `default` attribute. If `destructive`, emphasize consequences.'
      : 'Ask "Yes, proceed" / "No, cancel". Default per attribute.',
  };
}
