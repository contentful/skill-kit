import type { Fragment } from './types.js';

export function fragment(name: string, content: string): Fragment {
  if (!name) throw new Error('fragment: name is required');
  return Object.freeze({ name, content: content.trim() });
}

export function prompt(strings: TemplateStringsArray, ...values: unknown[]): string {
  let raw = '';
  for (let i = 0; i < strings.length; i++) {
    raw += strings[i];
    if (i < values.length) {
      const val = values[i];
      if (val && typeof val === 'object' && 'name' in val && 'content' in val) {
        raw += (val as Fragment).content;
      } else {
        raw += String(val);
      }
    }
  }
  return dedent(raw);
}

function dedent(text: string): string {
  const lines = text.split('\n');

  // Drop leading/trailing empty lines
  while (lines.length > 0 && lines[0]!.trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop();

  if (lines.length === 0) return '';

  const indents = lines.filter((l) => l.trim().length > 0).map((l) => l.match(/^(\s*)/)![1]!.length);
  const minIndent = Math.min(...indents);

  if (minIndent > 0) {
    return lines.map((l) => l.slice(minIndent)).join('\n');
  }
  return lines.join('\n');
}
