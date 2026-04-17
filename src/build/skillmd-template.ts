import type { SkillDefinition } from '../types.js';

export function generateSkillMd(skill: SkillDefinition): string {
  const frontmatter = [
    '---',
    `name: ${skill.name}`,
    `description: ${skill.description || `${skill.name} skill powered by @contentful/skill-kit.`}`,
  ];

  if (skill.version !== '0.0.0') {
    frontmatter.push(`metadata:`);
    frontmatter.push(`  version: "${skill.version}"`);
  }

  frontmatter.push('---');

  const stepDescriptions = Object.entries(skill.steps)
    .map(([name, stepDef]) => {
      const prompt = typeof stepDef.config.prompt === 'string' ? stepDef.config.prompt : '(dynamic)';
      const truncated = prompt.length > 100 ? prompt.slice(0, 97) + '...' : prompt;
      return `- **${name}**: ${truncated}`;
    })
    .join('\n');

  const body = `
# ${skill.name}

This skill is driven by a compiled CLI binary. Follow the invocation pattern below.

## Invocation

### Start the workflow

\`\`\`bash
<skill-dir>/scripts/run start --context '{}'
\`\`\`

Parse the JSON output. It contains:
- \`step\`: the current step name
- \`prompt\`: instructions to follow
- \`schema\`: JSON Schema for the expected output

### Follow the prompt

Read the \`prompt\` field and perform the described task. Produce output matching the \`schema\`.

### Advance to the next step

\`\`\`bash
<skill-dir>/scripts/run advance --step <step-name> --output '<your-json-output>' --history '<history-array>'
\`\`\`

The \`--history\` flag must contain the full array of prior step results. Each time you receive
a response with a \`completed\` field, append it to the history array for the next call.

### Repeat until done

Continue the start → advance loop until the response contains \`"done": true\`.
The \`finalOutput\` field contains the skill's result.

## Steps

${stepDescriptions}
`.trim();

  return frontmatter.join('\n') + '\n\n' + body + '\n';
}
