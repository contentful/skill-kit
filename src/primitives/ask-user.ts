import type { AskUserConfig, AskUserOption } from '../types.js';
import { definePrimitive } from './primitive.js';

export type AskUserInput =
  | { type: 'structured'; question: string; options: AskUserOption[]; multiSelect?: boolean }
  | { type: 'open'; question: string };

export const askUserPrimitive = definePrimitive({
  tag: 'ask-user',

  tools: ['AskUserQuestion', 'ToolRequestUserInput', 'ask_followup_question', 'ask-user', 'question'] as const,

  create(input: AskUserInput): AskUserConfig {
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
  },

  render(config) {
    if (config.type === 'open') {
      return `<ask-user type="open" question="${config.question}" />`;
    }
    const options = config.options
      .map((o) => `  <option value="${o.value}" label="${o.label}">${o.description ?? ''}</option>`)
      .join('\n');
    const multi = config.multiSelect ? ' multi-select="true"' : '';
    return `<ask-user type="structured" question="${config.question}"${multi}>\n${options}\n</ask-user>`;
  },

  preambleRow(tool) {
    return {
      tag: '`<ask-user>`',
      tool: tool ?? '—',
      instruction: tool
        ? 'Present `<option>` children as choices via the tool. For type="open", ask conversationally. Return selected value(s) verbatim.'
        : 'For type="structured", present `<option>` children as numbered list. Accept only exact value matches. For type="open", ask conversationally.',
    };
  },
});

export const askUser = askUserPrimitive.create;
