import type { ReferenceDefinition } from '../types.js';

export function generateReferenceMd(def: ReferenceDefinition): string {
  const frontmatter = ['---', `name: ${def.name}`, `description: ${def.description}`];

  if (def.version !== '0.0.0') {
    frontmatter.push(`metadata:`);
    frontmatter.push(`  version: "${def.version}"`);
  }

  frontmatter.push('---');

  const topicList = Object.entries(def.topics)
    .map(([name, topic]) => `- \`scripts/run topic ${name}\` — ${topic.label}`)
    .join('\n');

  const body = `
# ${def.name}

This skill provides reference information on demand. Load any topic for details:

${topicList}

To list all available topics: \`scripts/run\`
`.trim();

  return frontmatter.join('\n') + '\n\n' + body + '\n';
}
