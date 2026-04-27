import type { ViewSegment } from './types.js';

export function view(content: string | string[]): ViewSegment;
export function view(label: string, content: string | string[]): ViewSegment;
export function view(labelOrContent: string | string[], maybeContent?: string | string[]): ViewSegment {
  const hasLabel = maybeContent !== undefined;
  const label = hasLabel ? (labelOrContent as string) : undefined;
  const raw = hasLabel ? maybeContent! : labelOrContent;
  const text = Array.isArray(raw) ? raw.join('\n\n') : raw;
  return Object.freeze({ kind: 'view' as const, label, text });
}
