import type { SurveyConfig, SurveyQuestion, AskUserOption } from '../types.js';
import { definePrimitive } from './primitive.js';

const MAX_QUESTIONS_PER_BLOCK = 4;
const MAX_HEADER_LENGTH = 12;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;

const BATCH_TOOLS = ['AskUserQuestion', 'ToolRequestUserInput', 'question', 'ask-user'];

export const surveyPrimitive = definePrimitive({
  tag: 'survey',

  tools: ['AskUserQuestion', 'ToolRequestUserInput', 'question', 'ask-user', 'ask_followup_question'] as const,

  create(input: { questions: SurveyQuestion[] }): SurveyConfig {
    if (input.questions.length < 1) {
      throw new Error('survey: must have at least 1 question');
    }
    for (const q of input.questions) {
      if (q.header && q.header.length > MAX_HEADER_LENGTH) {
        throw new Error(`survey: header must be ≤${MAX_HEADER_LENGTH} characters, got ${q.header.length}`);
      }
      if (q.options.length < MIN_OPTIONS || q.options.length > MAX_OPTIONS) {
        throw new Error(
          `survey: each question must have ${MIN_OPTIONS}–${MAX_OPTIONS} options, got ${q.options.length}`,
        );
      }
    }
    return Object.freeze({
      kind: 'survey' as const,
      questions: input.questions,
    });
  },

  render(config) {
    const blocks: string[] = [];
    for (let i = 0; i < config.questions.length; i += MAX_QUESTIONS_PER_BLOCK) {
      const chunk = config.questions.slice(i, i + MAX_QUESTIONS_PER_BLOCK);
      const inner = chunk.map((q) => renderQuestion(q)).join('\n');
      blocks.push(`<survey>\n${inner}\n</survey>`);
    }
    return blocks.join('\n\n');
  },

  preambleRow(tool) {
    if (tool && BATCH_TOOLS.includes(tool)) {
      return {
        tag: '`<survey>`',
        tool,
        instruction:
          'Batch all `<question>` children into a single tool call. ' +
          'Each `<question>` maps to one entry in the `questions` array. ' +
          'Map `header`, `options`, and `multiSelect` attributes to the corresponding parameters. ' +
          'Map `<preview>` child elements to option preview fields. ' +
          'Return each answer keyed by question text.',
      };
    }
    if (tool) {
      return {
        tag: '`<survey>`',
        tool,
        instruction:
          'Ask each `<question>` sequentially using the tool. ' +
          'If options have `<preview>` content, present it alongside each option. ' +
          'Collect all answers before proceeding.',
      };
    }
    return {
      tag: '`<survey>`',
      tool: '—',
      instruction:
        'Present each `<question>` sequentially as a numbered-choice prompt. ' +
        'If options have `<preview>` content, display it alongside each option. ' +
        'Collect all answers before proceeding.',
    };
  },
});

function renderOption(o: AskUserOption): string {
  const desc = o.description ?? '';
  if (o.preview) {
    return `    <option value="${o.value}" label="${o.label}">${desc}\n      <preview>${o.preview}</preview>\n    </option>`;
  }
  return `    <option value="${o.value}" label="${o.label}">${desc}</option>`;
}

function renderQuestion(q: SurveyQuestion): string {
  const header = q.header ? ` header="${q.header}"` : '';
  const multi = q.multiSelect ? ' multi-select="true"' : '';
  const opts = q.options.map((o) => renderOption(o)).join('\n');
  return `  <question${header} text="${q.question}"${multi}>\n${opts}\n  </question>`;
}

export const survey = surveyPrimitive.create;
