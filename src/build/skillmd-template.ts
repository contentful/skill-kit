import type { SkillDefinition } from '../types.js';
import type { BuildProtocol } from './index.js';

interface ParamField {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
}

interface ParamInfo {
  fields: ParamField[];
  hasRequired: boolean;
  exampleJson: string;
}

function formatType(prop: Record<string, unknown>): string {
  if (Array.isArray(prop['enum'])) {
    return (prop['enum'] as unknown[]).map((v) => `\`${JSON.stringify(v)}\``).join(' \\| ');
  }
  if (prop['type'] === 'array') return 'array';
  if (prop['type'] === 'object') return 'object';
  return String(prop['type'] ?? 'unknown');
}

function exampleValue(prop: Record<string, unknown>, name: string): unknown {
  if ('default' in prop) return prop['default'];
  if (Array.isArray(prop['enum'])) return prop['enum'][0];
  switch (prop['type']) {
    case 'string':
      return `<${name}>`;
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return null;
  }
}

function extractParamInfo(params: unknown): ParamInfo | null {
  if (!params || typeof params !== 'object' || !('toJSONSchema' in params)) return null;

  try {
    const schema = (params as { toJSONSchema: () => Record<string, unknown> }).toJSONSchema() as Record<
      string,
      unknown
    >;
    const properties = (schema['properties'] as Record<string, Record<string, unknown>>) ?? {};
    const requiredArr = (schema['required'] as string[]) ?? [];

    const names = Object.keys(properties);
    if (names.length === 0) return null;

    const fields: ParamField[] = names.map((name) => {
      const prop = properties[name] ?? {};
      // A field is required from the caller's perspective only if it's
      // in the JSON Schema `required` array AND has no `default` value.
      const hasDefault = 'default' in prop;
      return {
        name,
        type: formatType(prop),
        required: requiredArr.includes(name) && !hasDefault,
        ...(hasDefault ? { default: prop['default'] } : {}),
      };
    });

    const hasRequired = fields.some((f) => f.required);

    const example: Record<string, unknown> = {};
    for (const name of names) {
      example[name] = exampleValue(properties[name] ?? {}, name);
    }
    const exampleJson = JSON.stringify(example);

    return { fields, hasRequired, exampleJson };
  } catch {
    return null;
  }
}

function generateParamsSection(info: ParamInfo | null): string {
  if (!info) return "## Parameters\n\nThis skill takes no parameters. Pass `--params '{}'`.";

  const rows = info.fields.map((f) => {
    const req = f.required ? '**Yes**' : 'No';
    const def = 'default' in f ? `\`${JSON.stringify(f.default)}\`` : '—';
    return `| \`${f.name}\` | ${f.type} | ${req} | ${def} |`;
  });

  const table = ['| Name | Type | Required | Default |', '|------|------|----------|---------|', ...rows].join('\n');

  const note = info.hasRequired ? '' : "\nAll parameters have defaults — `--params '{}'` is valid.\n";

  return `## Parameters\n\n${table}\n${note}\nExample:\n\n\`\`\`json\n${info.exampleJson}\n\`\`\``;
}

function buildExampleParamsFlag(info: ParamInfo | null): string {
  if (!info || !info.hasRequired) return "'{}'";
  return `'${info.exampleJson}'`;
}

const SKILL_DIR_INSTRUCTION = `This SKILL.md file is inside the skill directory. Resolve the **absolute path** to \`scripts/run\`
from this file's location (e.g., \`/path/to/skill/scripts/run\`). Use the absolute path in all
Bash commands — do not \`cd\` into the skill directory.

In the examples below, \`<skill>/scripts/run\` is a placeholder for this absolute path.`;

export function generateSkillMd(skill: SkillDefinition, protocol: BuildProtocol = 'session'): string {
  const frontmatter = ['---', `name: ${skill.name}`, `description: ${yamlDoubleQuoted(skill.description)}`];

  if (skill.version !== '0.0.0') {
    frontmatter.push(`metadata:`);
    frontmatter.push(`  version: "${skill.version}"`);
  }

  if (skill.argumentHint !== undefined) {
    frontmatter.push(`argument-hint: ${yamlDoubleQuoted(skill.argumentHint)}`);
  }

  if (skill.allowedTools !== undefined && !(Array.isArray(skill.allowedTools) && skill.allowedTools.length === 0)) {
    frontmatter.push(yamlStringOrList('allowed-tools', skill.allowedTools));
  }

  if (skill.paths !== undefined && !(Array.isArray(skill.paths) && skill.paths.length === 0)) {
    frontmatter.push(yamlStringOrList('paths', skill.paths));
  }

  if (skill.context !== undefined) {
    frontmatter.push(`context: ${yamlDoubleQuoted(skill.context)}`);
  }

  frontmatter.push('---');

  const stepDescriptions = Object.entries(skill.steps)
    .map(([name, stepDef]) => {
      const prompt = typeof stepDef.config.prompt === 'string' ? stepDef.config.prompt : '(dynamic)';
      const truncated = prompt.length > 100 ? prompt.slice(0, 97) + '...' : prompt;
      return `- **${name}**: ${truncated}`;
    })
    .join('\n');

  const paramInfo = extractParamInfo(skill.params);
  const paramsFlag = buildExampleParamsFlag(paramInfo);
  const paramsSection = generateParamsSection(paramInfo);

  const protocolInstructions =
    protocol === 'session' ? generateSessionInstructions(paramsFlag) : generateStatelessInstructions(paramsFlag);

  const body = `
# ${skill.name}

This skill is a structured workflow driven by a compiled CLI binary. You interact with it
by calling the binary, reading its JSON output, following the instructions in the \`prompt\`
field, and passing your response back. **Do not show the raw JSON or Bash commands to the user.**

## How this skill works

This skill was built with skill-kit, a structured workflow engine. Each step provides
a prompt containing XML-tagged sections:

- **\`<system>\`** — Behavioral directives: persona, tone, or constraints. Follow as
  guidelines for how to behave, not as tasks to relay to the user.
- **\`<prompt>\`** — Task instructions: what to do, what context to consider, what to produce.
- **\`<ask-user>\`** — Ask the user a question. Contains \`<option>\` children for structured
  choices, or \`type="open"\` for free-form conversation.
- **\`<confirm>\`** — Binary yes/no confirmation. Attributes: \`default\`, \`destructive\`.
- **\`<plan>\`** — Present a plan for approval. Contains \`<step>\` children.
- **\`<checklist>\`** — Create tracked work items. Contains \`<item>\` children with status.
- **\`<subagent>\`** — Delegate work to an isolated sub-agent. If \`no-recurse\` is set,
  the subagent must not invoke the skill named in the attribute.
- **\`<rendered>\`** — Pre-rendered output. Emit verbatim — no edits, no added commentary.

A step may contain one or more of these sections in sequence. Follow them in order.

The skill author composed these sections to guide your behavior. The tags and tool
mappings are generated by the SDK based on the author's intent and your host's
capabilities. A skill-level system directive may appear in the preamble — it applies
to all steps unless a step includes its own \`<system>\` override.

The **preamble** (sent on the first step) contains a table mapping each tag to the
specific tool available in your environment. Refer to it throughout the workflow.

## How to run this skill

### MCP mode (preferred)

If you have MCP tools for this skill (e.g., \`mcp__${skill.name}__start\` and
\`mcp__${skill.name}__advance\`), use them instead of the CLI:

1. Call the \`start\` tool (with \`params\` if the skill requires them).
2. Read the \`preamble\` field (first call only). It maps XML tags to your available tools.
3. Follow the \`prompt\` instructions. Produce a JSON object matching the \`schema\`.
4. Call the \`advance\` tool with the \`session\`, \`step\`, and \`output\`.
5. Repeat steps 3-4 until \`status\` is \`"done"\`.

If you get \`status: "error"\` with \`retry: true\`, fix your output and resubmit.
**Do not show raw JSON, session IDs, or MCP tool calls to the user.**

Skip the rest of this section — the CLI instructions below are only needed when
MCP tools are not available.

### CLI mode (fallback)

${SKILL_DIR_INSTRUCTION}

**Before you begin:** Tell the user that they may be prompted to allow \`scripts/run\` and to
read a file called \`skill-kit-<id>.jsonl\`. They should allow both permanently.

### Detect your host

Determine which agent host you are running in, and pass it as \`--host\`:
- Claude Code: \`--host claude-code\`
- Codex: \`--host codex\`
- OpenCode: \`--host opencode\`
- Gemini CLI: \`--host gemini-cli\`
- Cline: \`--host cline\`
- Roo Code: \`--host roo-code\`
- Kilo Code: \`--host kilo-code\`
- Cursor: \`--host cursor\`
- Amp: \`--host amp\`
- Unknown/other: omit the flag (defaults to generic)

### Report your tools

Pass the tools you have available as a comma-separated \`--tools\` flag on the **start**
command. The session remembers them — you don't need to pass \`--tools\` on advance.

When \`--host\` is provided, \`--tools\` is merged with the host's known tool registry.
This means partial reporting is handled gracefully — the registry fills in any tools
you omit. If \`--tools\` is omitted entirely, the skill infers tools from \`--host\`.
If both are omitted, all interactions use generic fallbacks.

### Subagent invocations

If you are a **subagent** (spawned by another agent, not the top-level agent the user
is talking to), add \`--subagent\` to the start command. This tells the skill that your
reported tools are a genuine subset — the skill will not merge them with the host registry.

Without \`--subagent\`, the skill assumes you are a top-level agent and merges your tools
with the registry (since top-level agents often under-report their tools).

${paramsSection}

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

function yamlStringOrList(key: string, value: string | string[]): string {
  if (typeof value === 'string') {
    return `${key}: ${yamlDoubleQuoted(value)}`;
  }
  const items = value.map((v) => `  - ${yamlDoubleQuoted(v)}`).join('\n');
  return `${key}:\n${items}`;
}

function generateSessionInstructions(paramsFlag: string): string {
  return `### Step 1: Start with a session

\`\`\`bash
<skill>/scripts/run --params ${paramsFlag} --host claude-code --tools <your-tools> --session new 2>/dev/null
\`\`\`

This returns a JSON pointer with \`sessionId\`, \`file\`, and \`line\`. The \`line\` field tells you
which line to read — it will be \`2\`, not \`1\` (line 1 is an internal header, never read it).

Read **only** line \`line\` from \`file\`. It contains the step prompt, schema, and preamble.

**Read the \`preamble\` first.** It contains a table mapping XML tags to the tools
available in your environment. Refer to it throughout the workflow.

### Step 2: Follow the prompt

Read the \`prompt\` field. It contains XML-tagged sections (described in "How this skill
works" above): \`<system>\` directives to follow, \`<prompt>\` instructions to act on, and
interaction tags (\`<ask-user>\`, \`<confirm>\`, \`<plan>\`, \`<checklist>\`, \`<subagent>\`)
to execute using the tools mapped in the preamble. If a \`<rendered>\` block appears,
emit its content verbatim.

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

function generateStatelessInstructions(paramsFlag: string): string {
  return `### Step 1: Start

\`\`\`bash
<skill>/scripts/run --params ${paramsFlag} --host claude-code --tools <your-tools> 2>/dev/null
\`\`\`

The output is JSON with: \`preamble\`, \`step\`, \`prompt\`, \`schema\`.

**Read the \`preamble\` first.** It contains a table mapping XML tags to the tools
available in your environment. Refer to it throughout the workflow.

### Step 2: Follow the prompt

Read the \`prompt\` field. It contains XML-tagged sections (described in "How this skill
works" above): \`<system>\` directives to follow, \`<prompt>\` instructions to act on, and
interaction tags (\`<ask-user>\`, \`<confirm>\`, \`<plan>\`, \`<checklist>\`, \`<subagent>\`)
to execute using the tools mapped in the preamble. If a \`<rendered>\` block appears,
emit its content verbatim.

Produce a JSON object matching the \`schema\`.

### Step 3: Advance

\`\`\`bash
<skill>/scripts/run advance --step <step-name> --output '<your-json>' --params ${paramsFlag} --history '<history>' --host claude-code 2>/dev/null
\`\`\`

- \`--step\`: the step name from the previous response
- \`--output\`: your JSON response matching the schema
- \`--params\`: same params JSON you passed on start (required for stateless mode)
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
    lines.push("<skill>/scripts/run <subskill> --params '<json>' --session new");
    lines.push('<skill>/scripts/run <subskill> advance --session <id>');
  } else {
    lines.push("<skill>/scripts/run <subskill> --params '<json>'");
    lines.push("<skill>/scripts/run <subskill> advance --step <step> --output '...' --history '[...]'");
  }
  lines.push('```');
  lines.push('', '### Available sub-skills', '');

  for (const [name, reg] of Object.entries(skill.subskills)) {
    const desc = reg.definition.description || '(no description)';
    const subParamInfo = extractParamInfo(reg.definition.params);
    if (subParamInfo) {
      const paramSummary = subParamInfo.fields
        .map((f) => `\`${f.name}\` (${f.type}${f.required ? ', required' : ''})`)
        .join(', ');
      lines.push(`- **${name}**: ${desc} — params: ${paramSummary}`);
    } else {
      lines.push(`- **${name}**: ${desc}`);
    }
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
