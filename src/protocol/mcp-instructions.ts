import type { SkillDefinition } from '../types.js';

export function generateMcpInstructions(skill: SkillDefinition): string {
  const steps = Object.entries(skill.steps)
    .map(([name, stepDef]) => {
      const prompt = typeof stepDef.config.prompt === 'string' ? stepDef.config.prompt : '(dynamic)';
      const truncated = prompt.length > 80 ? prompt.slice(0, 77) + '...' : prompt;
      return `  - ${name}: ${truncated}`;
    })
    .join('\n');

  return `This MCP server runs the "${skill.name}" skill — a structured workflow.

How to use:
1. Call the "start" tool to begin a new session. It returns a JSON object with session ID, the first step prompt, its JSON schema, and a preamble.
2. Read the preamble (first call only). It maps XML tags in prompts to your available tools.
3. Follow the prompt instructions. Produce a JSON object matching the schema.
4. Call the "advance" tool with session, step, and output.
5. Repeat steps 3-4 until status is "done".

If you get status "error" with retry: true, fix your output and resubmit the same step.
Do not show raw JSON, session IDs, or tool calls to the user.

Steps in this workflow:
${steps}`;
}

export function generateMcpCompositeInstructions(skill: SkillDefinition): string {
  const subskills = skill.subskills ? Object.keys(skill.subskills) : [];
  const topics = skill.topics ? Object.keys(skill.topics) : [];

  const lines = [
    `This MCP server runs the "${skill.name}" composite skill.`,
    '',
    'How to use:',
    '1. Call "start" to begin a new session. Pass "subskill" to go directly to a sub-skill, or omit to use the dispatcher.',
    '2. Read the preamble (first call only). It maps XML tags to your available tools.',
    '3. Follow the prompt instructions. Produce JSON matching the schema.',
    '4. Call "advance" with session, step, and output.',
    '5. Repeat until status is "done".',
    '',
    'Sub-skill step names are prefixed (e.g., "doctor/diagnose").',
    'Do not show raw JSON, session IDs, or tool calls to the user.',
  ];

  if (subskills.length > 0) {
    lines.push('', `Available sub-skills: ${subskills.join(', ')}`);
  }
  if (topics.length > 0) {
    lines.push('', `Reference topics (use "topic" tool): ${topics.join(', ')}`);
  }

  return lines.join('\n');
}
