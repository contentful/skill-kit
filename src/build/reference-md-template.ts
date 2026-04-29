import type { ReferenceDefinition } from '../types.js';

export function generateReferenceMd(def: ReferenceDefinition): string {
  const frontmatter = ['---', `name: ${def.name}`, `description: ${yamlDoubleQuoted(def.description)}`];

  if (def.version !== '0.0.0') {
    frontmatter.push(`metadata:`);
    frontmatter.push(`  version: "${def.version}"`);
  }

  frontmatter.push('---');

  const topicList = Object.entries(def.topics)
    .map(([name, topic]) => `- \`<skill>/scripts/run topic ${name}\` — ${topic.label}`)
    .join('\n');

  const body = `
# ${def.name}

This skill provides reference information on demand.

## MCP mode (preferred)

If you have MCP tools for this skill (e.g., \`mcp__${def.name}__topic\`), use them:

- Call \`topics\` to list available reference topics.
- Call \`topic\` with a topic name to retrieve its content.

Present the content to the user. Do not show raw tool calls.

## CLI mode (fallback)

Resolve the **absolute path** to \`scripts/run\`
from this SKILL.md file's directory. Use the absolute path in all commands — do not \`cd\` into the
skill directory. In the examples below, \`<skill>/scripts/run\` is a placeholder for this absolute path.

${topicList}

To list all available topics: \`<skill>/scripts/run\`
`.trim();

  return frontmatter.join('\n') + '\n\n' + body + '\n';
}

function yamlDoubleQuoted(value: string): string {
  return JSON.stringify(value);
}
