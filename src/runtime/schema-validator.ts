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

export function validateSave(
  storeSchemas: Readonly<Record<string, type.Any>>,
  saveData: Record<string, unknown>,
): ValidationResult {
  for (const [storeName, value] of Object.entries(saveData)) {
    if (value === undefined) continue;
    const schema = storeSchemas[storeName];
    if (!schema) {
      return { success: false, error: `save wrote to undeclared store "${storeName}"` };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const partialSchema = (schema as any).partial() as Type;
    const result = partialSchema(value);
    if (result instanceof type.errors) {
      const messages = result.map((issue) => {
        const prefix = issue.path.length > 0 ? `${storeName}.${issue.path.join('.')}: ` : `${storeName}: `;
        return `${prefix}${issue.message}`;
      });
      return { success: false, error: messages.join('; ') };
    }
  }
  return { success: true };
}
