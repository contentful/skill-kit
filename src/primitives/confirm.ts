import type { ConfirmConfig } from '../types.js';
import { definePrimitive } from './primitive.js';

export interface ConfirmInput {
  message: string;
  destructive?: boolean;
  defaultAnswer?: 'yes' | 'no';
}

export const confirmPrimitive = definePrimitive({
  tag: 'confirm',

  tools: ['AskUserQuestion', 'ask_followup_question'] as const,

  create(input: ConfirmInput): ConfirmConfig {
    return Object.freeze({
      kind: 'confirm' as const,
      message: input.message,
      destructive: input.destructive,
      defaultAnswer: input.defaultAnswer,
    });
  },

  render(config) {
    const attrs = [`default="${config.defaultAnswer ?? 'no'}"`, config.destructive ? 'destructive="true"' : '']
      .filter(Boolean)
      .join(' ');
    return `<confirm ${attrs}>${config.message}</confirm>`;
  },

  preambleRow(tool) {
    return {
      tag: '`<confirm>`',
      tool: tool ?? '—',
      instruction: tool
        ? 'Yes/no via the tool. Respect `default` attribute. If `destructive`, emphasize consequences.'
        : 'Ask "Yes, proceed" / "No, cancel". Default per attribute.',
    };
  },
});

export const confirm = confirmPrimitive.create;
