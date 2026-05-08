import type { AskUserConfig, AskUserOption } from '../types.js';
import { definePrimitive } from './primitive.js';

const MAX_HEADER_LENGTH = 12;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;

export type AskUserInput =
  | { type: 'structured'; question: string; header?: string; options: AskUserOption[]; multiSelect?: boolean }
  | { type: 'open'; question: string };

export const askUserPrimitive = definePrimitive({
  tag: 'ask-user',

  tools: [
    'AskUserQuestion',
    'request_user_input',
    'ToolRequestUserInput',
    'ask_followup_question',
    'ask-user',
    'question',
  ] as const,

  create(input: AskUserInput): AskUserConfig {
    if (input.type === 'open') {
      return Object.freeze({ kind: 'askUser' as const, type: 'open' as const, question: input.question });
    }
    if (input.header && input.header.length > MAX_HEADER_LENGTH) {
      throw new Error(`askUser: header must be ≤${MAX_HEADER_LENGTH} characters, got ${input.header.length}`);
    }
    if (input.options.length < MIN_OPTIONS || input.options.length > MAX_OPTIONS) {
      throw new Error(`askUser: options must have ${MIN_OPTIONS}–${MAX_OPTIONS} items, got ${input.options.length}`);
    }
    return Object.freeze({
      kind: 'askUser' as const,
      type: 'structured' as const,
      question: input.question,
      header: input.header,
      options: input.options,
      multiSelect: input.multiSelect,
    });
  },

  render(config) {
    if (config.type === 'open') {
      return `<ask-user type="open" question="${config.question}" />`;
    }
    const options = config.options.map((o) => renderOption(o)).join('\n');
    const header = config.header ? ` header="${config.header}"` : '';
    const multi = config.multiSelect ? ' multi-select="true"' : '';
    return `<ask-user type="structured"${header} question="${config.question}"${multi}>\n${options}\n</ask-user>`;
  },

  preambleRow(tool) {
    return {
      tag: '`<ask-user>`',
      tool: tool ?? '—',
      instruction: tool
        ? '**type="open": no tool — ask in plain text.** type="structured": present `<option>` children as choices via the tool. Map `header` to question header, `<preview>` to preview fields. Return selected value(s) as step output.'
        : '**type="open": ask in plain text.** type="structured": present `<option>` children as numbered list. If options have `<preview>` content, display it alongside each option. Accept only exact value matches.',
    };
  },
});

function renderOption(o: AskUserOption): string {
  const desc = o.description ?? '';
  if (o.preview) {
    return `  <option value="${o.value}" label="${o.label}">${desc}\n    <preview>${o.preview}</preview>\n  </option>`;
  }
  return `  <option value="${o.value}" label="${o.label}">${desc}</option>`;
}

export const askUser = askUserPrimitive.create;
