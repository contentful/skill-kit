import type { Handshake } from '../types.js';
import { resolveTools, preambleRows } from '../primitives/registry.js';

export function generatePreamble(handshake: Handshake): string {
  const resolved = resolveTools(handshake);
  const rows = preambleRows(resolved);

  const header = [
    'You are following a structured workflow driven by a skill CLI.',
    'Each step provides a prompt and a JSON schema for the expected output.',
    'Follow the prompt instructions precisely and return output matching the schema.',
    '',
    'Step prompts use XML tags. Follow sections in the order they appear.',
    '',
    '| Tag | Tool | How to use |',
    '|-----|------|-----------|',
  ];

  const tableRows = rows.map((r) => `| ${r.tag} | ${r.tool} | ${r.instruction} |`);

  return [...header, ...tableRows].join('\n');
}
