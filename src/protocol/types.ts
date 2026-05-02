import { type } from 'arktype';

export const HistoryEntrySchema = type({
  step: 'string',
  response: 'unknown',
  'actionResult?': 'unknown',
});

export type HistoryEntry = typeof HistoryEntrySchema.infer;

export const StartArgsSchema = type({
  params: type('string').pipe((s) => JSON.parse(s) as unknown),
  'host?': 'string',
});

export const AdvanceArgsSchema = type({
  step: 'string',
  output: type('string').pipe((s) => JSON.parse(s) as unknown),
  history: type('string').pipe((s) => {
    const arr = JSON.parse(s) as unknown[];
    return arr.map((entry) => {
      const result = HistoryEntrySchema(entry);
      if (result instanceof type.errors) throw result;
      return result;
    });
  }),
  'host?': 'string',
});
