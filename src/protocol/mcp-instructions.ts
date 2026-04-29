import type { SkillDefinition } from '../types.js';
import type { McpSessionManager } from './mcp-session.js';

export function generateMcpInstructions(skill: SkillDefinition, _sessions: McpSessionManager): string {
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
