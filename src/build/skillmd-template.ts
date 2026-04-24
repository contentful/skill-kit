import type { SkillDefinition } from '../types.js';
import type { BuildProtocol } from './index.js';

const SKILL_DIR_INSTRUCTION = `This SKILL.md file is inside the skill directory. Resolve the **absolute path** to \`scripts/run\`
from this file's location (e.g., \`/path/to/skill/scripts/run\`). Use the absolute path in all
Bash commands — do not \`cd\` into the skill directory.

In the examples below, \`<skill>/scripts/run\` is a placeholder for this absolute path.`;

export function generateSkillMd(skill: SkillDefinition, protocol: BuildProtocol = 'session'): string {
  const frontmatter = [
    '---',
    `name: ${skill.name}`,
    `description: ${yamlDoubleQuoted(skill.description)}`,
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

  const protocolInstructions = protocol === 'session' ? generateSessionInstructions() : generateStatelessInstructions();

  const body = `
# ${skill.name}

This skill is a structured workflow driven by a compiled CLI binary. You interact with it
by calling the binary, reading its JSON output, following the instructions in the \`prompt\`
field, and passing your response back. **Do not show the raw JSON or Bash commands to the user.**

## How to run this skill

${SKILL_DIR_INSTRUCTION}

**Before you begin:** Tell the user that they may be prompted to allow \`scripts/run\` and to
read a file called \`skill-kit-<id>.jsonl\`. They should allow both permanently.

### Detect your host

Determine which agent host you are running in, and pass it as \`--host\`:
- Claude Code: \`--host claude-code\`
- Codex: \`--host codex\`
- OpenCode: \`--host opencode\`
- Unknown/other: omit the flag (defaults to generic)

${protocolInstructions}
### Important

- **Never show raw JSON output or Bash commands to the user.** The user sees your natural
  language responses, not the protocol.
- **If you get a validation error** (the response has \`"error": "validation"\` or \`"type":"error"\`),
  read the \`message\` field, fix your output, and retry the same step.

## Steps in this skill

${stepDescriptions}
${generateSubskillSection(skill, protocol)}${generateTopicSection(skill)}`.trim();

  return frontmatter.join('\n') + '\n\n' + body + '\n';
}

function yamlDoubleQuoted(value: string): string {
  return JSON.stringify(value);
}

function generateSessionInstructions(): string {
  return `### Step 1: Start with a session

\`\`\`bash
<skill>/scripts/run --context '{}' --host claude-code --session new 2>/dev/null
\`\`\`

This returns a JSON pointer with \`sessionId\`, \`file\`, and \`line\`. The \`line\` field tells you
which line to read — it will be \`2\`, not \`1\` (line 1 is an internal header, never read it).

Read **only** line \`line\` from \`file\`. It contains the step prompt, schema, and preamble.

**Read the \`preamble\` first.** It defines verb-to-tool mappings (e.g., ASK_STRUCTURED, ASK_FREEFORM)
that prompts use throughout the skill. Follow these mappings for every step.

### Step 2: Follow the prompt

Read the \`prompt\` field from the session file line. It contains instructions — follow them.
The prompt may ask you to use specific tools, write files, analyze code, or interact with the user.
Produce a JSON object matching the \`schema\`.

### Step 3: Advance

Pass your output back with the step name:

\`\`\`bash
<skill>/scripts/run advance --step <step-name> --output '<your-json>' --session abc123 2>/dev/null
\`\`\`

This returns a single line number (e.g., \`4\`). Read **exactly and only that line** from the session file — it contains the next prompt. Do not read any other lines.

### Step 4: Repeat until done

Keep advancing until the line you read contains \`"type":"done"\`. The \`finalOutput\` field
contains the skill's result. Present it to the user.
`;
}

function generateStatelessInstructions(): string {
  return `### Step 1: Start

\`\`\`bash
<skill>/scripts/run --context '{}' --host claude-code 2>/dev/null
\`\`\`

The output is JSON with: \`preamble\`, \`step\`, \`prompt\`, \`schema\`.

**Read the \`preamble\` first.** It defines verb-to-tool mappings (e.g., ASK_STRUCTURED, ASK_FREEFORM)
that prompts use throughout the skill. Follow these mappings for every step.

### Step 2: Follow the prompt

Read the \`prompt\` field. Do what it says, then produce a JSON object matching \`schema\`.

### Step 3: Advance

\`\`\`bash
<skill>/scripts/run advance --step <step-name> --output '<your-json>' --history '<history>' --host claude-code 2>/dev/null
\`\`\`

- \`--step\`: the step name from the previous response
- \`--output\`: your JSON response matching the schema
- \`--history\`: a JSON array tracking the conversation. Start with \`[]\`. After each advance,
  the response includes a \`completed\` field — append it to the array for the next call.

### Step 4: Repeat until done

Keep advancing until the response contains \`"done": true\`. The \`finalOutput\` field
contains the skill's result. Present it to the user.
`;
}

function generateSubskillSection(skill: SkillDefinition, protocol: BuildProtocol): string {
  if (!skill.subskills || Object.keys(skill.subskills).length === 0) return '';

  const hasDispatcher = Object.keys(skill.steps).length > 0;

  const lines = ['', '', '## Sub-skills', ''];

  if (hasDispatcher) {
    lines.push(
      'This skill contains sub-skills that the workflow routes to automatically.',
      'Start the skill normally — the dispatcher will determine which sub-skill to use.',
      'Only use direct sub-skill access if the user explicitly requests a specific sub-skill by name.',
    );
  } else {
    lines.push(
      'This skill contains independent sub-skills. Choose the one that best matches',
      "the user's intent, or ask the user which one they need.",
    );
  }

  lines.push('', 'Sub-skill step names are prefixed: `<subskill>/<step>` (e.g., `doctor/diagnose`).', '');

  lines.push('### Direct sub-skill access', '');
  lines.push('```bash');
  if (protocol === 'session') {
    lines.push("<skill>/scripts/run <subskill> --context '{}' --session new");
    lines.push('<skill>/scripts/run <subskill> advance --session <id>');
  } else {
    lines.push("<skill>/scripts/run <subskill> --context '{}'");
    lines.push("<skill>/scripts/run <subskill> advance --step <step> --output '...' --history '[...]'");
  }
  lines.push('```');
  lines.push('', '### Available sub-skills', '');

  for (const [name, reg] of Object.entries(skill.subskills)) {
    const desc = reg.definition.description || '(no description)';
    lines.push(`- **${name}**: ${desc}`);
  }

  return lines.join('\n');
}

function generateTopicSection(skill: SkillDefinition): string {
  if (!skill.topics || Object.keys(skill.topics).length === 0) return '';

  const lines = [
    '',
    '',
    '## Reference topics',
    '',
    'Quick-reference topics accessible without running the full workflow:',
    '',
    '```bash',
    '<skill>/scripts/run topics              # list all topics',
    '<skill>/scripts/run topic <name>         # load a specific topic',
    '```',
    '',
  ];

  for (const [name, topic] of Object.entries(skill.topics)) {
    lines.push(`- **${name}**: ${topic.label}`);
  }

  return lines.join('\n');
}
