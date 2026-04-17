import type { z } from 'zod';

export interface ValidationResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export function validateOutput(schema: z.ZodType, raw: unknown): ValidationResult {
  const result = schema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const messages = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    return `${path}${issue.message}`;
  });

  return { success: false, error: messages.join('; ') };
}
