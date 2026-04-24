import type { SystemSegment, SystemBuilder } from './types.js';
import { resolveTemplate } from './fragment.js';

function createSystem(stringsOrText: TemplateStringsArray | string, ...values: unknown[]): SystemSegment {
  const text = typeof stringsOrText === 'string' ? stringsOrText : resolveTemplate(stringsOrText, values);
  return Object.freeze({ kind: 'system' as const, text });
}

export const system: SystemBuilder = createSystem as SystemBuilder;
