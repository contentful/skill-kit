import type { z } from 'zod';

export class StashStore {
  private data: Record<string, unknown> = {};
  private readonly schema: z.ZodType | undefined;

  constructor(schema?: z.ZodType) {
    this.schema = schema;
  }

  merge(partial: Record<string, unknown>): void {
    const candidate = { ...this.data, ...partial };
    if (this.schema) {
      const result = this.schema.safeParse(candidate);
      if (!result.success) {
        const issues = result.error.issues.map((i: { message: string }) => i.message).join('; ');
        process.stderr.write(`[skill-kit] stash validation warning: ${issues}\n`);
      }
    }
    this.data = candidate;
  }

  all(): Readonly<Record<string, unknown>> {
    return Object.freeze({ ...this.data });
  }
}
