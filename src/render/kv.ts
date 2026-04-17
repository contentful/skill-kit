export function kv(pairs: Record<string, string | number | boolean>): string {
  const entries = Object.entries(pairs);
  if (entries.length === 0) return '';

  const maxKeyLen = Math.max(...entries.map(([k]) => k.length));

  return entries.map(([k, v]) => `${k.padEnd(maxKeyLen)}  ${v}`).join('\n');
}
