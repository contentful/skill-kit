import type { ReferenceDefinition } from '../types.js';

const DEFAULT_ALLOWED_TOOLS = ['Bash(scripts/run *)', 'Read'];

function computeReferenceAllowedTools(def: ReferenceDefinition): string[] {
  const author: string[] = [];
  if (def.allowedTools) {
    if (typeof def.allowedTools === 'string') {
      author.push(...def.allowedTools.split(' ').filter(Boolean));
    } else {
      author.push(...def.allowedTools);
    }
  }
  const mcp = [`mcp__${def.name}__topic`, `mcp__${def.name}__topics`];
  return [...new Set([...DEFAULT_ALLOWED_TOOLS, ...mcp, ...author])];
}

export function generateReferenceMd(def: ReferenceDefinition): string {
  const frontmatter = ['---', `name: ${def.name}`, `description: ${yamlDoubleQuoted(def.description)}`];

  if (def.version !== '0.0.0') {
    frontmatter.push(`metadata:`);
    frontmatter.push(`  version: "${def.version}"`);
  }

  if (def.argumentHint !== undefined) {
    frontmatter.push(`argument-hint: ${yamlDoubleQuoted(def.argumentHint)}`);
  }

  if (def.arguments !== undefined && !(Array.isArray(def.arguments) && def.arguments.length === 0)) {
    frontmatter.push(yamlInlineList('arguments', def.arguments));
  }

  frontmatter.push(yamlSpaceSeparated('allowed-tools', computeReferenceAllowedTools(def)));

  if (def.paths !== undefined && !(Array.isArray(def.paths) && def.paths.length === 0)) {
    frontmatter.push(yamlInlineList('paths', def.paths));
  }

  if (def.context !== undefined) {
    frontmatter.push(`context: ${yamlDoubleQuoted(def.context)}`);
  }

  if (def.license !== undefined) {
    frontmatter.push(`license: ${yamlDoubleQuoted(def.license)}`);
  }

  if (def.compatibility !== undefined) {
    frontmatter.push(`compatibility: ${yamlDoubleQuoted(def.compatibility)}`);
  }

  if (def.agent !== undefined) {
    frontmatter.push(`agent: ${yamlDoubleQuoted(def.agent)}`);
  }

  if (def.model !== undefined) {
    frontmatter.push(`model: ${yamlDoubleQuoted(def.model)}`);
  }

  if (def.effort !== undefined) {
    frontmatter.push(`effort: ${yamlDoubleQuoted(def.effort)}`);
  }

  if (def.disableModelInvocation !== undefined) {
    frontmatter.push(`disable-model-invocation: ${def.disableModelInvocation}`);
  }

  if (def.userInvocable !== undefined) {
    frontmatter.push(`user-invocable: ${def.userInvocable}`);
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

function yamlSpaceSeparated(key: string, value: string | string[]): string {
  const joined = Array.isArray(value) ? value.join(' ') : value;
  return `${key}: ${yamlDoubleQuoted(joined)}`;
}

function yamlInlineList(key: string, value: string | string[]): string {
  if (typeof value === 'string') {
    return `${key}: ${yamlDoubleQuoted(value)}`;
  }
  const items = value.map((v) => yamlDoubleQuoted(v)).join(', ');
  return `${key}: [${items}]`;
}
