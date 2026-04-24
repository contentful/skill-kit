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

export function renderAskUser(config: AskUserConfig): string {
  if (config.type === 'open') {
    return `<ask-user type="open" question="${config.question}" />`;
  }
  const options = config.options
    .map((o) => `  <option value="${o.value}" label="${o.label}">${o.description ?? ''}</option>`)
    .join('\n');
  const multi = config.multiSelect ? ' multi-select="true"' : '';
  return `<ask-user type="structured" question="${config.question}"${multi}>\n${options}\n</ask-user>`;
}

export const askUserTools = [
  'AskUserQuestion',
  'ToolRequestUserInput',
  'ask_followup_question',
  'ask-user',
  'question',
];

export function askUserPreambleRow(tool: string | undefined): { tag: string; tool: string; instruction: string } {
  return {
    tag: '`<ask-user type="structured">`',
    tool: tool ?? '—',
    instruction: tool
      ? 'Present `<option>` children as choices via the tool. Return selected value(s) verbatim.'
      : 'Present `<option>` children as a numbered list. Accept only exact value matches.',
  };
}

export function askUserOpenPreambleRow(): { tag: string; tool: string; instruction: string } {
  return {
    tag: '`<ask-user type="open">`',
    tool: '—',
    instruction: 'Ask conversationally in plain text. No tool needed.',
  };
}
