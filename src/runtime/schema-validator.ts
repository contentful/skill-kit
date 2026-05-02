import { type, type Type } from 'arktype';

export interface ValidationResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export function validateOutput(schema: Type, raw: unknown): ValidationResult {
  const result = schema(raw);
  if (result instanceof type.errors) {
    const messages = result.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
      return `${path}${issue.message}`;
    });
    return { success: false, error: messages.join('; ') };
  }

  return { success: true, data: result };
}
