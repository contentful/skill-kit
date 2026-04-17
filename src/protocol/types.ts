import { z } from 'zod';

export const HistoryEntrySchema = z.object({
  step: z.string(),
  output: z.unknown(),
  action: z.unknown().optional(),
});

export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export const StartArgsSchema = z.object({
  context: z.string().transform((s) => JSON.parse(s) as unknown),
  host: z.string().optional(),
});

export const AdvanceArgsSchema = z.object({
  step: z.string(),
  output: z.string().transform((s) => JSON.parse(s) as unknown),
  history: z.string().transform((s) => z.array(HistoryEntrySchema).parse(JSON.parse(s))),
  host: z.string().optional(),
});
