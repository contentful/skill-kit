import { type, type Type } from 'arktype';

export class StashStore {
  private data: Record<string, unknown> = {};
  private readonly schema: Type | undefined;

  constructor(schema?: Type) {
    this.schema = schema;
  }

  merge(partial: Record<string, unknown>): void {
    const candidate = { ...this.data, ...partial };
    if (this.schema) {
      const result = this.schema(candidate);
      if (result instanceof type.errors) {
        const issues = result.map((i: { message: string }) => i.message).join('; ');
        process.stderr.write(`[skill-kit] stash validation warning: ${issues}\n`);
      }
    }
    this.data = candidate;
  }

  all(): Readonly<Record<string, unknown>> {
    return Object.freeze({ ...this.data });
  }
}
