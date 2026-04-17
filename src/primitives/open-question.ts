export interface OpenQuestionConfig {
  readonly kind: 'openQuestion';
  question: string;
}

export function openQuestion(input: { question: string }): OpenQuestionConfig {
  return Object.freeze({
    kind: 'openQuestion' as const,
    question: input.question,
  });
}
