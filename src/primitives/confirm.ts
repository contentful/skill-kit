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
