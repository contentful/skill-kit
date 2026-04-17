import type { AskUserConfig, AskUserOption } from '../types.js';

export interface AskUserInput {
  question: string;
  options: AskUserOption[];
  multiSelect?: boolean;
}

export function askUser(input: AskUserInput): AskUserConfig {
  return Object.freeze({
    kind: 'askUser' as const,
    question: input.question,
    options: input.options,
    multiSelect: input.multiSelect,
  });
}
