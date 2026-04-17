import type { AskUserConfig, AskUserOption } from '../types.js';

export type AskUserInput =
  | { type: 'structured'; question: string; options: AskUserOption[]; multiSelect?: boolean }
  | { type: 'open'; question: string };

export function askUser(input: AskUserInput): AskUserConfig {
  if (input.type === 'open') {
    return Object.freeze({ kind: 'askUser' as const, type: 'open' as const, question: input.question });
  }
  return Object.freeze({
    kind: 'askUser' as const,
    type: 'structured' as const,
    question: input.question,
    options: input.options,
    multiSelect: input.multiSelect,
  });
}
